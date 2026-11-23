//! Backup (Admin only): make a backup now, see the files the server keeps, and download one to the Downloads folder.
//! There is no restore here: restoring is a tool on the host PC, not part of the app (PRD 2.6), and the page says so, like the
//! web page does. A backup file holds the whole database: it is never opened or sent anywhere by this app.

use std::sync::Arc;

use ezi_core::api::{Client, ListMeta};
use ezi_core::files;
use ezi_core::format::{format_date_time, format_size};
use ezi_core::i18n::{self, error_message};
use ezi_core::models::{BackupFile, BACKUP_RETENTION};
use ezi_core::theme::{self, Token};
use gpui_kit::component::button::*;
use gpui_kit::component::Disableable;
use gpui_kit::prelude::*;
use gpui_kit::*;

use crate::load::Load;
use crate::state::{color, state, t};
use crate::widgets::{toast, Badge, Cell, Column, DataTable, KpiCard, Paging, StatePanel, ToastKind, Tone};

/// Rows per page: the dense layout of the redesign (PRD_REDESIGN.md 10.2).
const PAGE_SIZE: u32 = 8;

pub struct BackupPage {
    client: Arc<Client>,
    page: u32,
    list: Load<(Vec<BackupFile>, ListMeta)>,
    /// The newest file and the total, whatever page the table shows.
    newest: Option<(Option<BackupFile>, u32)>,
    generation: u32,
    creating: bool,
    downloading: Option<i64>,
}

impl BackupPage {
    pub fn new(client: Arc<Client>, cx: &mut Context<Self>) -> Self {
        let mut page = BackupPage { client, page: 1, list: Load::Loading, newest: None, generation: 0, creating: false, downloading: None };
        page.refresh(cx);
        page
    }

    /// Fetches the table and the two summary numbers again (the shell calls this when the page is opened).
    pub fn refresh(&mut self, cx: &mut Context<Self>) {
        self.generation += 1;
        let (generation, client, page) = (self.generation, self.client.clone(), self.page);
        if !matches!(self.list, Load::Ready(_)) {
            self.list = Load::Loading;
        }
        cx.notify();
        cx.spawn(async move |this, cx| {
            let result = cx
                .background_executor()
                .spawn(async move {
                    let (page, size) = (page.to_string(), PAGE_SIZE.to_string());
                    let list = client.backups(&[("page", page.as_str()), ("pageSize", size.as_str()), ("sort", "created:desc")])?;
                    let newest = client.backups(&[("pageSize", "1"), ("sort", "created:desc")])?;
                    let meta = list.meta.unwrap_or(ListMeta { page: 1, page_size: PAGE_SIZE, total: list.data.len() as u32 });
                    let total = newest.meta.map_or(newest.data.len() as u32, |m| m.total);
                    Ok::<_, ezi_core::api::ApiError>(((list.data, meta), (newest.data.into_iter().next(), total)))
                })
                .await;
            this.update(cx, |this, cx| {
                if this.generation == generation {
                    match result {
                        Ok((list, newest)) => (this.list, this.newest) = (Load::Ready(list), Some(newest)),
                        Err(e) => this.list = Load::Failed(e),
                    }
                    cx.notify();
                }
            })
            .ok();
        })
        .detach();
    }

