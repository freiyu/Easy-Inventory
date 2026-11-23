//! Stock transactions (Admin only): the list with search, type and status filters, the detail with its lines, the three
//! forms (incoming, outgoing, adjustment) and the void with a reason. Same data and rules as the web Stock pages.
//! shortcut: a row opens the detail, where Void is (the web also has a row menu); the list has no User column and no
//! sorting by header.

use std::rc::Rc;
use std::sync::Arc;

use ezi_core::api::{Client, ListMeta};
use ezi_core::format::{format_date, format_date_time, format_number};
use ezi_core::i18n::{self, error_message};
use ezi_core::models::StockTx;
use ezi_core::theme::{self, Token};
use gpui_kit::component::button::*;
use gpui_kit::component::input::{Input, InputEvent, InputState};
use gpui_kit::component::select::{SearchableVec, Select, SelectEvent, SelectState};
use gpui_kit::component::IndexPath;
use gpui_kit::prelude::*;
use gpui_kit::*;

use crate::lines::LineMode;
use crate::load::Load;
use crate::reason::ReasonPrompt;
use crate::state::{color, state, t};
use crate::stock_form::{AdjustForm, MoveForm};
use crate::widgets::{toast, Badge, Callback, Cell, Column, DataTable, Paging, StatePanel, ToastKind, Tone};

/// Rows per page: the dense layout of the redesign (PRD_REDESIGN.md 10.2).
const PAGE_SIZE: u32 = 8;
const TYPES: [&str; 6] = ["IN", "OUT", "ADJUSTMENT", "LOAN_ISSUE", "LOAN_RETURN", "REVERSAL"];

type Choice = Entity<SelectState<SearchableVec<String>>>;

enum View {
    List,
    Detail(i64),
    Move(Entity<MoveForm>),
    Adjust(Entity<AdjustForm>),
    Void(Entity<ReasonPrompt>),
}

pub fn type_tone(kind: &str) -> Tone {
    match kind {
        "IN" => Tone::Success,
        "OUT" => Tone::Warning,
        "ADJUSTMENT" => Tone::Info,
        "REVERSAL" => Tone::Danger,
        _ => Tone::Neutral,
    }
}

fn status_tone(status: &str) -> Tone {
    if status == "Voided" { Tone::Neutral } else { Tone::Success }
}

pub struct StockPage {
    client: Arc<Client>,
    view: View,
    search: Entity<InputState>,
    type_select: Choice,
    status_select: Choice,
    kind: Option<&'static str>,
    status: Option<&'static str>,
    page: u32,
    list: Load<(Vec<StockTx>, ListMeta)>,
    list_generation: u32,
    detail: Load<StockTx>,
    detail_generation: u32,
    _subscriptions: Vec<Subscription>,
}

fn choice(labels: Vec<String>, window: &mut Window, cx: &mut Context<StockPage>) -> Choice {
    cx.new(|cx| SelectState::new(SearchableVec::new(labels), Some(IndexPath::default()), window, cx))
}

impl StockPage {
    pub fn new(client: Arc<Client>, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let s = t(cx);
        let type_labels = std::iter::once(s.stock_all_types.to_string()).chain(TYPES.iter().map(|k| i18n::tx_type_label(state(cx).lang, k))).collect();
        let status_labels = vec![s.stock_all_statuses.to_string(), s.status_tx_status_posted.to_string(), s.status_tx_status_voided.to_string()];
        let (type_select, status_select) = (choice(type_labels, window, cx), choice(status_labels, window, cx));
        let search = cx.new(|cx| InputState::new(window, cx).placeholder(s.stock_search_placeholder.to_string()));
        let mut subs = Vec::new();
        subs.push(cx.subscribe_in(&search, window, |this, _, ev: &InputEvent, _, cx| {
            if let InputEvent::Change = ev {
                this.page = 1;
                this.fetch_list(cx);
            }
        }));
        subs.push(cx.subscribe_in(&type_select, window, |this, _, ev: &SelectEvent<SearchableVec<String>>, _, cx| {
            if let SelectEvent::Confirm(Some(label)) = ev {
                let lang = state(cx).lang;
                this.kind = TYPES.into_iter().find(|k| i18n::tx_type_label(lang, k) == *label);
                this.page = 1;
                this.fetch_list(cx);
            }
        }));
        subs.push(cx.subscribe_in(&status_select, window, |this, _, ev: &SelectEvent<SearchableVec<String>>, _, cx| {
            if let SelectEvent::Confirm(Some(label)) = ev {
                let s = t(cx);
                this.status = if label == s.status_tx_status_posted { Some("Posted") } else if label == s.status_tx_status_voided { Some("Voided") } else { None };
                this.page = 1;
                this.fetch_list(cx);
            }
        }));
        let mut page = StockPage {
            client,
            view: View::List,
            search,
            type_select,
            status_select,
            kind: None,
            status: None,
            page: 1,
            list: Load::Loading,
            list_generation: 0,
            detail: Load::Loading,
            detail_generation: 0,
            _subscriptions: subs,
        };
        page.fetch_list(cx);
        page
    }

