//! Puts the EZI palette into the component library's theme, so its buttons, inputs, dialogs and toasts
//! use the same colours as our own widgets.

use ezi_core::theme::{Mode, Palette, Token::*};
use gpui_kit::component::theme::{Theme, ThemeMode};
use gpui_kit::*;

use crate::state::{hsla, resolve, state, AppState, ThemePref};

/// Applies the current mode of `AppState` to the component theme and redraws every window.
pub fn apply(cx: &mut App) {
    let mode = state(cx).mode;
    Theme::change(if mode == Mode::Dark { ThemeMode::Dark } else { ThemeMode::Light }, None, cx);
    let p = Palette::of(mode);
    let c = |t| hsla(p.color(t));
    // Edit colours in `update` (after `change`): it brings the library's derived tokens in step with them.
    Theme::update(cx, |theme| {
    let k = &mut theme.colors;
    k.background = c(Background);
    k.foreground = c(Foreground);
    k.border = c(Border);
    k.input = c(Input);
    k.ring = c(Ring);
    k.caret = c(Foreground);
    k.selection = c(Primary).opacity(0.25);
    k.primary = c(Primary);
    k.primary_foreground = c(PrimaryForeground);
    k.primary_hover = c(PrimaryHover);
    k.primary_active = c(PrimaryHover);
    k.secondary = c(Secondary);
    k.secondary_foreground = c(SecondaryForeground);
    k.secondary_hover = c(Accent);
    k.secondary_active = c(Accent);
    k.muted = c(Muted);
    k.muted_foreground = c(MutedForeground);
    k.accent = c(Accent);
    k.accent_foreground = c(AccentForeground);
    k.danger = c(Destructive);
    k.danger_foreground = c(DestructiveForeground);
    k.danger_hover = c(DestructiveHover);
    k.danger_active = c(DestructiveActive);
    // Buttons have their own colour fields in the library, separate from `primary` and `danger`.
    k.button = c(Secondary);
    k.button_hover = c(Accent);
    k.button_active = c(Accent);
    k.button_foreground = c(Foreground);
    k.button_primary = c(Primary);
    k.button_primary_hover = c(PrimaryHover);
    k.button_primary_active = c(PrimaryHover);
    k.button_primary_foreground = c(PrimaryForeground);
    k.button_secondary = c(Secondary);
    k.button_secondary_hover = c(Accent);
    k.button_secondary_active = c(Accent);
    k.button_secondary_foreground = c(SecondaryForeground);
    k.button_danger = c(Destructive);
    k.button_danger_hover = c(DestructiveHover);
    k.button_danger_active = c(DestructiveActive);
    k.button_danger_foreground = c(DestructiveForeground);
    k.popover = c(Popover);
    k.popover_foreground = c(PopoverForeground);
    k.link = c(Link);
    k.link_hover = c(Link);
    k.link_active = c(Link);
    k.success = c(SuccessIcon);
    k.warning = c(WarningIcon);
    k.info = c(InfoIcon);
    k.sidebar = c(Sidebar);
    k.sidebar_foreground = c(SidebarForeground);
    k.sidebar_border = c(SidebarBorder);
    k.sidebar_accent = c(SidebarActive);
    k.sidebar_accent_foreground = c(SidebarActiveIcon);
    k.list = c(Background);
    k.list_even = c(Background);
    k.list_hover = c(Muted);
    k.list_active = c(SidebarActive);
    k.table = c(Background);
    k.table_even = c(Background);
    k.table_head = c(Muted);
    k.table_head_foreground = c(MutedForeground);
    k.table_hover = c(Muted);
    k.table_row_border = c(Border);
    let (scrim, alpha) = p.overlay();
    k.overlay = hsla(scrim).opacity(alpha);
    });
    cx.refresh_windows();
}

/// Changes the theme choice (and the mode it resolves to) and applies it.
pub fn set_pref(pref: ThemePref, window: &Window, cx: &mut App) {
    let mode = resolve(pref, window);
    cx.update_global::<AppState, _>(|s, _| {
        s.pref = pref;
        s.mode = mode;
    });
    apply(cx);
}
