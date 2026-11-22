//! Developer page that shows every shared widget at once, in the current theme and language.
//! Opened only with `EZI_GALLERY=1` (see main.rs). It exists so the widgets can be looked at and checked
//! without a server, and is replaced by real screens in the next tasks.

use ezi_core::theme;
use gpui_kit::component::button::*;
use gpui_kit::component::input::*;
use gpui_kit::*;

use crate::state::{color, t};
use crate::widgets::*;
use ezi_core::theme::Token;

pub struct Gallery {
    name: Entity<InputState>,
    email: Entity<InputState>,
    page: u32,
}

impl Gallery {
    pub fn new(window: &mut Window, cx: &mut Context<Self>) -> Self {
        Gallery { name: cx.new(|cx| InputState::new(window, cx)), email: cx.new(|cx| InputState::new(window, cx)), page: 1 }
    }
}

fn heading(cx: &App, text: &'static str) -> impl IntoElement {
    div().text_size(px(theme::TEXT_SECTION)).font_weight(FontWeight::SEMIBOLD).text_color(color(cx, Token::Foreground)).child(text)
}

impl Render for Gallery {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let s = t(cx);
        let this = cx.entity();
        let rows: Vec<Vec<Cell>> = vec![
            vec!["Kertas A4".into(), "Gudang".into(), Badge::new(Tone::Success, "Aman").into(), "120".into()],
            vec!["Spidol hitam".into(), "Ruang rapat".into(), Badge::new(Tone::Warning, "Menipis").into(), "6".into()],
            vec!["Proyektor".into(), "Aula".into(), Badge::new(Tone::Danger, "Habis").into(), "0".into()],
        ];
        let table = DataTable::new(
            "gallery-table",
            vec![Column::new(s.nav_items), Column::new(s.nav_categories).width(160.), Column::new(s.common_status).width(140.), Column::new(s.common_total).right().width(100.)],
        )
        .rows(rows)
        .paging(Paging { page: self.page, page_size: 3, total: 8 }, move |p, _, cx| {
            this.update(cx, |g, cx| {
                g.page = p;
                cx.notify();
            })
        });

        div()
            .flex()
            .flex_col()
            .gap(px(20.))
            .child(div().text_size(px(theme::TEXT_TITLE)).font_weight(FontWeight::SEMIBOLD).child(s.nav_dashboard))
            .child(heading(cx, "Badge"))
            .child(
                div()
                    .flex()
                    .gap(px(theme::SPACE_2))
                    .child(Badge::new(Tone::Success, "Aktif"))
                    .child(Badge::new(Tone::Warning, "Menunggu"))
                    .child(Badge::new(Tone::Danger, "Terlambat"))
                    .child(Badge::new(Tone::Info, "Dipinjam"))
                    .child(Badge::new(Tone::Neutral, "Dibatalkan")),
            )
            .child(heading(cx, "Form field"))
            .child(
                div()
                    .flex()
                    .gap(px(theme::SPACE_4))
                    .child(div().w(px(300.)).child(FormField::new(s.common_search, Input::new(&self.name)).required().hint(s.common_optional)))
                    .child(div().w(px(300.)).child(FormField::new("Email", Input::new(&self.email)).required().error(Some(s.common_required)))),
            )
            .child(heading(cx, "Button, dialog, toast"))
            .child(
                div()
                    .flex()
                    .gap(px(theme::SPACE_2))
                    .child(Button::new("b-primary").primary().label(s.common_save))
                    .child(Button::new("b-outline").outline().label(s.common_cancel))
                    .child(Button::new("b-danger").danger().label(s.common_delete).on_click(move |_, w, cx| {
                        let s = t(cx);
                        confirm(w, cx, s.common_delete, s.common_confirm, s.common_delete, true, |w, cx| toast(w, cx, ToastKind::Success, "OK"));
                    }))
                    .child(Button::new("b-toast").outline().label("Toast").on_click(move |_, w, cx| toast(w, cx, ToastKind::Success, t(cx).common_save))),
            )
            .child(heading(cx, "Table"))
            .child(table)
            .child(heading(cx, "State panel"))
            .child(
                div()
                    .flex()
                    .flex_wrap()
                    .gap(px(theme::SPACE_4))
                    .child(div().w(px(280.)).child(StatePanel::loading(cx)))
                    .child(div().w(px(280.)).child(StatePanel::empty(cx)))
                    .child(div().w(px(420.)).child(StatePanel::error(cx, t(cx).errors_network, |_, _| {})))
                    .child(div().w(px(420.)).child(StatePanel::no_access(cx))),
            )
    }
}
