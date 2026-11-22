//! The dashboard: Admin sees totals, stock and approvals plus the items that need attention; Staff see their own loans.
//! The numbers come from `/dashboard/summary`, the same endpoint as the web dashboard.

use std::sync::Arc;

use ezi_core::api::{ApiError, Client, Role};
use ezi_core::format::{format_date, format_number};
use ezi_core::i18n::{self, error_message};
use ezi_core::models::{AdminDashboard, DashboardSummary, StaffDashboard};
use ezi_core::theme::{self, Token};
use gpui_kit::prelude::*;
use gpui_kit::*;

use crate::state::{color, state, t};
use crate::widgets::{loan_tone, stock_tone, AlertBanner, Badge, Cell, Column, DataTable, KpiCard, StatePanel};

/// The needs-attention table shows 6 rows so the Admin dashboard fits one screen (PRD_REDESIGN.md 10.3).
const ATTENTION_ROWS: usize = 6;

enum Load {
    Loading,
    Ready(DashboardSummary),
    Failed(ApiError),
}

pub struct Dashboard {
    client: Arc<Client>,
    load: Load,
    /// Counts requests so an old answer cannot replace a newer one.
    generation: u32,
}

impl Dashboard {
    pub fn new(client: Arc<Client>, cx: &mut Context<Self>) -> Self {
        let mut d = Dashboard { client, load: Load::Loading, generation: 0 };
        d.refresh(cx);
        d
    }

    /// Fetches the numbers again (on open, and for "Try again"). The old numbers stay on screen until the answer arrives.
    pub fn refresh(&mut self, cx: &mut Context<Self>) {
        self.generation += 1;
        let (generation, client) = (self.generation, self.client.clone());
        if !matches!(self.load, Load::Ready(_)) {
            self.load = Load::Loading;
        }
        cx.notify();
        cx.spawn(async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.dashboard() }).await;
            this.update(cx, |this, cx| {
                if this.generation == generation {
                    this.load = match result {
                        Ok(summary) => Load::Ready(summary),
                        Err(e) => Load::Failed(e),
                    };
                    cx.notify();
                }
            })
            .ok();
        })
        .detach();
    }
}

fn title_block(cx: &App, title: &str, description: String) -> impl IntoElement {
    div()
        .flex()
        .flex_col()
        .gap(px(theme::SPACE_1))
        .child(div().text_size(px(theme::TEXT_TITLE)).font_weight(FontWeight::SEMIBOLD).child(title.to_string()))
        .child(div().text_size(px(theme::TEXT_BODY)).text_color(color(cx, Token::MutedForeground)).child(description))
}

fn admin_view(cx: &App, a: &AdminDashboard) -> impl IntoElement {
    let s = t(cx);
    let lang = state(cx).lang;
    let two_numbers = div()
        .flex()
        .gap(px(theme::SPACE_6))
        .child(
            div()
                .flex()
                .flex_col()
                .child(div().text_color(color(cx, Token::DangerIcon)).child(format_number(a.stock.out)))
                .child(div().text_size(px(theme::TEXT_TABLE)).font_weight(FontWeight::NORMAL).text_color(color(cx, Token::MutedForeground)).child(s.dashboard_kpi_stock_out)),
        )
        .child(
            div()
                .flex()
                .flex_col()
                .child(div().text_color(color(cx, Token::WarningIcon)).child(format_number(a.stock.low)))
                .child(div().text_size(px(theme::TEXT_TABLE)).font_weight(FontWeight::NORMAL).text_color(color(cx, Token::MutedForeground)).child(s.dashboard_kpi_stock_low)),
        );

    let rows: Vec<Vec<Cell>> = a
        .needs_attention
        .iter()
        .take(ATTENTION_ROWS)
        .map(|i| {
            vec![
                i.name.clone().into(),
                i.category_name.clone().into(),
                format_number(i.current_stock).into(),
                format_number(i.minimum_stock).into(),
                Badge::new(stock_tone(i.stock_status), i18n::stock_label(lang, true, i.stock_status)).into(),
            ]
        })
        .collect();
    let table = DataTable::new(
        "attention",
        vec![Column::new(s.dashboard_col_item), Column::new(s.dashboard_col_category).width(180.), Column::new(s.dashboard_col_stock).right().width(100.), Column::new(s.dashboard_col_minimum).right().width(100.), Column::new(s.dashboard_col_status).width(140.)],
    )
    .rows(rows)
    .empty(div().text_size(px(theme::TEXT_BODY)).text_color(color(cx, Token::MutedForeground)).child(s.dashboard_all_good));

    div()
        .flex()
        .flex_col()
        .gap(px(theme::SPACE_6))
        .child(title_block(cx, s.dashboard_title, s.dashboard_admin_desc.to_string()))
        .child(
            div()
                .flex()
                .gap(px(theme::SPACE_4))
                .child(KpiCard::new(s.dashboard_kpi_total, format_number(a.total_items())).caption(s.dashboard_kpi_total_caption))
                .child(KpiCard::new(s.dashboard_kpi_stock, two_numbers))
                .child(KpiCard::new(s.dashboard_kpi_approvals, format_number(a.pending_approvals)).caption(s.dashboard_kpi_approvals_caption)),
        )
        .child(div().text_size(px(theme::TEXT_SECTION)).font_weight(FontWeight::SEMIBOLD).child(s.dashboard_needs_attention))
        .child(table)
}