    /// Back to the list, with the rows fetched again (the shell calls this when the page is opened).
    pub fn show_list(&mut self, cx: &mut Context<Self>) {
        self.view = View::List;
        self.fetch_list(cx);
    }

    fn dirty(&self, cx: &App) -> bool {
        !self.search.read(cx).value().trim().is_empty() || self.kind.is_some() || self.status.is_some()
    }

    fn fetch_list(&mut self, cx: &mut Context<Self>) {
        self.list_generation += 1;
        let (generation, client, page) = (self.list_generation, self.client.clone(), self.page);
        let (search, kind, status) = (self.search.read(cx).value().trim().to_string(), self.kind, self.status);
        if !matches!(self.list, Load::Ready(_)) {
            self.list = Load::Loading;
        }
        cx.notify();
        cx.spawn(async move |this, cx| {
            let result = cx
                .background_executor()
                .spawn(async move {
                    let (page, size) = (page.to_string(), PAGE_SIZE.to_string());
                    let mut q = vec![("page", page.as_str()), ("pageSize", size.as_str()), ("sort", "date:desc")];
                    if !search.is_empty() {
                        q.push(("search", search.as_str()));
                    }
                    if let Some(k) = kind {
                        q.push(("type", k));
                    }
                    if let Some(s) = status {
                        q.push(("status", s));
                    }
                    client.stock_transactions(&q).map(|s| {
                        let meta = s.meta.unwrap_or(ListMeta { page: 1, page_size: PAGE_SIZE, total: s.data.len() as u32 });
                        (s.data, meta)
                    })
                })
                .await;
            this.update(cx, |this, cx| {
                if this.list_generation == generation {
                    this.list = Load::from_result(result);
                    cx.notify();
                }
            })
            .ok();
        })
        .detach();
    }

    fn clear_filters(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        (self.kind, self.status, self.page) = (None, None, 1);
        self.search.update(cx, |s, cx| s.set_value("", window, cx));
        for select in [&self.type_select, &self.status_select] {
            select.update(cx, |s, cx| s.set_selected_index(Some(IndexPath::default()), window, cx));
        }
        self.fetch_list(cx);
    }

