//! Motion tokens: how long things move, how far, and with which curve. The same numbers as the `--duration-*`, `--ease-*`,
//! `--press-scale` and other motion variables of `frontend/src/app/globals.css` (a test reads that file), so the desktop app
//! moves like the web app (PRD_REDESIGN.md 10.4). Nothing outside this module writes a duration or a curve.
//!
//! There are two sets. `Motion::FULL` is the normal one. `Motion::REDUCED` is used when the person turned animation off in
//! Windows: no slide, rise, scale, stagger, spinning or sliding pill; colour and opacity fades stay, shortened to 100 ms.
//! `Motion::of(reduced)` picks one; it is the only place that decision is made.

use std::time::Duration;

const fn ms(n: u64) -> Duration {
    Duration::from_millis(n)
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Motion {
    /// Press scale and colour of a clickable while it is pressed.
    pub press: Duration,
    /// Colour of a button or a nav item under the mouse.
    pub hover: Duration,
    /// Colours moving when the theme changes, and a field error fading in.
    pub theme: Duration,
    /// The content area when the page changes, and a new line-item row.
    pub route: Duration,
    /// A dialog and its backdrop opening.
    pub overlay_enter: Duration,
    /// A dropdown, select or popover growing from its trigger.
    pub popover: Duration,
    pub drawer: Duration,
    pub toast: Duration,
    /// Everything closing: always faster than opening.
    pub exit: Duration,
    /// The gap between the items of a staggered entrance (dashboard cards).
    pub stagger: Duration,
    /// The pill of a segmented control moving.
    pub pill: Duration,
    /// One card of the dashboard entering (PRD_REDESIGN.md 10.4: "200 ms each"; the web CSS has no variable for it).
    pub card: Duration,
    /// One turn of a spinner, and one pulse of a skeleton.
    pub spinner: Duration,
    pub skeleton: Duration,
    /// A pressed clickable scales to this (1.0 = no change).
    pub press_scale: f32,
    /// An overlay grows from this scale to 1.
    pub overlay_scale_from: f32,
    /// Distances in pixels a thing rises while it fades in: the content area, a card, a line-item row.
    pub rise_route: f32,
    pub rise_card: f32,
    pub rise_row: f32,
    /// 1.0 = a drawer slides its whole width, 0.0 = it only fades.
    pub drawer_travel: f32,
    /// Whether spinners turn and skeletons pulse (they stay still when reduced).
    pub loops: bool,
    /// Whether the pill of a segmented control slides (it jumps when reduced).
    pub pill_slides: bool,
}

impl Motion {
    pub const FULL: Motion = Motion {
        press: ms(140),
        hover: ms(120),
        theme: ms(150),
        route: ms(160),
        overlay_enter: ms(190),
        popover: ms(160),
        drawer: ms(220),
        toast: ms(200),
        exit: ms(120),
        stagger: ms(40),
        pill: ms(200),
        card: ms(200),
        spinner: ms(800),
        skeleton: ms(1400),
        press_scale: 0.97,
        overlay_scale_from: 0.96,
        rise_route: 6.0,
        rise_card: 8.0,
        rise_row: 4.0,
        drawer_travel: 1.0,
        loops: true,
        pill_slides: true,
    };

    /// The reduced-motion duration of every short transition (`--duration-reduced`).
    pub const REDUCED_DURATION: Duration = ms(100);

    pub const REDUCED: Motion = Motion {
        press: Self::REDUCED_DURATION,
        hover: Self::REDUCED_DURATION,
        theme: Self::REDUCED_DURATION,
        route: Self::REDUCED_DURATION,
        overlay_enter: Self::REDUCED_DURATION,
        popover: Self::REDUCED_DURATION,
        drawer: Self::REDUCED_DURATION,
        toast: Self::REDUCED_DURATION,
        exit: Self::REDUCED_DURATION,
        stagger: Duration::ZERO,
        pill: Self::REDUCED_DURATION,
        card: Self::REDUCED_DURATION,
        // The loops keep their durations for the day they are shown static; `loops: false` is what stops them.
        spinner: ms(800),
        skeleton: ms(1400),
        press_scale: 1.0,
        overlay_scale_from: 1.0,
        rise_route: 0.0,
        rise_card: 0.0,
        rise_row: 0.0,
        drawer_travel: 0.0,
        loops: false,
        pill_slides: false,
    };

    /// The tokens to use: the reduced set when the person turned animation off, the full set otherwise.
    pub fn of(reduced: bool) -> &'static Motion {
        if reduced { &Self::REDUCED } else { &Self::FULL }
    }
}

