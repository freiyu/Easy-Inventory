//! The widgets every screen reuses: badge, form field, state panel, data table, confirm dialog and toast.
//! Screens must use these and not draw their own, so the app looks the same everywhere.
//! Colours come from `ezi_core::theme` tokens through `state::color`; sizes are the constants of that module.

use std::rc::Rc;

use ezi_core::i18n;
use ezi_core::theme::{self, Token};
use gpui_kit::component::button::*;
use gpui_kit::component::dialog::DialogButtonProps;
use gpui_kit::component::notification::Notification;
use gpui_kit::component::spinner::Spinner;
use gpui_kit::component::*;
use gpui_kit::prelude::*;
use gpui_kit::*;

use crate::state::{color, state, t};

pub type Callback = Rc<dyn Fn(&mut Window, &mut App)>;

// ------------------------------------------------------------------ badge

/// The meaning of a badge. Always shown with a text label too: never colour alone.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Tone {
    Success,
    Warning,
    Danger,
    Info,
    Neutral,
}

#[derive(IntoElement)]
pub struct Badge {
    tone: Tone,
    label: SharedString,
}

impl Badge {
    pub fn new(tone: Tone, label: impl Into<SharedString>) -> Self {
        Badge { tone, label: label.into() }
    }
}

impl RenderOnce for Badge {
    fn render(self, _window: &mut Window, cx: &mut App) -> impl IntoElement {
        let (bg, fg) = match self.tone {
            Tone::Success => (Token::SuccessSoft, Token::SuccessIcon),
            Tone::Warning => (Token::WarningSoft, Token::WarningIcon),
            Tone::Danger => (Token::DangerSoft, Token::DangerIcon),
            Tone::Info => (Token::InfoSoft, Token::InfoIcon),
            Tone::Neutral => (Token::Muted, Token::MutedForeground),
        };
        div()
            .flex()
            .items_center()
            .h(px(theme::BADGE_HEIGHT))
            .px(px(theme::SPACE_2))
            .rounded(px(theme::RADIUS))
            .bg(color(cx, bg))
            .text_color(color(cx, fg))
            .text_size(px(theme::TEXT_LABEL))
            .font_weight(FontWeight::SEMIBOLD)
            .child(self.label)
    }
}

// ------------------------------------------------------------------ form field

/// Label above, control, then the hint or the error below. A required field gets a `*` next to the label.
#[derive(IntoElement)]
pub struct FormField {
    label: SharedString,
    required: bool,
    hint: Option<SharedString>,
    error: Option<SharedString>,
    control: AnyElement,
}

impl FormField {
    pub fn new(label: impl Into<SharedString>, control: impl IntoElement) -> Self {
        FormField { label: label.into(), required: false, hint: None, error: None, control: control.into_any_element() }
    }
    pub fn required(mut self) -> Self {
        self.required = true;
        self
    }
    pub fn hint(mut self, hint: impl Into<SharedString>) -> Self {
        self.hint = Some(hint.into());
        self
    }
    pub fn error(mut self, error: Option<impl Into<SharedString>>) -> Self {
        self.error = error.map(Into::into);
        self
    }
}

impl RenderOnce for FormField {
    fn render(self, _window: &mut Window, cx: &mut App) -> impl IntoElement {
        let label = div()
            .flex()
            .gap(px(theme::SPACE_HALF))
            .text_size(px(theme::TEXT_LABEL))
            .font_weight(FontWeight::SEMIBOLD)
            .text_color(color(cx, Token::Foreground))
            .child(self.label)
            .when(self.required, |d| d.child(div().text_color(color(cx, Token::DangerIcon)).child("*")));
        let note = match (&self.error, &self.hint) {
            (Some(e), _) => Some(div().text_color(color(cx, Token::DangerIcon)).font_weight(FontWeight::SEMIBOLD).child(e.clone())),
            (None, Some(h)) => Some(div().text_color(color(cx, Token::MutedForeground)).child(h.clone())),
            _ => None,
        };
        div()
            .flex()
            .flex_col()
            .gap(px(theme::SPACE_1_5))
            .child(label)
            .child(self.control)
            .children(note.map(|n| n.text_size(px(theme::TEXT_TABLE))))
    }
}

// ------------------------------------------------------------------ state panel

/// What a screen shows instead of its content while loading, when empty, on error and when the role has no access.
#[derive(IntoElement)]
pub struct StatePanel {
    title: SharedString,
    body: Option<SharedString>,
    retry: Option<(SharedString, Callback)>,
    busy: bool,
}