    fn open_detail(&mut self, id: i64, cx: &mut Context<Self>) {
        self.view = View::Detail(id);
        self.detail = Load::Loading;
        self.detail_generation += 1;
        let (generation, client) = (self.detail_generation, self.client.clone());
        cx.notify();
        cx.spawn(async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.stock_transaction(id) }).await;
            this.update(cx, |this, cx| {
                if this.detail_generation == generation {
                    this.detail = Load::from_result(result);
                    cx.notify();
                }
            })
            .ok();
        })
        .detach();
    }

    /// What a form calls when it finishes or is cancelled: back to the list with fresh rows.
    fn back_to_list(&self, cx: &mut Context<Self>) -> Callback {
        let this = cx.entity().downgrade();
        Rc::new(move |_window, cx| {
            this.update(cx, |page, cx| page.show_list(cx)).ok();
        })
    }

    fn open_move(&mut self, mode: LineMode, window: &mut Window, cx: &mut Context<Self>) {
        let (client, done) = (self.client.clone(), self.back_to_list(cx));
        self.view = View::Move(cx.new(|cx| MoveForm::new(client, mode, done, window, cx)));
        cx.notify();
    }

    fn open_adjust(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let (client, done) = (self.client.clone(), self.back_to_list(cx));
        self.view = View::Adjust(cx.new(|cx| AdjustForm::new(client, done, window, cx)));
        cx.notify();
    }

    /// Void asks for a reason first; on success the detail shows the result (the original now voided, with its reversal).
    fn open_void(&mut self, tx: &StockTx, window: &mut Window, cx: &mut Context<Self>) {
        let (s, lang) = (t(cx), state(cx).lang);
        let (id, client) = (tx.id, self.client.clone());
        let page = cx.entity().downgrade();
        let (done_page, cancel_page) = (page.clone(), page);
        let on_done: Callback = Rc::new(move |window, cx| {
            let text = t(cx).stock_voided;
            toast(window, cx, ToastKind::Success, text);
            done_page.update(cx, |p, cx| p.open_detail(id, cx)).ok();
        });
        let on_cancel: Callback = Rc::new(move |_, cx| {
            cancel_page.update(cx, |p, cx| p.open_detail(id, cx)).ok();
        });
        let run = Arc::new(move |reason: String| client.void_stock(id, &reason).map(|_| ()));
        let title = i18n::void_title(lang, &tx.number);
        self.view = View::Void(cx.new(|cx| ReasonPrompt::new(title, s.stock_void_body, s.stock_void_confirm, true, run, on_done, on_cancel, window, cx)));
        cx.notify();
    }
}

fn heading(cx: &App, text: &str) -> impl IntoElement {
    div().text_size(px(theme::TEXT_SECTION)).font_weight(FontWeight::SEMIBOLD).text_color(color(cx, Token::Foreground)).child(text.to_string())
}

fn card(cx: &App) -> Div {
    div().flex().flex_col().gap(px(theme::SPACE_3)).p(px(theme::SPACE_4)).rounded(px(theme::RADIUS_CARD)).border_1().border_color(color(cx, Token::Border)).bg(color(cx, Token::Card))
}

fn labelled(cx: &App, label: &str, value: impl IntoElement) -> Div {
    div()
        .flex()
        .flex_col()
        .gap(px(theme::SPACE_HALF))
        .child(div().text_size(px(theme::TEXT_TABLE)).text_color(color(cx, Token::MutedForeground)).child(label.to_string()))
        .child(div().text_size(px(theme::TEXT_BODY)).font_weight(FontWeight::SEMIBOLD).child(value))
}

