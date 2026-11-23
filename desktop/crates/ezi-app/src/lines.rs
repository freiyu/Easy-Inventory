//! Item lines for incoming and outgoing stock (and, in the next tasks, loan requests): a searchable item choice,
//! a quantity and, for incoming stock, a unit price. Several rows, each removable, and one button to add a row.
//! Same rules and messages as the web `LinesEditor`; the form that owns it reads `lines()` and shows `set_errors`.
//! shortcut: an item already on
//! another row is not hidden from the choice (the server refuses a repeated item with its own message).

use ezi_core::api::Client;
use ezi_core::forms::{FieldErrors, LineFields};
use ezi_core::format::format_number;
use ezi_core::i18n::{self, error_message};
use ezi_core::models::Item;
use ezi_core::theme::{self, Token};
use gpui_kit::component::button::*;
use gpui_kit::component::input::{Input, InputEvent, InputState};
use gpui_kit::component::select::{SearchableVec, Select, SelectEvent, SelectState};
use gpui_kit::component::{Disableable, IndexPath};
use gpui_kit::prelude::*;
use gpui_kit::*;
use std::sync::Arc;

use crate::load::Load;
use crate::state::{color, state, t};
use crate::widgets::{FormField, StatePanel};

type Choice = Entity<SelectState<SearchableVec<String>>>;

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum LineMode {
    /// Quantity and unit price; picking an item fills in its last purchase price.
    In,
    /// Quantity only, with the stock that can still be taken shown under it.
    Out,
}

struct Row {
    key: usize,
    select: Choice,
    pick: Option<usize>,
    quantity: Entity<InputState>,
    price: Entity<InputState>,
    /// Added by the person (not there from the start): it fades and rises in once.
    fresh: bool,
    _subscriptions: Vec<Subscription>,
}

/// What a row holds, as typed: for the form to check with `forms::stock_in` and `stock_out`.
pub struct LineValues {
    pub item_id: Option<i64>,
    pub quantity: String,
    pub unit_price: String,
}

impl LineValues {
    pub fn fields(&self) -> LineFields<'_> {
        LineFields { item_id: self.item_id, quantity: &self.quantity, unit_price: &self.unit_price }
    }
}

pub struct LinesEditor {
    client: Arc<Client>,
    mode: LineMode,
    /// Rows to start with once the items are loaded (an edit form).
    initial: Vec<(i64, i64)>,
    items: Load<Vec<Item>>,
    labels: Vec<String>,
    rows: Vec<Row>,
    next_key: usize,
    errors: FieldErrors,
}

impl LinesEditor {
    /// `initial` is (item id, quantity) for an edit form; empty starts with one empty row.
    pub fn new(client: Arc<Client>, mode: LineMode, initial: Vec<(i64, i64)>, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let mut editor = LinesEditor { client, mode, initial, items: Load::Loading, labels: Vec::new(), rows: Vec::new(), next_key: 0, errors: FieldErrors::new() };
        editor.load(window, cx);
        editor
    }

    fn load(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.items = Load::Loading;
        cx.notify();
        let client = self.client.clone();
        cx.spawn_in(window, async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.pickable_items() }).await;
            this.update_in(cx, |this, window, cx| {
                if let Ok(items) = &result {
                    // The name and, for Admin, the code: two items with one name stay told apart.
                    this.labels = items.iter().map(|i| i.code.as_ref().map_or_else(|| i.name.clone(), |c| format!("{} ({c})", i.name))).collect();
                    if this.rows.is_empty() {
                        let initial = std::mem::take(&mut this.initial);
                        this.items = Load::Ready(result.as_ref().map_or_else(|_| Vec::new(), |i| i.clone()));
                        if initial.is_empty() {
                            this.add_row(window, cx);
                        }
                        for (item_id, quantity) in initial {
                            let index = result.as_ref().ok().and_then(|items| items.iter().position(|i| i.id == item_id));
                            this.add_row(window, cx);
                            if let (Some(index), Some(row)) = (index, this.rows.last_mut()) {
                                row.pick = Some(index);
                                row.select.update(cx, |sel, cx| sel.set_selected_index(Some(IndexPath::default().row(index)), window, cx));
                                row.quantity.update(cx, |q, cx| q.set_value(quantity.to_string(), window, cx));
                            }
                        }
                    }
                }
                this.items = Load::from_result(result);
                cx.notify();
            })
            .ok();
        })
        .detach();
    }

    fn add_row(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let key = self.next_key;
        self.next_key += 1;
        let select = cx.new(|cx| SelectState::new(SearchableVec::new(self.labels.clone()), None, window, cx));
        let quantity = cx.new(|cx| InputState::new(window, cx));
        let price = cx.new(|cx| InputState::new(window, cx));
        let mut subs = Vec::new();
        subs.push(cx.subscribe_in(&select, window, move |this, _, ev: &SelectEvent<SearchableVec<String>>, window, cx| {
            let SelectEvent::Confirm(label) = ev;
            this.picked(key, label.clone(), window, cx);
        }));
        for input in [&quantity, &price] {
            subs.push(cx.subscribe_in(input, window, |_, _, ev: &InputEvent, _, cx| {
                if let InputEvent::Change = ev {
                    cx.notify();
                }
            }));
        }
        self.rows.push(Row { key, select, pick: None, quantity, price, fresh: false, _subscriptions: subs });
        cx.notify();
    }

    fn picked(&mut self, key: usize, label: Option<String>, window: &mut Window, cx: &mut Context<Self>) {
        let index = label.and_then(|l| self.labels.iter().position(|x| *x == l));
        let (mode, last_price) = (self.mode, index.and_then(|i| self.items_ready().get(i)).and_then(|i| i.last_purchase_price));
        if let Some(row) = self.rows.iter_mut().find(|r| r.key == key) {
            row.pick = index;
            // Incoming stock starts from the price last paid, as the web form does; a price already typed is kept.
            if mode == LineMode::In && row.price.read(cx).value().trim().is_empty() {
                let price = last_price.unwrap_or(0).to_string();
                row.price.update(cx, |p, cx| p.set_value(price, window, cx));
            }
        }
        cx.notify();
    }

    fn items_ready(&self) -> &[Item] {
        match &self.items {
            Load::Ready(items) => items,
            _ => &[],
        }
    }

    /// The rows as typed, in order.
    pub fn lines(&self, cx: &App) -> Vec<LineValues> {
        self.rows
            .iter()
            .map(|r| LineValues {
                item_id: r.pick.and_then(|i| self.items_ready().get(i)).map(|i| i.id),
                quantity: r.quantity.read(cx).value().to_string(),
                unit_price: r.price.read(cx).value().to_string(),
            })
            .collect()
    }

    /// Value of incoming stock so far: the sum of quantity times unit price over the rows that have both.
    pub fn total(&self, cx: &App) -> i64 {
        let number = |s: String| s.trim().parse::<i64>().unwrap_or(0).max(0);
        self.lines(cx).into_iter().map(|l| number(l.quantity) * number(l.unit_price)).sum()
    }

    pub fn set_errors(&mut self, errors: FieldErrors, cx: &mut Context<Self>) {
        self.errors = errors;
        cx.notify();
    }
}

