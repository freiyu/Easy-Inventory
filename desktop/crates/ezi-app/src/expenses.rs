//! Expenses (Admin only): what incoming stock cost in a date range, by month. The total and the months are added up by the
//! server (PRD 4.7); this only shows them. Same check of the range as the web page. No chart (PRD 1.4).

use std::sync::Arc;

use ezi_core::api::Client;
use ezi_core::forms;
use ezi_core::format::{first_day_months_back, format_number, is_date, month_key, month_label, today};
use ezi_core::i18n::error_message;
use ezi_core::models::ExpenseSummary;
use ezi_core::theme::{self, Token};
use gpui_kit::component::button::*;
use gpui_kit::component::input::{Input, InputEvent, InputState};
use gpui_kit::prelude::*;
use gpui_kit::*;

use crate::load::Load;
use crate::state::{color, state, t};
use crate::widgets::{Cell, Column, DataTable, FormField, KpiCard, StatePanel};

pub struct ExpensesPage {
    client: Arc<Client>,
    from: Entity<InputState>,
    to: Entity<InputState>,
    load: Load<ExpenseSummary>,
    generation: u32,
    _subscriptions: Vec<Subscription>,
}

fn this_month() -> (String, String) {
    (format!("{}-01", month_key(&today())), today())
}

impl ExpensesPage {
    pub fn new(client: Arc<Client>, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let (from, to) = this_month();
        let from = cx.new(|cx| InputState::new(window, cx).default_value(from));
        let to = cx.new(|cx| InputState::new(window, cx).default_value(to));
        let subs = [&from, &to].map(|input| {
            cx.subscribe_in(input, window, |this, _, ev: &InputEvent, _, cx| {
                if let InputEvent::Change = ev {
                    this.refresh(cx);
                }
            })
        });
        let mut page = ExpensesPage { client, from, to, load: Load::Loading, generation: 0, _subscriptions: subs.into() };
        page.refresh(cx);
        page
    }

    fn range(&self, cx: &App) -> (String, String) {
        (self.from.read(cx).value().trim().to_string(), self.to.read(cx).value().trim().to_string())
    }

    /// Fetches the summary of the range now in the two dates. A range the check refuses, or a date still being typed, asks nothing.
    pub fn refresh(&mut self, cx: &mut Context<Self>) {
        let (from, to) = self.range(cx);
        if !is_date(&from) || !is_date(&to) || forms::expense_range_error(state(cx).lang, &from, &to).is_some() {
            cx.notify();
            return;
        }
        self.generation += 1;
        let (generation, client) = (self.generation, self.client.clone());
        if !matches!(self.load, Load::Ready(_)) {
            self.load = Load::Loading;
        }
        cx.notify();
        cx.spawn(async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.expense_summary(&from, &to) }).await;
            this.update(cx, |this, cx| {
                if this.generation == generation {
                    this.load = Load::from_result(result);
                    cx.notify();
                }
            })
            .ok();
        })
        .detach();
    }

    fn set_range(&mut self, from: String, to: String, window: &mut Window, cx: &mut Context<Self>) {
        self.from.update(cx, |i, cx| i.set_value(from, window, cx));
        self.to.update(cx, |i, cx| i.set_value(to, window, cx));
    }
}

impl Render for ExpensesPage {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let s = t(cx);
        let lang = state(cx).lang;
        let (from, to) = self.range(cx);
        let range_error = forms::expense_range_error(lang, &from, &to);

        let body: AnyElement = if let Some(error) = range_error {
            div().px(px(theme::SPACE_4)).py(px(theme::SPACE_3)).rounded(px(theme::RADIUS)).bg(color(cx, Token::DangerSoft)).text_size(px(theme::TEXT_BODY)).font_weight(FontWeight::SEMIBOLD).child(error).into_any_element()
        } else {
            match &self.load {
                Load::Loading => StatePanel::loading(cx).into_any_element(),
                Load::Failed(e) => {
                    let message = error_message(lang, e);
                    let this = cx.entity();
                    StatePanel::error(cx, message, move |_, cx| this.update(cx, |p, cx| p.refresh(cx))).into_any_element()
                }
                Load::Ready(summary) => {
                    let kpis = div()
                        .flex()
                        .gap(px(theme::SPACE_4))
                        .child(KpiCard::new(s.expenses_total_value, format!("Rp {}", format_number(summary.total))).caption(s.expenses_total_caption))
                        .child(KpiCard::new(s.expenses_purchase_count, format_number(summary.count)).caption(s.expenses_purchase_caption));
                    let table: AnyElement = if summary.count == 0 {
                        StatePanel::message(cx, s.expenses_empty_title, s.expenses_empty_body).into_any_element()
                    } else {
                        let bold = |text: String| Cell::Element(div().font_weight(FontWeight::SEMIBOLD).child(text).into_any_element());
                        let mut rows: Vec<Vec<Cell>> = summary.months.iter().map(|m| vec![month_label(&m.month).into(), m.count.to_string().into(), format!("Rp {}", format_number(m.value)).into()]).collect();
                        rows.push(vec![bold(s.common_total.to_string()), bold(summary.count.to_string()), bold(format!("Rp {}", format_number(summary.total)))]);
                        div()
                            .flex()
                            .flex_col()
                            .gap(px(theme::SPACE_3))
                            .child(div().text_size(px(theme::TEXT_SECTION)).font_weight(FontWeight::SEMIBOLD).child(s.expenses_by_month))
                            .child(DataTable::new("expenses", vec![Column::new(s.expenses_col_month), Column::new(s.expenses_col_purchases).right().width(160.), Column::new(s.expenses_col_value).right().width(220.)]).rows(rows))
                            .into_any_element()
                    };
                    div().flex().flex_col().gap(px(theme::SPACE_4)).child(kpis).child(table).into_any_element()
                }
            }
        };

        div()
            .flex()
            .flex_col()
            .gap(px(theme::SPACE_4))
            .child(
                div()
                    .flex()
                    .flex_col()
                    .gap(px(theme::SPACE_1))
                    .child(div().text_size(px(theme::TEXT_TITLE)).font_weight(FontWeight::SEMIBOLD).child(s.expenses_title))
                    .child(div().text_size(px(theme::TEXT_BODY)).text_color(color(cx, Token::MutedForeground)).child(s.expenses_description)),
            )
            .child(
                div()
                    .flex()
                    .flex_wrap()
                    .items_end()
                    .gap(px(theme::SPACE_3))
                    .child(div().w(px(theme::FILTER_SEARCH_WIDTH)).child(FormField::new(s.common_from.to_string(), Input::new(&self.from))))
                    .child(div().w(px(theme::FILTER_SEARCH_WIDTH)).child(FormField::new(s.common_to.to_string(), Input::new(&self.to))))
                    .child(Button::new("expenses-this-month").outline().label(s.expenses_this_month).on_click(cx.listener(|this, _, w, cx| {
                        let (f, t) = this_month();
                        this.set_range(f, t, w, cx);
                    })))
                    .child(Button::new("expenses-last-12").outline().label(s.expenses_last12).on_click(cx.listener(|this, _, w, cx| this.set_range(first_day_months_back(11), today(), w, cx)))),
            )
            .child(body)
    }
}
