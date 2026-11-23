//! The purchase request form (new, or edit a draft) and the receive form. Same fields, rules and messages as the web.
//! A request is received once and in full: the form has no quantities. Receiving a line that proposes a new item makes
//! the server create the item with its code (BR-31, BR-32): nothing here makes a code.

use std::sync::Arc;

use ezi_core::api::Client;
use ezi_core::forms::{self, FieldErrors, PurchaseLineFields, ReceiveLineFields};
use ezi_core::format::{days_from_today, format_number, today};
use ezi_core::i18n::{self, error_message};
use ezi_core::models::{NameOption, Purchase, UserOption};
use ezi_core::theme::{self, Token};
use gpui_kit::component::button::*;
use gpui_kit::component::input::{Input, InputEvent, InputState};
use gpui_kit::component::select::{SearchableVec, Select, SelectEvent, SelectState};
use gpui_kit::component::{Disableable, IndexPath};
use gpui_kit::prelude::*;
use gpui_kit::*;

use crate::item_form::Done;
use crate::load::Load;
use crate::purchase_lines::PurchaseLinesEditor;
use crate::state::{color, state, t};
use crate::widgets::{toast, FormField, StatePanel, ToastKind};

type Choice = Entity<SelectState<SearchableVec<String>>>;

fn banner(cx: &App, text: SharedString) -> impl IntoElement {
    div().px(px(theme::SPACE_3)).py(px(theme::SPACE_2)).rounded(px(theme::RADIUS)).bg(color(cx, Token::DangerSoft)).text_size(px(theme::TEXT_TABLE)).text_color(color(cx, Token::Foreground)).child(text)
}

fn section(cx: &App, title: &str) -> impl IntoElement {
    div().text_size(px(theme::TEXT_SECTION)).font_weight(FontWeight::SEMIBOLD).text_color(color(cx, Token::Foreground)).child(title.to_string())
}

// ------------------------------------------------------------------ new and edit

pub struct PurchaseForm {
    client: Arc<Client>,
    editing: Option<Purchase>,
    admin: bool,
    people: Load<Vec<UserOption>>,
    requester_select: Option<Choice>,
    requester_pick: Option<i64>,
    lines: Entity<PurchaseLinesEditor>,
    needed_by: Entity<InputState>,
    reason: Entity<InputState>,
    notes: Entity<InputState>,
    errors: FieldErrors,
    form_error: Option<SharedString>,
    busy: bool,
    request_id: String,
    on_done: Done,
    _subscriptions: Vec<Subscription>,
}

impl PurchaseForm {
    pub fn new(client: Arc<Client>, editing: Option<Purchase>, admin: bool, on_done: Done, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let own_id = state(cx).user_id;
        let e = editing.as_ref();
        let text = |window: &mut Window, cx: &mut Context<Self>, value: String| cx.new(|cx| InputState::new(window, cx).default_value(value));
        let needed_by = text(window, cx, e.map_or_else(|| days_from_today(7), |p| p.needed_by.clone()));
        let reason = text(window, cx, e.map(|p| p.reason.clone()).unwrap_or_default());
        let notes = text(window, cx, e.map(|p| p.notes.clone()).unwrap_or_default());
        let initial = e.map(|p| p.lines.clone()).unwrap_or_default();
        let lines = cx.new(|cx| PurchaseLinesEditor::new(client.clone(), initial, window, cx));
        let mut form = PurchaseForm {
            requester_pick: Some(e.map_or(own_id, |p| p.requester_id)),
            client,
            editing,
            admin,
            people: if admin { Load::Loading } else { Load::Ready(Vec::new()) },
            requester_select: None,
            lines,
            needed_by,
            reason,
            notes,
            errors: FieldErrors::new(),
            form_error: None,
            busy: false,
            request_id: forms::new_request_id(),
            on_done,
            _subscriptions: Vec::new(),
        };
        // Enter in a field sends the form, like the web forms.
        for input in [form.needed_by.clone(), form.reason.clone(), form.notes.clone()] {
            let sub = cx.subscribe_in(&input, window, |this, _, ev: &InputEvent, window, cx| {
                if let InputEvent::PressEnter { .. } = ev {
                    this.save(true, window, cx);
                }
            });
            form._subscriptions.push(sub);
        }
        if admin {
            form.load_people(window, cx);
        }
        form
    }

