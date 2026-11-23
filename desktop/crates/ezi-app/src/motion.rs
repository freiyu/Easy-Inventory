//! Motion in the app: the tokens (`ezi_core::motion`) chosen by the reduced-motion switch, and the one place an animation is
//! made. No other file writes a duration or a curve (a test in `ezi-core/tests/no_raw_values.rs` reads the sources and fails).
//!
//! The switch follows the person's setting: on Windows "Settings > Accessibility > Visual effects > Animation effects"
//! (the system setting `SPI_GETCLIENTAREAANIMATION`). It is read when the app starts and again each time the window is
//! activated, so changing it and coming back to the app takes effect. On any system, `EZI_REDUCE_MOTION=1` forces reduced
//! motion and `EZI_REDUCE_MOTION=0` forces full motion (for checking and for WSL, which has no such setting).

use std::time::Duration;

use ezi_core::motion::{reduced_motion_wanted, Curve, Motion};
use gpui_kit::*;

#[allow(dead_code)] // used by the animations of the next tasks
/// The tokens now in force: the reduced set when the person turned animation off.
pub fn tokens(cx: &App) -> &'static Motion {
    Motion::of(cx.reduce_motion())
}

#[allow(dead_code)] // used by the animations of the next tasks
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