impl StockPage {
    fn render_list(&mut self, cx: &mut Context<Self>) -> AnyElement {
        let s = t(cx);
        let lang = state(cx).lang;
        let this = cx.entity();
        let body: AnyElement = match &self.list {
            Load::Loading => StatePanel::loading(cx).into_any_element(),
            Load::Failed(e) => {
                let message = error_message(lang, e);
                let this = this.clone();
                StatePanel::error(cx, message, move |_, cx| this.update(cx, |p, cx| p.fetch_list(cx))).into_any_element()
            }
            Load::Ready((rows, meta)) => {
                let columns = vec![Column::new(s.stock_col_number).width(175.), Column::new(s.stock_col_date).width(100.), Column::new(s.stock_col_type).width(140.), Column::new(s.stock_col_items), Column::new(s.stock_col_party).width(140.), Column::new(s.stock_col_total).right().width(120.), Column::new(s.stock_col_status).width(120.)];
                let cells: Vec<Vec<Cell>> = rows
                    .iter()
                    .map(|x| {
                        let first = x.lines.first().map_or(String::new(), |l| l.item_name.clone());
                        let items = if x.lines.len() > 1 { format!("{first} {}", i18n::stock_more_items(lang, x.lines.len() - 1)) } else { first };
                        vec![
                            x.number.clone().into(),
                            format_date(&x.date).into(),
                            Badge::new(type_tone(&x.kind), i18n::tx_type_label(lang, &x.kind)).into(),
                            items.into(),
                            if x.party.is_empty() { "-".to_string() } else { x.party.clone() }.into(),
                            if x.kind == "IN" { format!("Rp {}", format_number(x.total)) } else { "-".to_string() }.into(),
                            Badge::new(status_tone(&x.status), i18n::tx_status_label(lang, &x.status)).into(),
                        ]
                    })
                    .collect();
                let ids: Vec<i64> = rows.iter().map(|x| x.id).collect();
                let empty: AnyElement = if self.dirty(cx) {
                    let this = this.clone();
                    StatePanel::action(s.stock_empty_filtered, "", s.common_clear, move |w, cx| this.update(cx, |p, cx| p.clear_filters(w, cx))).into_any_element()
                } else {
                    let this = this.clone();
                    StatePanel::action(s.stock_empty_title, s.stock_empty_body, s.stock_incoming, move |w, cx| this.update(cx, |p, cx| p.open_move(LineMode::In, w, cx))).into_any_element()
                };
                let (this_page, this_row) = (this.clone(), this.clone());
                DataTable::new("stock", columns)
                    .rows(cells)
                    .empty(empty)
                    .paging(Paging { page: meta.page, page_size: meta.page_size, total: meta.total }, move |p, _, cx| {
                        this_page.update(cx, |page, cx| {
                            page.page = p;
                            page.fetch_list(cx);
                        })
                    })
                    .on_row_click(move |i, _, cx| {
                        if let Some(id) = ids.get(i).copied() {
                            this_row.update(cx, |page, cx| page.open_detail(id, cx));
                        }
                    })
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
                            .child(div().text_size(px(theme::TEXT_TITLE)).font_weight(FontWeight::SEMIBOLD).child(s.stock_title))
                            .child(div().text_size(px(theme::TEXT_BODY)).text_color(color(cx, Token::MutedForeground)).child(s.stock_description)),
                    )
                    .child(
                        div()
                            .flex()
                            .gap(px(theme::SPACE_2))
                            .child(Button::new("stock-adjust").outline().label(s.stock_adjustment).on_click(cx.listener(|this, _, w, cx| this.open_adjust(w, cx))))
                            .child(Button::new("stock-out").outline().label(s.stock_outgoing).on_click(cx.listener(|this, _, w, cx| this.open_move(LineMode::Out, w, cx))))
                            .child(Button::new("stock-in").primary().label(s.stock_incoming).on_click(cx.listener(|this, _, w, cx| this.open_move(LineMode::In, w, cx)))),
                    ),
            )
            .child(
                div()
                    .flex()
                    .flex_wrap()
                    .items_center()
                    .gap(px(theme::SPACE_2))
                    .child(div().w(px(theme::FILTER_SEARCH_WIDTH)).child(Input::new(&self.search)))
                    .child(div().w(px(theme::FILTER_STOCK_WIDTH)).child(Select::new(&self.type_select)))
                    .child(div().w(px(theme::FILTER_STATUS_WIDTH)).child(Select::new(&self.status_select))),
            )
            .child(body)
            .into_any_element()
    }

