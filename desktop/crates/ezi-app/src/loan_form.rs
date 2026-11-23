//! The loan form (new, or edit a draft) and the return form. Same fields, rules and messages as the web: an Admin books for
//! anyone active, a Staff member always borrows for themselves. Whether the stock is enough is the server's rule (BR-08):
//! its message comes back at the quantity of the line. A loan is returned in full, so the return form has no quantities.

use std::sync::Arc;

use ezi_core::api::Client;
use ezi_core::forms::{self, FieldErrors, LineFields};
use ezi_core::format::{days_from_today, today};
use ezi_core::i18n::{self, error_message};
use ezi_core::models::{Loan, UserOption};
use ezi_core::theme::{self, Token};
use gpui_kit::component::button::*;
use gpui_kit::component::input::{Input, InputEvent, InputState};
use gpui_kit::component::select::{SearchableVec, Select, SelectEvent, SelectState};
use gpui_kit::component::{Disableable, IndexPath};
use gpui_kit::prelude::*;
use gpui_kit::*;

use crate::item_form::Done;
use crate::lines::{LineMode, LinesEditor};
use crate::load::Load;
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

pub struct LoanForm {
    client: Arc<Client>,
    editing: Option<Loan>,
    admin: bool,
    people: Load<Vec<UserOption>>,
    borrower_select: Option<Choice>,
    borrower_pick: Option<i64>,
    lines: Entity<LinesEditor>,
    loan_date: Entity<InputState>,
    expected: Entity<InputState>,
    purpose: Entity<InputState>,
    notes: Entity<InputState>,
    errors: FieldErrors,
    form_error: Option<SharedString>,
    busy: bool,
    request_id: String,
    on_done: Done,
    _subscriptions: Vec<Subscription>,
}

