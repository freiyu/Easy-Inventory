//! Item lines of a purchase request. Each line is an existing item or a new one (name, area, kind, unit): a new item
//! becomes a real item, with a code the server generates, only when the request is received (BR-31, BR-32). Same fields,
//! rules and messages as the web `LinesEditor` in purchase mode.
//! shortcut: the item choices are the first 500 active items (see `Client::pickable_items`).

use std::sync::Arc;

use ezi_core::api::{ApiError, Client};
use ezi_core::forms::{FieldErrors, PurchaseLineFields, UNITS};
use ezi_core::i18n::error_message;
use ezi_core::models::{Item, NameOption, PurchaseLine};
use ezi_core::theme::{self, Token};
use gpui_kit::component::button::*;
use gpui_kit::component::input::{Input, InputState};
use gpui_kit::component::select::{SearchableVec, Select, SelectEvent, SelectState};
use gpui_kit::component::{Disableable, IndexPath};
use gpui_kit::prelude::*;
use gpui_kit::*;

use crate::load::Load;
use crate::state::{color, state, t};
use crate::widgets::{FormField, StatePanel};

type Choice = Entity<SelectState<SearchableVec<String>>>;

struct Options {
    items: Vec<Item>,
    item_labels: Vec<String>,
    categories: Vec<NameOption>,
    subcategories: Vec<NameOption>,
}

struct Row {
    key: usize,
    is_new: bool,
    item_select: Choice,
    item_pick: Option<usize>,
    quantity: Entity<InputState>,
    name: Entity<InputState>,
    category_select: Choice,
    category_pick: Option<usize>,
    subcategory_select: Choice,
    subcategory_pick: Option<usize>,
    unit_select: Choice,
    unit_pick: Option<usize>,
    _subscriptions: Vec<Subscription>,
}

/// What a row holds, as typed.
pub struct PurchaseLineValues {
    is_new: bool,
    item_id: Option<i64>,
    quantity: String,
    name: String,
    category_id: Option<i64>,
    subcategory_id: Option<i64>,
    unit: String,
}

impl PurchaseLineValues {
    pub fn fields(&self) -> PurchaseLineFields<'_> {
        PurchaseLineFields { is_new: self.is_new, item_id: self.item_id, quantity: &self.quantity, name: &self.name, category_id: self.category_id, subcategory_id: self.subcategory_id, unit: &self.unit }
    }
}

pub struct PurchaseLinesEditor {
    client: Arc<Client>,
    /// Rows to start with once the choices are loaded (an edit form).
    initial: Vec<PurchaseLine>,
    options: Load<Options>,
    rows: Vec<Row>,
    next_key: usize,
    errors: FieldErrors,
}

fn select(labels: Vec<String>, window: &mut Window, cx: &mut App) -> Choice {
    cx.new(|cx| SelectState::new(SearchableVec::new(labels), None, window, cx))
}

impl PurchaseLinesEditor {
    pub fn new(client: Arc<Client>, initial: Vec<PurchaseLine>, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let mut editor = PurchaseLinesEditor { client, initial, options: Load::Loading, rows: Vec::new(), next_key: 0, errors: FieldErrors::new() };
        editor.load(window, cx);
        editor
    }

