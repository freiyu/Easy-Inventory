// Hide the console window in release builds on Windows.
#![cfg_attr(all(not(debug_assertions), windows), windows_subsystem = "windows")]

use gpui_kit::component::button::*;
use gpui_kit::*;

/// P3-T1 placeholder: one window with a label and a button, to prove GPUI builds and opens on Windows.
/// The real screens come in the next tasks of Phase 3.
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

fn main() {
    gpui_kit::application().run(move |cx| {
        gpui_kit::init(cx);
        gpui_kit::open_window(WindowOptions::default(), cx, |_, cx| cx.new(|_| Hello)).expect("failed to open window");
    });
}
