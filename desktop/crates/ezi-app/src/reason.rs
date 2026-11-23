//! Asks for a reason before something that cannot be undone (void a transaction, reject a request, cancel). The reason is
//! required, like the web `ReasonDialog`; the server's answer, good or bad, comes back here. Shown in place of the screen
//! that opened it, so there is no dialog to lose.

use std::sync::Arc;

use ezi_core::api::ApiError;
use ezi_core::forms;
use ezi_core::i18n::error_message;
use ezi_core::theme::{self, Token};
use gpui_kit::component::button::*;
use gpui_kit::component::input::{Input, InputEvent, InputState};
use gpui_kit::component::Disableable;
use gpui_kit::prelude::*;
use gpui_kit::*;

use crate::state::{color, state, t};
use crate::widgets::{Callback, FormField};

pub type Run = Arc<dyn Fn(String) -> Result<(), ApiError> + Send + Sync>;

pub struct ReasonPrompt {
    title: SharedString,
    body: SharedString,
    confirm: SharedString,
    danger: bool,
    input: Entity<InputState>,
    error: Option<SharedString>,
    form_error: Option<SharedString>,
    busy: bool,
    run: Run,
    on_done: Callback,
    on_cancel: Callback,
    _subscription: Subscription,
}

impl ReasonPrompt {
    /// `run` sends the reason to the server on a background thread; `on_done` is called when it succeeded.
    #[allow(clippy::too_many_arguments)]
    pub fn new(title: String, body: &str, confirm: &str, danger: bool, run: Run, on_done: Callback, on_cancel: Callback, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let input = cx.new(|cx| InputState::new(window, cx));
        let subscription = cx.subscribe_in(&input, window, |this, _, ev: &InputEvent, window, cx| {
            if let InputEvent::PressEnter { .. } = ev {
                this.submit(window, cx);
            }
        });
        ReasonPrompt { title: title.into(), body: body.to_string().into(), confirm: confirm.to_string().into(), danger, input, error: None, form_error: None, busy: false, run, on_done, on_cancel, _subscription: subscription }
    }

    fn submit(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.busy {
            return;
        }
        let lang = state(cx).lang;
        let reason = match forms::reason(lang, &self.input.read(cx).value()) {
            Ok(r) => r,
            Err(e) => {
                self.error = e.get("reason").cloned().map(Into::into);
                cx.notify();
                return;
            }
        };
        self.busy = true;
        self.error = None;
        self.form_error = None;
        cx.notify();
        let run = self.run.clone();
        cx.spawn_in(window, async move |this, cx| {
            let result = cx.background_executor().spawn(async move { run(reason) }).await;
            this.update_in(cx, |this, window, cx| {
                this.busy = false;
                match result {
                    Ok(()) => (this.on_done.clone())(window, cx),
                    Err(e) => this.form_error = Some(error_message(state(cx).lang, &e).into()),
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
    }
}

impl Render for ReasonPrompt {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let s = t(cx);
        let cancel = self.on_cancel.clone();
        let confirm = Button::new("reason-confirm").label(if self.busy { s.common_saving } else { self.confirm.as_ref() }).disabled(self.busy).on_click(cx.listener(|this, _, window, cx| this.submit(window, cx)));
        div()
            .flex()
            .flex_col()
            .gap(px(theme::SPACE_4))
            .max_w(px(theme::FORM_MAX_WIDTH))
            .child(div().text_size(px(theme::TEXT_TITLE)).font_weight(FontWeight::SEMIBOLD).child(self.title.clone()))
            .child(div().text_size(px(theme::TEXT_BODY)).text_color(color(cx, Token::MutedForeground)).child(self.body.clone()))
            .child(FormField::new(s.fields_reason.to_string(), Input::new(&self.input)).required().error(self.error.clone()))
            .children(self.form_error.clone().map(|e| {
                div().px(px(theme::SPACE_3)).py(px(theme::SPACE_2)).rounded(px(theme::RADIUS)).bg(color(cx, Token::DangerSoft)).text_size(px(theme::TEXT_TABLE)).text_color(color(cx, Token::Foreground)).child(e)
            }))
            .child(
                div()
                    .flex()
                    .gap(px(theme::SPACE_2))
                    .child(if self.danger { confirm.danger() } else { confirm.primary() })
                    .child(Button::new("reason-cancel").outline().label(s.common_cancel).disabled(self.busy).on_click(move |_, w, cx| cancel(w, cx))),
            )
    }
}
