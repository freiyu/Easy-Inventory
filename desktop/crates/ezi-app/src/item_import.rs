//! Import items from a CSV file (Admin): choose the file, see what will happen to every row, then confirm.
//! Nothing is saved by the preview. The server re-checks the file, takes a backup and creates only the ready rows.

use std::path::PathBuf;
use std::sync::Arc;

use ezi_core::api::{ApiError, Client};
use ezi_core::format::format_number;
use ezi_core::i18n::{self, error_message};
use ezi_core::models::{ImportReport, ImportStatus};
use ezi_core::theme::{self, Token};
use gpui_kit::component::button::*;
use gpui_kit::component::input::{Input, InputEvent, InputState};
use gpui_kit::component::Disableable;
use gpui_kit::prelude::*;
use gpui_kit::*;

use crate::item_form::Done;
use crate::state::{color, state, t};
use crate::widgets::{toast, Badge, Cell, Column, DataTable, FormField, ToastKind, Tone};

pub struct ItemImport {
    client: Arc<Client>,
    path: Entity<InputState>,
    /// The file as it was when it was checked, sent again on confirm so what is imported is what was previewed.
    csv: Option<String>,
    report: Option<ImportReport>,
    error: Option<SharedString>,
    busy: bool,
    on_done: Done,
    _subscriptions: Vec<Subscription>,
}

impl ItemImport {
    pub fn new(client: Arc<Client>, on_done: Done, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let path = cx.new(|cx| InputState::new(window, cx).placeholder("/home/me/items.csv"));
        let sub = cx.subscribe_in(&path, window, |this, _, ev: &InputEvent, window, cx| {
            if let InputEvent::PressEnter { .. } = ev {
                this.check(window, cx);
            }
        });
        ItemImport { client, path, csv: None, report: None, error: None, busy: false, on_done, _subscriptions: vec![sub] }
    }

    fn choose_file(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let rx = cx.prompt_for_paths(PathPromptOptions { files: true, directories: false, multiple: false, prompt: None });
        cx.spawn_in(window, async move |this, cx| {
            if let Ok(Ok(Some(paths))) = rx.await {
                if let Some(path) = paths.first() {
                    let shown = path.to_string_lossy().to_string();
                    this.update_in(cx, |this, window, cx| this.path.update(cx, |s, cx| s.set_value(shown, window, cx))).ok();
                }
            }
        })
        .detach();
    }

    fn reset(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.csv = None;
        self.report = None;
        self.error = None;
        self.path.update(cx, |s, cx| s.set_value("", window, cx));
        cx.notify();
    }