    fn create(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.creating {
            return;
        }
        self.creating = true;
        cx.notify();
        let client = self.client.clone();
        cx.spawn_in(window, async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.create_backup() }).await;
            this.update_in(cx, |this, window, cx| {
                this.creating = false;
                let lang = state(cx).lang;
                match result {
                    Ok(file) => {
                        toast(window, cx, ToastKind::Success, i18n::backup_created(lang, &file.file_name));
                        this.page = 1;
                        this.refresh(cx);
                    }
                    Err(e) => toast(window, cx, ToastKind::Error, error_message(lang, &e)),
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
    }

    /// The backup file saved into Downloads under its own name (never over an existing file).
    fn download(&mut self, id: i64, window: &mut Window, cx: &mut Context<Self>) {
        if self.downloading.is_some() {
            return;
        }
        self.downloading = Some(id);
        cx.notify();
        let client = self.client.clone();
        cx.spawn_in(window, async move |this, cx| {
            let result = cx
                .background_executor()
                .spawn(async move {
                    let file = client.download_backup(id).map_err(Ok)?;
                    files::save_to_downloads(&file.file_name, &file.bytes).map_err(Err)
                })
                .await;
            this.update_in(cx, |this, window, cx| {
                this.downloading = None;
                let lang = state(cx).lang;
                match result {
                    Ok(path) => toast(window, cx, ToastKind::Success, i18n::export_saved(lang, &path.to_string_lossy())),
                    Err(Ok(api)) => toast(window, cx, ToastKind::Error, error_message(lang, &api)),
                    Err(Err(text)) => toast(window, cx, ToastKind::Error, text),
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
    }
}

impl Render for BackupPage {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let s = t(cx);
        let lang = state(cx).lang;
        let this = cx.entity();

        let body: AnyElement = match &self.list {
            Load::Loading => StatePanel::loading(cx).into_any_element(),
            Load::Failed(e) => {
                let message = error_message(lang, e);
                let this = this.clone();
                StatePanel::error(cx, message, move |_, cx| this.update(cx, |p, cx| p.refresh(cx))).into_any_element()
            }
            Load::Ready((files, meta)) => {
                let (latest, total) = self.newest.as_ref().map_or((None, 0), |(f, n)| (f.as_ref(), *n));
                let kpis = div()
                    .flex()
                    .gap(px(theme::SPACE_4))
                    .child(KpiCard::new(s.backup_last_backup, latest.map_or("-".to_string(), |f| format_date_time(&f.created_at))).caption(s.backup_last_caption))
                    .child(KpiCard::new(s.backup_kept, i18n::backup_kept_value(lang, total, BACKUP_RETENTION)).caption(i18n::backup_kept_caption(lang, BACKUP_RETENTION)));
                let columns = vec![Column::new(s.backup_col_file), Column::new(s.backup_col_created).width(150.), Column::new(s.backup_col_type).width(170.), Column::new(s.backup_col_size).right().width(90.), Column::new(s.backup_download).width(130.)];
                let busy = self.downloading;
                let rows: Vec<Vec<Cell>> = files
                    .iter()
                    .map(|f| {
                        let id = f.id;
                        let this = this.clone();
                        let download = Button::new(SharedString::from(format!("backup-download-{id}"))).outline().label(if busy == Some(id) { s.backup_downloading } else { s.backup_download }).disabled(busy.is_some()).on_click(move |_, w, cx| this.update(cx, |p, cx| p.download(id, w, cx)));
                        vec![f.file_name.clone().into(), format_date_time(&f.created_at).into(), Badge::new(Tone::Neutral, i18n::backup_kind_label(lang, &f.kind)).into(), format_size(f.size_kb).into(), Cell::Element(download.into_any_element())]
                    })
                    .collect();
                let empty: AnyElement = {
                    let this = this.clone();
                    StatePanel::action(s.backup_empty_title, s.backup_empty_body, s.backup_backup_now, move |w, cx| this.update(cx, |p, cx| p.create(w, cx))).into_any_element()
                };
                let this_page = this.clone();
                div()
                    .flex()
                    .flex_col()
                    .gap(px(theme::SPACE_4))
                    .child(kpis)
                    .child(div().text_size(px(theme::TEXT_SECTION)).font_weight(FontWeight::SEMIBOLD).child(s.backup_available))
                    .child(DataTable::new("backups", columns).rows(rows).empty(empty).paging(Paging { page: meta.page, page_size: meta.page_size, total: meta.total }, move |p, _, cx| {
                        this_page.update(cx, |page, cx| {
                            page.page = p;
                            page.refresh(cx);
                        })
                    }))
                    .child(div().px(px(theme::SPACE_4)).py(px(theme::SPACE_3)).rounded(px(theme::RADIUS)).bg(color(cx, Token::InfoSoft)).text_size(px(theme::TEXT_BODY)).child(s.backup_restore_note))
                    .into_any_element()
            }
        };

        div()
            .flex()
            .flex_col()
            .gap(px(theme::SPACE_4))
            .child(
                div()
                    .flex()
                    .items_start()
                    .justify_between()
                    .gap(px(theme::SPACE_4))
                    .child(
                        div()
                            .flex()
                            .flex_col()
                            .gap(px(theme::SPACE_1))
                            .max_w(px(theme::TEXT_MAX_WIDTH))
                            .child(div().text_size(px(theme::TEXT_TITLE)).font_weight(FontWeight::SEMIBOLD).child(s.backup_title))
                            .child(div().text_size(px(theme::TEXT_BODY)).text_color(color(cx, Token::MutedForeground)).child(s.backup_description)),
                    )
                    .child(Button::new("backup-now").primary().label(if self.creating { s.backup_creating } else { s.backup_backup_now }).disabled(self.creating).on_click(cx.listener(|this, _, w, cx| this.create(w, cx)))),
            )
            .child(div().px(px(theme::SPACE_4)).py(px(theme::SPACE_3)).rounded(px(theme::RADIUS)).bg(color(cx, Token::WarningSoft)).text_size(px(theme::TEXT_BODY)).child(s.backup_warning))
            .child(body)
    }
}
