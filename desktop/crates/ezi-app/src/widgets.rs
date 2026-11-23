//! The widgets every screen reuses: badge, form field, state panel, data table, confirm dialog and toast.
//! Screens must use these and not draw their own, so the app looks the same everywhere.
//! Colours come from `ezi_core::theme` tokens through `state::color`; sizes are the constants of that module.

use std::rc::Rc;
use std::sync::Arc;

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

/// Badge tone of a stock status (Safe green, Low yellow, Out red), as in the web app.
pub fn stock_tone(status: ezi_core::models::StockStatus) -> Tone {
    use ezi_core::models::StockStatus::*;
    match status {
        Safe => Tone::Success,
        Low => Tone::Warning,
        Out => Tone::Danger,
    }
}

/// Badge tone of a loan status, as in the web app (`LoanBadge`).
pub fn loan_tone(status: ezi_core::models::LoanStatus) -> Tone {
    use ezi_core::models::LoanStatus::*;
    match status {
        PendingApproval | Approved => Tone::Info,
        Completed => Tone::Success,
        Overdue => Tone::Danger,
        Draft | Rejected | Borrowed | Cancelled => Tone::Neutral,
    }
}

// ------------------------------------------------------------------ logo

/// The owner's EZI mark on a green square, then the wordmark "EZI Inventory": the web `Logo`. `large` is the size of the sign-in screens.
#[derive(IntoElement)]
pub struct Logo {
    large: bool,
}

impl Logo {
    pub fn new(large: bool) -> Self {
        Logo { large }
    }
}

impl RenderOnce for Logo {
    fn render(self, _window: &mut Window, cx: &mut App) -> impl IntoElement {
        let (square, text) = if self.large { (theme::LOGO_SIZE_LG, theme::TEXT_LOGO_LG) } else { (theme::LOGO_SIZE, theme::TEXT_LOGO) };
        let s = t(cx);
        div()
            .flex()
            .items_center()
            .gap(px(theme::LOGO_GAP))
            .child(
                div()
                    .flex()
                    .items_center()
                    .justify_center()
                    .size(px(square))
                    .flex_none()
                    .rounded(px(theme::RADIUS_CARD))
                    .bg(color(cx, Token::SidebarActiveIcon))
                    .child(svg().path(crate::assets::MARK).size(px(square)).text_color(color(cx, Token::Background))),
            )
            .child(
                div()
                    .flex()
                    .gap(px(theme::SPACE_1))
                    .items_baseline()
                    .text_size(px(text))
                    .line_height(relative(1.0))
                    .text_color(color(cx, Token::Foreground))
                    .child(div().font_weight(FontWeight::EXTRA_BOLD).child(s.app_name))
                    .child(div().font_weight(FontWeight::MEDIUM).child(s.app_product)),
            )
    }
}

// ------------------------------------------------------------------ barcode and photo

/// A Code 128 barcode, drawn as filled bars. Always black on white (see `theme::BARCODE_INK`).
/// `text` is printed under the bars; pass None to show the bars only (Staff never read the code as text).
#[derive(IntoElement)]
pub struct BarcodeView {
    value: String,
    text: Option<SharedString>,
}

impl BarcodeView {
    pub fn new(value: impl Into<String>, show_text: bool) -> Self {
        let value = value.into();
        let text = show_text.then(|| SharedString::from(value.clone()));
        BarcodeView { value, text }
    }
}

impl RenderOnce for BarcodeView {
    fn render(self, _window: &mut Window, _cx: &mut App) -> impl IntoElement {
        let Some((bars, total)) = ezi_core::code128::bars(&self.value, theme::BARCODE_QUIET_MODULES) else {
            return div().into_any_element();
        };
        let ink = crate::state::hsla(theme::BARCODE_INK);
        let paper = crate::state::hsla(theme::BARCODE_PAPER);
        let paint_bars = canvas(
            |_, _, _| (),
            move |bounds, _, window, _| {
                let unit = bounds.size.width / total as f32;
                window.paint_quad(fill(bounds, paper));
                for (start, width) in &bars {
                    let origin = point(bounds.origin.x + unit * *start as f32, bounds.origin.y);
                    window.paint_quad(fill(Bounds::new(origin, size(unit * *width as f32, bounds.size.height)), ink));
                }
            },
        )
        .w_full()
        .h(px(theme::BARCODE_HEIGHT));
        div()
            .flex()
            .flex_col()
            .items_center()
            .gap(px(theme::SPACE_1))
            .w_full()
            .p(px(theme::SPACE_2))
            .rounded(px(theme::RADIUS))
            .bg(paper)
            .text_color(ink)
            .text_size(px(theme::TEXT_TABLE))
            .child(paint_bars)
            .children(self.text)
            .into_any_element()
    }
}

/// An item's photo, or an empty state when there is none. `bytes` is the file as the server sent it.
#[derive(IntoElement)]
pub struct PhotoView {
    bytes: Option<Arc<Vec<u8>>>,
    empty_label: SharedString,
}

impl PhotoView {
    pub fn new(bytes: Option<Arc<Vec<u8>>>, empty_label: impl Into<SharedString>) -> Self {
        PhotoView { bytes, empty_label: empty_label.into() }
    }
}

