//! The two stock forms (Admin): incoming and outgoing stock with item lines, and the stock adjustment.
//! Same fields, rules and messages as the web forms. The "stock cannot go below zero" rule is the server's: an outgoing
//! request over the stock comes back as the server's error and nothing is saved, so this only shows it.

use std::sync::Arc;

use ezi_core::api::{ApiError, Client};
use ezi_core::forms::{self, FieldErrors, LineFields};
use ezi_core::format::{format_number, today};
use ezi_core::i18n::{self, error_message};
use ezi_core::models::{Item, NameOption};
use ezi_core::theme::{self, Token};
use gpui_kit::component::button::*;
use gpui_kit::component::input::{Input, InputEvent, InputState};
use gpui_kit::component::select::{SearchableVec, Select, SelectEvent, SelectState};
use gpui_kit::component::Disableable;
use gpui_kit::prelude::*;
use gpui_kit::*;

use crate::lines::{LineMode, LinesEditor};
use crate::load::Load;
use crate::state::{color, state, t};
use crate::widgets::{toast, Callback, FormField, StatePanel, ToastKind};

type Choice = Entity<SelectState<SearchableVec<String>>>;

fn choice(labels: Vec<String>, window: &mut Window, cx: &mut App) -> Choice {
    cx.new(|cx| SelectState::new(SearchableVec::new(labels), None, window, cx))
}

fn banner(cx: &App, text: SharedString) -> impl IntoElement {
    div().px(px(theme::SPACE_3)).py(px(theme::SPACE_2)).rounded(px(theme::RADIUS)).bg(color(cx, Token::DangerSoft)).text_size(px(theme::TEXT_TABLE)).text_color(color(cx, Token::Foreground)).child(text)
}

/// A server refusal as form errors: the messages of the fields it names, and its own message for the banner.
fn failure(e: &ApiError, cx: &App) -> (FieldErrors, SharedString) {
    (e.fields().into_iter().collect(), error_message(state(cx).lang, e).into())
}

// ------------------------------------------------------------------ incoming and outgoing stock

pub struct MoveForm {
    client: Arc<Client>,
    mode: LineMode,
    date: Entity<InputState>,
    destination: Entity<InputState>,
    notes: Entity<InputState>,
    lines: Entity<LinesEditor>,
    suppliers: Load<Vec<NameOption>>,
    supplier: Option<Choice>,
    supplier_pick: Option<i64>,
    errors: FieldErrors,
    form_error: Option<SharedString>,
    busy: bool,
    request_id: String,
    on_done: Callback,
    _subscriptions: Vec<Subscription>,
}