    fn render_detail(&mut self, cx: &mut Context<Self>) -> AnyElement {
        let s = t(cx);
        let lang = state(cx).lang;
        let this = cx.entity();
        let back = Button::new("stock-back").outline().label(s.common_back).on_click({
            let this = this.clone();
            move |_, _, cx| this.update(cx, |p, cx| p.show_list(cx))
        });
        let content: AnyElement = match &self.detail {
            Load::Loading => StatePanel::loading(cx).into_any_element(),
            Load::Failed(e) => {
                let message = error_message(lang, e);
                let id = if let View::Detail(id) = self.view { id } else { 0 };
                let this = this.clone();
                StatePanel::error(cx, message, move |_, cx| this.update(cx, |p, cx| p.open_detail(id, cx))).into_any_element()
            }
            Load::Ready(tx) => {
                let incoming = tx.kind == "IN";
                let link = |id: i64, number: String, key: &'static str| {
                    let this = this.clone();
                    Button::new(key).outline().label(number).on_click(move |_, _, cx| this.update(cx, |p, cx| p.open_detail(id, cx)))
                };
                let details = card(cx)
                    .child(heading(cx, s.stock_details_card))
                    .child(
                        div()
                            .flex()
                            .flex_wrap()
                            .gap_x(px(theme::SPACE_6))
                            .gap_y(px(theme::SPACE_3))
                            .child(labelled(cx, s.fields_date, format_date(&tx.date)))
                            .child(labelled(cx, s.stock_col_user, tx.user_name.clone()))
                            .child(labelled(cx, s.stock_col_party, if tx.party.is_empty() { "-".to_string() } else { tx.party.clone() }))
                            .child(labelled(cx, s.stock_note_field, if tx.notes.is_empty() { "-".to_string() } else { tx.notes.clone() }))
                            .child(labelled(cx, s.stock_recorded_at, format_date_time(&tx.created_at)))
                            .when(!tx.reason.is_empty(), |d| d.child(labelled(cx, s.stock_reason_label, tx.reason.clone())))
                            .children(tx.voided_by_id.zip(tx.voided_by_number.clone()).map(|(id, n)| labelled(cx, s.stock_voided_by, link(id, n, "stock-voided-by"))))
                            .children(tx.reversal_of_id.zip(tx.reversal_of_number.clone()).map(|(id, n)| labelled(cx, s.stock_reversal_of, link(id, n, "stock-reversal-of"))))
                            .children(tx.loan_number.clone().map(|n| labelled(cx, s.stock_linked_loan, n))),
                    );
                let mut columns = vec![Column::new(s.stock_col_item), Column::new(s.stock_col_change).right().width(110.), Column::new(s.stock_col_balance).right().width(130.)];
                if incoming {
                    columns.extend([Column::new(s.stock_col_unit_price).right().width(140.), Column::new(s.stock_col_line_total).right().width(150.)]);
                }
                let rows: Vec<Vec<Cell>> = tx
                    .lines
                    .iter()
                    .map(|l| {
                        let tone = if l.quantity_change < 0 { Token::DangerIcon } else { Token::SuccessIcon };
                        let sign = if l.quantity_change > 0 { "+" } else { "" };
                        let mut row = vec![
                            l.item_name.clone().into(),
                            Cell::Element(div().text_color(color(cx, tone)).font_weight(FontWeight::SEMIBOLD).child(format!("{sign}{}", format_number(l.quantity_change))).into_any_element()),
                            format_number(l.balance_after).into(),
                        ];
                        if incoming {
                            row.push(format!("Rp {}", format_number(l.unit_price.unwrap_or(0))).into());
                            row.push(format!("Rp {}", format_number(l.total.unwrap_or(0))).into());
                        }
                        row
                    })
                    .collect();
                div()
                    .flex()
                    .flex_col()
                    .gap(px(theme::SPACE_4))
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap(px(theme::SPACE_3))
                            .child(div().text_size(px(theme::TEXT_TITLE)).font_weight(FontWeight::SEMIBOLD).child(i18n::stock_detail_title(lang, &tx.number)))
                            .child(Badge::new(type_tone(&tx.kind), i18n::tx_type_label(lang, &tx.kind)))
                            .child(Badge::new(status_tone(&tx.status), i18n::tx_status_label(lang, &tx.status))),
                    )
                    .child(details)
                    .child(heading(cx, s.stock_lines_card))
                    .child(DataTable::new("stock-lines", columns).rows(rows))
                    .into_any_element()
            }
        };
        let void = match &self.detail {
            Load::Ready(tx) if tx.can_void() => {
                let tx = tx.clone();
                Some(Button::new("stock-void").danger().label(s.stock_void).on_click(cx.listener(move |this, _, window, cx| this.open_void(&tx, window, cx))))
            }
            _ => None,
        };
        div().flex().flex_col().gap(px(theme::SPACE_4)).child(div().flex().items_center().justify_between().child(back).children(void)).child(content).into_any_element()
    }
}

impl Render for StockPage {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        match &self.view {
            View::List => self.render_list(cx),
            View::Detail(_) => self.render_detail(cx),
            View::Move(form) => form.clone().into_any_element(),
            View::Adjust(form) => form.clone().into_any_element(),
            View::Void(prompt) => prompt.clone().into_any_element(),
        }
    }
}