    fn load(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.options = Load::Loading;
        cx.notify();
        let client = self.client.clone();
        cx.spawn_in(window, async move |this, cx| {
            let result = cx
                .background_executor()
                .spawn(async move {
                    let items = client.pickable_items()?;
                    let item_labels = items.iter().map(|i| i.code.as_ref().map_or_else(|| i.name.clone(), |c| format!("{} ({c})", i.name))).collect();
                    Ok::<_, ApiError>(Options { items, item_labels, categories: client.name_options("/categories")?, subcategories: client.name_options("/subcategories")? })
                })
                .await;
            this.update_in(cx, |this, window, cx| {
                this.options = Load::from_result(result);
                if this.rows.is_empty() && matches!(this.options, Load::Ready(_)) {
                    let initial = std::mem::take(&mut this.initial);
                    if initial.is_empty() {
                        this.add_row(None, window, cx);
                    }
                    for line in initial {
                        this.add_row(Some(line), window, cx);
                    }
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
    }

    fn add_row(&mut self, from: Option<PurchaseLine>, window: &mut Window, cx: &mut Context<Self>) {
        let Load::Ready(o) = &self.options else { return };
        let key = self.next_key;
        self.next_key += 1;
        let names = |v: &[NameOption]| v.iter().map(|x| x.name.clone()).collect::<Vec<_>>();
        let (item_select, category_select, subcategory_select, unit_select) = (
            select(o.item_labels.clone(), window, cx),
            select(names(&o.categories), window, cx),
            select(names(&o.subcategories), window, cx),
            select(UNITS.map(String::from).to_vec(), window, cx),
        );
        let quantity = cx.new(|cx| InputState::new(window, cx));
        let name = cx.new(|cx| InputState::new(window, cx));
        let mut subs = Vec::new();
        subs.push(cx.subscribe_in(&item_select, window, move |this, _, ev: &SelectEvent<SearchableVec<String>>, _, cx| {
            let SelectEvent::Confirm(label) = ev;
            if let (Load::Ready(o), Some(row)) = (&this.options, this.rows.iter_mut().find(|r| r.key == key)) {
                row.item_pick = label.as_ref().and_then(|l| o.item_labels.iter().position(|x| x == l));
            }
            cx.notify();
        }));
        subs.push(cx.subscribe_in(&category_select, window, move |this, _, ev: &SelectEvent<SearchableVec<String>>, _, _| {
            let SelectEvent::Confirm(label) = ev;
            if let (Load::Ready(o), Some(row)) = (&this.options, this.rows.iter_mut().find(|r| r.key == key)) {
                row.category_pick = label.as_ref().and_then(|l| o.categories.iter().position(|x| &x.name == l));
            }
        }));
        subs.push(cx.subscribe_in(&subcategory_select, window, move |this, _, ev: &SelectEvent<SearchableVec<String>>, _, _| {
            let SelectEvent::Confirm(label) = ev;
            if let (Load::Ready(o), Some(row)) = (&this.options, this.rows.iter_mut().find(|r| r.key == key)) {
                row.subcategory_pick = label.as_ref().and_then(|l| o.subcategories.iter().position(|x| &x.name == l));
            }
        }));
        subs.push(cx.subscribe_in(&unit_select, window, move |this, _, ev: &SelectEvent<SearchableVec<String>>, _, _| {
            let SelectEvent::Confirm(label) = ev;
            if let Some(row) = this.rows.iter_mut().find(|r| r.key == key) {
                row.unit_pick = label.as_ref().and_then(|l| UNITS.iter().position(|u| u == l));
            }
        }));
        let mut row = Row { key, is_new: false, item_select, item_pick: None, quantity, name, category_select, category_pick: None, subcategory_select, subcategory_pick: None, unit_select, unit_pick: None, _subscriptions: subs };
        if let Some(line) = from {
            row.quantity.update(cx, |q, cx| q.set_value(line.quantity.to_string(), window, cx));
            match line.new_item {
                None => {
                    row.item_pick = line.item_id.and_then(|id| o.items.iter().position(|i| i.id == id));
                    if let Some(i) = row.item_pick {
                        row.item_select.update(cx, |s, cx| s.set_selected_index(Some(IndexPath::default().row(i)), window, cx));
                    }
                }
                Some(n) => {
                    row.is_new = true;
                    row.name.update(cx, |q, cx| q.set_value(n.name.clone(), window, cx));
                    row.category_pick = o.categories.iter().position(|c| c.id == n.category_id);
                    row.subcategory_pick = n.subcategory_id.and_then(|id| o.subcategories.iter().position(|c| c.id == id));
                    row.unit_pick = UNITS.iter().position(|u| *u == n.unit);
                    for (sel, pick) in [(&row.category_select, row.category_pick), (&row.subcategory_select, row.subcategory_pick), (&row.unit_select, row.unit_pick)] {
                        if let Some(i) = pick {
                            sel.update(cx, |s, cx| s.set_selected_index(Some(IndexPath::default().row(i)), window, cx));
                        }
                    }
                }
            }
        }
        self.rows.push(row);
        cx.notify();
    }

    /// The rows as typed, in order.
    pub fn lines(&self, cx: &App) -> Vec<PurchaseLineValues> {
        let Load::Ready(o) = &self.options else { return Vec::new() };
        self.rows
            .iter()
            .map(|r| PurchaseLineValues {
                is_new: r.is_new,
                item_id: r.item_pick.and_then(|i| o.items.get(i)).map(|i| i.id),
                quantity: r.quantity.read(cx).value().to_string(),
                name: r.name.read(cx).value().to_string(),
                category_id: r.category_pick.and_then(|i| o.categories.get(i)).map(|c| c.id),
                subcategory_id: r.subcategory_pick.and_then(|i| o.subcategories.get(i)).map(|c| c.id),
                unit: r.unit_pick.and_then(|i| UNITS.get(i)).map(|u| u.to_string()).unwrap_or_default(),
            })
            .collect()
    }

    pub fn set_errors(&mut self, errors: FieldErrors, cx: &mut Context<Self>) {
        self.errors = errors;
        cx.notify();
    }
}

impl Render for PurchaseLinesEditor {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let s = t(cx);
        let lang = state(cx).lang;
        match &self.options {
            Load::Loading => return StatePanel::loading(cx).into_any_element(),
            Load::Failed(e) => {
                let message = error_message(lang, e);
                let this = cx.entity();
                return StatePanel::error(cx, message, move |w, cx| this.update(cx, |p, cx| p.load(w, cx))).into_any_element();
            }
            Load::Ready(_) => {}
        }
        let many = self.rows.len() > 1;
        let rows: Vec<_> = self.rows.iter().map(|row| {
            let key = row.key;
            let index = self.rows.iter().position(|r| r.key == key).unwrap_or(0);
            let error = |field: &str| self.errors.get(&format!("lines.{index}.{field}")).cloned();
            let kind = |id: &'static str, label: &'static str, is_new: bool, cx: &mut Context<Self>| {
                let b = Button::new(SharedString::from(format!("pline-{id}-{key}"))).label(label).on_click(cx.listener(move |this, _, _, cx| {
                    if let Some(r) = this.rows.iter_mut().find(|r| r.key == key) {
                        r.is_new = is_new;
                    }
                    cx.notify();
                }));
                if row.is_new == is_new { b.primary() } else { b.outline() }
            };
            let first: AnyElement = if row.is_new {
                FormField::new(s.fields_item_name.to_string(), Input::new(&row.name)).required().hint(s.purchases_new_item_hint).error(error("name")).into_any_element()
            } else {
                FormField::new(s.fields_item.to_string(), Select::new(&row.item_select).placeholder(s.ui_pick_item)).required().error(error("itemId")).into_any_element()
            };
            div()
                .flex()
                .flex_col()
                .gap(px(theme::SPACE_3))
                .p(px(theme::SPACE_3))
                .rounded(px(theme::RADIUS))
                .border_1()
                .border_color(color(cx, Token::Border))
                .bg(color(cx, Token::Muted))
                .child(
                    div()
                        .flex()
                        .items_center()
                        .justify_between()
                        .child(div().flex().gap(px(theme::SPACE_2)).child(kind("existing", s.purchases_line_existing, false, cx)).child(kind("new", s.purchases_line_new, true, cx)))
                        .child(Button::new(SharedString::from(format!("pline-remove-{key}"))).outline().label(s.stock_remove_line).disabled(!many).on_click(cx.listener(move |this, _, _, cx| {
                            this.rows.retain(|r| r.key != key);
                            cx.notify();
                        }))),
                )
                .child(
                    div()
                        .flex()
                        .items_start()
                        .gap(px(theme::SPACE_3))
                        .child(div().flex_1().min_w_0().child(first))
                        .child(div().w(px(theme::LINE_QUANTITY_WIDTH)).child(FormField::new(s.fields_quantity.to_string(), Input::new(&row.quantity)).required().error(error("quantity")))),
                )
                .when(row.is_new, |d| {
                    d.child(
                        div()
                            .flex()
                            .gap(px(theme::SPACE_3))
                            .child(div().flex_1().child(FormField::new(s.fields_category.to_string(), Select::new(&row.category_select).placeholder(s.purchases_pick_category)).required().error(error("categoryId"))))
                            .child(div().flex_1().child(FormField::new(s.fields_subcategory.to_string(), Select::new(&row.subcategory_select).placeholder(s.purchases_pick_subcategory)).required().error(error("subcategoryId"))))
                            .child(div().flex_1().child(FormField::new(s.fields_unit.to_string(), Select::new(&row.unit_select).placeholder(s.purchases_pick_unit)).required().error(error("unit")))),
                    )
                })
        }).collect();
        div()
            .flex()
            .flex_col()
            .gap(px(theme::SPACE_3))
            .children(self.errors.get("lines").cloned().map(|e| div().text_size(px(theme::TEXT_TABLE)).font_weight(FontWeight::SEMIBOLD).text_color(color(cx, Token::DangerIcon)).child(e)))
            .children(rows)
            .child(div().flex().child(Button::new("pline-add").outline().label(s.purchases_add_line).on_click(cx.listener(|this, _, window, cx| this.add_row(None, window, cx)))))
            .into_any_element()
    }
}