    fn check(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.busy {
            return;
        }
        let path = self.path.read(cx).value().trim().to_string();
        let s = t(cx);
        // A CSV may start with a byte order mark (Excel does this); it is not part of the first column name.
        let csv = match std::fs::read_to_string(PathBuf::from(&path)) {
            Ok(text) => text.trim_start_matches('\u{feff}').to_string(),
            Err(_) => {
                self.error = Some(s.ui_file_unreadable.into());
                cx.notify();
                return;
            }
        };
        self.busy = true;
        self.error = None;
        cx.notify();
        let client = self.client.clone();
        let sent = csv.clone();
        cx.spawn_in(window, async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.import_preview(&sent) }).await;
            this.update_in(cx, |this, _, cx| {
                this.busy = false;
                match result {
                    Ok(report) => {
                        this.csv = Some(csv);
                        this.report = Some(report);
                    }
                    Err(e) => this.error = Some(error_message(state(cx).lang, &e).into()),
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
    }

    fn confirm(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let (Some(csv), false) = (self.csv.clone(), self.busy) else { return };
        self.busy = true;
        self.error = None;
        cx.notify();
        let client = self.client.clone();
        cx.spawn_in(window, async move |this, cx| {
            let result: Result<ImportReport, ApiError> = cx.background_executor().spawn(async move { client.import_confirm(&csv) }).await;
            this.update_in(cx, |this, window, cx| {
                this.busy = false;
                match result {
                    Ok(report) => {
                        let message = i18n::import_done(state(cx).lang, report.created);
                        toast(window, cx, ToastKind::Success, message);
                        (this.on_done.clone())(None, window, cx);
                    }
                    Err(e) => this.error = Some(error_message(state(cx).lang, &e).into()),
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
    }
}

impl Render for ItemImport {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let s = t(cx);
        let lang = state(cx).lang;
        let muted = color(cx, Token::MutedForeground);
        let done = self.on_done.clone();

        let picker = div()
            .flex()
            .flex_col()
            .gap(px(theme::SPACE_2))
            .max_w(px(theme::FORM_MAX_WIDTH))
            .child(FormField::new(s.item_import_file_label.to_string(), Input::new(&self.path)).hint(s.ui_file_path))
            .child(
                div()
                    .flex()
                    .gap(px(theme::SPACE_2))
                    .child(Button::new("csv-choose").outline().label(s.ui_browse).disabled(self.busy).on_click(cx.listener(|this, _, window, cx| this.choose_file(window, cx))))
                    .child(Button::new("csv-check").primary().label(if self.busy && self.report.is_none() { s.item_import_reading } else { s.ui_check_file }).disabled(self.busy).on_click(cx.listener(|this, _, window, cx| this.check(window, cx)))),
            );

        let preview: Option<AnyElement> = self.report.as_ref().map(|r| {
            let rows: Vec<Vec<Cell>> = r
                .rows
                .iter()
                .map(|row| {
                    let (tone, label) = match row.status {
                        ImportStatus::Ready => (Tone::Success, s.item_import_status_ready),
                        ImportStatus::Skipped => (Tone::Neutral, s.item_import_status_skipped),
                        ImportStatus::Error => (Tone::Danger, s.item_import_status_error),
                        ImportStatus::Imported => (Tone::Success, s.item_import_status_imported),
                    };
                    vec![
                        row.line.to_string().into(),
                        row.name.clone().into(),
                        row.category.clone().into(),
                        row.subcategory.clone().into(),
                        row.unit.clone().into(),
                        format_number(row.opening_stock).into(),
                        Cell::Element(div().flex().items_center().gap(px(theme::SPACE_2)).child(Badge::new(tone, label)).child(row.message.clone()).into_any_element()),
                    ]
                })
                .collect();
            let groups = (!r.new_categories.is_empty() || !r.new_subcategories.is_empty()).then(|| {
                let list = r.new_categories.iter().chain(r.new_subcategories.iter()).map(|g| format!("{} ({})", g.name, g.code)).collect::<Vec<_>>().join(", ");
                format!("{} {} {}", i18n::import_new_groups(lang, r.new_categories.len() as i64, r.new_subcategories.len() as i64), i18n::import_new_groups_label(lang, false), list)
            });
            div()
                .flex()
                .flex_col()
                .gap(px(theme::SPACE_3))
                .child(div().text_size(px(theme::TEXT_SECTION)).font_weight(FontWeight::SEMIBOLD).child(s.item_import_preview_title))
                .child(
                    div()
                        .flex()
                        .gap(px(theme::SPACE_2))
                        .child(Badge::new(Tone::Success, i18n::import_summary_ready(lang, r.ready)))
                        .child(Badge::new(Tone::Neutral, i18n::import_summary_skipped(lang, r.skipped)))
                        .child(Badge::new(Tone::Danger, i18n::import_summary_errors(lang, r.errors))),
                )
                .children(groups.map(|g| div().text_size(px(theme::TEXT_TABLE)).text_color(muted).child(g)))
                .child(DataTable::new(
                    "import-rows",
                    vec![Column::new(s.item_import_col_line).right().width(60.), Column::new(s.items_col_name), Column::new(s.items_col_category).width(110.), Column::new(s.items_col_subcategory).width(110.), Column::new(s.items_col_unit).width(70.), Column::new(s.fields_opening_stock).right().width(100.), Column::new(s.item_import_col_result)],
                ).rows(rows))
                .child(div().text_size(px(theme::TEXT_TABLE)).text_color(muted).child(s.item_import_backup_note))
                .child(
                    div()
                        .flex()
                        .gap(px(theme::SPACE_2))
                        .child(Button::new("csv-confirm").primary().label(if self.busy { s.item_import_confirming.to_string() } else { i18n::import_confirm(lang, r.ready) }).disabled(self.busy || r.ready == 0).on_click(cx.listener(|this, _, window, cx| this.confirm(window, cx))))
                        .child(Button::new("csv-another").outline().label(s.item_import_another).disabled(self.busy).on_click(cx.listener(|this, _, window, cx| this.reset(window, cx)))),
                )
                .into_any_element()
        });

        div()
            .flex()
            .flex_col()
            .gap(px(theme::SPACE_4))
            .child(div().flex().child(Button::new("csv-back").outline().label(s.item_import_back_to_items).on_click(move |_, w, cx| done(None, w, cx))))
            .child(div().text_size(px(theme::TEXT_TITLE)).font_weight(FontWeight::SEMIBOLD).child(s.item_import_title))
            .child(div().text_size(px(theme::TEXT_BODY)).text_color(muted).max_w(px(theme::FORM_MAX_WIDTH)).child(s.item_import_desc))
            .child(picker)
            .children(self.error.clone().map(|e| div().px(px(theme::SPACE_3)).py(px(theme::SPACE_2)).rounded(px(theme::RADIUS)).bg(color(cx, Token::DangerSoft)).text_size(px(theme::TEXT_TABLE)).text_color(color(cx, Token::Foreground)).child(e)))
            .children(preview)
    }
}
