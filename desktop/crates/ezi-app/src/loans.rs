//! Loans: the list with status counts, search and (Admin) borrower filter; the detail with its progress and every action
//! (edit draft, submit, cancel, approve, reject with a reason, issue, record return); the new and edit forms.
//! Same data and rules as the web Loans pages. What may be done now comes from the server (`allowedActions`): this only
//! shows it. Staff see their own loans and no stock numbers, price or supplier, because the server leaves them out.
//! shortcut: the status counts and the borrower choices come from the newest 500 loans (like the web page).

use std::rc::Rc;
use std::sync::Arc;

use ezi_core::api::{ApiError, Client, ListMeta};
use ezi_core::format::{format_date, format_date_time, format_number};
use ezi_core::i18n::{self, error_message};
use ezi_core::models::{Loan, LoanStatus};
use ezi_core::theme::{self, Token};
use gpui_kit::component::button::*;
use gpui_kit::component::input::{Input, InputEvent, InputState};
use gpui_kit::component::select::{SearchableVec, Select, SelectEvent, SelectState};
use gpui_kit::component::{Disableable, IndexPath};
use gpui_kit::prelude::*;
use gpui_kit::*;

use crate::item_form::Done;
use crate::load::Load;
use crate::loan_form::{LoanForm, ReturnForm};
use crate::reason::ReasonPrompt;
use crate::state::{color, state, t};
use crate::widgets::{confirm, loan_tone, toast, Badge, Callback, Cell, Chip, Column, DataTable, Paging, StatePanel, ToastKind};

/// Rows per page: the dense layout of the redesign (PRD_REDESIGN.md 10.2).
const PAGE_SIZE: u32 = 8;
/// The status chips, in the web's order. "" is All; "closed" is rejected or cancelled.
const CHIPS: [&str; 7] = ["", "Pending Approval", "Approved", "Borrowed", "Overdue", "Completed", "closed"];

type Choice = Entity<SelectState<SearchableVec<String>>>;

enum View {
    List,
    Detail(i64),
    Form(Entity<LoanForm>),
    Return(Entity<ReturnForm>),
    Reject(Entity<ReasonPrompt>),
}

pub struct LoansPage {
    client: Arc<Client>,
    admin: bool,
    view: View,
    search: Entity<InputState>,
    chip: &'static str,
    /// The chip chosen before this one, and a count of choices: the fade between them plays once per choice.
    prev_chip: &'static str,
    chip_epoch: u32,
    borrower_select: Option<Choice>,
    /// (id, name) pairs behind `borrower_select`, with "all" first.
    borrowers: Vec<(i64, String)>,
    borrower: Option<i64>,
    page: u32,
    list: Load<(Vec<Loan>, ListMeta)>,
    list_generation: u32,
    everything: Load<Vec<Loan>>,
    detail: Load<Loan>,
    detail_generation: u32,
    busy: bool,
    route: crate::motion::RouteTracker,
    _subscriptions: Vec<Subscription>,
}

fn chip_matches(chip: &str, status: LoanStatus) -> bool {
    match chip {
        "" => true,
        "closed" => matches!(status, LoanStatus::Rejected | LoanStatus::Cancelled),
        "Borrowed" => matches!(status, LoanStatus::Borrowed | LoanStatus::Overdue),
        "Pending Approval" => status == LoanStatus::PendingApproval,
        "Approved" => status == LoanStatus::Approved,
        "Overdue" => status == LoanStatus::Overdue,
        "Completed" => status == LoanStatus::Completed,
        _ => false,
    }
}

fn chip_status(chip: &str) -> Option<LoanStatus> {
    match chip {
        "Pending Approval" => Some(LoanStatus::PendingApproval),
        "Approved" => Some(LoanStatus::Approved),
        "Borrowed" => Some(LoanStatus::Borrowed),
        "Overdue" => Some(LoanStatus::Overdue),
        "Completed" => Some(LoanStatus::Completed),
        _ => None,
    }
}

