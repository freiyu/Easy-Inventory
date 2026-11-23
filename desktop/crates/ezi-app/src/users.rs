//! User management (Admin only): the list with search and role and status filters; add and edit a user; deactivate, activate;
//! reset a password. A new user and a reset both give a temporary password that the server makes: it is shown once, to be
//! handed over in person, and is never kept here. Same rules and messages as the web page; the server decides who may be
//! deactivated (the last Admin, yourself).
//! shortcut: a row opens the edit form, which also holds Deactivate/Activate and Reset password (the web has a row menu).

use std::rc::Rc;
use std::sync::Arc;

use ezi_core::api::{Client, ListMeta};
use ezi_core::forms::{self, Errors};
use ezi_core::format::format_date_time;
use ezi_core::i18n::{self, error_message};
use ezi_core::models::User;
use ezi_core::theme::{self, Token};
use gpui_kit::component::button::*;
use gpui_kit::component::input::{Input, InputEvent, InputState};
use gpui_kit::component::select::{SearchableVec, Select, SelectEvent, SelectState};
use gpui_kit::component::{Disableable, IndexPath};
use gpui_kit::prelude::*;
use gpui_kit::*;

use crate::load::Load;
use crate::state::{color, state, t};
use crate::widgets::{confirm, toast, Badge, Cell, Column, DataTable, FormField, Paging, StatePanel, ToastKind, Tone};

/// Rows per page: the dense layout of the redesign (PRD_REDESIGN.md 10.2).
const PAGE_SIZE: u32 = 8;
const ROLES: [&str; 2] = ["Staff", "Admin"];

type Choice = Entity<SelectState<SearchableVec<String>>>;
/// What a form hands back: a temporary password to show (name, password), or nothing.
type Done = Rc<dyn Fn(Option<(String, String)>, &mut Window, &mut App)>;

// ------------------------------------------------------------------ the form

struct UserForm {
    client: Arc<Client>,
    editing: Option<User>,
    name: Entity<InputState>,
    email: Entity<InputState>,
    role_select: Choice,
    role: &'static str,
    errors: Errors,
    form_error: Option<SharedString>,
    busy: bool,
    on_done: Done,
    _subscriptions: Vec<Subscription>,
}

impl UserForm {
    fn new(client: Arc<Client>, editing: Option<User>, on_done: Done, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let text = |window: &mut Window, cx: &mut Context<Self>, value: &str| cx.new(|cx| InputState::new(window, cx).default_value(value.to_string()));
        let name = text(window, cx, editing.as_ref().map_or("", |u| u.name.as_str()));
        let email = text(window, cx, editing.as_ref().map_or("", |u| u.email.as_str()));
        let role = if editing.as_ref().is_some_and(|u| u.role == "Admin") { "Admin" } else { "Staff" };
        let role_select = cx.new(|cx| SelectState::new(SearchableVec::new(ROLES.map(String::from).to_vec()), Some(IndexPath::default().row(ROLES.iter().position(|r| *r == role).unwrap_or(0))), window, cx));
        let mut subs = vec![cx.subscribe_in(&role_select, window, |this, _, ev: &SelectEvent<SearchableVec<String>>, _, _| {
            let SelectEvent::Confirm(label) = ev;
            this.role = ROLES.into_iter().find(|r| Some(*r) == label.as_deref()).unwrap_or("Staff");
        })];
        for input in [&name, &email] {
            subs.push(cx.subscribe_in(input, window, |this, _, ev: &InputEvent, window, cx| {
                if let InputEvent::PressEnter { .. } = ev {
                    this.save(window, cx);
                }
            }));
        }
        UserForm { client, editing, name, email, role_select, role, errors: Errors::new(), form_error: None, busy: false, on_done, _subscriptions: subs }
    }

