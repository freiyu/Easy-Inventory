//! Purchase requests: the list with status counts, search and (Admin) requester filter; the detail with its progress and
//! every action (edit draft, submit, cancel, approve, reject with a reason, receive); the new and edit forms.
//! Same data and rules as the web Purchase pages. What may be done now comes from the server (`allowedActions`): this only
//! shows it. A request is received once and in full. Staff see their own requests and no price, supplier, code or stock
//! numbers, because the server leaves them out.
//! shortcut: the help card of the web form ("how it works") is not repeated here.

use std::rc::Rc;
use std::sync::Arc;

use ezi_core::api::{ApiError, Client, ListMeta};
use ezi_core::format::{format_date, format_date_time, format_number};
use ezi_core::i18n::{self, error_message};
use ezi_core::models::{Purchase, PurchaseStatus};
use ezi_core::theme::{self, Token};
use gpui_kit::component::button::*;
use gpui_kit::component::input::{Input, InputEvent, InputState};
use gpui_kit::component::select::{SearchableVec, Select, SelectEvent, SelectState};
use gpui_kit::component::{Disableable, IndexPath};
use gpui_kit::prelude::*;
use gpui_kit::*;

use crate::item_form::Done;
use crate::load::Load;
use crate::purchase_form::{PurchaseForm, ReceiveForm};
use crate::reason::ReasonPrompt;
use crate::state::{color, state, t};
use crate::widgets::{confirm, toast, Badge, Callback, Cell, Chip, Column, DataTable, Paging, StatePanel, ToastKind, Tone};

/// Rows per page: the dense layout of the redesign (PRD_REDESIGN.md 10.2).
const PAGE_SIZE: u32 = 8;
/// The status chips, in the web's order. "" is All; "Rejected,Cancelled" is the closed tab (the filter takes a comma list).
const CHIPS: [&str; 5] = ["", "Pending Approval", "Approved", "Received", "Rejected,Cancelled"];

type Choice = Entity<SelectState<SearchableVec<String>>>;

enum View {
    List,
    Detail(i64),
    Form(Entity<PurchaseForm>),
    Receive(Entity<ReceiveForm>),
    Reject(Entity<ReasonPrompt>),
}

pub fn status_tone(status: PurchaseStatus) -> Tone {
    match status {
        PurchaseStatus::PendingApproval | PurchaseStatus::Approved => Tone::Info,
        PurchaseStatus::Received => Tone::Success,
        PurchaseStatus::Draft | PurchaseStatus::Rejected | PurchaseStatus::Cancelled => Tone::Neutral,
    }
}

fn chip_status(chip: &str) -> Option<PurchaseStatus> {
    match chip {
        "Pending Approval" => Some(PurchaseStatus::PendingApproval),
        "Approved" => Some(PurchaseStatus::Approved),
        "Received" => Some(PurchaseStatus::Received),
        _ => None,
    }
}

pub struct PurchasesPage {
    client: Arc<Client>,
    admin: bool,
    view: View,
    search: Entity<InputState>,
    chip: &'static str,
    /// The chip chosen before this one, and a count of choices: the fade between them plays once per choice.
    prev_chip: &'static str,
    chip_epoch: u32,
    requester_select: Option<Choice>,
    /// (id, name) pairs behind `requester_select`.
    requesters: Vec<(i64, String)>,
    requester: Option<i64>,
    page: u32,
    list: Load<(Vec<Purchase>, ListMeta)>,
    list_generation: u32,
    /// The count on each chip, in `CHIPS` order, from the list's own meta (one row per request is enough).
    counts: Vec<Option<u32>>,
    detail: Load<Purchase>,
    detail_generation: u32,
    busy: bool,
    route: crate::motion::RouteTracker,
    _subscriptions: Vec<Subscription>,
}