fn staff_view(cx: &App, d: &StaffDashboard, first_name: &str) -> impl IntoElement {
    let s = t(cx);
    let lang = state(cx).lang;
    let banner = d.overdue_first.as_ref().map(|l| {
        AlertBanner::danger(i18n::overdue_alert(lang, &l.number, &l.summary, &format_date(&l.expected_return_date), l.days_overdue))
    });
    let rows: Vec<Vec<Cell>> = d
        .active_loans
        .iter()
        .map(|l| {
            vec![
                l.number.clone().into(),
                l.summary.clone().into(),
                format_date(&l.expected_return_date).into(),
                Badge::new(loan_tone(l.status), i18n::loan_status_label(lang, l.status)).into(),
            ]
        })
        .collect();
    let list: AnyElement = if rows.is_empty() {
        StatePanel::message(cx, s.dashboard_no_active_loans, s.dashboard_no_active_loans_body).into_any_element()
    } else {
        DataTable::new("active-loans", vec![Column::new(s.dashboard_col_loan).width(140.), Column::new(s.dashboard_col_items), Column::new(s.dashboard_col_due).width(160.), Column::new(s.dashboard_col_status).width(210.)])
            .rows(rows)
            .into_any_element()
    };
    div()
        .flex()
        .flex_col()
        .gap(px(theme::SPACE_6))
        .child(title_block(cx, s.dashboard_title, i18n::staff_desc(lang, first_name)))
        .children(banner)
        .child(
            div()
                .flex()
                .gap(px(theme::SPACE_4))
                .child(KpiCard::new(s.dashboard_my_loans_kpi, d.active_loans.len().to_string()).caption(i18n::my_loans_caption(lang, d.overdue_count)))
                .child(KpiCard::new(s.dashboard_available_kpi, format_number(d.requestable)).caption(i18n::available_caption(lang, d.active_items))),
        )
        .child(div().text_size(px(theme::TEXT_SECTION)).font_weight(FontWeight::SEMIBOLD).child(s.dashboard_my_active_loans))
        .child(list)
}

impl Render for Dashboard {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let (role, name) = (state(cx).role, state(cx).user_name.clone());
        match &self.load {
            Load::Loading => StatePanel::loading(cx).into_any_element(),
            Load::Failed(e) => {
                let this = cx.entity();
                let message = error_message(state(cx).lang, e);
                StatePanel::error(cx, message, move |_, cx| this.update(cx, |d, cx| d.refresh(cx))).into_any_element()
            }
            Load::Ready(summary) => match (role, &summary.admin, &summary.staff) {
                (Role::Admin, Some(a), _) => admin_view(cx, a).into_any_element(),
                (Role::Staff, _, Some(st)) => staff_view(cx, st, name.split(' ').next().unwrap_or("")).into_any_element(),
                // The server's answer does not fit the role we think we have: say so instead of showing nothing.
                _ => StatePanel::no_access(cx).into_any_element(),
            },
        }
    }
}