    fn load_people(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.people = Load::Loading;
        cx.notify();
        let client = self.client.clone();
        cx.spawn_in(window, async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.borrower_options() }).await;
            this.update_in(cx, |this, window, cx| {
                if let Ok(list) = &result {
                    let labels: Vec<String> = list.iter().map(|u| format!("{} ({})", u.name, u.role)).collect();
                    let selected = this.requester_pick.and_then(|id| list.iter().position(|u| u.id == id));
                    let select = cx.new(|cx| SelectState::new(SearchableVec::new(labels), selected.map(|i| IndexPath::default().row(i)), window, cx));
                    this._subscriptions.push(cx.subscribe_in(&select, window, |this, _, ev: &SelectEvent<SearchableVec<String>>, _, cx| {
                        let SelectEvent::Confirm(label) = ev;
                        if let Load::Ready(list) = &this.people {
                            this.requester_pick = label.as_ref().and_then(|l| list.iter().find(|u| format!("{} ({})", u.name, u.role) == *l)).map(|u| u.id);
                        }
                        cx.notify();
                    }));
                    this.requester_select = Some(select);
                }
                this.people = Load::from_result(result);
                cx.notify();
            })
            .ok();
        })
        .detach();
    }

    fn save(&mut self, submit: bool, window: &mut Window, cx: &mut Context<Self>) {
        if self.busy || !matches!(self.people, Load::Ready(_)) {
            return;
        }
        let lang = state(cx).lang;
        let values = self.lines.read(cx).lines(cx);
        let fields: Vec<PurchaseLineFields> = values.iter().map(|l| l.fields()).collect();
        let text = |input: &Entity<InputState>| input.read(cx).value().to_string();
        let (needed_by, reason, notes) = (text(&self.needed_by), text(&self.reason), text(&self.notes));
        let creating = self.editing.is_none();
        let body = match forms::purchase(lang, self.requester_pick, &fields, &needed_by, &reason, &notes, submit, creating.then_some(self.request_id.as_str())) {
            Ok(b) => b,
            Err(e) => {
                self.errors = e.clone();
                self.form_error = None;
                self.lines.update(cx, |l, cx| l.set_errors(e, cx));
                cx.notify();
                return;
            }
        };
        self.busy = true;
        self.errors.clear();
        self.form_error = None;
        self.lines.update(cx, |l, cx| l.set_errors(FieldErrors::new(), cx));
        cx.notify();
        let (client, id) = (self.client.clone(), self.editing.as_ref().map(|p| p.id));
        cx.spawn_in(window, async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.save_purchase(id, &body) }).await;
            this.update_in(cx, |this, window, cx| {
                this.busy = false;
                match result {
                    Ok(p) => {
                        let s = t(cx);
                        toast(window, cx, ToastKind::Success, if submit { s.purchases_submitted } else { s.purchases_draft_saved });
                        this.request_id = forms::new_request_id();
                        (this.on_done.clone())(Some(p.id), window, cx);
                    }
                    Err(e) => {
                        let fields: FieldErrors = e.fields().into_iter().collect();
                        this.errors = fields.clone();
                        this.lines.update(cx, |l, cx| l.set_errors(fields, cx));
                        this.form_error = Some(error_message(state(cx).lang, &e).into());
                    }
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
    }
}

impl Render for PurchaseForm {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let s = t(cx);
        let lang = state(cx).lang;
        let title = if self.editing.is_some() { s.purchases_edit_title } else { s.purchases_new_title };
        let head = div()
            .flex()
            .flex_col()
            .gap(px(theme::SPACE_1))
            .child(div().text_size(px(theme::TEXT_TITLE)).font_weight(FontWeight::SEMIBOLD).child(title))
            .child(div().text_size(px(theme::TEXT_BODY)).text_color(color(cx, Token::MutedForeground)).child(s.purchases_form_desc));
        let error = |key: &str| self.errors.get(key).cloned();
        let body: AnyElement = match &self.people {
            Load::Loading => StatePanel::loading(cx).into_any_element(),
            Load::Failed(e) => {
                let message = error_message(lang, e);
                let this = cx.entity();
                StatePanel::error(cx, message, move |w, cx| this.update(cx, |f, cx| f.load_people(w, cx))).into_any_element()
            }
            Load::Ready(_) => {
                let requester: Option<AnyElement> = self.requester_select.as_ref().filter(|_| self.admin).map(|sel| FormField::new(s.fields_requester.to_string(), Select::new(sel)).required().hint(s.purchases_requester_hint).error(error("requesterId")).into_any_element());
                div()
                    .flex()
                    .flex_col()
                    .gap(px(theme::SPACE_4))
                    .children(requester)
                    .child(section(cx, s.purchases_section_items))
                    .child(div().text_size(px(theme::TEXT_TABLE)).text_color(color(cx, Token::MutedForeground)).child(s.purchases_how_new))
                    .child(self.lines.clone())
                    .child(section(cx, s.purchases_section_when))
                    .child(div().max_w(px(theme::FORM_MAX_WIDTH)).child(FormField::new(s.fields_needed_by.to_string(), Input::new(&self.needed_by)).required().error(error("neededBy"))))
                    .child(section(cx, s.purchases_section_why))
                    .child(FormField::new(s.fields_reason.to_string(), Input::new(&self.reason)).required().error(error("reason")))
                    .child(FormField::new(s.common_notes.to_string(), Input::new(&self.notes)))
                    .children(self.form_error.clone().filter(|_| self.errors.is_empty()).map(|e| banner(cx, e)))
                    .child(
                        div()
                            .flex()
                            .flex_wrap()
                            .gap(px(theme::SPACE_2))
                            .child(Button::new("purchase-submit").primary().label(if self.busy { s.common_saving } else { s.purchases_submit }).disabled(self.busy).on_click(cx.listener(|this, _, window, cx| this.save(true, window, cx))))
                            .child(Button::new("purchase-draft").outline().label(s.purchases_save_draft).disabled(self.busy).on_click(cx.listener(|this, _, window, cx| this.save(false, window, cx))))
                            .child(Button::new("purchase-cancel").outline().label(s.common_cancel).disabled(self.busy).on_click({
                                let done = self.on_done.clone();
                                let id = self.editing.as_ref().map(|p| p.id);
                                move |_, w, cx| done(id, w, cx)
                            })),
                    )
                    .into_any_element()
            }
        };
        div().flex().flex_col().gap(px(theme::SPACE_4)).child(head).child(body)
    }
}