/// The image type from the file's first bytes (the server only stores JPEG, PNG and WebP).
fn image_format(b: &[u8]) -> Option<ImageFormat> {
    if b.starts_with(&[0xff, 0xd8, 0xff]) {
        Some(ImageFormat::Jpeg)
    } else if b.starts_with(&[0x89, b'P', b'N', b'G']) {
        Some(ImageFormat::Png)
    } else if b.len() >= 12 && &b[0..4] == b"RIFF" && &b[8..12] == b"WEBP" {
        Some(ImageFormat::Webp)
    } else {
        None
    }
}

impl RenderOnce for PhotoView {
    fn render(self, _window: &mut Window, cx: &mut App) -> impl IntoElement {
        let frame = div()
            .flex()
            .flex_none()
            .items_center()
            .justify_center()
            .size(px(theme::PHOTO_SIZE))
            .overflow_hidden()
            .rounded(px(theme::RADIUS))
            .border_1()
            .border_color(color(cx, Token::Border))
            .bg(color(cx, Token::Muted));
        match self.bytes.as_ref().and_then(|b| image_format(b).map(|f| (f, b))) {
            Some((format, bytes)) => frame.child(img(Arc::new(Image::from_bytes(format, bytes.as_ref().clone()))).size_full().object_fit(ObjectFit::Cover)),
            None => frame.child(div().px(px(theme::SPACE_2)).text_center().text_size(px(theme::TEXT_TABLE)).text_color(color(cx, Token::MutedForeground)).child(self.empty_label)),
        }
    }
}

// ------------------------------------------------------------------ KPI card

/// One number with a label and a caption (dashboard). `value` is any element, so a card can show two numbers.
#[derive(IntoElement)]
pub struct KpiCard {
    label: SharedString,
    value: AnyElement,
    caption: Option<SharedString>,
}

impl KpiCard {
    pub fn new(label: impl Into<SharedString>, value: impl IntoElement) -> Self {
        KpiCard { label: label.into(), value: value.into_any_element(), caption: None }
    }
    pub fn caption(mut self, caption: impl Into<SharedString>) -> Self {
        self.caption = Some(caption.into());
        self
    }
}

impl RenderOnce for KpiCard {
    fn render(self, _window: &mut Window, cx: &mut App) -> impl IntoElement {
        div()
            .flex()
            .flex_col()
            .flex_1()
            .gap(px(theme::SPACE_1))
            .p(px(theme::SPACE_4))
            .rounded(px(theme::RADIUS_CARD))
            .border_1()
            .border_color(color(cx, Token::Border))
            .bg(color(cx, Token::Card))
            .child(div().text_size(px(theme::TEXT_TABLE)).text_color(color(cx, Token::MutedForeground)).child(self.label))
            .child(div().text_size(px(theme::TEXT_KPI)).font_weight(FontWeight::SEMIBOLD).line_height(relative(1.15)).child(self.value))
            .children(self.caption.map(|c| div().text_size(px(theme::TEXT_TABLE)).text_color(color(cx, Token::MutedForeground)).child(c)))
    }
}

/// A red banner for something that needs action now (an overdue loan).
#[derive(IntoElement)]
pub struct AlertBanner {
    text: SharedString,
}

impl AlertBanner {
    pub fn danger(text: impl Into<SharedString>) -> Self {
        AlertBanner { text: text.into() }
    }
}

impl RenderOnce for AlertBanner {
    fn render(self, _window: &mut Window, cx: &mut App) -> impl IntoElement {
        // `flex_1` + `min_w_0` let the text shrink to the banner and wrap instead of running out of it.
        div()
            .flex()
            .w_full()
            .px(px(theme::SPACE_4))
            .py(px(theme::SPACE_3))
            .rounded(px(theme::RADIUS_CARD))
            .bg(color(cx, Token::DangerSoft))
            .text_size(px(theme::TEXT_BODY))
            .text_color(color(cx, Token::Foreground))
            .child(div().flex_1().min_w_0().child(self.text))
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
    /// A message with one button (for example 'Clear filters').
    pub fn action(title: &str, body: &str, label: &str, run: impl Fn(&mut Window, &mut App) + 'static) -> Self {
        StatePanel { title: title.to_string().into(), body: Some(body.to_string().into()), retry: Some((label.to_string().into(), Rc::new(run))), busy: false }
    }
    /// A plain message with a title and a line of help (an empty list with an explanation).
    pub fn message(_cx: &App, title: &str, body: &str) -> Self {
        StatePanel { title: title.to_string().into(), body: Some(body.to_string().into()), retry: None, busy: false }
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
    on_row: Option<Rc<dyn Fn(usize, &mut Window, &mut App)>>,
    empty: Option<AnyElement>,
}

impl DataTable {
    pub fn new(id: impl Into<SharedString>, columns: Vec<Column>) -> Self {
        DataTable { id: id.into(), columns, rows: Vec::new(), paging: None, on_page: None, on_row: None, empty: None }
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
    /// Makes a row clickable; `f` gets the row's position.
    pub fn on_row_click(mut self, f: impl Fn(usize, &mut Window, &mut App) + 'static) -> Self {
        self.on_row = Some(Rc::new(f));
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
            let on_row = self.on_row.clone();
            div()
                .flex()
                .flex_col()
                .children(self.rows.into_iter().enumerate().map(|(i, row)| {
                    let on_row = on_row.clone();
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
                        .when(on_row.is_some(), |d| d.cursor_pointer())
                        .on_click(move |_, window, cx| {
                            if let Some(f) = &on_row {
                                f(i, window, cx);
                            }
                        })
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