impl LoansPage {
    pub fn new(client: Arc<Client>, admin: bool, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let search = cx.new(|cx| InputState::new(window, cx).placeholder(t(cx).loans_search_placeholder.to_string()));
        let sub = cx.subscribe_in(&search, window, |this, _, ev: &InputEvent, _, cx| {
            if let InputEvent::Change = ev {
                this.page = 1;
                this.fetch_list(cx);
            }
        });
        let mut page = LoansPage {
            client,
            admin,
            view: View::List,
            search,
            chip: "",
            prev_chip: "",
            chip_epoch: 0,
            borrower_select: None,
            borrowers: Vec::new(),
            borrower: None,
            page: 1,
            list: Load::Loading,
            list_generation: 0,
            everything: Load::Loading,
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
        self.fetch_everything(window, cx);
    }

    fn dirty(&self, cx: &App) -> bool {
        !self.search.read(cx).value().trim().is_empty() || !self.chip.is_empty() || self.borrower.is_some()
    }

    fn fetch_list(&mut self, cx: &mut Context<Self>) {
        self.list_generation += 1;
        let (generation, client, page, chip, borrower) = (self.list_generation, self.client.clone(), self.page, self.chip, self.borrower);
        let search = self.search.read(cx).value().trim().to_string();
        if !matches!(self.list, Load::Ready(_)) {
            self.list = Load::Loading;
        }
        cx.notify();
        cx.spawn(async move |this, cx| {
            let result = cx
                .background_executor()
                .spawn(async move {
                    let (page, size, borrower) = (page.to_string(), PAGE_SIZE.to_string(), borrower.map(|b| b.to_string()));
                    let mut q = vec![("page", page.as_str()), ("pageSize", size.as_str()), ("sort", "number:desc")];
                    if !search.is_empty() {
                        q.push(("search", search.as_str()));
                    }
                    if !chip.is_empty() {
                        q.push(("status", chip));
                    }
                    if let Some(b) = &borrower {
                        q.push(("borrowerId", b.as_str()));
                    }
                    client.loans(&q).map(|s| {
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

    /// The counts on the chips and the borrower choices come from one unfiltered read.
    fn fetch_everything(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let client = self.client.clone();
        cx.spawn_in(window, async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.loans(&[("pageSize", "500")]).map(|s| s.data) }).await;
            this.update_in(cx, |this, window, cx| {
                if let (Ok(loans), true, None) = (&result, this.admin, &this.borrower_select) {
                    let mut people: Vec<(i64, String)> = Vec::new();
                    for l in loans {
                        if !people.iter().any(|(id, _)| *id == l.borrower_id) {
                            people.push((l.borrower_id, l.borrower_name.clone()));
                        }
                    }
                    let labels: Vec<String> = std::iter::once(t(cx).loans_all_borrowers.to_string()).chain(people.iter().map(|(_, n)| n.clone())).collect();
                    let select = cx.new(|cx| SelectState::new(SearchableVec::new(labels), Some(IndexPath::default()), window, cx));
                    this._subscriptions.push(cx.subscribe_in(&select, window, |this, _, ev: &SelectEvent<SearchableVec<String>>, _, cx| {
                        let SelectEvent::Confirm(label) = ev;
                        this.borrower = label.as_ref().and_then(|l| this.borrowers.iter().find(|(_, n)| n == l)).map(|(id, _)| *id);
                        this.page = 1;
                        this.fetch_list(cx);
                    }));
                    this.borrowers = people;
                    this.borrower_select = Some(select);
                }
                this.everything = Load::from_result(result);
                cx.notify();
            })
            .ok();
        })
        .detach();
    }

    fn clear_filters(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        (self.chip, self.borrower, self.page) = ("", None, 1);
        self.search.update(cx, |s, cx| s.set_value("", window, cx));
        if let Some(select) = &self.borrower_select {
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
            let result = cx.background_executor().spawn(async move { client.loan(id) }).await;
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

    /// What a form calls when it ends: `Some(id)` shows that loan, `None` goes back to the list.
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

    fn open_form(&mut self, loan: Option<Loan>, window: &mut Window, cx: &mut Context<Self>) {
        let (client, admin, done) = (self.client.clone(), self.admin, self.finished(cx));
        self.view = View::Form(cx.new(|cx| LoanForm::new(client, loan, admin, done, window, cx)));
        cx.notify();
    }

    fn open_return(&mut self, loan: Loan, window: &mut Window, cx: &mut Context<Self>) {
        let (client, done) = (self.client.clone(), self.finished(cx));
        self.view = View::Return(cx.new(|cx| ReturnForm::new(client, loan, done, window, cx)));
        cx.notify();
    }

    fn open_reject(&mut self, loan: &Loan, window: &mut Window, cx: &mut Context<Self>) {
        let (s, lang) = (t(cx), state(cx).lang);
        let (id, client) = (loan.id, self.client.clone());
        let page = cx.entity().downgrade();
        let (done_page, cancel_page) = (page.clone(), page);
        let on_done: Callback = Rc::new(move |window, cx| {
            let text = t(cx).loans_rejected;
            toast(window, cx, ToastKind::Success, text);
            done_page.update(cx, |p, cx| p.open_detail(id, cx)).ok();
        });
        let on_cancel: Callback = Rc::new(move |_, cx| {
            cancel_page.update(cx, |p, cx| p.open_detail(id, cx)).ok();
        });
        let run = Arc::new(move |reason: String| client.reject_loan(id, &reason).map(|_| ()));
        let title = i18n::loan_reject_title(lang, &loan.number);
        self.view = View::Reject(cx.new(|cx| ReasonPrompt::new(title, s.loans_reject_body, s.loans_reject_confirm, true, run, on_done, on_cancel, window, cx)));
        cx.notify();
    }

    /// `submit`, `approve`, `issue` or `cancel`: one call, then the detail shows the loan as the server now has it.
    fn act(&mut self, id: i64, action: &'static str, message: &'static str, window: &mut Window, cx: &mut Context<Self>) {
        if self.busy {
            return;
        }
        self.busy = true;
        cx.notify();
        let client = self.client.clone();
        cx.spawn_in(window, async move |this, cx| {
            let result: Result<_, ApiError> = cx.background_executor().spawn(async move { client.loan_action(id, action) }).await;
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

    fn confirm_issue(&mut self, loan: &Loan, window: &mut Window, cx: &mut Context<Self>) {
        let (s, lang) = (t(cx), state(cx).lang);
        let this = cx.entity();
        let id = loan.id;
        // The dialog lists what is being handed over, so it can be checked before confirming.
        let items = loan.lines.iter().map(|l| format!("{} x {}", l.item_name, l.quantity)).collect::<Vec<_>>().join(", ");
        let body = format!("{} {}", s.loans_issue_body, items);
        confirm(window, cx, i18n::loan_issue_title(lang, &loan.number), body, s.loans_issue_confirm, false, move |window, cx| {
            this.update(cx, |page, cx| page.act(id, "issue", t(cx).loans_issued, window, cx));
        });
    }

    fn confirm_cancel(&mut self, loan: &Loan, window: &mut Window, cx: &mut Context<Self>) {
        let (s, lang) = (t(cx), state(cx).lang);
        let this = cx.entity();
        let id = loan.id;
        confirm(window, cx, i18n::loan_cancel_title(lang, &loan.number), s.loans_cancel_body, s.loans_cancel, true, move |window, cx| {
            this.update(cx, |page, cx| page.act(id, "cancel", t(cx).loans_cancelled, window, cx));
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

/// Step shown on the progress card (0-based), or None once the loan is rejected or cancelled (`loanStep` in the web app).
fn loan_step(status: LoanStatus) -> Option<usize> {
    match status {
        LoanStatus::Draft | LoanStatus::PendingApproval => Some(0),
        LoanStatus::Approved => Some(1),
        LoanStatus::Borrowed | LoanStatus::Overdue => Some(2),
        LoanStatus::Completed => Some(3),
        LoanStatus::Rejected | LoanStatus::Cancelled => None,
    }
}

impl LoansPage {
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
                let mut columns = vec![Column::new(s.loans_col_number).width(130.)];
                if admin {
                    columns.push(Column::new(s.loans_col_borrower).width(150.));
                }
                columns.extend([Column::new(s.loans_col_items), Column::new(s.loans_col_loan_date).width(105.), Column::new(s.loans_col_expected).width(125.), Column::new(s.loans_col_status).width(150.)]);
                let cells: Vec<Vec<Cell>> = rows
                    .iter()
                    .map(|l| {
                        let mut row: Vec<Cell> = vec![l.number.clone().into()];
                        if admin {
                            row.push(l.borrower_name.clone().into());
                        }
                        row.extend([l.items_summary.clone().into(), format_date(&l.loan_date).into(), format_date(&l.expected_return_date).into(), Badge::new(loan_tone(l.display_status), i18n::loan_status_label(lang, l.display_status)).into()]);
                        row
                    })
                    .collect();
                let ids: Vec<i64> = rows.iter().map(|l| l.id).collect();
                let empty: AnyElement = if self.dirty(cx) {
                    let this = this.clone();
                    StatePanel::action(s.loans_empty_filtered, "", s.common_clear, move |w, cx| this.update(cx, |p, cx| p.clear_filters(w, cx))).into_any_element()
                } else {
                    let this = this.clone();
                    StatePanel::action(s.loans_empty_title, if admin { s.loans_empty_admin_body } else { s.loans_empty_staff_body }, if admin { s.loans_new_admin } else { s.loans_new_staff }, move |w, cx| this.update(cx, |p, cx| p.open_form(None, w, cx))).into_any_element()
                };
                let (this_page, this_row) = (this.clone(), this.clone());
                DataTable::new("loans", columns)
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

        let all: &[Loan] = match &self.everything {
            Load::Ready(v) => v,
            _ => &[],
        };
        let chips = CHIPS.iter().map(|&value| {
            let label = match (value, chip_status(value)) {
                ("", _) => s.loans_tab_all.to_string(),
                ("closed", _) => s.loans_tab_closed.to_string(),
                (_, Some(status)) => i18n::loan_status_label(lang, status).to_string(),
                _ => value.to_string(),
            };
            let count = all.iter().filter(|l| chip_matches(value, l.display_status)).count();
            let page = this.clone();
            let change = match (self.chip_epoch, value == self.chip, value == self.prev_chip) {
                (0, _, _) => None,
                (e, true, false) => Some((e, true)),
                (e, false, true) => Some((e, false)),
                _ => None,
            };
            Chip::new(SharedString::from(format!("loan-chip-{value}")), format!("{label} ({count})"), self.chip == value, move |_, cx| {
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
                            .child(div().text_size(px(theme::TEXT_TITLE)).font_weight(FontWeight::SEMIBOLD).child(s.loans_title))
                            .child(div().text_size(px(theme::TEXT_BODY)).text_color(color(cx, Token::MutedForeground)).child(if admin { s.loans_desc_admin } else { s.loans_desc_staff })),
                    )
                    .child(Button::new("loan-new").primary().label(if admin { s.loans_new_admin } else { s.loans_new_staff }).on_click(cx.listener(|this, _, w, cx| this.open_form(None, w, cx)))),
            )
            .child(div().flex().flex_wrap().gap(px(theme::SPACE_2)).children(chips))
            .child(
                div()
                    .flex()
                    .flex_wrap()
                    .items_center()
                    .gap(px(theme::SPACE_2))
                    .child(div().w(px(theme::FILTER_SEARCH_WIDTH)).child(Input::new(&self.search)))
                    .children(self.borrower_select.as_ref().map(|sel| div().w(px(theme::FILTER_SELECT_WIDTH)).child(Select::new(sel)))),
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
        let back = Button::new("loan-back").outline().label(s.common_back).on_click({
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
            Load::Ready(loan) => {
                let status = loan.display_status;
                let total_units: i64 = loan.lines.iter().map(|l| l.quantity).sum();
                let dash = |v: &str| if v.is_empty() { "-".to_string() } else { v.to_string() };
                let date = |d: &Option<String>| d.as_deref().map(format_date).unwrap_or_else(|| "-".into());
                let details = card(cx)
                    .flex_1()
                    .child(heading(cx, s.loans_detail_title))
                    .child(
                        div()
                            .flex()
                            .flex_wrap()
                            .gap_x(px(theme::SPACE_6))
                            .gap_y(px(theme::SPACE_3))
                            .child(labelled(cx, s.loans_borrower, loan.borrower_name.clone()))
                            .child(labelled(cx, s.loans_requested_on, format_date_time(&loan.created_at)))
                            .child(labelled(cx, s.loans_loan_date, format_date(&loan.loan_date)))
                            .child(labelled(cx, s.loans_expected_return, format_date(&loan.expected_return_date)))
                            .child(labelled(cx, s.loans_purpose, dash(&loan.purpose)))
                            .when(!loan.notes.is_empty(), |d| d.child(labelled(cx, s.loans_note, loan.notes.clone())))
                            .when(loan.approved_by.is_some(), |d| d.child(labelled(cx, if loan.status == LoanStatus::Rejected { s.loans_rejected_by } else { s.loans_approved_by }, format!("{} · {}", loan.approved_by_name, date(&loan.approved_at)))))
                            .when(!loan.reject_reason.is_empty(), |d| d.child(labelled(cx, s.loans_reject_reason, loan.reject_reason.clone())))
                            .when(loan.issued_by.is_some(), |d| d.child(labelled(cx, s.loans_issued_by, format!("{} · {}", loan.issued_by_name, date(&loan.issued_at)))))
                            .when(loan.returned_at.is_some(), |d| d.child(labelled(cx, s.loans_returned_on, date(&loan.returned_at))))
                            .when(loan.received_by.is_some(), |d| d.child(labelled(cx, s.loans_received_by, loan.received_by_name.clone())))
                            .when(!loan.return_notes.is_empty(), |d| d.child(labelled(cx, s.loans_return_note, loan.return_notes.clone()))),
                    );
                let mut columns = vec![Column::new(s.loans_col_item), Column::new(s.loans_col_qty).right().width(120.)];
                if admin {
                    columns.extend([Column::new(s.loans_col_stock_now).right().width(120.), Column::new(s.loans_col_available).right().width(170.)]);
                }
                let rows: Vec<Vec<Cell>> = loan
                    .lines
                    .iter()
                    .map(|l| {
                        let mut row: Vec<Cell> = vec![l.item_name.clone().into(), format!("{} {}", format_number(l.quantity), l.unit).into()];
                        if admin {
                            row.push(l.current_stock.map_or("-".to_string(), format_number).into());
                            row.push(l.available_for_loan.map_or("-".to_string(), format_number).into());
                        }
                        row
                    })
                    .collect();

                // The progress card: four steps, the finished ones ticked, the current one marked.
                let step = loan_step(status);
                let steps = [
                    (s.loans_step_submitted, i18n::loan_step_submitted_body(lang, &loan.borrower_name, &format_date(&loan.created_at))),
                    (s.loans_step_approved, s.loans_step_approved_body.to_string()),
                    (s.loans_step_borrowed, s.loans_step_borrowed_body.to_string()),
                    (s.loans_step_completed, s.loans_step_completed_body.to_string()),
                ];
                let progress_note = match loan.status {
                    LoanStatus::Rejected => Some(s.loans_rejected_note),
                    LoanStatus::Cancelled => Some(s.loans_cancelled_note),
                    LoanStatus::Draft => Some(s.loans_draft_note),
                    _ => None,
                };
                let step_rows = steps.into_iter().enumerate().map(|(i, (title, body))| {
                    let done = if i == 0 { loan.status != LoanStatus::Draft && step.is_some() } else { step.is_some_and(|c| c > i) } || (loan.status == LoanStatus::Completed && i == 3);
                    let current = step == Some(i) && !done;
                    let (mark, tone) = if done { (s.loans_step_done, Token::SuccessIcon) } else if current { (s.loans_step_current, Token::Primary) } else { (s.loans_step_upcoming, Token::MutedForeground) };
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
                let progress = card(cx).w(px(theme::SIDE_CARD_WIDTH)).child(heading(cx, s.loans_progress)).children(step_rows).children(progress_note.map(|n| note(cx, Token::Muted, n.to_string())));

                div()
                    .flex()
                    .flex_col()
                    .gap(px(theme::SPACE_4))
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap(px(theme::SPACE_3))
                            .child(div().text_size(px(theme::TEXT_TITLE)).font_weight(FontWeight::SEMIBOLD).child(loan.number.clone()))
                            .child(Badge::new(loan_tone(status), i18n::loan_status_label(lang, status))),
                    )
                    .when(admin && loan.status == LoanStatus::PendingApproval && loan.borrower_id == own_id, |d| d.child(note(cx, Token::WarningSoft, s.loans_own_request.to_string())))
                    .when(status == LoanStatus::Overdue, |d| d.child(note(cx, Token::DangerSoft, i18n::loan_overdue_note(lang, loan.days_overdue))))
                    .child(div().flex().items_start().gap(px(theme::SPACE_4)).child(details).child(div().flex().flex_col().gap(px(theme::SPACE_4)).child(progress).when(loan.can("approve"), |d| d.child(div().w(px(theme::SIDE_CARD_WIDTH)).child(note(cx, Token::InfoSoft, i18n::loan_approve_info(lang, total_units)))))))
                    .child(heading(cx, s.loans_items_card))
                    .child(DataTable::new("loan-lines", columns).rows(rows))
                    .into_any_element()
            }
        };

        // The buttons are what the server allows for this loan and this user right now.
        let actions: Option<Div> = match &self.detail {
            Load::Ready(loan) => {
                let (busy, id) = (self.busy, loan.id);
                let mut row = div().flex().flex_wrap().gap(px(theme::SPACE_2));
                if loan.can("edit") {
                    let l = loan.clone();
                    row = row.child(Button::new("loan-edit").outline().label(s.loans_edit_draft).disabled(busy).on_click(cx.listener(move |this, _, w, cx| this.open_form(Some(l.clone()), w, cx))));
                }
                if loan.can("submit") || loan.can("edit") {
                    row = row.child(Button::new("loan-do-submit").primary().label(s.loans_submit).disabled(busy).on_click(cx.listener(move |this, _, w, cx| this.act(id, "submit", t(cx).loans_submitted, w, cx))));
                }
                if loan.can("cancel") {
                    let l = loan.clone();
                    let label = if loan.status == LoanStatus::PendingApproval && !admin { s.loans_cancel_request } else { s.loans_cancel };
                    row = row.child(Button::new("loan-cancel-loan").outline().label(label).disabled(busy).on_click(cx.listener(move |this, _, w, cx| this.confirm_cancel(&l, w, cx))));
                }
                if loan.can("approve") {
                    let l = loan.clone();
                    row = row
                        .child(Button::new("loan-reject").outline().label(s.loans_reject).disabled(busy).on_click(cx.listener(move |this, _, w, cx| this.open_reject(&l, w, cx))))
                        .child(Button::new("loan-approve").primary().label(s.loans_approve).disabled(busy).on_click(cx.listener(move |this, _, w, cx| this.act(id, "approve", t(cx).loans_approved, w, cx))));
                }
                if loan.can("issue") {
                    let l = loan.clone();
                    row = row.child(Button::new("loan-issue").primary().label(s.loans_issue).disabled(busy).on_click(cx.listener(move |this, _, w, cx| this.confirm_issue(&l, w, cx))));
                }
                if loan.can("return") {
                    let l = loan.clone();
                    row = row.child(Button::new("loan-return").primary().label(s.loans_record_return).disabled(busy).on_click(cx.listener(move |this, _, w, cx| this.open_return(l.clone(), w, cx))));
                }
                Some(row)
            }
            _ => None,
        };
        div().flex().flex_col().gap(px(theme::SPACE_4)).child(div().flex().items_center().justify_between().gap(px(theme::SPACE_3)).child(back).children(actions)).child(content).into_any_element()
    }
}

impl Render for LoansPage {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let tag = match &self.view {
            View::List => 0,
            View::Detail(id) => (1 << 32) | *id as u64,
            View::Form(_) => 2,
            View::Return(_) => 3,
            View::Reject(_) => 4,
        };
        let element = match &self.view {
            View::List => self.render_list(cx),
            View::Detail(_) => self.render_detail(cx),
            View::Form(form) => form.clone().into_any_element(),
            View::Return(form) => form.clone().into_any_element(),
            View::Reject(prompt) => prompt.clone().into_any_element(),
        };
        crate::motion::routed(cx, "loans", self.route.epoch(tag), element)
    }
}