impl LoanForm {
    pub fn new(client: Arc<Client>, editing: Option<Loan>, admin: bool, on_done: Done, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let own_id = state(cx).user_id;
        let e = editing.as_ref();
        let text = |window: &mut Window, cx: &mut Context<Self>, value: String| cx.new(|cx| InputState::new(window, cx).default_value(value));
        let loan_date = text(window, cx, e.map_or_else(today, |l| l.loan_date.clone()));
        let expected = text(window, cx, e.map_or_else(|| days_from_today(3), |l| l.expected_return_date.clone()));
        let purpose = text(window, cx, e.map(|l| l.purpose.clone()).unwrap_or_default());
        let notes = text(window, cx, e.map(|l| l.notes.clone()).unwrap_or_default());
        let initial = e.map(|l| l.lines.iter().map(|x| (x.item_id, x.quantity)).collect()).unwrap_or_default();
        let lines = cx.new(|cx| LinesEditor::new(client.clone(), LineMode::Out, initial, window, cx));
        let mut form = LoanForm {
            borrower_pick: Some(e.map_or(own_id, |l| l.borrower_id)),
            client,
            editing,
            admin,
            people: if admin { Load::Loading } else { Load::Ready(Vec::new()) },
            borrower_select: None,
            lines,
            loan_date,
            expected,
            purpose,
            notes,
            errors: FieldErrors::new(),
            form_error: None,
            busy: false,
            request_id: forms::new_request_id(),
            on_done,
            _subscriptions: Vec::new(),
        };
        // Enter in a field sends the form, like the web forms.
        for input in [form.loan_date.clone(), form.expected.clone(), form.purpose.clone(), form.notes.clone()] {
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
                    let selected = this.borrower_pick.and_then(|id| list.iter().position(|u| u.id == id));
                    let select = cx.new(|cx| SelectState::new(SearchableVec::new(labels), selected.map(|i| IndexPath::default().row(i)), window, cx));
                    this._subscriptions.push(cx.subscribe_in(&select, window, |this, _, ev: &SelectEvent<SearchableVec<String>>, _, cx| {
                        let SelectEvent::Confirm(label) = ev;
                        if let Load::Ready(list) = &this.people {
                            this.borrower_pick = label.as_ref().and_then(|l| list.iter().find(|u| format!("{} ({})", u.name, u.role) == *l)).map(|u| u.id);
                        }
                        cx.notify();
                    }));
                    this.borrower_select = Some(select);
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
        let fields: Vec<LineFields> = values.iter().map(|l| l.fields()).collect();
        let text = |input: &Entity<InputState>| input.read(cx).value().to_string();
        let (loan_date, expected, purpose, notes) = (text(&self.loan_date), text(&self.expected), text(&self.purpose), text(&self.notes));
        let creating = self.editing.is_none();
        let body = match forms::loan(lang, self.borrower_pick, &fields, &loan_date, &expected, &purpose, &notes, submit, creating.then_some(self.request_id.as_str())) {
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
        let (client, id) = (self.client.clone(), self.editing.as_ref().map(|l| l.id));
        cx.spawn_in(window, async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.save_loan(id, &body) }).await;
            this.update_in(cx, |this, window, cx| {
                this.busy = false;
                match result {
                    Ok(loan) => {
                        let s = t(cx);
                        toast(window, cx, ToastKind::Success, if submit { s.loans_submitted } else { s.loans_draft_saved });
                        this.request_id = forms::new_request_id();
                        (this.on_done.clone())(Some(loan.id), window, cx);
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

impl Render for LoanForm {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let s = t(cx);
        let lang = state(cx).lang;
        let editing = self.editing.is_some();
        let title = if editing { s.loans_edit_title } else if self.admin { s.loans_new_title } else { s.loans_new_request_title };
        let head = div()
            .flex()
            .flex_col()
            .gap(px(theme::SPACE_1))
            .child(div().text_size(px(theme::TEXT_TITLE)).font_weight(FontWeight::SEMIBOLD).child(title))
            .child(div().text_size(px(theme::TEXT_BODY)).text_color(color(cx, Token::MutedForeground)).child(s.loans_form_desc));
        let error = |key: &str| self.errors.get(key).cloned();
        let body: AnyElement = match &self.people {
            Load::Loading => StatePanel::loading(cx).into_any_element(),
            Load::Failed(e) => {
                let message = error_message(lang, e);
                let this = cx.entity();
                StatePanel::error(cx, message, move |w, cx| this.update(cx, |f, cx| f.load_people(w, cx))).into_any_element()
            }
            Load::Ready(_) => {
                let borrower: Option<AnyElement> = self.borrower_select.as_ref().filter(|_| self.admin).map(|sel| FormField::new(s.fields_borrower.to_string(), Select::new(sel)).required().hint(s.loans_borrower_hint).error(error("borrowerId")).into_any_element());
                div()
                    .flex()
                    .flex_col()
                    .gap(px(theme::SPACE_4))
                    .children(borrower)
                    .child(section(cx, s.loans_section_items))
                    .child(self.lines.clone())
                    .child(section(cx, s.loans_section_when))
                    .child(
                        div()
                            .flex()
                            .gap(px(theme::SPACE_4))
                            .child(div().flex_1().child(FormField::new(s.fields_loan_date.to_string(), Input::new(&self.loan_date)).required().error(error("loanDate"))))
                            .child(div().flex_1().child(FormField::new(s.fields_expected_return.to_string(), Input::new(&self.expected)).required().error(error("expectedReturnDate")))),
                    )
                    .child(section(cx, s.loans_section_why))
                    .child(FormField::new(s.fields_purpose.to_string(), Input::new(&self.purpose)).required().error(error("purpose")))
                    .child(FormField::new(s.common_notes.to_string(), Input::new(&self.notes)))
                    .children(self.form_error.clone().filter(|_| self.errors.is_empty()).map(|e| banner(cx, e)))
                    .child(
                        div()
                            .flex()
                            .flex_wrap()
                            .gap(px(theme::SPACE_2))
                            .child(Button::new("loan-submit").primary().label(if self.busy { s.common_saving } else { s.loans_submit }).disabled(self.busy).on_click(cx.listener(|this, _, window, cx| this.save(true, window, cx))))
                            .child(Button::new("loan-draft").outline().label(s.loans_save_draft).disabled(self.busy).on_click(cx.listener(|this, _, window, cx| this.save(false, window, cx))))
                            .child(Button::new("loan-cancel").outline().label(s.common_cancel).disabled(self.busy).on_click({
                                let done = self.on_done.clone();
                                let id = self.editing.as_ref().map(|l| l.id);
                                move |_, w, cx| done(id, w, cx)
                            })),
                    )
                    .into_any_element()
            }
        };
        div().flex().flex_col().gap(px(theme::SPACE_4)).child(head).child(body)
    }
}

// ------------------------------------------------------------------ return

pub struct ReturnForm {
    client: Arc<Client>,
    loan: Loan,
    date: Entity<InputState>,
    notes: Entity<InputState>,
    errors: FieldErrors,
    form_error: Option<SharedString>,
    busy: bool,
    on_done: Done,
    _subscriptions: Vec<Subscription>,
}

impl ReturnForm {
    pub fn new(client: Arc<Client>, loan: Loan, on_done: Done, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let date = cx.new(|cx| InputState::new(window, cx).default_value(today()));
        let notes = cx.new(|cx| InputState::new(window, cx));
        let mut form = ReturnForm { client, loan, date, notes, errors: FieldErrors::new(), form_error: None, busy: false, on_done, _subscriptions: Vec::new() };
        // Enter in a field sends the form, like the web forms.
        for input in [form.date.clone(), form.notes.clone()] {
            let sub = cx.subscribe_in(&input, window, |this, _, ev: &InputEvent, window, cx| {
                if let InputEvent::PressEnter { .. } = ev {
                    this.save(window, cx);
                }
            });
            form._subscriptions.push(sub);
        }
        form
    }

    fn save(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.busy {
            return;
        }
        let lang = state(cx).lang;
        let body = match forms::loan_return(lang, &self.date.read(cx).value(), &self.notes.read(cx).value()) {
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
        let (client, id) = (self.client.clone(), self.loan.id);
        cx.spawn_in(window, async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.return_loan(id, &body) }).await;
            this.update_in(cx, |this, window, cx| {
                this.busy = false;
                match result {
                    Ok(_) => {
                        let text = t(cx).loans_returned;
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

impl Render for ReturnForm {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let s = t(cx);
        let lang = state(cx).lang;
        let error = |key: &str| self.errors.get(key).cloned();
        let receiver = state(cx).user_name.clone();
        let id = self.loan.id;
        div()
            .flex()
            .flex_col()
            .gap(px(theme::SPACE_4))
            .max_w(px(theme::FORM_MAX_WIDTH))
            .child(div().text_size(px(theme::TEXT_TITLE)).font_weight(FontWeight::SEMIBOLD).child(i18n::loan_return_title(lang, &self.loan.number)))
            .child(div().text_size(px(theme::TEXT_BODY)).text_color(color(cx, Token::MutedForeground)).child(s.loans_return_body))
            .child(
                div()
                    .flex()
                    .gap(px(theme::SPACE_4))
                    .child(div().flex_1().child(FormField::new(s.fields_return_date.to_string(), Input::new(&self.date)).required().error(error("returnDate"))))
                    .child(
                        div().flex_1().child(FormField::new(
                            s.loans_received_by.to_string(),
                            div().h(px(theme::CONTROL_HEIGHT)).flex().items_center().px(px(theme::SPACE_3)).rounded(px(theme::RADIUS)).bg(color(cx, Token::Muted)).text_size(px(theme::TEXT_BODY)).child(receiver),
                        )),
                    ),
            )
            .child(FormField::new(s.fields_return_note.to_string(), Input::new(&self.notes)))
            .children(self.form_error.clone().filter(|_| self.errors.is_empty()).map(|e| banner(cx, e)))
            .child(
                div()
                    .flex()
                    .gap(px(theme::SPACE_2))
                    .child(Button::new("return-save").primary().label(if self.busy { s.common_saving } else { s.loans_return_confirm }).disabled(self.busy).on_click(cx.listener(|this, _, window, cx| this.save(window, cx))))
                    .child(Button::new("return-cancel").outline().label(s.common_cancel).disabled(self.busy).on_click({
                        let done = self.on_done.clone();
                        move |_, w, cx| done(Some(id), w, cx)
                    })),
            )
    }
}
