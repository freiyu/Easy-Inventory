//! Reports (Admin only): stock, stock movements and loans, each with its filters, a row count, and the Excel file of what is
//! on screen (same filters and sort, saved to the Downloads folder). Same data as the web Reports page; no chart (PRD 1.4).
//! shortcut: the tables are not sorted by clicking a header (the order is the web default of each report).

use std::sync::Arc;

use ezi_core::api::{ApiError, Client, ListMeta};
use ezi_core::files;
use ezi_core::format::{format_date, format_number};
use ezi_core::i18n::{self, error_message};
use ezi_core::models::{Item, LoanReportRow, LoanStatus, MovementRow, NameOption, StockStatus};
use ezi_core::theme::{self, Token};
use gpui_kit::component::button::*;
use gpui_kit::component::input::{Input, InputEvent, InputState};
use gpui_kit::component::select::{SearchableVec, Select, SelectEvent, SelectState};
use gpui_kit::component::{Disableable, IndexPath};
use gpui_kit::prelude::*;
use gpui_kit::*;

use crate::load::Load;
use crate::state::{color, state, t};
use crate::stock::type_tone;
use crate::widgets::{loan_tone, stock_tone, toast, Badge, Cell, Column, DataTable, Paging, StatePanel, ToastKind};

/// Rows per page: the dense layout of the redesign (PRD_REDESIGN.md 10.2).
const PAGE_SIZE: u32 = 8;
const TX_TYPES: [&str; 6] = ["IN", "OUT", "ADJUSTMENT", "LOAN_ISSUE", "LOAN_RETURN", "REVERSAL"];
const LOAN_STATUSES: [LoanStatus; 8] = [LoanStatus::Draft, LoanStatus::PendingApproval, LoanStatus::Approved, LoanStatus::Rejected, LoanStatus::Borrowed, LoanStatus::Completed, LoanStatus::Cancelled, LoanStatus::Overdue];
const LOAN_STATUS_KEYS: [&str; 8] = ["Draft", "Pending Approval", "Approved", "Rejected", "Borrowed", "Completed", "Cancelled", "Overdue"];
const STOCK_STATUSES: [(&str, StockStatus); 3] = [("Safe", StockStatus::Safe), ("Low", StockStatus::Low), ("Out", StockStatus::Out)];

type Choice = Entity<SelectState<SearchableVec<String>>>;

#[derive(Clone, Copy, PartialEq, Eq)]
enum Tab {
    Stock,
    Movements,
    Loans,
}

impl Tab {
    /// The report name in the API path and the sort the web page starts with.
    fn api(self) -> (&'static str, &'static str) {
        match self {
            Tab::Stock => ("stock", "code:asc"),
            Tab::Movements => ("movements", "date:desc"),
            Tab::Loans => ("loans", "number:desc"),
        }
    }
}

/// Why an export failed: the server said no, or the file could not be written.
enum Failure {
    Api(ApiError),
    Io(String),
}

enum Rows {
    Stock(Vec<Item>),
    Movements(Vec<MovementRow>),
    Loans(Vec<LoanReportRow>),
}

pub struct ReportsPage {
    client: Arc<Client>,
    tab: Tab,
    search: Entity<InputState>,
    from: Entity<InputState>,
    to: Entity<InputState>,
    category_select: Option<Choice>,
    subcategory_select: Option<Choice>,
    stock_select: Choice,
    type_select: Choice,
    status_select: Choice,
    categories: Vec<NameOption>,
    subcategories: Vec<NameOption>,
    category: Option<i64>,
    subcategory: Option<i64>,
    stock_status: Option<&'static str>,
    kind: Option<&'static str>,
    loan_status: Option<&'static str>,
    page: u32,
    list: Load<(Rows, ListMeta)>,
    generation: u32,
    exporting: bool,
    _subscriptions: Vec<Subscription>,
}

fn choice(labels: Vec<String>, window: &mut Window, cx: &mut Context<ReportsPage>) -> Choice {
    cx.new(|cx| SelectState::new(SearchableVec::new(labels), Some(IndexPath::default()), window, cx))
}