// ------------------------------------------------------------------ receive

pub struct ReceiveForm {
    client: Arc<Client>,
    purchase: Purchase,
    suppliers: Load<Vec<NameOption>>,
    supplier_select: Option<Choice>,
    supplier_pick: Option<i64>,
    date: Entity<InputState>,
    notes: Entity<InputState>,
    /// One price and one minimum stock per request line, in the request's order.
    prices: Vec<Entity<InputState>>,
    minimums: Vec<Entity<InputState>>,
    errors: FieldErrors,
    form_error: Option<SharedString>,
    busy: bool,
    on_done: Done,
    _subscriptions: Vec<Subscription>,
}

impl ReceiveForm {
    pub fn new(client: Arc<Client>, purchase: Purchase, on_done: Done, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let date = cx.new(|cx| InputState::new(window, cx).default_value(today()));
        let notes = cx.new(|cx| InputState::new(window, cx));
        // The usual price for an existing item; a new item starts without one.
        let prices: Vec<_> = purchase.lines.iter().map(|l| cx.new(|cx| InputState::new(window, cx).default_value(if l.new_item.is_some() { String::new() } else { l.last_purchase_price.unwrap_or(0).to_string() }))).collect();
        let minimums: Vec<_> = purchase.lines.iter().map(|_| cx.new(|cx| InputState::new(window, cx))).collect();
        let mut subs = Vec::new();
        for input in prices.iter().chain(minimums.iter()) {
            subs.push(cx.subscribe_in(input, window, |_, _, ev: &InputEvent, _, cx| {
                if let InputEvent::Change = ev {
                    cx.notify();
                }
            }));
        }
        let preferred = purchase.lines.iter().find_map(|l| l.preferred_supplier_id);
        let mut form = ReceiveForm { client, purchase, suppliers: Load::Loading, supplier_select: None, supplier_pick: preferred, date, notes, prices, minimums, errors: FieldErrors::new(), form_error: None, busy: false, on_done, _subscriptions: subs };
        // Enter in a field sends the form, like the web forms.
        let inputs: Vec<Entity<InputState>> = [form.date.clone(), form.notes.clone()].into_iter().chain(form.prices.iter().cloned()).chain(form.minimums.iter().cloned()).collect();
        for input in inputs {
            let sub = cx.subscribe_in(&input, window, |this, _, ev: &InputEvent, window, cx| {
                if let InputEvent::PressEnter { .. } = ev {
                    this.save(window, cx);
                }
            });
            form._subscriptions.push(sub);
        }
        form.load_suppliers(window, cx);
        form
    }