/// Whether reduced motion is wanted: an explicit `EZI_REDUCE_MOTION` value wins (`1`, `true`, `yes` reduce; `0`, `false`, `no` keep
/// full motion), otherwise the system's setting (`system`, read only when needed).
pub fn reduced_motion_wanted(env: Option<&str>, system: impl Fn() -> bool) -> bool {
    match env.map(|v| v.trim().to_lowercase()).as_deref() {
        Some("1" | "true" | "yes") => true,
        Some("0" | "false" | "no") => false,
        _ => system(),
    }
}

/// The three curves of the web app (`--ease-out`, `--ease-in-out`, `--ease-drawer`) and a plain line for spinners.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Curve {
    /// A strong ease-out, not the CSS default: `cubic-bezier(0.23, 1, 0.32, 1)`. Everything that appears uses it.
    EaseOut,
    /// `cubic-bezier(0.77, 0, 0.175, 1)`: the pill, and skeleton pulses.
    EaseInOut,
    /// `cubic-bezier(0.32, 0.72, 0, 1)`: the drawer.
    Drawer,
    Linear,
}

impl Curve {
    /// The control points `(x1, y1, x2, y2)` of the curve; a test compares them with `globals.css`.
    pub const fn points(self) -> (f32, f32, f32, f32) {
        match self {
            Curve::EaseOut => (0.23, 1.0, 0.32, 1.0),
            Curve::EaseInOut => (0.77, 0.0, 0.175, 1.0),
            Curve::Drawer => (0.32, 0.72, 0.0, 1.0),
            Curve::Linear => (0.0, 0.0, 1.0, 1.0),
        }
    }

    /// Progress (0 to 1) of the animation at time `t` (0 to 1).
    pub fn at(self, t: f32) -> f32 {
        let (x1, y1, x2, y2) = self.points();
        cubic_bezier(x1, y1, x2, y2, t)
    }

    /// For `Animation::with_easing`.
    pub fn easing(self) -> impl Fn(f32) -> f32 + 'static {
        move |t| self.at(t)
    }
}