    fn save(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.busy {
            return;
        }
        let lang = state(cx).lang;
        let body = match forms::user(lang, &self.name.read(cx).value(), &self.email.read(cx).value(), self.role) {
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
        let (client, id, name) = (self.client.clone(), self.editing.as_ref().map(|u| u.id), body.name.clone());
        cx.spawn_in(window, async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.save_user(id, &body) }).await;
            this.update_in(cx, |this, window, cx| {
                this.busy = false;
                match result {
                    Ok(temp) => {
                        let text = t(cx).users_saved;
                        toast(window, cx, ToastKind::Success, text);
                        (this.on_done.clone())(temp.map(|p| (name, p)), window, cx);
                    }
                    Err(e) => {
                        let key = |k: &str| ["name", "email"].into_iter().find(|f| *f == k);
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

    fn confirm_status(&mut self, active: bool, window: &mut Window, cx: &mut Context<Self>) {
        let Some(user) = self.editing.clone() else { return };
        let (s, lang) = (t(cx), state(cx).lang);
        let this = cx.entity();
        let (title, body, label) = if active { (i18n::user_activate_title(lang, &user.name), s.users_activate_body, s.users_activate) } else { (i18n::user_deactivate_title(lang, &user.name), s.users_deactivate_body, s.users_deactivate) };
        confirm(window, cx, title, body, label, !active, move |window, cx| {
            this.update(cx, |form, cx| form.run(false, active, window, cx));
        });
    }

    fn confirm_reset(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let Some(user) = self.editing.clone() else { return };
        let (s, lang) = (t(cx), state(cx).lang);
        let this = cx.entity();
        confirm(window, cx, i18n::user_reset_title(lang, &user.name), s.users_reset_body, s.users_reset_password, false, move |window, cx| {
            this.update(cx, |form, cx| form.run(true, false, window, cx));
        });
    }

    /// Resets the password (`reset`) or sets the user active or inactive. A refusal is shown as the server words it.
    fn run(&mut self, reset: bool, active: bool, window: &mut Window, cx: &mut Context<Self>) {
        let Some((id, name)) = self.editing.as_ref().map(|u| (u.id, u.name.clone())) else { return };
        let client = self.client.clone();
        cx.spawn_in(window, async move |this, cx| {
            let result = cx
                .background_executor()
                .spawn(async move {
                    if reset { client.reset_password(id).map(Some) } else { client.set_user_active(id, active).map(|_| None) }
                })
                .await;
            this.update_in(cx, |this, window, cx| match result {
                Ok(temp) => {
                    if temp.is_none() {
                        let s = t(cx);
                        toast(window, cx, ToastKind::Success, if active { s.users_activated } else { s.users_deactivated });
                    }
                    (this.on_done.clone())(temp.map(|p| (name, p)), window, cx);
                }
                Err(e) => {
                    let message = error_message(state(cx).lang, &e);
                    toast(window, cx, ToastKind::Error, message)
                }
            })
            .ok();
        })
        .detach();
    }
}

impl Render for UserForm {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let s = t(cx);
        let editing = self.editing.is_some();
        let active = self.editing.as_ref().is_some_and(|u| u.status == "Active");
        let error = |key: &'static str| self.errors.get(key).cloned();
        div()
            .flex()
            .flex_col()
            .gap(px(theme::SPACE_4))
            .max_w(px(theme::FORM_MAX_WIDTH))
            .child(div().text_size(px(theme::TEXT_TITLE)).font_weight(FontWeight::SEMIBOLD).child(if editing { s.users_edit_title } else { s.users_add_title }))
            .children((!editing).then(|| div().text_size(px(theme::TEXT_BODY)).text_color(color(cx, Token::MutedForeground)).child(s.users_add_desc)))
            .child(FormField::new(s.fields_full_name.to_string(), Input::new(&self.name)).required().error(error("name")))
            .child(FormField::new(s.fields_email.to_string(), Input::new(&self.email)).required().error(error("email")))
            .child(FormField::new(s.fields_role.to_string(), Select::new(&self.role_select)).required().hint(s.users_role_hint))
            .children(self.form_error.clone().filter(|_| self.errors.is_empty()).map(|e| {
                div().px(px(theme::SPACE_3)).py(px(theme::SPACE_2)).rounded(px(theme::RADIUS)).bg(color(cx, Token::DangerSoft)).text_size(px(theme::TEXT_TABLE)).text_color(color(cx, Token::Foreground)).child(e)
            }))
            .child(
                div()
                    .flex()
                    .flex_wrap()
                    .gap(px(theme::SPACE_2))
                    .child(Button::new("user-save").primary().label(if self.busy { s.common_saving } else { s.users_save }).disabled(self.busy).on_click(cx.listener(|this, _, window, cx| this.save(window, cx))))
                    .child(Button::new("user-cancel").outline().label(s.common_cancel).disabled(self.busy).on_click({
                        let done = self.on_done.clone();
                        move |_, w, cx| done(None, w, cx)
                    }))
                    .when(editing && active, |d| d.child(Button::new("user-reset").outline().label(s.users_reset_password).on_click(cx.listener(|this, _, window, cx| this.confirm_reset(window, cx)))))
                    .when(editing, |d| {
                        d.child(Button::new("user-status").outline().label(if active { s.users_deactivate } else { s.users_activate }).on_click(cx.listener(move |this, _, window, cx| this.confirm_status(!active, window, cx))))
                    }),
            )
    }
}

// ------------------------------------------------------------------ the list

enum View {
    List,
    Form(Entity<UserForm>),
    /// The temporary password of a new user or a reset: (user name, password), shown once.
    Temp(String, String),
}

pub struct UsersPage {
    client: Arc<Client>,
    view: View,
    search: Entity<InputState>,
    role_select: Choice,
    status_select: Choice,
    role: Option<&'static str>,
    status: Option<&'static str>,
    page: u32,
    list: Load<(Vec<User>, ListMeta)>,
    generation: u32,
    _subscriptions: Vec<Subscription>,
}

impl UsersPage {
    pub fn new(client: Arc<Client>, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let s = t(cx);
        let search = cx.new(|cx| InputState::new(window, cx).placeholder(s.users_search_placeholder.to_string()));
        let mk = |labels: Vec<String>, window: &mut Window, cx: &mut Context<Self>| cx.new(|cx| SelectState::new(SearchableVec::new(labels), Some(IndexPath::default()), window, cx));
        let role_select = mk(vec![s.users_all_roles.to_string(), "Admin".into(), "Staff".into()], window, cx);
        // The same three status labels as the web filter: all, active, inactive (the words of the Active and Inactive tags).
        let status_select = mk(vec![s.stock_all_statuses.to_string(), s.ui_active_tag.to_string(), s.items_inactive_tag.to_string()], window, cx);
        let mut subs = Vec::new();
        subs.push(cx.subscribe_in(&search, window, |this, _, ev: &InputEvent, _, cx| {
            if let InputEvent::Change = ev {
                this.page = 1;
                this.fetch(cx);
            }
        }));
        subs.push(cx.subscribe_in(&role_select, window, |this, _, ev: &SelectEvent<SearchableVec<String>>, _, cx| {
            let SelectEvent::Confirm(label) = ev;
            this.role = ["Admin", "Staff"].into_iter().find(|r| Some(*r) == label.as_deref());
            this.page = 1;
            this.fetch(cx);
        }));
        subs.push(cx.subscribe_in(&status_select, window, |this, _, ev: &SelectEvent<SearchableVec<String>>, _, cx| {
            let SelectEvent::Confirm(label) = ev;
            let s = t(cx);
            this.status = match label.as_deref() {
                Some(l) if l == s.ui_active_tag => Some("Active"),
                Some(l) if l == s.items_inactive_tag => Some("Inactive"),
                _ => None,
            };
            this.page = 1;
            this.fetch(cx);
        }));
        let mut page = UsersPage { client, view: View::List, search, role_select, status_select, role: None, status: None, page: 1, list: Load::Loading, generation: 0, _subscriptions: subs };
        page.fetch(cx);
        page
    }

    /// Back to the list with fresh rows (the shell calls this when the page is opened).
    pub fn show_list(&mut self, cx: &mut Context<Self>) {
        self.view = View::List;
        self.fetch(cx);
    }

    fn dirty(&self, cx: &App) -> bool {
        !self.search.read(cx).value().trim().is_empty() || self.role.is_some() || self.status.is_some()
    }

    fn fetch(&mut self, cx: &mut Context<Self>) {
        self.generation += 1;
        let (generation, client, page, role, status) = (self.generation, self.client.clone(), self.page, self.role, self.status);
        let search = self.search.read(cx).value().trim().to_string();
        if !matches!(self.list, Load::Ready(_)) {
            self.list = Load::Loading;
        }
        cx.notify();
        cx.spawn(async move |this, cx| {
            let result = cx
                .background_executor()
                .spawn(async move {
                    let (page, size) = (page.to_string(), PAGE_SIZE.to_string());
                    let mut q = vec![("page", page.as_str()), ("pageSize", size.as_str()), ("sort", "name:asc")];
                    if !search.is_empty() {
                        q.push(("search", search.as_str()));
                    }
                    if let Some(r) = role {
                        q.push(("role", r));
                    }
                    if let Some(s) = status {
                        q.push(("status", s));
                    }
                    client.users(&q).map(|s| {
                        let meta = s.meta.unwrap_or(ListMeta { page: 1, page_size: PAGE_SIZE, total: s.data.len() as u32 });
                        (s.data, meta)
                    })
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

    fn clear_filters(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        (self.role, self.status, self.page) = (None, None, 1);
        self.search.update(cx, |s, cx| s.set_value("", window, cx));
        for select in [&self.role_select, &self.status_select] {
            select.update(cx, |s, cx| s.set_selected_index(Some(IndexPath::default()), window, cx));
        }
        self.fetch(cx);
    }

    fn open_form(&mut self, user: Option<User>, window: &mut Window, cx: &mut Context<Self>) {
        let client = self.client.clone();
        let this = cx.entity().downgrade();
        let done: Done = Rc::new(move |temp, _window, cx| {
            this.update(cx, |page, cx| {
                match temp {
                    Some((name, password)) => page.view = View::Temp(name, password),
                    None => page.view = View::List,
                }
                page.fetch(cx);
                cx.notify();
            })
            .ok();
        });
        self.view = View::Form(cx.new(|cx| UserForm::new(client, user, done, window, cx)));
        cx.notify();
    }
}

impl Render for UsersPage {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let s = t(cx);
        let lang = state(cx).lang;
        let this = cx.entity();
        match &self.view {
            View::Form(form) => return form.clone().into_any_element(),
            View::Temp(name, password) => {
                return div()
                    .flex()
                    .flex_col()
                    .gap(px(theme::SPACE_4))
                    .max_w(px(theme::FORM_MAX_WIDTH))
                    .child(div().text_size(px(theme::TEXT_TITLE)).font_weight(FontWeight::SEMIBOLD).child(s.users_temp_title))
                    .child(div().text_size(px(theme::TEXT_BODY)).text_color(color(cx, Token::MutedForeground)).child(i18n::user_temp_body(lang, name)))
                    .child(div().px(px(theme::SPACE_4)).py(px(theme::SPACE_3)).rounded(px(theme::RADIUS)).bg(color(cx, Token::Muted)).text_size(px(theme::TEXT_SECTION)).font_weight(FontWeight::SEMIBOLD).child(password.clone()))
                    .child(div().flex().child(Button::new("temp-close").primary().label(s.users_temp_close).on_click(cx.listener(|this, _, _, cx| this.show_list(cx)))))
                    .into_any_element();
            }
            View::List => {}
        }

        let body: AnyElement = match &self.list {
            Load::Loading => StatePanel::loading(cx).into_any_element(),
            Load::Failed(e) => {
                let message = error_message(lang, e);
                let this = this.clone();
                StatePanel::error(cx, message, move |_, cx| this.update(cx, |p, cx| p.fetch(cx))).into_any_element()
            }
            Load::Ready((users, meta)) => {
                let me = state(cx).user_id;
                let columns = vec![Column::new(s.users_col_name).width(170.), Column::new(s.users_col_email), Column::new(s.users_col_role).width(80.), Column::new(s.users_col_status).width(280.), Column::new(s.users_col_last_login).width(150.)];
                let rows: Vec<Vec<Cell>> = users
                    .iter()
                    .map(|u| {
                        let name = if u.id == me { format!("{} ({})", u.name, s.common_you) } else { u.name.clone() };
                        let status = Cell::Element(
                            div()
                                .flex()
                                .gap(px(theme::SPACE_1))
                                .child(if u.status == "Active" { Badge::new(Tone::Success, s.ui_active_tag) } else { Badge::new(Tone::Neutral, s.items_inactive_tag) })
                                .children(u.must_change_password.then(|| Badge::new(Tone::Warning, s.users_must_change)))
                                .into_any_element(),
                        );
                        vec![name.into(), u.email.clone().into(), u.role.clone().into(), status, u.last_login_at.as_deref().map_or_else(|| s.users_never.to_string(), format_date_time).into()]
                    })
                    .collect();
                let list = users.clone();
                let empty: AnyElement = {
                    let this = this.clone();
                    StatePanel::action(s.users_empty_title, "", s.common_clear, move |w, cx| this.update(cx, |p, cx| p.clear_filters(w, cx))).into_any_element()
                };
                let (this_page, this_row) = (this.clone(), this.clone());
                DataTable::new("users", columns)
                    .rows(rows)
                    .empty(empty)
                    .paging(Paging { page: meta.page, page_size: meta.page_size, total: meta.total }, move |p, _, cx| {
                        this_page.update(cx, |page, cx| {
                            page.page = p;
                            page.fetch(cx);
                        })
                    })
                    .on_row_click(move |i, window, cx| {
                        if let Some(user) = list.get(i).cloned() {
                            this_row.update(cx, |page, cx| page.open_form(Some(user), window, cx));
                        }
                    })
                    .into_any_element()
            }
        };

        div()
            .flex()
            .flex_col()
            .gap(px(theme::SPACE_4))
            .child(
                div()
                    .flex()
                    .items_start()
                    .justify_between()
                    .gap(px(theme::SPACE_4))
                    .child(
                        div()
                            .flex()
                            .flex_col()
                            .gap(px(theme::SPACE_1))
                            .max_w(px(theme::TEXT_MAX_WIDTH))
                            .child(div().text_size(px(theme::TEXT_TITLE)).font_weight(FontWeight::SEMIBOLD).child(s.users_title))
                            .child(div().text_size(px(theme::TEXT_BODY)).text_color(color(cx, Token::MutedForeground)).child(s.users_description)),
                    )
                    .child(Button::new("user-add").primary().label(s.users_add).on_click(cx.listener(|this, _, w, cx| this.open_form(None, w, cx)))),
            )
            .child(
                div()
                    .flex()
                    .flex_wrap()
                    .items_center()
                    .gap(px(theme::SPACE_2))
                    .child(div().w(px(theme::FILTER_SEARCH_WIDTH)).child(Input::new(&self.search)))
                    .child(div().w(px(theme::FILTER_SELECT_WIDTH)).child(Select::new(&self.role_select)))
                    .child(div().w(px(theme::FILTER_STATUS_WIDTH)).child(Select::new(&self.status_select)))
                    .when(self.dirty(cx), |d| d.child(Button::new("user-clear").outline().label(s.common_clear).on_click(cx.listener(|this, _, w, cx| this.clear_filters(w, cx))))),
            )
            .child(body)
            .into_any_element()
    }
}