impl Render for LinesEditor {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let s = t(cx);
        let lang = state(cx).lang;
        match &self.items {
            Load::Loading => return StatePanel::loading(cx).into_any_element(),
            Load::Failed(e) => {
                let message = error_message(lang, e);
                let this = cx.entity();
                return StatePanel::error(cx, message, move |w, cx| this.update(cx, |p, cx| p.load(w, cx))).into_any_element();
            }
            Load::Ready(_) => {}
        }
        let (many, mode) = (self.rows.len() > 1, self.mode);
        let m = crate::motion::tokens(cx);
        let rows = self.rows.iter().enumerate().map(|(i, row)| {
            let key = row.key;
            let error = |field: &str| self.errors.get(&format!("lines.{i}.{field}")).cloned();
            let item = row.pick.and_then(|p| self.items_ready().get(p));
            let hint = item.filter(|_| mode == LineMode::Out).map(|it| i18n::available_hint(lang, it.available_for_loan, &it.unit));
            let mut quantity = FormField::new(s.fields_quantity.to_string(), Input::new(&row.quantity)).required().error(error("quantity"));
            if let Some(h) = hint {
                quantity = quantity.hint(h);
            }
            let line = div()
                .flex()
                .items_start()
                .gap(px(theme::SPACE_3))
                .p(px(theme::SPACE_3))
                .rounded(px(theme::RADIUS))
                .border_1()
                .border_color(color(cx, Token::Border))
                .bg(color(cx, Token::Muted))
                .child(div().flex_1().min_w_0().child(FormField::new(s.fields_item.to_string(), Select::new(&row.select).placeholder(s.ui_pick_item)).required().error(error("itemId"))))
                .child(div().w(px(theme::LINE_QUANTITY_WIDTH)).child(quantity))
                .when(mode == LineMode::In, |d| d.child(div().w(px(theme::LINE_PRICE_WIDTH)).child(FormField::new(s.fields_unit_price.to_string(), Input::new(&row.price)).required().error(error("unitPrice")))))
                .child(
                    div().pt(px(theme::LINE_REMOVE_OFFSET)).child(
                        Button::new(SharedString::from(format!("line-remove-{key}")))
                            .outline()
                            .label(s.stock_remove_line)
                            .disabled(!many)
                            .on_click(cx.listener(move |this, _, _, cx| {
                                this.rows.retain(|r| r.key != key);
                                cx.notify();
                            })),
                    ),
                );
            // A row the person added fades and rises in (4 px, once); deleting a row is instant.
            if row.fresh { crate::motion::enter(("line-row", key), std::time::Duration::ZERO, m.route, m.rise_row, line) } else { line.into_any_element() }
        });
        div()
            .flex()
            .flex_col()
            .gap(px(theme::SPACE_3))
            .children(self.errors.get("lines").cloned().map(|e| div().text_size(px(theme::TEXT_TABLE)).font_weight(FontWeight::SEMIBOLD).text_color(color(cx, Token::DangerIcon)).child(e)))
            .children(rows)
            .child(div().flex().child(Button::new("line-add").outline().label(s.stock_add_line).on_click(cx.listener(|this, _, window, cx| {
                this.add_row(window, cx);
                if let Some(row) = this.rows.last_mut() {
                    row.fresh = true;
                }
            }))))
            .when(mode == LineMode::In, |d| {
                d.child(
                    div()
                        .flex()
                        .justify_end()
                        .gap(px(theme::SPACE_3))
                        .text_size(px(theme::TEXT_BODY))
                        .child(div().text_color(color(cx, Token::MutedForeground)).child(s.stock_total_purchase))
                        .child(div().font_weight(FontWeight::SEMIBOLD).child(format!("Rp {}", format_number(self.total(cx))))),
                )
            })
            .into_any_element()
    }
}
