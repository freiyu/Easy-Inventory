//! Motion in the app: the tokens (`ezi_core::motion`) chosen by the reduced-motion switch, and the one place an animation is
//! made. No other file writes a duration or a curve (a test in `ezi-core/tests/no_raw_values.rs` reads the sources and fails).
//!
//! The switch follows the person's setting: on Windows "Settings > Accessibility > Visual effects > Animation effects"
//! (the system setting `SPI_GETCLIENTAREAANIMATION`). It is read when the app starts and again each time the window is
//! activated, so changing it and coming back to the app takes effect. On any system, `EZI_REDUCE_MOTION=1` forces reduced
//! motion and `EZI_REDUCE_MOTION=0` forces full motion (for checking and for WSL, which has no such setting).

use std::time::Duration;

use ezi_core::motion::{reduced_motion_wanted, Curve, Motion};
use gpui_kit::prelude::*;
use gpui_kit::*;

/// The tokens now in force: the reduced set when the person turned animation off.
pub fn tokens(cx: &App) -> &'static Motion {
    Motion::of(cx.reduce_motion())
}

/// An animation of `duration` with `curve`. GPUI draws it still, at its end state, when reduced motion is on.
pub fn animation(duration: Duration, curve: Curve) -> Animation {
    Animation::new(duration).with_easing(curve.easing())
}

/// Reads the setting and tells GPUI, which then draws every animation made with `with_animation` still when it is on.
pub fn refresh(cx: &mut App) {
    cx.set_reduce_motion(reduced_motion_wanted(std::env::var("EZI_REDUCE_MOTION").ok().as_deref(), system_animations_off));
}

/// Whether Windows has "Animation effects" turned off. Other systems: false.
#[cfg(windows)]
fn system_animations_off() -> bool {
    use std::ffi::c_void;
    const SPI_GETCLIENTAREAANIMATION: u32 = 0x1042;
    #[link(name = "user32")]
    unsafe extern "system" {
        fn SystemParametersInfoW(action: u32, param: u32, value: *mut c_void, win_ini: u32) -> i32;
    }
    let mut on: i32 = 1;
    // SAFETY: the call writes one BOOL (a 4-byte integer) into `on`, which lives for the whole call.
    let ok = unsafe { SystemParametersInfoW(SPI_GETCLIENTAREAANIMATION, 0, (&mut on as *mut i32).cast(), 0) };
    ok != 0 && on == 0
}

#[cfg(not(windows))]
fn system_animations_off() -> bool {
    false
}

/// The animation of an element that enters: after `delay`, over `duration`, with `curve` (a staggered card waits its turn).
pub fn animation_delayed(delay: Duration, duration: Duration, curve: Curve) -> Animation {
    let total = (delay + duration).as_secs_f32().max(f32::EPSILON);
    let (wait, run) = (delay.as_secs_f32(), duration.as_secs_f32().max(f32::EPSILON));
    Animation::new(delay + duration).with_easing(move |t| curve.at(((t * total - wait) / run).clamp(0.0, 1.0)))
}

/// Fade in and rise `rise` pixels over `duration`, after `delay`. `id` decides when it plays again: a new id plays it once more.
/// The rise moves the element without moving its neighbours. With reduced motion the element is drawn finished.
pub fn enter(id: impl Into<ElementId>, delay: Duration, duration: Duration, rise: f32, element: Div) -> AnyElement {
    element
        .relative()
        .with_animation(id, animation_delayed(delay, duration, Curve::EaseOut), move |el, t| el.opacity(t).top(px(rise * (1.0 - t))))
        .into_any_element()
}

/// The pulse of a skeleton: brightness between `low` and 1, a full pulse every `tokens.skeleton`, repeating. It stays at full
/// brightness (the first frame) when reduced motion is on.
pub fn pulse(id: impl Into<ElementId>, duration: Duration, low: f32, element: Div) -> AnyElement {
    let ease = Curve::EaseInOut;
    element
        .with_animation(id, Animation::new(duration).repeat().with_easing(move |t| ease.at(if t < 0.5 { t * 2.0 } else { 2.0 - t * 2.0 })), move |el, t| el.opacity(1.0 - (1.0 - low) * t))
        .into_any_element()
}

/// Remembers which screen of a page was drawn last. A page asks `epoch(tag)` each time it draws: `None` on the first draw and while
/// the screen is the same (no animation), `Some(n)` after the screen changed, with a new `n` per change, so the entrance plays
/// once per change and not each time the data refreshes.
#[derive(Default)]
pub struct RouteTracker {
    tag: std::cell::Cell<Option<u64>>,
    epoch: std::cell::Cell<u32>,
}

impl RouteTracker {
    pub fn epoch(&self, tag: u64) -> Option<u32> {
        match self.tag.replace(Some(tag)) {
            None => None,
            Some(old) => {
                if old != tag {
                    self.epoch.set(self.epoch.get() + 1);
                }
                (self.epoch.get() > 0).then(|| self.epoch.get())
            }
        }
    }
}

/// A page's content for the screen it shows now: the route entrance (fade and rise, `tokens.route`) when the screen changed.
pub fn routed(cx: &App, name: &'static str, epoch: Option<u32>, element: AnyElement) -> AnyElement {
    let Some(epoch) = epoch else { return element };
    let m = tokens(cx);
    enter((name, epoch as usize), Duration::ZERO, m.route, m.rise_route, div().child(element))
}

/// How long after the first draw of the dashboard its entrance may still be running: the last card's turn plus its own time.
pub fn entrance_window(cx: &App) -> Duration {
    let m = tokens(cx);
    m.stagger * 6 + m.card + m.route
}

/// An element that starts opaque and fades away over `duration` (the colour fade of a theme switch). A new id plays it again.
pub fn fade_out(id: impl Into<ElementId>, duration: Duration, element: Div) -> AnyElement {
    element.with_animation(id, animation(duration, Curve::EaseOut), |el, t| el.opacity(1.0 - t)).into_any_element()
}
