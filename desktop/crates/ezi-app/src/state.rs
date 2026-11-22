//! App-wide state every view reads: language, theme choice, and who is signed in. One global, set once at start.

use ezi_core::api::{Lang, Role};
use ezi_core::i18n::{self, Strings};
use ezi_core::theme::{Mode, Palette, Rgb, Token};
use gpui_kit::*;

/// What the user chose for the theme. `System` follows the operating system's light or dark setting.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ThemePref {
    System,
    Light,
    Dark,
}

pub struct AppState {
    pub lang: Lang,
    pub pref: ThemePref,
    /// The mode in use now (`pref` resolved against the system setting).
    pub mode: Mode,
    pub role: Role,
    pub user_name: SharedString,
}

impl Global for AppState {}

pub fn state(cx: &App) -> &AppState {
    cx.global::<AppState>()
}

/// The strings in the current language.
pub fn t(cx: &App) -> &'static Strings {
    i18n::strings(state(cx).lang)
}

pub fn palette(cx: &App) -> Palette {
    Palette::of(state(cx).mode)
}

pub fn hsla(rgb: Rgb) -> Hsla {
    gpui_kit::rgb(rgb.as_u32()).into()
}

/// One token as a GPUI colour in the current mode.
pub fn color(cx: &App, token: Token) -> Hsla {
    hsla(palette(cx).color(token))
}

pub fn system_mode(window: &Window) -> Mode {
    match window.appearance() {
        WindowAppearance::Dark | WindowAppearance::VibrantDark => Mode::Dark,
        _ => Mode::Light,
    }
}

pub fn resolve(pref: ThemePref, window: &Window) -> Mode {
    match pref {
        ThemePref::Light => Mode::Light,
        ThemePref::Dark => Mode::Dark,
        ThemePref::System => system_mode(window),
    }
}
