//! My profile (everyone): the account details, and the change of one's own password. The current password is required here;
//! a password is read from its masked input at the moment it is sent and is never kept or logged.

use std::sync::Arc;

use ezi_core::api::{Client, Password, SessionUser};
use ezi_core::forms::{self, Errors};
use ezi_core::format::format_date_time;
use ezi_core::i18n::error_message;
use ezi_core::theme::{self, Token};
use gpui_kit::component::button::*;
use gpui_kit::component::input::{Input, InputEvent, InputState};
use gpui_kit::component::Disableable;
use gpui_kit::prelude::*;
use gpui_kit::*;

use crate::load::Load;
use crate::state::{color, state, t};
use crate::widgets::{toast, Badge, FormField, StatePanel, ToastKind, Tone};

pub struct ProfilePage {
    client: Arc<Client>,
    me: Load<SessionUser>,
    current: Entity<InputState>,
    password: Entity<InputState>,
    confirm: Entity<InputState>,
    errors: Errors,
    form_error: Option<SharedString>,
    busy: bool,
    _subscriptions: Vec<Subscription>,
}

impl ProfilePage {
    pub fn new(client: Arc<Client>, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let masked = |window: &mut Window, cx: &mut Context<Self>| cx.new(|cx| InputState::new(window, cx).masked(true));
        let (current, password, confirm) = (masked(window, cx), masked(window, cx), masked(window, cx));
        let subs = [&current, &password, &confirm].map(|input| {
            cx.subscribe_in(input, window, |this, _, ev: &InputEvent, window, cx| {
                if let InputEvent::PressEnter { .. } = ev {
                    this.save(window, cx);
                }
            })
        });
        let mut page = ProfilePage { client, me: Load::Loading, current, password, confirm, errors: Errors::new(), form_error: None, busy: false, _subscriptions: subs.into() };
        page.refresh(cx);
        page
    }

    /// Reads the account again (the shell calls this when the page is opened).
    pub fn refresh(&mut self, cx: &mut Context<Self>) {
        if !matches!(self.me, Load::Ready(_)) {
            self.me = Load::Loading;
        }
        cx.notify();
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.me() }).await;
            this.update(cx, |this, cx| {
                this.me = Load::from_result(result);
                cx.notify();
            })
            .ok();
        })
        .detach();
    }

    fn save(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.busy {
            return;
        }
        let lang = state(cx).lang;
        let (current, password, confirm) = (self.current.read(cx).value().to_string(), self.password.read(cx).value().to_string(), self.confirm.read(cx).value().to_string());
        let errors = forms::profile_password(lang, &current, &password, &confirm);
        if !errors.is_empty() {
            self.errors = errors;
            self.form_error = None;
            cx.notify();
            return;
        }
        self.busy = true;
        self.errors.clear();
        self.form_error = None;
        cx.notify();
        let client = self.client.clone();
        cx.spawn_in(window, async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.change_password(Some(&Password::new(current)), &Password::new(password)) }).await;
            this.update_in(cx, |this, window, cx| {
                this.busy = false;
                match result {
                    Ok(_) => {
                        let text = t(cx).auth_change_done;
                        toast(window, cx, ToastKind::Success, text);
                        for input in [&this.current, &this.password, &this.confirm] {
                            input.update(cx, |i, cx| i.set_value("", window, cx));
                        }
                    }
                    Err(e) => {
                        let key = |k: &str| ["current", "password", "confirm"].into_iter().find(|f| *f == k);
                        this.errors = e.fields().into_iter().filter_map(|(k, v)| Some((key(&k)?, v))).collect();
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

impl Render for ProfilePage {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let s = t(cx);
        let lang = state(cx).lang;
        let error = |key: &'static str| self.errors.get(key).cloned();
        let heading = |text: &str| div().text_size(px(theme::TEXT_SECTION)).font_weight(FontWeight::SEMIBOLD).child(text.to_string());
        let card = |cx: &App| div().flex().flex_col().flex_1().gap(px(theme::SPACE_3)).p(px(theme::SPACE_4)).rounded(px(theme::RADIUS_CARD)).border_1().border_color(color(cx, Token::Border)).bg(color(cx, Token::Card));
        let labelled = |label: &str, value: AnyElement, cx: &App| {
            div()
                .flex()
                .flex_col()
                .gap(px(theme::SPACE_HALF))
                .child(div().text_size(px(theme::TEXT_TABLE)).text_color(color(cx, Token::MutedForeground)).child(label.to_string()))
                .child(div().text_size(px(theme::TEXT_BODY)).font_weight(FontWeight::SEMIBOLD).child(value))
        };

        let account: AnyElement = match &self.me {
            Load::Loading => StatePanel::loading(cx).into_any_element(),
            Load::Failed(e) => {
                let message = error_message(lang, e);
                let this = cx.entity();
                StatePanel::error(cx, message, move |_, cx| this.update(cx, |p, cx| p.refresh(cx))).into_any_element()
            }
            Load::Ready(u) => card(cx)
                .child(heading(s.profile_account))
                .child(labelled(s.fields_full_name, u.name.clone().into_any_element(), cx))
                .child(labelled(s.fields_email, u.email.clone().into_any_element(), cx))
                .child(labelled(s.fields_role, div().flex().child(Badge::new(Tone::Neutral, format!("{:?}", u.role))).into_any_element(), cx))
                .child(labelled(s.profile_last_login, u.last_login_at.as_deref().map_or("-".to_string(), format_date_time).into_any_element(), cx))
                .into_any_element(),
        };
        let password_card = card(cx)
            .child(heading(s.profile_password_card))
            .child(div().text_size(px(theme::TEXT_BODY)).text_color(color(cx, Token::MutedForeground)).child(s.profile_password_body))
            .child(FormField::new(s.fields_current_password.to_string(), Input::new(&self.current)).required().error(error("current")))
            .child(FormField::new(s.fields_new_password.to_string(), Input::new(&self.password)).required().hint(s.auth_password_hint).error(error("password")))
            .child(FormField::new(s.fields_confirm_password.to_string(), Input::new(&self.confirm)).required().error(error("confirm")))
            .children(self.form_error.clone().filter(|_| self.errors.is_empty()).map(|e| {
                div().px(px(theme::SPACE_3)).py(px(theme::SPACE_2)).rounded(px(theme::RADIUS)).bg(color(cx, Token::DangerSoft)).text_size(px(theme::TEXT_TABLE)).text_color(color(cx, Token::Foreground)).child(e)
            }))
            .child(div().flex().child(Button::new("password-save").primary().label(if self.busy { s.common_saving } else { s.auth_change_submit }).disabled(self.busy).on_click(cx.listener(|this, _, w, cx| this.save(w, cx)))));

        div()
            .flex()
            .flex_col()
            .gap(px(theme::SPACE_4))
            .child(
                div()
                    .flex()
                    .flex_col()
                    .gap(px(theme::SPACE_1))
                    .child(div().text_size(px(theme::TEXT_TITLE)).font_weight(FontWeight::SEMIBOLD).child(s.profile_title))
                    .child(div().text_size(px(theme::TEXT_BODY)).text_color(color(cx, Token::MutedForeground)).child(s.profile_description)),
            )
            .child(div().flex().items_start().gap(px(theme::SPACE_4)).child(div().flex_1().child(account)).child(password_card))
    }
}