impl ReportsPage {
    pub fn new(client: Arc<Client>, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let (s, lang) = (t(cx), state(cx).lang);
        let first = |all: &str, rest: Vec<String>| std::iter::once(all.to_string()).chain(rest).collect::<Vec<_>>();
        let stock_select = choice(first(s.items_all_stock_status, STOCK_STATUSES.iter().map(|(_, st)| i18n::stock_label(lang, true, *st).to_string()).collect()), window, cx);
        let type_select = choice(first(s.stock_all_types, TX_TYPES.iter().map(|k| i18n::tx_type_label(lang, k)).collect()), window, cx);
        let status_select = choice(first(s.reports_all_loan_statuses, LOAN_STATUSES.iter().map(|st| i18n::loan_status_label(lang, *st).to_string()).collect()), window, cx);
        let search = cx.new(|cx| InputState::new(window, cx).placeholder(s.reports_search_stock.to_string()));
        let (from, to) = (cx.new(|cx| InputState::new(window, cx).placeholder(s.common_from.to_string())), cx.new(|cx| InputState::new(window, cx).placeholder(s.common_to.to_string())));
        let mut subs = Vec::new();
        for input in [&search, &from, &to] {
            subs.push(cx.subscribe_in(input, window, |this, _, ev: &InputEvent, _, cx| {
                if let InputEvent::Change = ev {
                    this.page = 1;
                    this.fetch(cx);
                }
            }));
        }
        subs.push(cx.subscribe_in(&stock_select, window, |this, _, ev: &SelectEvent<SearchableVec<String>>, _, cx| {
            {
                let SelectEvent::Confirm(label) = ev;
                let lang = state(cx).lang;
                this.stock_status = STOCK_STATUSES.iter().find(|(_, st)| Some(i18n::stock_label(lang, true, *st).to_string()) == *label).map(|(k, _)| *k);
                this.page = 1;
                this.fetch(cx);
            }
        }));
        subs.push(cx.subscribe_in(&type_select, window, |this, _, ev: &SelectEvent<SearchableVec<String>>, _, cx| {
            {
                let SelectEvent::Confirm(label) = ev;
                let lang = state(cx).lang;
                this.kind = TX_TYPES.into_iter().find(|k| Some(i18n::tx_type_label(lang, k)) == *label);
                this.page = 1;
                this.fetch(cx);
            }
        }));
        subs.push(cx.subscribe_in(&status_select, window, |this, _, ev: &SelectEvent<SearchableVec<String>>, _, cx| {
            {
                let SelectEvent::Confirm(label) = ev;
                let lang = state(cx).lang;
                this.loan_status = LOAN_STATUSES.iter().zip(LOAN_STATUS_KEYS).find(|(st, _)| Some(i18n::loan_status_label(lang, **st).to_string()) == *label).map(|(_, k)| k);
                this.page = 1;
                this.fetch(cx);
            }
        }));
        let mut page = ReportsPage {
            client,
            tab: Tab::Stock,
            search,
            from,
            to,
            category_select: None,
            subcategory_select: None,
            stock_select,
            type_select,
            status_select,
            categories: Vec::new(),
            subcategories: Vec::new(),
            category: None,
            subcategory: None,
            stock_status: None,
            kind: None,
            loan_status: None,
            page: 1,
            list: Load::Loading,
            generation: 0,
            exporting: false,
            _subscriptions: subs,
        };
        page.fetch(cx);
        page.fetch_options(window, cx);
        page
    }

    /// Fetches the rows again (the shell calls this when the page is opened).
    pub fn reload(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.fetch(cx);
        if self.category_select.is_none() {
            self.fetch_options(window, cx);
        }
    }

    /// The active area and kind choices of the stock report's two filters.
    fn fetch_options(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let client = self.client.clone();
        cx.spawn_in(window, async move |this, cx| {
            let result = cx.background_executor().spawn(async move { Ok::<_, ApiError>((client.name_options("/categories")?, client.name_options("/subcategories")?)) }).await;
            this.update_in(cx, |this, window, cx| {
                // Without the options only the two filters are missing; the report itself still works.
                let Ok((categories, subcategories)) = result else { return };
                let s = t(cx);
                let labels = |all: &str, v: &[NameOption]| std::iter::once(all.to_string()).chain(v.iter().map(|o| o.name.clone())).collect::<Vec<_>>();
                let (category_select, subcategory_select) = (choice(labels(s.items_all_categories, &categories), window, cx), choice(labels(s.items_all_subcategories, &subcategories), window, cx));
                this._subscriptions.push(cx.subscribe_in(&category_select, window, |this, _, ev: &SelectEvent<SearchableVec<String>>, _, cx| {
                    let SelectEvent::Confirm(label) = ev;
                    this.category = label.as_ref().and_then(|l| this.categories.iter().find(|c| &c.name == l)).map(|c| c.id);
                    this.page = 1;
                    this.fetch(cx);
                }));
                this._subscriptions.push(cx.subscribe_in(&subcategory_select, window, |this, _, ev: &SelectEvent<SearchableVec<String>>, _, cx| {
                    let SelectEvent::Confirm(label) = ev;
                    this.subcategory = label.as_ref().and_then(|l| this.subcategories.iter().find(|c| &c.name == l)).map(|c| c.id);
                    this.page = 1;
                    this.fetch(cx);
                }));
                (this.categories, this.subcategories) = (categories, subcategories);
                this.category_select = Some(category_select);
                this.subcategory_select = Some(subcategory_select);
                cx.notify();
            })
            .ok();
        })
        .detach();
    }

