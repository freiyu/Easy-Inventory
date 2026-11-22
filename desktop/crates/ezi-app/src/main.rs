// Hide the console window in release builds on Windows.
#![cfg_attr(all(not(debug_assertions), windows), windows_subsystem = "windows")]

mod gallery;
mod shell;
mod state;
mod theme;
mod widgets;

use std::rc::Rc;

use ezi_core::api::{Lang, Role};
use gpui_kit::component::button::*;
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

/// P3-T1 placeholder, shown until the login screen exists.
struct Hello;

impl Render for Hello {
    fn render(&mut self, _window: &mut Window, _cx: &mut Context<Self>) -> impl IntoElement {
        div()
            .flex()
            .flex_col()
            .gap_3()
            .size_full()
            .items_center()
            .justify_center()
            .child(ezi_core::window_title())
            .child(Button::new("ok").primary().label("OK"))
    }
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
        let lang = if dev("EZI_LANG").as_deref() == Some("en") { Lang::En } else { Lang::Id };
        let role = if dev("EZI_ROLE").as_deref() == Some("staff") { Role::Staff } else { Role::Admin };
        let gallery = dev("EZI_GALLERY").as_deref() == Some("1");

        let options = WindowOptions {
            titlebar: Some(TitlebarOptions { title: Some(ezi_core::window_title().into()), ..Default::default() }),
            window_bounds: Some(WindowBounds::Windowed(Bounds::centered(None, window_size(), cx))),
            ..Default::default()
        };
        gpui_kit::open_window(options, cx, move |window, cx| {
            cx.set_global(AppState { lang, pref, mode: resolve(pref, window), role, user_name: "Admin Satu".into() });
            theme::apply(cx);
            let child: AnyView = if gallery {
                let gallery = cx.new(|cx| gallery::Gallery::new(window, cx));
                let content: shell::PageBuilder = Rc::new(move |_page, _window, _cx| gallery.clone().into_any_element());
                cx.new(|_| shell::AppShell::new(content)).into()
            } else {
                cx.new(|_| Hello).into()
            };
            cx.new(|_| Launcher { child })
        })
        .expect("failed to open window");
    });
}