impl StatePanel {
    pub fn loading(cx: &App) -> Self {
        StatePanel { title: t(cx).common_loading.into(), body: None, retry: None, busy: true }
    }
    pub fn empty(cx: &App) -> Self {
        StatePanel { title: t(cx).states_empty_title.into(), body: None, retry: None, busy: false }
    }
    /// `message` is the server's or the network's message; the retry button runs `on_retry`.
    pub fn error(cx: &App, message: impl Into<SharedString>, on_retry: impl Fn(&mut Window, &mut App) + 'static) -> Self {
        StatePanel {
            title: t(cx).states_error_title.into(),
            body: Some(message.into()),
            retry: Some((t(cx).common_retry.into(), Rc::new(on_retry))),
            busy: false,
        }
    }
    pub fn no_access(cx: &App) -> Self {
        StatePanel { title: t(cx).states_no_access_title.into(), body: Some(t(cx).states_no_access_body.into()), retry: None, busy: false }
    }
}

impl RenderOnce for StatePanel {
    fn render(self, _window: &mut Window, cx: &mut App) -> impl IntoElement {
        div()
            .flex()
            .flex_col()
            .items_center()
            .justify_center()
            .gap(px(theme::SPACE_2))
            .p(px(theme::SPACE_8))
            .rounded(px(theme::RADIUS_CARD))
            .border_1()
            .border_color(color(cx, Token::Border))
            .bg(color(cx, Token::Card))
            .child(
                div()
                    .text_size(px(theme::TEXT_SECTION))
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(color(cx, Token::Foreground))
                    .child(self.title),
            )
            .children(self.body.map(|b| {
                div().max_w(px(theme::TEXT_MAX_WIDTH)).text_center().text_size(px(theme::TEXT_BODY)).text_color(color(cx, Token::MutedForeground)).child(b)
            }))
            .children(self.retry.map(|(label, run)| {
                Button::new("state-retry").outline().label(label).on_click(move |_, window, cx| run(window, cx))
            }))
            .when(self.busy, |d| d.child(Spinner::new()))
    }
}

// ------------------------------------------------------------------ data table

#[derive(Clone)]
pub struct Column {
    pub title: SharedString,
    pub right: bool,
    /// Fixed width in pixels; `None` shares the rest equally.
    pub width: Option<f32>,
}

impl Column {
    pub fn new(title: impl Into<SharedString>) -> Self {
        Column { title: title.into(), right: false, width: None }
    }
    /// Numbers are right-aligned (docs/DESIGN.md).
    pub fn right(mut self) -> Self {
        self.right = true;
        self
    }
    pub fn width(mut self, w: f32) -> Self {
        self.width = Some(w);
        self
    }
}

pub enum Cell {
    Text(SharedString),
    Element(AnyElement),
}

impl From<&str> for Cell {
    fn from(s: &str) -> Self {
        Cell::Text(s.to_string().into())
    }
}
impl From<String> for Cell {
    fn from(s: String) -> Self {
        Cell::Text(s.into())
    }
}
impl From<Badge> for Cell {
    fn from(b: Badge) -> Self {
        Cell::Element(b.into_any_element())
    }
}

/// Paging as the server reports it.
#[derive(Clone, Copy)]
pub struct Paging {
    pub page: u32,
    pub page_size: u32,
    pub total: u32,
}

/// A dense table (header 36 px, rows 40 px, text 14 px) with the paging bar of the web app.
#[derive(IntoElement)]
pub struct DataTable {
    id: SharedString,
    columns: Vec<Column>,
    rows: Vec<Vec<Cell>>,
    paging: Option<Paging>,
    on_page: Option<Rc<dyn Fn(u32, &mut Window, &mut App)>>,
    empty: Option<AnyElement>,
}

impl DataTable {
    pub fn new(id: impl Into<SharedString>, columns: Vec<Column>) -> Self {
        DataTable { id: id.into(), columns, rows: Vec::new(), paging: None, on_page: None, empty: None }
    }
    pub fn rows(mut self, rows: Vec<Vec<Cell>>) -> Self {
        self.rows = rows;
        self
    }
    pub fn paging(mut self, paging: Paging, on_page: impl Fn(u32, &mut Window, &mut App) + 'static) -> Self {
        self.paging = Some(paging);
        self.on_page = Some(Rc::new(on_page));
        self
    }
    /// Shown instead of the rows when there are none.
    #[allow(dead_code)] // used by the list screens of the next tasks
    pub fn empty(mut self, panel: impl IntoElement) -> Self {
        self.empty = Some(panel.into_any_element());
        self
    }
}

fn cell_box(col: &Column, content: impl IntoElement) -> Div {
    let d = div().flex().items_center().min_w_0().overflow_hidden().px(px(theme::SPACE_3));
    let d = match col.width {
        Some(w) => d.w(px(w)).flex_none(),
        None => d.flex_1(),
    };
    if col.right { d.justify_end() } else { d }.child(content)
}

