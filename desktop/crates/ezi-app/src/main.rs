// Hide the console window in release builds on Windows.
#![cfg_attr(all(not(debug_assertions), windows), windows_subsystem = "windows")]

mod activity;
mod assets;
mod auth;
mod backup;
mod dashboard;
mod expenses;
mod gallery;
mod item_form;
mod item_import;
mod items;
mod lines;
mod load;
mod loan_form;
mod loans;
mod master;
mod motion;
mod profile;
mod purchase_form;
mod purchase_lines;
mod purchases;
mod reason;
mod reports;
mod shell;
mod state;
mod stock;
mod stock_form;
mod theme;
mod users;
mod widgets;

use std::rc::Rc;

use ezi_core::api::{Lang, Role};
use ezi_core::settings;
use gpui_kit::*;

use crate::state::{resolve, AppState, ThemePref};

/// Dev switches for looking at the app without a server (a later task replaces them with the login screen):
/// `EZI_GALLERY=1` opens the shell with the widget gallery; `EZI_ROLE=staff|admin`, `EZI_THEME=light|dark|system`, `EZI_LANG=id|en`.
fn dev(name: &str) -> Option<String> {
    std::env::var(name).ok().map(|v| v.to_lowercase())
}

/// 1366x768 unless `EZI_SIZE=WIDTHxHEIGHT` is set (dev only, for screenshots of tall screens).
fn window_size() -> Size<Pixels> {
    let parsed = dev("EZI_SIZE").and_then(|v| {
        let (w, h) = v.split_once('x')?;
        Some(size(px(w.parse().ok()?), px(h.parse().ok()?)))
    });
    parsed.unwrap_or(size(px(1366.), px(768.)))
}

/// The single root view: shows whichever screen the app starts on. When the theme changes it covers the window with the old
/// background colour and fades that away over 450 ms, eased in and out, so colours move softly instead of snapping (human request 2026-11-24; PRD_REDESIGN.md 10.4 caps other motion at 250 ms).
struct Launcher {
    child: AnyView,
    mode: Option<ezi_core::theme::Mode>,
    old_background: Option<Hsla>,
    changes: usize,
    changed_at: Option<std::time::Instant>,
}

impl Render for Launcher {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let mode = state::state(cx).mode;
        if let Some(old) = self.mode.filter(|old| *old != mode) {
            self.old_background = Some(state::hsla(ezi_core::theme::Palette::of(old).color(ezi_core::theme::Token::Background)));
            self.changes += 1;
            self.changed_at = Some(std::time::Instant::now());
        }
        self.mode = Some(mode);
        let m = motion::tokens(cx);
        // The cover is only there while the fade runs; drawn finished (clear) when reduced motion is on.
        let cover = self.changed_at.filter(|at| at.elapsed() < m.theme_switch * 2).zip(self.old_background).map(|(_, bg)| {
            motion::fade_out(("theme-fade", self.changes), m.theme_switch, ezi_core::motion::Curve::EaseInOut, div().absolute().top_0().left_0().size_full().bg(bg))
        });
        div().relative().size_full().child(self.child.clone()).children(cover)
    }
}

fn main() {
    // Lucide icons are embedded in the program (no network): the component library draws toast and spinner icons from them.
    gpui_kit::application().with_assets(assets::EziAssets).run(move |cx| {
        gpui_kit::init(cx);

        let pref = match dev("EZI_THEME").as_deref() {
            Some("light") => ThemePref::Light,
            Some("dark") => ThemePref::Dark,
            _ => ThemePref::System,
        };
        // The language chosen last time, unless a dev switch overrides it.
        let settings_path = settings::default_path();
        let remembered = settings_path.as_deref().map(settings::load).unwrap_or_default().lang;
        let lang = match dev("EZI_LANG").or(remembered).as_deref() {
            Some("en") => Lang::En,
            _ => Lang::Id,
        };
        let role = if dev("EZI_ROLE").as_deref() == Some("staff") { Role::Staff } else { Role::Admin };
        let gallery = dev("EZI_GALLERY").as_deref() == Some("1");

        let options = WindowOptions {
            titlebar: Some(TitlebarOptions { title: Some(ezi_core::window_title().into()), ..Default::default() }),
            window_bounds: Some(WindowBounds::Windowed(Bounds::centered(None, window_size(), cx))),
            ..Default::default()
        };
        gpui_kit::open_window(options, cx, move |window, cx| {
            cx.set_global(AppState { lang, pref, mode: resolve(pref, window), role, user_name: "Admin Satu".into(), user_id: 0 });
            theme::apply(cx);
            // "System" follows the operating system while the app runs, not only at start (B-05 in the Phase 5 bug log).
            window.observe_window_appearance(|window, cx| {
                if state::state(cx).pref == ThemePref::System {
                    theme::set_pref(ThemePref::System, window, cx);
                }
            })
            .detach();
            let child: AnyView = if gallery {
                let gallery = cx.new(|cx| gallery::Gallery::new(window, cx));
                let content: shell::PageBuilder = Rc::new(move |_page, _window, _cx| gallery.clone().into_any_element());
                cx.new(|_| shell::AppShell::new(content)).into()
            } else {
                cx.new(|cx| auth::AuthGate::new(window, cx, settings_path.clone())).into()
            };
            // Reduced motion: read now, and again each time the window is activated (the person may have changed the setting).
            motion::refresh(cx);
            cx.new(|cx| {
                cx.observe_window_activation(window, |_, _, cx| motion::refresh(cx)).detach();
                Launcher { child, mode: None, old_background: None, changes: 0, changed_at: None }
            })
        })
        .expect("failed to open window");
    });
}
