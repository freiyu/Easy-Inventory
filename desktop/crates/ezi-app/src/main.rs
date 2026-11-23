// Hide the console window in release builds on Windows.
#![cfg_attr(all(not(debug_assertions), windows), windows_subsystem = "windows")]

mod activity;
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

/// The single root view: shows whichever screen the app starts on.
struct Launcher {
    child: AnyView,
}

impl Render for Launcher {
    fn render(&mut self, _window: &mut Window, _cx: &mut Context<Self>) -> impl IntoElement {
        self.child.clone()
    }
}

fn main() {
    // Lucide icons are embedded in the program (no network): the component library draws toast and spinner icons from them.
    gpui_kit::application().with_assets(gpui_kit::assets::Assets).run(move |cx| {
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
            let child: AnyView = if gallery {
                let gallery = cx.new(|cx| gallery::Gallery::new(window, cx));
                let content: shell::PageBuilder = Rc::new(move |_page, _window, _cx| gallery.clone().into_any_element());
                cx.new(|_| shell::AppShell::new(content)).into()
            } else {
                cx.new(|cx| auth::AuthGate::new(window, cx, settings_path.clone())).into()
            };
            cx.new(|_| Launcher { child })
        })
        .expect("failed to open window");
    });
}