    /// The filters of the open report as the server takes them (no page): what the rows and the Excel file both use.
    fn query(&self, cx: &App) -> Vec<(String, String)> {
        let (_, sort) = self.tab.api();
        let mut q = vec![("sort".to_string(), sort.to_string())];
        let mut add = |k: &str, v: String| {
            if !v.trim().is_empty() {
                q.push((k.to_string(), v.trim().to_string()));
            }
        };
        add("search", self.search.read(cx).value().to_string());
        match self.tab {
            Tab::Stock => {
                add("categoryId", self.category.map(|c| c.to_string()).unwrap_or_default());
                add("subcategoryId", self.subcategory.map(|c| c.to_string()).unwrap_or_default());
                add("stockStatus", self.stock_status.map(String::from).unwrap_or_default());
            }
            Tab::Movements => {
                add("type", self.kind.map(String::from).unwrap_or_default());
                add("from", self.from.read(cx).value().to_string());
                add("to", self.to.read(cx).value().to_string());
            }
            Tab::Loans => {
                add("status", self.loan_status.map(String::from).unwrap_or_default());
                add("from", self.from.read(cx).value().to_string());
                add("to", self.to.read(cx).value().to_string());
            }
        }
        q
    }

    fn dirty(&self, cx: &App) -> bool {
        self.query(cx).len() > 1
    }

    fn fetch(&mut self, cx: &mut Context<Self>) {
        self.generation += 1;
        let (generation, client, tab, page) = (self.generation, self.client.clone(), self.tab, self.page);
        let query = self.query(cx);
        if !matches!(self.list, Load::Ready(_)) {
            self.list = Load::Loading;
        }
        cx.notify();
        cx.spawn(async move |this, cx| {
            let result = cx
                .background_executor()
                .spawn(async move {
                    let (page, size) = (page.to_string(), PAGE_SIZE.to_string());
                    let mut q: Vec<(&str, &str)> = query.iter().map(|(k, v)| (k.as_str(), v.as_str())).collect();
                    q.extend([("page", page.as_str()), ("pageSize", size.as_str())]);
                    let meta = |m: Option<ListMeta>, n: usize| m.unwrap_or(ListMeta { page: 1, page_size: PAGE_SIZE, total: n as u32 });
                    match tab {
                        Tab::Stock => client.report_stock(&q).map(|s| (Rows::Stock(s.data.clone()), meta(s.meta, s.data.len()))),
                        Tab::Movements => client.report_movements(&q).map(|s| (Rows::Movements(s.data.clone()), meta(s.meta, s.data.len()))),
                        Tab::Loans => client.report_loans(&q).map(|s| (Rows::Loans(s.data.clone()), meta(s.meta, s.data.len()))),
                    }
                })
                .await;
            this.update(cx, |this, cx| {
                if this.generation == generation {
                    this.list = Load::from_result(result);
                    cx.notify();
                }
            })
            .ok();
        })
        .detach();
    }

    /// Each report has its own search and filters, so switching starts the new one clean (like the web tabs).
    fn switch(&mut self, tab: Tab, window: &mut Window, cx: &mut Context<Self>) {
        if self.tab != tab {
            self.tab = tab;
            self.list = Load::Loading;
            let s = t(cx);
            let placeholder = match tab {
                Tab::Stock => s.reports_search_stock,
                Tab::Movements => s.reports_search_movements,
                Tab::Loans => s.reports_search_loans,
            };
            self.search.update(cx, |i, cx| i.set_placeholder(placeholder.to_string(), window, cx));
            self.clear_filters(window, cx);
        }
    }

    fn clear_filters(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        (self.category, self.subcategory, self.stock_status, self.kind, self.loan_status, self.page) = (None, None, None, None, None, 1);
        for input in [&self.search, &self.from, &self.to] {
            input.update(cx, |i, cx| i.set_value("", window, cx));
        }
        for select in [Some(&self.stock_select), Some(&self.type_select), Some(&self.status_select), self.category_select.as_ref(), self.subcategory_select.as_ref()].into_iter().flatten() {
            select.update(cx, |s, cx| s.set_selected_index(Some(IndexPath::default()), window, cx));
        }
        self.fetch(cx);
    }