impl PurchasesPage {
    pub fn new(client: Arc<Client>, admin: bool, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let search = cx.new(|cx| InputState::new(window, cx).placeholder(t(cx).purchases_search_placeholder.to_string()));
        let sub = cx.subscribe_in(&search, window, |this, _, ev: &InputEvent, _, cx| {
            if let InputEvent::Change = ev {
                this.page = 1;
                this.fetch_list(cx);
            }
        });
        let mut page = PurchasesPage {
            client,
            admin,
            view: View::List,
            search,
            chip: "",
            prev_chip: "",
            chip_epoch: 0,
            requester_select: None,
            requesters: Vec::new(),
            requester: None,
            page: 1,
            list: Load::Loading,
            list_generation: 0,
            counts: vec![None; CHIPS.len()],
            detail: Load::Loading,
            detail_generation: 0,
            busy: false,
            route: Default::default(),
            _subscriptions: vec![sub],
        };
        page.show_list(window, cx);
        page
    }

    /// Back to the list, with the rows and the counts fetched again (the shell calls this when the page is opened).
    pub fn show_list(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.view = View::List;
        self.prev_chip = self.chip;
        self.fetch_list(cx);
        self.fetch_counts(window, cx);
    }

    fn dirty(&self, cx: &App) -> bool {
        !self.search.read(cx).value().trim().is_empty() || !self.chip.is_empty() || self.requester.is_some()
    }