impl MoveForm {
    pub fn new(client: Arc<Client>, mode: LineMode, on_done: Callback, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let date = cx.new(|cx| InputState::new(window, cx).default_value(today()));
        let destination = cx.new(|cx| InputState::new(window, cx));
        let notes = cx.new(|cx| InputState::new(window, cx));
        let lines = cx.new(|cx| LinesEditor::new(client.clone(), mode, Vec::new(), window, cx));
        // The lines editor shows its own total and errors; this form only asks it to redraw nothing more.
        let mut form = MoveForm {
            client,
            mode,
            date,
            destination,
            notes,
            lines,
            suppliers: if mode == LineMode::In { Load::Loading } else { Load::Ready(Vec::new()) },
            supplier: None,
            supplier_pick: None,
            errors: FieldErrors::new(),
            form_error: None,
            busy: false,
            request_id: forms::new_request_id(),
            on_done,
            _subscriptions: Vec::new(),
        };
        // Enter in a field sends the form, like the web forms.
        for input in [form.date.clone(), form.destination.clone(), form.notes.clone()] {
            let sub = cx.subscribe_in(&input, window, |this, _, ev: &InputEvent, window, cx| {
                if let InputEvent::PressEnter { .. } = ev {
                    this.save(window, cx);
                }
            });
            form._subscriptions.push(sub);
        }
        if mode == LineMode::In {
            form.load_suppliers(window, cx);
        }
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
                    let select = choice(list.iter().map(|o| o.name.clone()).collect(), window, cx);
                    this._subscriptions.push(cx.subscribe_in(&select, window, |this, _, ev: &SelectEvent<SearchableVec<String>>, _, cx| {
                        let SelectEvent::Confirm(label) = ev;
                        if let Load::Ready(list) = &this.suppliers {
                            this.supplier_pick = label.as_ref().and_then(|l| list.iter().find(|o| &o.name == l)).map(|o| o.id);
                        }
                        cx.notify();
                    }));
                    this.supplier = Some(select);
                }
                this.suppliers = Load::from_result(result);
                cx.notify();
            })
            .ok();
        })
        .detach();
    }

    fn save(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.busy || !matches!(self.suppliers, Load::Ready(_)) {
            return;
        }
        let lang = state(cx).lang;
        let (date, destination, notes) = (self.date.read(cx).value().to_string(), self.destination.read(cx).value().to_string(), self.notes.read(cx).value().to_string());
        let values = self.lines.read(cx).lines(cx);
        let fields: Vec<LineFields> = values.iter().map(|l| l.fields()).collect();
        let (kind, built) = match self.mode {
            LineMode::In => ("in", forms::stock_in(lang, &date, self.supplier_pick, &fields, &notes, &self.request_id)),
            LineMode::Out => ("out", forms::stock_out(lang, &date, &destination, &fields, &notes, &self.request_id)),
        };
        let body = match built {
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
        let client = self.client.clone();
        cx.spawn_in(window, async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.stock_move(kind, &body) }).await;
            this.update_in(cx, |this, window, cx| {
                this.busy = false;
                match result {
                    Ok(tx) => {
                        let text = i18n::stock_saved(state(cx).lang, &tx.kind, &tx.number);
                        toast(window, cx, ToastKind::Success, text);
                        this.request_id = forms::new_request_id();
                        (this.on_done.clone())(window, cx);
                    }
                    Err(e) => {
                        let (fields, message) = failure(&e, cx);
                        this.errors = fields.clone();
                        this.lines.update(cx, |l, cx| l.set_errors(fields, cx));
                        this.form_error = Some(message);
                    }
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
    }
}

impl Render for MoveForm {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let s = t(cx);
        let incoming = self.mode == LineMode::In;
        let (title, desc, section, save) = if incoming { (s.stock_in_title, s.stock_in_desc, s.stock_items_section, s.stock_save_in) } else { (s.stock_out_title, s.stock_out_desc, s.stock_out_items_section, s.stock_save_out) };
        let head = div()
            .flex()
            .flex_col()
            .gap(px(theme::SPACE_1))
            .child(div().text_size(px(theme::TEXT_TITLE)).font_weight(FontWeight::SEMIBOLD).child(title))
            .child(div().text_size(px(theme::TEXT_BODY)).text_color(color(cx, Token::MutedForeground)).child(desc));
        let error = |key: &str| self.errors.get(key).cloned();
        let body: AnyElement = match &self.suppliers {
            Load::Loading => StatePanel::loading(cx).into_any_element(),
            Load::Failed(e) => {
                let message = error_message(state(cx).lang, e);
                let this = cx.entity();
                StatePanel::error(cx, message, move |w, cx| this.update(cx, |f, cx| f.load_suppliers(w, cx))).into_any_element()
            }
            Load::Ready(_) => {
                let party: AnyElement = match (&self.supplier, incoming) {
                    (Some(select), true) => FormField::new(s.fields_supplier.to_string(), Select::new(select).placeholder(s.stock_select_supplier)).required().error(error("supplierId")).into_any_element(),
                    _ => FormField::new(s.fields_destination.to_string(), Input::new(&self.destination)).required().hint(s.fields_destination_hint).error(error("destination")).into_any_element(),
                };
                div()
                    .flex()
                    .flex_col()
                    .gap(px(theme::SPACE_4))
                    .child(div().flex().gap(px(theme::SPACE_4)).child(div().flex_1().child(FormField::new(s.fields_date.to_string(), Input::new(&self.date)).required().error(error("date")))).child(div().flex_1().child(party)))
                    .child(div().text_size(px(theme::TEXT_SECTION)).font_weight(FontWeight::SEMIBOLD).child(section))
                    .child(self.lines.clone())
                    .child(FormField::new(s.stock_note_field.to_string(), Input::new(&self.notes)))
                    .children(self.form_error.clone().filter(|_| self.errors.is_empty()).map(|e| banner(cx, e)))
                    .child(
                        div()
                            .flex()
                            .gap(px(theme::SPACE_2))
                            .child(Button::new("stock-save").primary().label(if self.busy { s.common_saving } else { save }).disabled(self.busy).on_click(cx.listener(|this, _, window, cx| this.save(window, cx))))
                            .child(Button::new("stock-cancel").outline().label(s.common_cancel).disabled(self.busy).on_click({
                                let done = self.on_done.clone();
                                move |_, w, cx| done(w, cx)
                            })),
                    )
                    .into_any_element()
            }
        };
        div().flex().flex_col().gap(px(theme::SPACE_4)).child(head).child(body)
    }
}

// ------------------------------------------------------------------ adjustment

pub struct AdjustForm {
    client: Arc<Client>,
    items: Load<Vec<Item>>,
    labels: Vec<String>,
    select: Option<Choice>,
    pick: Option<usize>,
    date: Entity<InputState>,
    physical: Entity<InputState>,
    reason: Entity<InputState>,
    errors: FieldErrors,
    form_error: Option<SharedString>,
    busy: bool,
    request_id: String,
    on_done: Callback,
    _subscriptions: Vec<Subscription>,
}

impl AdjustForm {
    pub fn new(client: Arc<Client>, on_done: Callback, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let date = cx.new(|cx| InputState::new(window, cx).default_value(today()));
        let physical = cx.new(|cx| InputState::new(window, cx));
        let reason = cx.new(|cx| InputState::new(window, cx));
        // The difference is shown live, so the form redraws when the counted stock changes.
        let sub = cx.subscribe_in(&physical, window, |_, _, ev: &InputEvent, _, cx| {
            if let InputEvent::Change = ev {
                cx.notify();
            }
        });
        let mut form = AdjustForm { client, items: Load::Loading, labels: Vec::new(), select: None, pick: None, date, physical, reason, errors: FieldErrors::new(), form_error: None, busy: false, request_id: forms::new_request_id(), on_done, _subscriptions: vec![sub] };
        // Enter in a field sends the form, like the web forms.
        for input in [form.date.clone(), form.physical.clone(), form.reason.clone()] {
            let sub = cx.subscribe_in(&input, window, |this, _, ev: &InputEvent, window, cx| {
                if let InputEvent::PressEnter { .. } = ev {
                    this.save(window, cx);
                }
            });
            form._subscriptions.push(sub);
        }
        form.load_items(window, cx);
        form
    }

    fn load_items(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.items = Load::Loading;
        cx.notify();
        let client = self.client.clone();
        cx.spawn_in(window, async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.pickable_items() }).await;
            this.update_in(cx, |this, window, cx| {
                if let Ok(items) = &result {
                    this.labels = items.iter().map(|i| i.code.as_ref().map_or_else(|| i.name.clone(), |c| format!("{} ({c})", i.name))).collect();
                    let select = choice(this.labels.clone(), window, cx);
                    this._subscriptions.push(cx.subscribe_in(&select, window, |this, _, ev: &SelectEvent<SearchableVec<String>>, window, cx| {
                        let SelectEvent::Confirm(label) = ev;
                        this.pick = label.as_ref().and_then(|l| this.labels.iter().position(|x| x == l));
                        // A new item starts a new count, as in the web form.
                        this.physical.update(cx, |p, cx| p.set_value("", window, cx));
                        cx.notify();
                    }));
                    this.select = Some(select);
                }
                this.items = Load::from_result(result);
                cx.notify();
            })
            .ok();
        })
        .detach();
    }

    fn picked(&self) -> Option<&Item> {
        match (&self.items, self.pick) {
            (Load::Ready(items), Some(i)) => items.get(i),
            _ => None,
        }
    }

    fn save(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.busy || !matches!(self.items, Load::Ready(_)) {
            return;
        }
        let lang = state(cx).lang;
        let (item_id, system) = (self.picked().map(|i| i.id), self.picked().and_then(|i| i.current_stock).unwrap_or(0));
        let (date, physical, reason) = (self.date.read(cx).value().to_string(), self.physical.read(cx).value().to_string(), self.reason.read(cx).value().to_string());
        let body = match forms::adjustment(lang, &date, item_id, &physical, system, &reason, &self.request_id) {
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
        let client = self.client.clone();
        cx.spawn_in(window, async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.stock_adjust(&body) }).await;
            this.update_in(cx, |this, window, cx| {
                this.busy = false;
                match result {
                    Ok(tx) => {
                        let text = i18n::stock_saved(state(cx).lang, &tx.kind, &tx.number);
                        toast(window, cx, ToastKind::Success, text);
                        this.request_id = forms::new_request_id();
                        (this.on_done.clone())(window, cx);
                    }
                    Err(e) => {
                        let (fields, message) = failure(&e, cx);
                        this.errors = fields;
                        this.form_error = Some(message);
                    }
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
    }
}

impl Render for AdjustForm {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let s = t(cx);
        let lang = state(cx).lang;
        let head = div()
            .flex()
            .flex_col()
            .gap(px(theme::SPACE_1))
            .child(div().text_size(px(theme::TEXT_TITLE)).font_weight(FontWeight::SEMIBOLD).child(s.stock_adj_title))
            .child(div().text_size(px(theme::TEXT_BODY)).text_color(color(cx, Token::MutedForeground)).child(s.stock_adj_desc));
        let error = |key: &str| self.errors.get(key).cloned();
        let body: AnyElement = match (&self.items, &self.select) {
            (Load::Loading, _) => StatePanel::loading(cx).into_any_element(),
            (Load::Failed(e), _) => {
                let message = error_message(lang, e);
                let this = cx.entity();
                StatePanel::error(cx, message, move |w, cx| this.update(cx, |f, cx| f.load_items(w, cx))).into_any_element()
            }
            (Load::Ready(_), Some(select)) => {
                let item = self.picked();
                let system = item.and_then(|i| i.current_stock).unwrap_or(0);
                let reserved_note = item.map(|i| i18n::reserved_note(lang, system - i.available_for_loan));
                let difference = match (item, self.physical.read(cx).value().trim().parse::<i64>()) {
                    (Some(_), Ok(p)) if p >= 0 => match p - system {
                        0 => s.stock_no_change.to_string(),
                        d => format!("{}{}", if d > 0 { "+" } else { "" }, format_number(d)),
                    },
                    _ => "-".to_string(),
                };
                let readonly = |text: String| div().h(px(theme::CONTROL_HEIGHT)).flex().items_center().px(px(theme::SPACE_3)).rounded(px(theme::RADIUS)).bg(color(cx, Token::Muted)).text_size(px(theme::TEXT_BODY)).child(text);
                let mut system_field = FormField::new(s.fields_system_stock.to_string(), readonly(item.map_or("-".to_string(), |i| format!("{} {}", format_number(system), i.unit))));
                if let Some(note) = reserved_note {
                    system_field = system_field.hint(note);
                }
                div()
                    .flex()
                    .flex_col()
                    .gap(px(theme::SPACE_4))
                    .max_w(px(theme::FORM_MAX_WIDTH))
                    .child(FormField::new(s.fields_item.to_string(), Select::new(select).placeholder(s.ui_pick_item)).required().hint(s.stock_adj_item_hint).error(error("itemId")))
                    .child(FormField::new(s.fields_date.to_string(), Input::new(&self.date)).required().error(error("date")))
                    .child(
                        div()
                            .flex()
                            .gap(px(theme::SPACE_4))
                            .child(div().flex_1().child(system_field))
                            .child(div().flex_1().child(FormField::new(s.fields_physical_stock.to_string(), Input::new(&self.physical)).required().error(error("physical"))))
                            .child(div().flex_1().child(FormField::new(s.stock_difference_label.to_string(), readonly(difference)))),
                    )
                    .child(FormField::new(s.fields_reason.to_string(), Input::new(&self.reason)).required().hint(s.stock_reason_hint).error(error("reason")))
                    .children(self.form_error.clone().filter(|_| self.errors.is_empty()).map(|e| banner(cx, e)))
                    .child(
                        div()
                            .flex()
                            .gap(px(theme::SPACE_2))
                            .child(Button::new("adjust-save").primary().label(if self.busy { s.common_saving } else { s.stock_save_adj }).disabled(self.busy).on_click(cx.listener(|this, _, window, cx| this.save(window, cx))))
                            .child(Button::new("adjust-cancel").outline().label(s.common_cancel).disabled(self.busy).on_click({
                                let done = self.on_done.clone();
                                move |_, w, cx| done(w, cx)
                            })),
                    )
                    .into_any_element()
            }
            _ => div().into_any_element(),
        };
        div().flex().flex_col().gap(px(theme::SPACE_4)).child(head).child(body)
    }
}