impl RenderOnce for DataTable {
    fn render(self, _window: &mut Window, cx: &mut App) -> impl IntoElement {
        let lang = state(cx).lang;
        let s = t(cx);
        let line = color(cx, Token::Border);
        let header = div()
            .flex()
            .h(px(theme::TABLE_HEADER_HEIGHT))
            .items_center()
            .bg(color(cx, Token::Muted))
            .border_b_1()
            .border_color(line)
            .text_size(px(theme::TEXT_TABLE))
            .font_weight(FontWeight::SEMIBOLD)
            .text_color(color(cx, Token::MutedForeground))
            .children(self.columns.iter().map(|c| cell_box(c, c.title.clone())));

        let body: AnyElement = if self.rows.is_empty() {
            match self.empty {
                Some(e) => div().p(px(theme::SPACE_4)).child(e).into_any_element(),
                None => div().into_any_element(),
            }
        } else {
            let hover = color(cx, Token::Muted);
            let table_id = self.id.clone();
            div()
                .flex()
                .flex_col()
                .children(self.rows.into_iter().enumerate().map(|(i, row)| {
                    div()
                        .id(SharedString::from(format!("{table_id}-row-{i}")))
                        .flex()
                        .h(px(theme::TABLE_ROW_HEIGHT))
                        .items_center()
                        .border_b_1()
                        .border_color(line)
                        .text_size(px(theme::TEXT_TABLE))
                        .text_color(color(cx, Token::Foreground))
                        .hover(move |s| s.bg(hover)) // row hover is instant (PRD_REDESIGN 10.4)
                        .children(row.into_iter().zip(self.columns.iter()).map(|(cell, col)| match cell {
                            Cell::Text(t) => cell_box(col, div().truncate().child(t)),
                            Cell::Element(e) => cell_box(col, e),
                        }))
                }))
                .into_any_element()
        };

        let footer = self.paging.map(|p| {
            let pages = p.total.div_ceil(p.page_size.max(1)).max(1);
            let from = if p.total == 0 { 0 } else { (p.page - 1) * p.page_size + 1 };
            let to = (p.page * p.page_size).min(p.total);
            let go = self.on_page.clone().unwrap_or_else(|| Rc::new(|_, _, _| {}));
            let (go_prev, go_next) = (go.clone(), go);
            let page = p.page;
            div()
                .flex()
                .items_center()
                .justify_between()
                .h(px(theme::TABLE_FOOTER_HEIGHT))
                .px(px(theme::SPACE_3))
                .text_size(px(theme::TEXT_TABLE))
                .text_color(color(cx, Token::MutedForeground))
                .child(i18n::showing(lang, from, to, p.total))
                .child(
                    div()
                        .flex()
                        .items_center()
                        .gap(px(theme::SPACE_2))
                        .child(Button::new("page-prev").outline().label(s.common_previous).disabled(page <= 1).on_click(move |_, w, cx| go_prev(page - 1, w, cx)))
                        .child(i18n::page(lang, page))
                        .child(Button::new("page-next").outline().label(s.common_next).disabled(page >= pages).on_click(move |_, w, cx| go_next(page + 1, w, cx))),
                )
        });

        div()
            .flex()
            .flex_col()
            .rounded(px(theme::RADIUS_CARD))
            .border_1()
            .border_color(line)
            .bg(color(cx, Token::Card))
            .overflow_hidden()
            .child(header)
            .child(body)
            .children(footer)
    }
}

// ------------------------------------------------------------------ dialog and toast

/// A confirmation: title, text, a primary button and a cancel button. `destructive` makes the main button red.
pub fn confirm(
    window: &mut Window,
    cx: &mut App,
    title: impl Into<SharedString>,
    body: impl Into<SharedString>,
    ok_label: impl Into<SharedString>,
    destructive: bool,
    on_ok: impl Fn(&mut Window, &mut App) + 'static,
) {
    let (title, body, ok_label) = (title.into(), body.into(), ok_label.into());
    let cancel = t(cx).common_cancel;
    let on_ok = Rc::new(on_ok);
    window.open_alert_dialog(cx, move |dialog, _, _| {
        let on_ok = on_ok.clone();
        dialog
            .title(title.clone())
            .description(body.clone())
            .width(px(theme::DIALOG_WIDTH))
            .show_cancel(true)
            .button_props(
                DialogButtonProps::default()
                    .ok_text(ok_label.clone())
                    .cancel_text(cancel)
                    .ok_variant(if destructive { ButtonVariant::Danger } else { ButtonVariant::Primary }),
            )
            .on_ok(move |_, window, cx| {
                on_ok(window, cx);
                true
            })
    });
}

#[derive(Clone, Copy)]
#[allow(dead_code)] // Error and Info are used by the next tasks
pub enum ToastKind {
    Success,
    Error,
    Info,
}

/// A toast that goes away by itself.
pub fn toast(window: &mut Window, cx: &mut App, kind: ToastKind, message: impl Into<SharedString>) {
    let message = message.into();
    let note = match kind {
        ToastKind::Success => Notification::success(message),
        ToastKind::Error => Notification::error(message),
        ToastKind::Info => Notification::info(message),
    };
    window.push_notification(note, cx);
}