    fn fetch_list(&mut self, cx: &mut Context<Self>) {
        self.list_generation += 1;
        let (generation, client, page, chip, requester) = (self.list_generation, self.client.clone(), self.page, self.chip, self.requester);
        let search = self.search.read(cx).value().trim().to_string();
        if !matches!(self.list, Load::Ready(_)) {
            self.list = Load::Loading;
        }
        cx.notify();
        cx.spawn(async move |this, cx| {
            let result = cx
                .background_executor()
                .spawn(async move {
                    let (page, size, requester) = (page.to_string(), PAGE_SIZE.to_string(), requester.map(|r| r.to_string()));
                    let mut q = vec![("page", page.as_str()), ("pageSize", size.as_str()), ("sort", "number:desc")];
                    if !search.is_empty() {
                        q.push(("search", search.as_str()));
                    }
                    if !chip.is_empty() {
                        q.push(("status", chip));
                    }
                    if let Some(r) = &requester {
                        q.push(("requesterId", r.as_str()));
                    }
                    client.purchases(&q).map(|s| {
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

    /// One tiny read per chip for its count, and (Admin, once) the people for the requester filter.
    fn fetch_counts(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let (client, admin, need_people) = (self.client.clone(), self.admin, self.requester_select.is_none());
        cx.spawn_in(window, async move |this, cx| {
            let result = cx
                .background_executor()
                .spawn(async move {
                    let counts: Vec<Option<u32>> = CHIPS
                        .iter()
                        .map(|chip| {
                            let mut q = vec![("pageSize", "1")];
                            if !chip.is_empty() {
                                q.push(("status", chip));
                            }
                            client.purchases(&q).ok().and_then(|s| s.meta.map(|m| m.total))
                        })
                        .collect();
                    let people = if admin && need_people { client.all_people().ok() } else { None };
                    (counts, people)
                })
                .await;
            this.update_in(cx, |this, window, cx| {
                let (counts, people) = result;
                this.counts = counts;
                if let (Some(people), None) = (people, &this.requester_select) {
                    let people: Vec<(i64, String)> = people.into_iter().map(|u| (u.id, u.name)).collect();
                    let labels: Vec<String> = std::iter::once(t(cx).purchases_all_requesters.to_string()).chain(people.iter().map(|(_, n)| n.clone())).collect();
                    let select = cx.new(|cx| SelectState::new(SearchableVec::new(labels), Some(IndexPath::default()), window, cx));
                    this._subscriptions.push(cx.subscribe_in(&select, window, |this, _, ev: &SelectEvent<SearchableVec<String>>, _, cx| {
                        let SelectEvent::Confirm(label) = ev;
                        this.requester = label.as_ref().and_then(|l| this.requesters.iter().find(|(_, n)| n == l)).map(|(id, _)| *id);
                        this.page = 1;
                        this.fetch_list(cx);
                    }));
                    this.requesters = people;
                    this.requester_select = Some(select);
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
    }

    fn clear_filters(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        (self.chip, self.requester, self.page) = ("", None, 1);
        self.search.update(cx, |s, cx| s.set_value("", window, cx));
        if let Some(select) = &self.requester_select {
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
            let result = cx.background_executor().spawn(async move { client.purchase(id) }).await;
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

    /// What a form calls when it ends: `Some(id)` shows that request, `None` goes back to the list.
    fn finished(&self, cx: &mut Context<Self>) -> Done {
        let this = cx.entity().downgrade();
        Rc::new(move |id, window, cx| {
            this.update(cx, |page, cx| match id {
                Some(id) => page.open_detail(id, cx),
                None => page.show_list(window, cx),
            })
            .ok();
        })
    }

    fn open_form(&mut self, request: Option<Purchase>, window: &mut Window, cx: &mut Context<Self>) {
        let (client, admin, done) = (self.client.clone(), self.admin, self.finished(cx));
        self.view = View::Form(cx.new(|cx| PurchaseForm::new(client, request, admin, done, window, cx)));
        cx.notify();
    }

    fn open_receive(&mut self, request: Purchase, window: &mut Window, cx: &mut Context<Self>) {
        let (client, done) = (self.client.clone(), self.finished(cx));
        self.view = View::Receive(cx.new(|cx| ReceiveForm::new(client, request, done, window, cx)));
        cx.notify();
    }

    fn open_reject(&mut self, request: &Purchase, window: &mut Window, cx: &mut Context<Self>) {
        let (s, lang) = (t(cx), state(cx).lang);
        let (id, client) = (request.id, self.client.clone());
        let page = cx.entity().downgrade();
        let (done_page, cancel_page) = (page.clone(), page);
        let on_done: Callback = Rc::new(move |window, cx| {
            let text = t(cx).purchases_rejected;
            toast(window, cx, ToastKind::Success, text);
            done_page.update(cx, |p, cx| p.open_detail(id, cx)).ok();
        });
        let on_cancel: Callback = Rc::new(move |_, cx| {
            cancel_page.update(cx, |p, cx| p.open_detail(id, cx)).ok();
        });
        let run = Arc::new(move |reason: String| client.reject_purchase(id, &reason).map(|_| ()));
        let title = i18n::purchase_reject_title(lang, &request.number);
        self.view = View::Reject(cx.new(|cx| ReasonPrompt::new(title, s.purchases_reject_body, s.purchases_reject_confirm, true, run, on_done, on_cancel, window, cx)));
        cx.notify();
    }

    /// `submit`, `approve` or `cancel`: one call, then the detail shows the request as the server now has it.
    fn act(&mut self, id: i64, action: &'static str, message: &'static str, window: &mut Window, cx: &mut Context<Self>) {
        if self.busy {
            return;
        }
        self.busy = true;
        cx.notify();
        let client = self.client.clone();
        cx.spawn_in(window, async move |this, cx| {
            let result: Result<_, ApiError> = cx.background_executor().spawn(async move { client.purchase_action(id, action) }).await;
            this.update_in(cx, |this, window, cx| {
                this.busy = false;
                match result {
                    Ok(_) => {
                        toast(window, cx, ToastKind::Success, message);
                        this.open_detail(id, cx);
                    }
                    Err(e) => {
                        let text = error_message(state(cx).lang, &e);
                        toast(window, cx, ToastKind::Error, text);
                        cx.notify();
                    }
                }
            })
            .ok();
        })
        .detach();
    }

    fn confirm_cancel(&mut self, request: &Purchase, window: &mut Window, cx: &mut Context<Self>) {
        let (s, lang) = (t(cx), state(cx).lang);
        let this = cx.entity();
        let id = request.id;
        confirm(window, cx, i18n::purchase_cancel_title(lang, &request.number), s.purchases_cancel_body, s.purchases_cancel, true, move |window, cx| {
            this.update(cx, |page, cx| page.act(id, "cancel", t(cx).purchases_cancelled, window, cx));
        });
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

fn note(cx: &App, tone: Token, text: String) -> impl IntoElement {
    div().px(px(theme::SPACE_4)).py(px(theme::SPACE_3)).rounded(px(theme::RADIUS)).bg(color(cx, tone)).text_size(px(theme::TEXT_BODY)).text_color(color(cx, Token::Foreground)).child(text)
}

/// Step shown on the progress card (0-based), or None once the request is rejected or cancelled (`purchaseStep` in the web app).
fn purchase_step(status: PurchaseStatus) -> Option<usize> {
    match status {
        PurchaseStatus::Draft | PurchaseStatus::PendingApproval => Some(0),
        PurchaseStatus::Approved => Some(1),
        PurchaseStatus::Received => Some(2),
        PurchaseStatus::Rejected | PurchaseStatus::Cancelled => None,
    }
}

impl PurchasesPage {
    fn render_list(&mut self, cx: &mut Context<Self>) -> AnyElement {
        let s = t(cx);
        let lang = state(cx).lang;
        let admin = self.admin;
        let this = cx.entity();

        let body: AnyElement = match &self.list {
            Load::Loading => StatePanel::loading(cx).into_any_element(),
            Load::Failed(e) => {
                let message = error_message(lang, e);
                let this = this.clone();
                StatePanel::error(cx, message, move |_, cx| this.update(cx, |p, cx| p.fetch_list(cx))).into_any_element()
            }
            Load::Ready((rows, meta)) => {
                let mut columns = vec![Column::new(s.purchases_col_number).width(130.)];
                if admin {
                    columns.push(Column::new(s.purchases_col_requester).width(150.));
                }
                columns.extend([Column::new(s.purchases_col_items), Column::new(s.purchases_col_needed_by).width(125.), Column::new(s.purchases_col_status).width(170.)]);
                let cells: Vec<Vec<Cell>> = rows
                    .iter()
                    .map(|p| {
                        let mut row: Vec<Cell> = vec![p.number.clone().into()];
                        if admin {
                            row.push(p.requester_name.clone().into());
                        }
                        row.extend([p.line_summary.clone().into(), format_date(&p.needed_by).into(), Badge::new(status_tone(p.status), i18n::purchase_status_label(lang, p.status)).into()]);
                        row
                    })
                    .collect();
                let ids: Vec<i64> = rows.iter().map(|p| p.id).collect();
                let empty: AnyElement = if self.dirty(cx) {
                    let this = this.clone();
                    StatePanel::action(s.purchases_empty_filtered, "", s.common_clear, move |w, cx| this.update(cx, |p, cx| p.clear_filters(w, cx))).into_any_element()
                } else {
                    let this = this.clone();
                    StatePanel::action(s.purchases_empty_title, if admin { s.purchases_empty_admin_body } else { s.purchases_empty_staff_body }, s.purchases_new, move |w, cx| this.update(cx, |p, cx| p.open_form(None, w, cx))).into_any_element()
                };
                let (this_page, this_row) = (this.clone(), this.clone());
                DataTable::new("purchases", columns)
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

        let chips = CHIPS.iter().enumerate().map(|(i, &value)| {
            let label = match (value, chip_status(value)) {
                ("", _) => s.purchases_tab_all.to_string(),
                (_, Some(status)) => i18n::purchase_status_label(lang, status).to_string(),
                _ => s.purchases_tab_closed.to_string(),
            };
            let text = match self.counts.get(i).copied().flatten() {
                Some(n) => format!("{label} ({n})"),
                None => label,
            };
            let page = this.clone();
            let change = match (self.chip_epoch, value == self.chip, value == self.prev_chip) {
                (0, _, _) => None,
                (e, true, false) => Some((e, true)),
                (e, false, true) => Some((e, false)),
                _ => None,
            };
            Chip::new(SharedString::from(format!("purchase-chip-{i}")), text, self.chip == value, move |_, cx| {
                page.update(cx, |this, cx| {
                    (this.prev_chip, this.chip, this.chip_epoch, this.page) = (this.chip, value, this.chip_epoch + 1, 1);
                    this.fetch_list(cx);
                })
            })
            .change(change)
        });

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
                            .child(div().text_size(px(theme::TEXT_TITLE)).font_weight(FontWeight::SEMIBOLD).child(s.purchases_title))
                            .child(div().text_size(px(theme::TEXT_BODY)).text_color(color(cx, Token::MutedForeground)).child(if admin { s.purchases_desc_admin } else { s.purchases_desc_staff })),
                    )
                    .child(Button::new("purchase-new").primary().label(s.purchases_new).on_click(cx.listener(|this, _, w, cx| this.open_form(None, w, cx)))),
            )
            .child(div().flex().flex_wrap().gap(px(theme::SPACE_2)).children(chips))
            .child(
                div()
                    .flex()
                    .flex_wrap()
                    .items_center()
                    .gap(px(theme::SPACE_2))
                    .child(div().w(px(theme::FILTER_SEARCH_WIDTH)).child(Input::new(&self.search)))
                    .children(self.requester_select.as_ref().map(|sel| div().w(px(theme::FILTER_SELECT_WIDTH)).child(Select::new(sel)))),
            )
            .child(body)
            .into_any_element()
    }

    fn render_detail(&mut self, cx: &mut Context<Self>) -> AnyElement {
        let s = t(cx);
        let lang = state(cx).lang;
        let admin = self.admin;
        let own_id = state(cx).user_id;
        let this = cx.entity();
        let back = Button::new("purchase-back").outline().label(s.common_back).on_click({
            let this = this.clone();
            move |_, w, cx| this.update(cx, |p, cx| p.show_list(w, cx))
        });
        let content: AnyElement = match &self.detail {
            Load::Loading => StatePanel::loading(cx).into_any_element(),
            Load::Failed(e) => {
                let message = error_message(lang, e);
                let id = if let View::Detail(id) = self.view { id } else { 0 };
                let this = this.clone();
                StatePanel::error(cx, message, move |_, cx| this.update(cx, |p, cx| p.open_detail(id, cx))).into_any_element()
            }
            Load::Ready(p) => {
                let dash = |v: &str| if v.is_empty() { "-".to_string() } else { v.to_string() };
                let date = |d: &Option<String>| d.as_deref().map(format_date).unwrap_or_else(|| "-".into());
                let details = card(cx)
                    .flex_1()
                    .child(heading(cx, s.purchases_detail_title))
                    .child(
                        div()
                            .flex()
                            .flex_wrap()
                            .gap_x(px(theme::SPACE_6))
                            .gap_y(px(theme::SPACE_3))
                            .child(labelled(cx, s.fields_requester, p.requester_name.clone()))
                            .child(labelled(cx, s.purchases_created_on, format_date_time(&p.created_at)))
                            .child(labelled(cx, s.purchases_needed_by, format_date(&p.needed_by)))
                            .child(labelled(cx, s.purchases_reason, dash(&p.reason)))
                            .when(!p.notes.is_empty(), |d| d.child(labelled(cx, s.purchases_note, p.notes.clone())))
                            .when(p.approved_by.is_some(), |d| d.child(labelled(cx, if p.status == PurchaseStatus::Rejected { s.purchases_rejected_by } else { s.purchases_approved_by }, format!("{} · {}", p.approved_by_name, date(&p.approved_at)))))
                            .when(!p.reject_reason.is_empty(), |d| d.child(labelled(cx, s.purchases_reject_reason, p.reject_reason.clone())))
                            .when(p.received_at.is_some(), |d| d.child(labelled(cx, s.purchases_received_on, date(&p.received_at))))
                            .when(p.received_by.is_some(), |d| d.child(labelled(cx, s.purchases_received_by, p.received_by_name.clone())))
                            .children(p.transaction_number.clone().filter(|n| admin && !n.is_empty()).map(|n| labelled(cx, s.purchases_transaction, n))),
                    );
                let mut columns = vec![Column::new(s.purchases_col_item), Column::new(s.purchases_col_qty).right().width(120.)];
                if admin {
                    columns.extend([Column::new(s.purchases_col_stock_now).right().width(110.), Column::new(s.purchases_col_minimum).right().width(110.), Column::new(s.purchases_col_last_price).right().width(150.)]);
                }
                let rows: Vec<Vec<Cell>> = p
                    .lines
                    .iter()
                    .map(|l| {
                        // A new item is tagged, with its area and kind after the name (rows are one line high).
                        let name: Cell = match &l.new_item {
                            Some(n) => format!("{}  ·  {}  ·  {}", l.item_name, s.purchases_new_item_tag, if n.subcategory_name.is_empty() { n.category_name.clone() } else { format!("{} / {}", n.category_name, n.subcategory_name) }).into(),
                            None => l.item_name.clone().into(),
                        };
                        let mut row: Vec<Cell> = vec![name, format!("{} {}", format_number(l.quantity), l.unit).into()];
                        if admin {
                            row.push(l.current_stock.map_or("-".to_string(), format_number).into());
                            row.push(l.minimum_stock.map_or("-".to_string(), format_number).into());
                            row.push(l.last_purchase_price.map_or("-".to_string(), |v| format!("Rp {}", format_number(v))).into());
                        }
                        row
                    })
                    .collect();

                let step = purchase_step(p.status);
                let steps = [
                    (s.purchases_step_submitted, i18n::loan_step_submitted_body(lang, &p.requester_name, &format_date(&p.created_at))),
                    (s.purchases_step_approved, s.purchases_step_approved_body.to_string()),
                    (s.purchases_step_received, s.purchases_step_received_body.to_string()),
                ];
                let progress_note = match p.status {
                    PurchaseStatus::Rejected => Some(s.purchases_rejected_note),
                    PurchaseStatus::Cancelled => Some(s.purchases_cancelled_note),
                    PurchaseStatus::Draft => Some(s.purchases_draft_note),
                    _ => None,
                };
                let step_rows = steps.into_iter().enumerate().map(|(i, (title, body))| {
                    let done = if i == 0 { p.status != PurchaseStatus::Draft } else { step.is_some_and(|c| c > i) || (p.status == PurchaseStatus::Received && i == 2) };
                    let current = step == Some(i) && !done;
                    let (mark, tone) = if done { (s.purchases_step_done, Token::SuccessIcon) } else if current { (s.purchases_step_current, Token::Primary) } else { (s.purchases_step_upcoming, Token::MutedForeground) };
                    div()
                        .flex()
                        .gap(px(theme::SPACE_3))
                        .child(div().mt(px(theme::SPACE_HALF)).w(px(theme::STEP_DOT)).h(px(theme::STEP_DOT)).flex_none().rounded_full().border_2().border_color(color(cx, tone)).when(done, |d| d.bg(color(cx, Token::SuccessSoft))))
                        .child(
                            div()
                                .flex()
                                .flex_col()
                                .flex_1()
                                .min_w_0()
                                .child(div().text_size(px(theme::TEXT_BODY)).font_weight(FontWeight::SEMIBOLD).text_color(color(cx, if done || current { Token::Foreground } else { Token::MutedForeground })).child(format!("{title}{mark}")))
                                .child(div().text_size(px(theme::TEXT_TABLE)).text_color(color(cx, Token::MutedForeground)).child(body)),
                        )
                });
                let progress = card(cx).w(px(theme::SIDE_CARD_WIDTH)).child(heading(cx, s.purchases_progress)).children(step_rows).children(progress_note.map(|n| note(cx, Token::Muted, n.to_string())));

                div()
                    .flex()
                    .flex_col()
                    .gap(px(theme::SPACE_4))
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap(px(theme::SPACE_3))
                            .child(div().text_size(px(theme::TEXT_TITLE)).font_weight(FontWeight::SEMIBOLD).child(p.number.clone()))
                            .child(Badge::new(status_tone(p.status), i18n::purchase_status_label(lang, p.status))),
                    )
                    .when(admin && p.status == PurchaseStatus::PendingApproval && p.requester_id == own_id, |d| d.child(note(cx, Token::WarningSoft, s.purchases_own_request.to_string())))
                    .when(admin && p.receipt_voided, |d| d.child(note(cx, Token::WarningSoft, s.purchases_receipt_voided.to_string())))
                    .child(div().flex().items_start().gap(px(theme::SPACE_4)).child(details).child(div().flex().flex_col().gap(px(theme::SPACE_4)).child(progress).when(p.can("approve"), |d| d.child(div().w(px(theme::SIDE_CARD_WIDTH)).child(note(cx, Token::InfoSoft, s.purchases_approve_info.to_string()))))))
                    .child(heading(cx, s.purchases_items_card))
                    .child(DataTable::new("purchase-lines", columns).rows(rows))
                    .into_any_element()
            }
        };

        // The buttons are what the server allows for this request and this user right now.
        let actions: Option<Div> = match &self.detail {
            Load::Ready(p) => {
                let (busy, id) = (self.busy, p.id);
                let mut row = div().flex().flex_wrap().gap(px(theme::SPACE_2));
                if p.can("edit") {
                    let r = p.clone();
                    row = row.child(Button::new("purchase-edit").outline().label(s.purchases_edit_draft).disabled(busy).on_click(cx.listener(move |this, _, w, cx| this.open_form(Some(r.clone()), w, cx))));
                }
                if p.can("submit") {
                    row = row.child(Button::new("purchase-do-submit").primary().label(s.purchases_submit).disabled(busy).on_click(cx.listener(move |this, _, w, cx| this.act(id, "submit", t(cx).purchases_submitted, w, cx))));
                }
                if p.can("cancel") {
                    let r = p.clone();
                    row = row.child(Button::new("purchase-cancel-request").outline().label(s.purchases_cancel).disabled(busy).on_click(cx.listener(move |this, _, w, cx| this.confirm_cancel(&r, w, cx))));
                }
                if p.can("reject") {
                    let r = p.clone();
                    row = row.child(Button::new("purchase-reject").outline().label(s.purchases_reject).disabled(busy).on_click(cx.listener(move |this, _, w, cx| this.open_reject(&r, w, cx))));
                }
                if p.can("approve") {
                    row = row.child(Button::new("purchase-approve").primary().label(s.purchases_approve).disabled(busy).on_click(cx.listener(move |this, _, w, cx| this.act(id, "approve", t(cx).purchases_approved, w, cx))));
                }
                if p.can("receive") {
                    let r = p.clone();
                    row = row.child(Button::new("purchase-receive").primary().label(s.purchases_receive).disabled(busy).on_click(cx.listener(move |this, _, w, cx| this.open_receive(r.clone(), w, cx))));
                }
                Some(row)
            }
            _ => None,
        };
        div().flex().flex_col().gap(px(theme::SPACE_4)).child(div().flex().items_center().justify_between().gap(px(theme::SPACE_3)).child(back).children(actions)).child(content).into_any_element()
    }
}

impl Render for PurchasesPage {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let tag = match &self.view {
            View::List => 0,
            View::Detail(id) => (1 << 32) | *id as u64,
            View::Form(_) => 2,
            View::Receive(_) => 3,
            View::Reject(_) => 4,
        };
        let element = match &self.view {
            View::List => self.render_list(cx),
            View::Detail(_) => self.render_detail(cx),
            View::Form(form) => form.clone().into_any_element(),
            View::Receive(form) => form.clone().into_any_element(),
            View::Reject(prompt) => prompt.clone().into_any_element(),
        };
        crate::motion::routed(cx, "purchases", self.route.epoch(tag), element)
    }
}