    /// The Excel file of the open report with the filters and sort on screen, saved to Downloads (never over an existing file).
    fn export(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.exporting {
            return;
        }
        self.exporting = true;
        cx.notify();
        let (client, query, (report, _)) = (self.client.clone(), self.query(cx), self.tab.api());
        cx.spawn_in(window, async move |this, cx| {
            let result = cx
                .background_executor()
                .spawn(async move {
                    let run = || -> Result<std::path::PathBuf, Failure> {
                        let q: Vec<(&str, &str)> = query.iter().map(|(k, v)| (k.as_str(), v.as_str())).collect();
                        let file = client.export_report(report, &q).map_err(Failure::Api)?;
                        files::save_to_downloads(&file.file_name, &file.bytes).map_err(Failure::Io)
                    };
                    run()
                })
                .await;
            this.update_in(cx, |this, window, cx| {
                this.exporting = false;
                let lang = state(cx).lang;
                match result {
                    Ok(path) => toast(window, cx, ToastKind::Success, i18n::export_saved(lang, &path.to_string_lossy())),
                    Err(Failure::Io(text)) => toast(window, cx, ToastKind::Error, text),
                    Err(Failure::Api(api)) => toast(window, cx, ToastKind::Error, error_message(lang, &api)),
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
    }
}

impl Render for ReportsPage {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let s = t(cx);
        let lang = state(cx).lang;
        let this = cx.entity();

        let body: AnyElement = match &self.list {
            Load::Loading => StatePanel::loading(cx).into_any_element(),
            Load::Failed(e) => {
                let message = error_message(lang, e);
                let this = this.clone();
                StatePanel::error(cx, message, move |_, cx| this.update(cx, |p, cx| p.fetch(cx))).into_any_element()
            }
            Load::Ready((rows, meta)) => {
                let (columns, cells): (Vec<Column>, Vec<Vec<Cell>>) = match rows {
                    Rows::Stock(items) => (
                        vec![Column::new(s.reports_col_code).width(140.), Column::new(s.reports_col_item), Column::new(s.reports_col_category).width(100.), Column::new(s.fields_subcategory).width(110.), Column::new(s.reports_col_unit).width(70.), Column::new(s.reports_col_stock).right().width(80.), Column::new(s.reports_col_minimum).right().width(90.), Column::new(s.reports_col_status).width(110.)],
                        items
                            .iter()
                            .map(|i| {
                                vec![
                                    i.code.clone().unwrap_or_default().into(),
                                    i.name.clone().into(),
                                    i.category_name.clone().into(),
                                    i.subcategory_name.clone().into(),
                                    i.unit.clone().into(),
                                    format_number(i.current_stock.unwrap_or(0)).into(),
                                    format_number(i.minimum_stock.unwrap_or(0)).into(),
                                    Badge::new(stock_tone(i.stock_status), i18n::stock_label(lang, true, i.stock_status)).into(),
                                ]
                            })
                            .collect(),
                    ),
                    Rows::Movements(list) => (
                        vec![Column::new(s.reports_col_date).width(100.), Column::new(s.reports_col_item), Column::new(s.reports_col_type).width(130.), Column::new(s.reports_col_change).right().width(90.), Column::new(s.reports_col_balance).right().width(110.), Column::new(s.reports_col_user).width(120.), Column::new(s.reports_col_ref).width(170.)],
                        list.iter()
                            .map(|m| {
                                let tone = if m.quantity_change < 0 { Token::DangerIcon } else { Token::SuccessIcon };
                                let sign = if m.quantity_change > 0 { "+" } else { "" };
                                vec![
                                    format_date(&m.date).into(),
                                    m.item_name.clone().into(),
                                    Badge::new(type_tone(&m.kind), i18n::tx_type_label(lang, &m.kind)).into(),
                                    Cell::Element(div().text_color(color(cx, tone)).child(format!("{sign}{}", format_number(m.quantity_change))).into_any_element()),
                                    format_number(m.balance_after).into(),
                                    m.user_name.clone().into(),
                                    m.number.clone().into(),
                                ]
                            })
                            .collect(),
                    ),
                    Rows::Loans(list) => (
                        vec![Column::new(s.reports_col_loan).width(150.), Column::new(s.reports_col_borrower).width(130.), Column::new(s.loans_col_items), Column::new(s.reports_col_loan_date).width(100.), Column::new(s.reports_col_expected).width(120.), Column::new(s.reports_col_returned).width(100.), Column::new(s.reports_col_status).width(150.)],
                        list.iter()
                            .map(|l| {
                                vec![
                                    l.number.clone().into(),
                                    l.borrower_name.clone().into(),
                                    l.summary.clone().into(),
                                    format_date(&l.loan_date).into(),
                                    format_date(&l.expected_return_date).into(),
                                    l.returned_at.as_deref().map_or("-".to_string(), format_date).into(),
                                    Badge::new(loan_tone(l.status), i18n::loan_status_label(lang, l.status)).into(),
                                ]
                            })
                            .collect(),
                    ),
                };
                let empty: AnyElement = {
                    let this = this.clone();
                    StatePanel::action(s.reports_empty_title, s.reports_empty_body, s.common_clear, move |w, cx| this.update(cx, |p, cx| p.clear_filters(w, cx))).into_any_element()
                };
                let this_page = this.clone();
                div()
                    .flex()
                    .flex_col()
                    .gap(px(theme::SPACE_3))
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .justify_between()
                            .child(div().text_size(px(theme::TEXT_BODY)).text_color(color(cx, Token::MutedForeground)).child(i18n::report_rows(lang, i64::from(meta.total))))
                            .child(Button::new("report-export").outline().label(if self.exporting { s.common_exporting } else { s.common_export_excel }).disabled(self.exporting).on_click(cx.listener(|this, _, w, cx| this.export(w, cx)))),
                    )
                    .when(self.tab == Tab::Loans, |d| d.child(div().text_size(px(theme::TEXT_TABLE)).text_color(color(cx, Token::MutedForeground)).child(s.reports_overdue_highlight)))
                    .child(DataTable::new("report", columns).rows(cells).empty(empty).paging(Paging { page: meta.page, page_size: meta.page_size, total: meta.total }, move |p, _, cx| {
                        this_page.update(cx, |page, cx| {
                            page.page = p;
                            page.fetch(cx);
                        })
                    }))
                    .into_any_element()
            }
        };

        let tab = |id: &'static str, label: &'static str, which: Tab, cx: &mut Context<Self>| {
            let b = Button::new(id).label(label).on_click(cx.listener(move |this, _, w, cx| this.switch(which, w, cx)));
            if self.tab == which { b.primary() } else { b.outline() }
        };
        let dates = self.tab != Tab::Stock;
        let filters = div()
            .flex()
            .flex_wrap()
            .items_center()
            .gap(px(theme::SPACE_2))
            .child(div().w(px(theme::FILTER_SEARCH_WIDTH)).child(Input::new(&self.search)))
            .when(self.tab == Tab::Stock, |d| {
                d.children(self.category_select.as_ref().map(|sel| div().w(px(theme::FILTER_SELECT_WIDTH)).child(Select::new(sel))))
                    .children(self.subcategory_select.as_ref().map(|sel| div().w(px(theme::FILTER_SELECT_WIDTH)).child(Select::new(sel))))
                    .child(div().w(px(theme::FILTER_STOCK_WIDTH)).child(Select::new(&self.stock_select)))
            })
            .when(self.tab == Tab::Movements, |d| d.child(div().w(px(theme::FILTER_STOCK_WIDTH)).child(Select::new(&self.type_select))))
            .when(self.tab == Tab::Loans, |d| d.child(div().w(px(theme::FILTER_STOCK_WIDTH)).child(Select::new(&self.status_select))))
            .when(dates, |d| {
                d.child(div().w(px(theme::FILTER_STATUS_WIDTH)).child(Input::new(&self.from)))
                    .child(div().w(px(theme::FILTER_STATUS_WIDTH)).child(Input::new(&self.to)))
            })
            .when(self.dirty(cx), |d| d.child(Button::new("report-clear").outline().label(s.common_clear).on_click(cx.listener(|this, _, w, cx| this.clear_filters(w, cx)))));

        div()
            .flex()
            .flex_col()
            .gap(px(theme::SPACE_4))
            .child(
                div()
                    .flex()
                    .flex_col()
                    .gap(px(theme::SPACE_1))
                    .child(div().text_size(px(theme::TEXT_TITLE)).font_weight(FontWeight::SEMIBOLD).child(s.reports_title))
                    .child(div().text_size(px(theme::TEXT_BODY)).text_color(color(cx, Token::MutedForeground)).child(s.reports_description)),
            )
            .child(div().flex().gap(px(theme::SPACE_2)).child(tab("report-tab-stock", s.reports_tab_stock, Tab::Stock, cx)).child(tab("report-tab-movements", s.reports_tab_movements, Tab::Movements, cx)).child(tab("report-tab-loans", s.reports_tab_loans, Tab::Loans, cx)))
            .child(filters)
            .child(body)
    }
}