/// The CSS `cubic-bezier(x1, y1, x2, y2)` at time `t`: find the curve parameter whose x is `t` (Newton's method, then bisection
/// as a fallback), then read y.
pub fn cubic_bezier(x1: f32, y1: f32, x2: f32, y2: f32, t: f32) -> f32 {
    let t = t.clamp(0.0, 1.0);
    if x1 == y1 && x2 == y2 {
        return t; // the straight line
    }
    let axis = |a: f32, b: f32, u: f32| 3.0 * a * (1.0 - u).powi(2) * u + 3.0 * b * (1.0 - u) * u * u + u.powi(3);
    let slope = |a: f32, b: f32, u: f32| 3.0 * a * (1.0 - u).powi(2) + 6.0 * (b - a) * (1.0 - u) * u + 3.0 * (1.0 - b) * u * u;
    let mut u = t;
    for _ in 0..8 {
        let error = axis(x1, x2, u) - t;
        if error.abs() < 1e-5 {
            return axis(y1, y2, u);
        }
        let d = slope(x1, x2, u);
        if d.abs() < 1e-6 {
            break;
        }
        u = (u - error / d).clamp(0.0, 1.0);
    }
    let (mut lo, mut hi) = (0.0_f32, 1.0_f32);
    for _ in 0..32 {
        u = (lo + hi) / 2.0;
        if axis(x1, x2, u) < t { lo = u } else { hi = u }
    }
    axis(y1, y2, u)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// `--name: 140ms;` or `--name: 0.97;` of globals.css, for the variable `name`, from its first definition.
    fn css(name: &str) -> String {
        let css = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/../../../frontend/src/app/globals.css")).unwrap();
        let line = css.lines().find(|l| l.trim_start().starts_with(&format!("--{name}:"))).unwrap_or_else(|| panic!("--{name} in globals.css"));
        line.split_once(':').unwrap().1.trim().trim_end_matches(';').to_string()
    }

    fn css_ms(name: &str) -> Duration {
        ms(css(name).trim_end_matches("ms").parse().unwrap_or_else(|_| panic!("--{name}")))
    }

    fn css_f(name: &str) -> f32 {
        css(name).trim_end_matches("px").parse().unwrap_or_else(|_| panic!("--{name}"))
    }

    #[test]
    fn the_full_tokens_equal_the_web_apps_css_variables() {
        let m = Motion::FULL;
        for (name, got) in [
            ("duration-press", m.press), ("duration-hover", m.hover), ("duration-theme", m.theme), ("duration-route", m.route),
            ("duration-overlay-enter", m.overlay_enter), ("duration-popover", m.popover), ("duration-drawer", m.drawer), ("duration-toast", m.toast),
            ("duration-exit", m.exit), ("duration-stagger", m.stagger), ("duration-pill", m.pill), ("duration-spinner", m.spinner),
            ("duration-skeleton", m.skeleton), ("duration-reduced", Motion::REDUCED_DURATION),
        ] {
            assert_eq!(got, css_ms(name), "--{name}");
        }
        assert_eq!(m.card, ms(200), "PRD 10.4: dashboard cards 200 ms each");
        for (name, got) in [("press-scale", m.press_scale), ("overlay-scale-from", m.overlay_scale_from), ("rise-route", m.rise_route), ("rise-card", m.rise_card), ("rise-row", m.rise_row), ("drawer-travel", m.drawer_travel)] {
            assert_eq!(got, css_f(name), "--{name}");
        }
    }

    #[test]
    fn the_curves_equal_the_web_apps_css_curves() {
        for (name, curve) in [("ease-out", Curve::EaseOut), ("ease-in-out", Curve::EaseInOut), ("ease-drawer", Curve::Drawer)] {
            let value = css(name);
            let inner = value.trim_start_matches("cubic-bezier(").trim_end_matches(')');
            let p: Vec<f32> = inner.split(',').map(|n| n.trim().parse().unwrap()).collect();
            assert_eq!((p[0], p[1], p[2], p[3]), curve.points(), "--{name}");
        }
    }

    #[test]
    fn reduced_motion_picks_the_reduced_set_and_it_has_no_movement() {
        assert_eq!(Motion::of(false), &Motion::FULL);
        assert_eq!(Motion::of(true), &Motion::REDUCED);
        let r = Motion::REDUCED;
        // Every transition shortened to the one reduced duration, the stagger gone (the rules of the css media query).
        for d in [r.press, r.hover, r.theme, r.route, r.overlay_enter, r.popover, r.drawer, r.toast, r.exit, r.pill, r.card] {
            assert_eq!(d, Motion::REDUCED_DURATION);
        }
        assert_eq!(r.stagger, Duration::ZERO);
        // No slide, rise or scale; nothing loops; the pill jumps.
        assert_eq!((r.press_scale, r.overlay_scale_from, r.rise_route, r.rise_card, r.rise_row, r.drawer_travel), (1.0, 1.0, 0.0, 0.0, 0.0, 0.0));
        assert!(!r.loops && !r.pill_slides);
        assert!(Motion::FULL.loops && Motion::FULL.pill_slides);
        // Reduced is never slower than full, so a person who turns animation off never waits longer.
        for (a, b) in [(r.press, Motion::FULL.press), (r.route, Motion::FULL.route), (r.overlay_enter, Motion::FULL.overlay_enter), (r.drawer, Motion::FULL.drawer), (r.toast, Motion::FULL.toast)] {
            assert!(a <= b);
        }
    }

    #[test]
    fn the_environment_decides_before_the_system_does() {
        let (on, off) = (|| true, || false);
        assert!(reduced_motion_wanted(Some("1"), off) && reduced_motion_wanted(Some(" True "), off));
        assert!(!reduced_motion_wanted(Some("0"), on) && !reduced_motion_wanted(Some("false"), on));
        assert!(reduced_motion_wanted(None, on) && !reduced_motion_wanted(None, off), "no switch: the system setting");
        assert!(reduced_motion_wanted(Some("maybe"), on) && !reduced_motion_wanted(Some(""), off), "an unknown value does not decide");
    }

    #[test]
    fn exits_are_never_slower_than_entrances() {
        let m = Motion::FULL;
        assert!(m.exit <= m.overlay_enter && m.exit <= m.popover && m.exit <= m.drawer && m.exit <= m.toast);
        assert!(m.press.max(m.hover).max(m.theme).max(m.route).max(m.overlay_enter).max(m.popover).max(m.drawer).max(m.toast).max(m.pill).max(m.card) <= ms(250), "nothing above 250 ms (PRD 10.4)");
    }

    #[test]
    fn the_curves_start_at_zero_end_at_one_and_never_go_backwards() {
        for curve in [Curve::EaseOut, Curve::EaseInOut, Curve::Drawer, Curve::Linear] {
            assert!(curve.at(0.0).abs() < 1e-4 && (curve.at(1.0) - 1.0).abs() < 1e-4, "{curve:?}");
            let mut last = -1.0;
            for i in 0..=100 {
                let y = curve.at(i as f32 / 100.0);
                assert!(y >= last - 1e-4, "{curve:?} at {i}");
                last = y;
            }
        }
        assert!((Curve::Linear.at(0.3) - 0.3).abs() < 1e-5);
        // A strong ease-out is well past halfway at half the time; an ease-in-out is at half.
        assert!(Curve::EaseOut.at(0.5) > 0.8, "{}", Curve::EaseOut.at(0.5));
        assert!((Curve::EaseInOut.at(0.5) - 0.5).abs() < 0.1, "{}", Curve::EaseInOut.at(0.5));
    }
}