    fn load_suppliers(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.suppliers = Load::Loading;
        cx.notify();
        let client = self.client.clone();
        cx.spawn_in(window, async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.name_options("/suppliers") }).await;
            this.update_in(cx, |this, window, cx| {
                if let Ok(list) = &result {
                    let selected = this.supplier_pick.and_then(|id| list.iter().position(|o| o.id == id));
                    // A preferred supplier that is no longer active is not preselected.
                    if selected.is_none() {
                        this.supplier_pick = None;
                    }
                    let select = cx.new(|cx| SelectState::new(SearchableVec::new(list.iter().map(|o| o.name.clone()).collect::<Vec<String>>()), selected.map(|i| IndexPath::default().row(i)), window, cx));
                    this._subscriptions.push(cx.subscribe_in(&select, window, |this, _, ev: &SelectEvent<SearchableVec<String>>, _, cx| {
                        let SelectEvent::Confirm(label) = ev;
                        if let Load::Ready(list) = &this.suppliers {
                            this.supplier_pick = label.as_ref().and_then(|l| list.iter().find(|o| &o.name == l)).map(|o| o.id);
                        }
                        cx.notify();
                    }));
                    this.supplier_select = Some(select);
                }
                this.suppliers = Load::from_result(result);
                cx.notify();
            })
            .ok();
        })
        .detach();
    }

    fn total(&self, cx: &App) -> i64 {
        self.purchase.lines.iter().zip(&self.prices).map(|(l, p)| l.quantity * p.read(cx).value().trim().parse::<i64>().unwrap_or(0).max(0)).sum()
    }

    fn save(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.busy || !matches!(self.suppliers, Load::Ready(_)) {
            return;
        }
        let lang = state(cx).lang;
        let (prices, minimums): (Vec<String>, Vec<String>) = (self.prices.iter().map(|p| p.read(cx).value().to_string()).collect(), self.minimums.iter().map(|p| p.read(cx).value().to_string()).collect());
        let fields: Vec<ReceiveLineFields> = self.purchase.lines.iter().enumerate().map(|(i, l)| ReceiveLineFields { is_new: l.new_item.is_some(), unit_price: &prices[i], minimum_stock: &minimums[i] }).collect();
        let body = match forms::receive(lang, &self.date.read(cx).value(), self.supplier_pick, &fields, &self.notes.read(cx).value()) {
            Ok(b) => b,
            Err(e) => {
                self.errors = e;
                self.form_error = None;
                cx.notify();
                return;
            }
        };
        self.busy = true;
        self.errors.clear();
        self.form_error = None;
        cx.notify();
        let (client, id) = (self.client.clone(), self.purchase.id);
        cx.spawn_in(window, async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.receive_purchase(id, &body) }).await;
            this.update_in(cx, |this, window, cx| {
                this.busy = false;
                match result {
                    Ok(_) => {
                        let text = t(cx).purchases_received;
                        toast(window, cx, ToastKind::Success, text);
                        (this.on_done.clone())(Some(id), window, cx);
                    }
                    Err(e) => {
                        this.errors = e.fields().into_iter().collect();
                        this.form_error = Some(error_message(state(cx).lang, &e).into());
                    }
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
    }
}

impl Render for ReceiveForm {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let s = t(cx);
        let lang = state(cx).lang;
        let id = self.purchase.id;
        let head = div()
            .flex()
            .flex_col()
            .gap(px(theme::SPACE_1))
            .child(div().text_size(px(theme::TEXT_TITLE)).font_weight(FontWeight::SEMIBOLD).child(i18n::purchase_receive_title(lang, &self.purchase.number)))
            .child(div().text_size(px(theme::TEXT_BODY)).text_color(color(cx, Token::MutedForeground)).child(s.purchases_receive_body));
        let error = |key: &str| self.errors.get(key).cloned();
        let body: AnyElement = match (&self.suppliers, &self.supplier_select) {
            (Load::Loading, _) => StatePanel::loading(cx).into_any_element(),
            (Load::Failed(e), _) => {
                let message = error_message(lang, e);
                let this = cx.entity();
                StatePanel::error(cx, message, move |w, cx| this.update(cx, |f, cx| f.load_suppliers(w, cx))).into_any_element()
            }
            (Load::Ready(_), Some(supplier)) => {
                let has_new = self.purchase.lines.iter().any(|l| l.new_item.is_some());
                let lines = self.purchase.lines.iter().enumerate().map(|(i, l)| {
                    let new = l.new_item.is_some();
                    div()
                        .flex()
                        .flex_col()
                        .gap(px(theme::SPACE_3))
                        .p(px(theme::SPACE_3))
                        .rounded(px(theme::RADIUS))
                        .border_1()
                        .border_color(color(cx, Token::Border))
                        .child(div().text_size(px(theme::TEXT_BODY)).font_weight(FontWeight::SEMIBOLD).child(i18n::purchase_receive_line_name(&l.item_name, l.quantity, &l.unit)))
                        .child(
                            div()
                                .flex()
                                .gap(px(theme::SPACE_3))
                                .when(new, |d| d.child(div().flex_1().child(FormField::new(s.fields_minimum_stock.to_string(), Input::new(&self.minimums[i])).required().hint(s.items_minimum_hint).error(error(&format!("lines.{i}.minimumStock"))))))
                                .child(div().flex_1().child(FormField::new(s.fields_unit_price.to_string(), Input::new(&self.prices[i])).required().error(error(&format!("lines.{i}.unitPrice"))))),
                        )
                });
                div()
                    .flex()
                    .flex_col()
                    .gap(px(theme::SPACE_4))
                    .child(div().flex().gap(px(theme::SPACE_4)).child(div().flex_1().child(FormField::new(s.fields_received_date.to_string(), Input::new(&self.date)).required().error(error("date")))).child(div().flex_1().child(FormField::new(s.fields_supplier.to_string(), Select::new(supplier).placeholder(s.validation_select_supplier)).required().error(error("supplierId")))))
                    .when(has_new, |d| d.child(div().px(px(theme::SPACE_4)).py(px(theme::SPACE_3)).rounded(px(theme::RADIUS)).bg(color(cx, Token::InfoSoft)).text_size(px(theme::TEXT_BODY)).child(s.purchases_receive_new_items_note)))
                    .children(lines)
                    .child(
                        div()
                            .flex()
                            .justify_between()
                            .px(px(theme::SPACE_4))
                            .py(px(theme::SPACE_3))
                            .rounded(px(theme::RADIUS))
                            .bg(color(cx, Token::Muted))
                            .text_size(px(theme::TEXT_BODY))
                            .child(div().text_color(color(cx, Token::MutedForeground)).child(s.purchases_receive_total))
                            .child(div().font_weight(FontWeight::SEMIBOLD).child(format!("Rp {}", format_number(self.total(cx))))),
                    )
                    .child(FormField::new(s.common_notes.to_string(), Input::new(&self.notes)))
                    .children(self.form_error.clone().filter(|_| self.errors.is_empty()).map(|e| banner(cx, e)))
                    .child(
                        div()
                            .flex()
                            .gap(px(theme::SPACE_2))
                            .child(Button::new("receive-save").primary().label(if self.busy { s.common_saving } else { s.purchases_receive_confirm }).disabled(self.busy).on_click(cx.listener(|this, _, window, cx| this.save(window, cx))))
                            .child(Button::new("receive-cancel").outline().label(s.common_cancel).disabled(self.busy).on_click({
                                let done = self.on_done.clone();
                                move |_, w, cx| done(Some(id), w, cx)
                            })),
                    )
                    .into_any_element()
            }
            _ => div().into_any_element(),
        };
        div().flex().flex_col().gap(px(theme::SPACE_4)).child(head).child(body)
    }
}
