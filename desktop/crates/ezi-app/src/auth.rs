//! Sign-in, first-run setup and the forced password change, then the app shell for the signed-in user.
//! Every network call runs on a background thread (the client blocks); the screen shows a busy state meanwhile.
//! A password is read from its masked input into a `Password` at the moment it is sent, and is never logged or kept.

use std::path::PathBuf;
use std::rc::Rc;
use std::sync::Arc;

use ezi_core::api::{ApiError, Client, Lang, Password, SessionUser};
use ezi_core::forms::{self, Errors};
use ezi_core::i18n::error_message;
use ezi_core::nav::Page;
use ezi_core::settings::{self, Settings};
use ezi_core::theme::{self, Token};
use gpui_kit::component::button::*;
use gpui_kit::component::input::*;
use gpui_kit::component::*;
use gpui_kit::prelude::*;
use gpui_kit::*;

use crate::dashboard::Dashboard;
use crate::items::ItemsPage;
use crate::activity::ActivityPage;
use crate::backup::BackupPage;
use crate::expenses::ExpensesPage;
use crate::loans::LoansPage;
use crate::master::{Kind, MasterPage};
use crate::profile::ProfilePage;
use crate::purchases::PurchasesPage;
use crate::reports::ReportsPage;
use crate::stock::StockPage;
use crate::users::UsersPage;
use crate::shell::{AppShell, PageBuilder};
use crate::state::{color, state, t, AppState};
use crate::widgets::{toast, FormField, StatePanel, ToastKind};

#[derive(Clone, Copy, PartialEq, Eq)]
enum Screen {
    Login,
    Setup,
    ForcedChange,
}

/// What a background request found out, handed back to the screen.
enum Outcome {
    Failed(ApiError),
    NeedsSetup,
    Signed(SessionUser),
    SetupDone,
}

/// The screens only an Admin gets. Each task of the Admin screens adds its page here.
#[derive(Clone)]
struct AdminPages {
    categories: Entity<MasterPage>,
    suppliers: Entity<MasterPage>,
    stock: Entity<StockPage>,
    expenses: Entity<ExpensesPage>,
    reports: Entity<ReportsPage>,
    backup: Entity<BackupPage>,
    users: Entity<UsersPage>,
    activity: Entity<ActivityPage>,
}

pub struct AuthGate {
    screen: Screen,
    client: Option<Arc<Client>>,
    user: Option<SessionUser>,
    server: Entity<InputState>,
    email: Entity<InputState>,
    password: Entity<InputState>,
    name: Entity<InputState>,
    confirm: Entity<InputState>,
    errors: Errors,
    form_error: Option<SharedString>,
    notice: Option<SharedString>,
    busy: bool,
    shell: Option<AnyView>,
    settings_path: Option<PathBuf>,
    _subscriptions: Vec<Subscription>,
}

impl AuthGate {
    pub fn new(window: &mut Window, cx: &mut Context<Self>, settings_path: Option<PathBuf>) -> Self {
        let saved = settings_path.as_deref().map(settings::load).unwrap_or_default();
        let input = |window: &mut Window, cx: &mut Context<Self>, placeholder: &str, masked: bool, value: String| {
            cx.new(|cx| InputState::new(window, cx).placeholder(placeholder.to_string()).masked(masked).default_value(value))
        };
        let server = input(window, cx, "192.168.1.10:3000", false, saved.server_url.unwrap_or_default().trim_start_matches("http://").to_string());
        let email = input(window, cx, "", false, String::new());
        let password = input(window, cx, "", true, String::new());
        let name = input(window, cx, "", false, String::new());
        let confirm = input(window, cx, "", true, String::new());
        // Enter in any field sends the form.
        let mut subs = Vec::new();
        for field in [&server, &email, &password, &name, &confirm] {
            subs.push(cx.subscribe_in(field, window, |this, _, ev: &gpui_kit::component::input::InputEvent, window, cx| {
                if let gpui_kit::component::input::InputEvent::PressEnter { .. } = ev {
                    this.submit(window, cx);
                }
            }));
        }
        AuthGate {
            screen: Screen::Login,
            client: None,
            user: None,
            server,
            email,
            password,
            name,
            confirm,
            errors: Errors::new(),
            form_error: None,
            notice: None,
            busy: false,
            shell: None,
            settings_path,
            _subscriptions: subs,
        }
    }

    fn text(input: &Entity<InputState>, cx: &App) -> String {
        input.read(cx).value().to_string()
    }

    fn clear(input: &Entity<InputState>, window: &mut Window, cx: &mut Context<Self>) {
        input.update(cx, |s, cx| s.set_value("", window, cx));
    }

    fn clear_secrets(&self, window: &mut Window, cx: &mut Context<Self>) {
        Self::clear(&self.password, window, cx);
        Self::clear(&self.confirm, window, cx);
    }

    fn submit(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.busy || self.shell.is_some() {
            return;
        }
        match self.screen {
            Screen::Login => self.sign_in(window, cx),
            Screen::Setup => self.create_admin(window, cx),
            Screen::ForcedChange => self.change_password(window, cx),
        }
    }

    /// Marks the form busy and runs `work` off the UI thread, then hands its outcome to `done`.
    fn run(
        &mut self,
        window: &mut Window,
        cx: &mut Context<Self>,
        work: impl FnOnce() -> Outcome + Send + 'static,
        done: impl FnOnce(&mut Self, Outcome, &mut Window, &mut Context<Self>) + 'static,
    ) {
        self.busy = true;
        self.errors.clear();
        self.form_error = None;
        cx.notify();
        cx.spawn_in(window, async move |this, cx| {
            let outcome = cx.background_executor().spawn(async move { work() }).await;
            this.update_in(cx, |this, window, cx| {
                this.busy = false;
                done(this, outcome, window, cx);
                cx.notify();
            })
            .ok();
        })
        .detach();
    }

    fn show_failure(&mut self, error: &ApiError, cx: &App) {
        let lang = state(cx).lang;
        self.errors = error.fields().into_iter().filter_map(|(k, v)| Some((field_key(&k)?, v))).collect();
        self.form_error = Some(error_message(lang, error).into());
    }

    fn sign_in(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let lang = state(cx).lang;
        let (server, email, password) = (Self::text(&self.server, cx), Self::text(&self.email, cx), Self::text(&self.password, cx));
        let mut errors = forms::login(lang, &email, &password);
        let client = match Client::new(&server) {
            Ok(c) => Some(Arc::new(c)),
            Err(e) => {
                errors.insert("server", error_message(lang, &e));
                None
            }
        };
        let Some(client) = client.filter(|_| errors.is_empty()) else {
            self.errors = errors;
            cx.notify();
            return;
        };
        client.set_lang(lang);
        self.client = Some(client.clone());
        let email = email.trim().to_string();
        self.run(
            window,
            cx,
            move || match client.needs_setup() {
                Err(e) => Outcome::Failed(e),
                Ok(true) => Outcome::NeedsSetup,
                Ok(false) => match client.login(&email, &Password::new(password)) {
                    Ok(user) => Outcome::Signed(user),
                    Err(e) => Outcome::Failed(e),
                },
            },
            |this, outcome, window, cx| match outcome {
                Outcome::Failed(e) => this.show_failure(&e, cx),
                Outcome::NeedsSetup => {
                    this.screen = Screen::Setup;
                    this.notice = Some(t(cx).ui_setup_needed.into());
                    Self::clear(&this.password, window, cx);
                }
                Outcome::Signed(user) => this.signed_in(user, window, cx),
                Outcome::SetupDone => {}
            },
        );
    }

    fn create_admin(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let lang = state(cx).lang;
        let (name, email, password, confirm) = (Self::text(&self.name, cx), Self::text(&self.email, cx), Self::text(&self.password, cx), Self::text(&self.confirm, cx));
        let errors = forms::first_admin(lang, &name, &email, &password, &confirm);
        let Some(client) = self.client.clone().filter(|_| errors.is_empty()) else {
            self.errors = errors;
            cx.notify();
            return;
        };
        let (name, email) = (name.trim().to_string(), email.trim().to_string());
        self.run(
            window,
            cx,
            move || match client.create_first_admin(&name, &email, &Password::new(password)) {
                Ok(()) => Outcome::SetupDone,
                Err(e) => Outcome::Failed(e),
            },
            |this, outcome, window, cx| match outcome {
                Outcome::SetupDone => {
                    this.screen = Screen::Login;
                    this.notice = None;
                    this.clear_secrets(window, cx);
                    let text = t(cx).auth_setup_done;
                    toast(window, cx, ToastKind::Success, text);
                }
                Outcome::Failed(e) => this.show_failure(&e, cx),
                _ => {}
            },
        );
    }

    fn change_password(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let lang = state(cx).lang;
        let (password, confirm) = (Self::text(&self.password, cx), Self::text(&self.confirm, cx));
        let errors = forms::change_password(lang, &password, &confirm);
        let Some(client) = self.client.clone().filter(|_| errors.is_empty()) else {
            self.errors = errors;
            cx.notify();
            return;
        };
        self.run(
            window,
            cx,
            move || match client.change_password(None, &Password::new(password)) {
                Ok(user) => Outcome::Signed(user),
                Err(e) => Outcome::Failed(e),
            },
            |this, outcome, window, cx| match outcome {
                Outcome::Signed(user) => {
                    let text = t(cx).auth_change_done;
                    toast(window, cx, ToastKind::Success, text);
                    this.signed_in(user, window, cx);
                }
                Outcome::Failed(e) => this.show_failure(&e, cx),
                _ => {}
            },
        );
    }

    /// A user with a temporary password may do nothing but change it; everyone else gets the app.
    fn signed_in(&mut self, user: SessionUser, window: &mut Window, cx: &mut Context<Self>) {
        self.save_settings(cx);
        self.clear_secrets(window, cx);
        if user.must_change_password {
            self.user = Some(user);
            self.screen = Screen::ForcedChange;
            return;
        }
        cx.update_global::<AppState, _>(|s, _| {
            s.role = user.role;
            s.user_name = user.name.clone().into();
            s.user_id = user.id;
        });
        let client = self.client.clone().expect("a signed-in user has a client");
        let admin = user.role == ezi_core::api::Role::Admin;
        let dashboard = cx.new(|cx| Dashboard::new(client.clone(), cx));
        let items = cx.new(|cx| ItemsPage::new(client.clone(), admin, window, cx));
        let loans = cx.new(|cx| LoansPage::new(client.clone(), admin, window, cx));
        let purchases = cx.new(|cx| PurchasesPage::new(client.clone(), admin, window, cx));
        let profile = cx.new(|cx| ProfilePage::new(client.clone(), window, cx));
        // The master data screens are Admin only: Staff never get the entities (the server refuses them anyway).
        let master = admin.then(|| {
            let categories = cx.new(|cx| MasterPage::new(client.clone(), Kind::Category, window, cx));
            let suppliers = cx.new(|cx| MasterPage::new(client.clone(), Kind::Supplier, window, cx));
            let stock = cx.new(|cx| StockPage::new(client.clone(), window, cx));
            let expenses = cx.new(|cx| ExpensesPage::new(client.clone(), window, cx));
            let reports = cx.new(|cx| ReportsPage::new(client.clone(), window, cx));
            let backup = cx.new(|cx| BackupPage::new(client.clone(), cx));
            let users = cx.new(|cx| UsersPage::new(client.clone(), window, cx));
            let activity = cx.new(|cx| ActivityPage::new(client.clone(), window, cx));
            AdminPages { categories, suppliers, stock, expenses, reports, backup, users, activity }
        });
        let content: PageBuilder = {
            let (dashboard, items, loans, purchases, profile, master) = (dashboard.clone(), items.clone(), loans.clone(), purchases.clone(), profile.clone(), master.clone());
            Rc::new(move |page: Page, _window: &mut Window, cx: &mut App| match page {
                // A page the role cannot use shows "no access", even if it were reached some other way.
                p if !ezi_core::nav::can_access(state(cx).role, p) => StatePanel::no_access(cx).into_any_element(),
                Page::Dashboard => dashboard.clone().into_any_element(),
                Page::Items => items.clone().into_any_element(),
                Page::Loans => loans.clone().into_any_element(),
                Page::Purchases => purchases.clone().into_any_element(),
                Page::Profile => profile.clone().into_any_element(),
                Page::Categories => master.as_ref().map_or_else(|| div().into_any_element(), |a| a.categories.clone().into_any_element()),
                Page::Suppliers => master.as_ref().map_or_else(|| div().into_any_element(), |a| a.suppliers.clone().into_any_element()),
                Page::Stock => master.as_ref().map_or_else(|| div().into_any_element(), |a| a.stock.clone().into_any_element()),
                Page::Expenses => master.as_ref().map_or_else(|| div().into_any_element(), |a| a.expenses.clone().into_any_element()),
                Page::Reports => master.as_ref().map_or_else(|| div().into_any_element(), |a| a.reports.clone().into_any_element()),
                Page::Backup => master.as_ref().map_or_else(|| div().into_any_element(), |a| a.backup.clone().into_any_element()),
                Page::Users => master.as_ref().map_or_else(|| div().into_any_element(), |a| a.users.clone().into_any_element()),
                Page::ActivityLog => master.as_ref().map_or_else(|| div().into_any_element(), |a| a.activity.clone().into_any_element()),
            })
        };
        let gate = cx.entity().downgrade();
        let shell = cx.new(|_| {
            AppShell::new(content)
                .on_sign_out(move |window, cx| {
                    gate.update(cx, |gate, cx| gate.sign_out(window, cx)).ok();
                })
                // The numbers are fetched again each time the Dashboard is opened.
                .on_page(move |page, window, cx| match page {
                    Page::Dashboard => dashboard.update(cx, |d, cx| d.refresh(cx)),
                    Page::Items => items.update(cx, |i, cx| i.show_list(cx)),
                    Page::Loans => loans.update(cx, |p, cx| p.show_list(window, cx)),
                    Page::Purchases => purchases.update(cx, |p, cx| p.show_list(window, cx)),
                    Page::Profile => profile.update(cx, |p, cx| p.refresh(cx)),
                    // The Admin screens fetch their rows again each time they are opened.
                    Page::Categories | Page::Suppliers | Page::Stock | Page::Expenses | Page::Reports | Page::Backup | Page::Users | Page::ActivityLog => {
                        if let Some(admin) = &master {
                            match page {
                                Page::Categories => admin.categories.update(cx, |p, cx| p.show_list(cx)),
                                Page::Suppliers => admin.suppliers.update(cx, |p, cx| p.show_list(cx)),
                                Page::Stock => admin.stock.update(cx, |p, cx| p.show_list(cx)),
                                Page::Expenses => admin.expenses.update(cx, |p, cx| p.refresh(cx)),
                                Page::Reports => admin.reports.update(cx, |p, cx| p.reload(window, cx)),
                                Page::Backup => admin.backup.update(cx, |p, cx| p.refresh(cx)),
                                Page::Users => admin.users.update(cx, |p, cx| p.show_list(cx)),
                                _ => admin.activity.update(cx, |p, cx| p.reload(window, cx)),
                            }
                        }
                    }
                })
        });
        self.shell = Some(shell.into());
        self.user = Some(user);
    }

    fn sign_out(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if let Some(client) = self.client.take() {
            // Ends the session on the server too; the answer does not matter, we are leaving anyway.
            cx.background_executor().spawn(async move { client.logout().ok() }).detach();
        }
        self.shell = None;
        self.user = None;
        self.screen = Screen::Login;
        self.errors.clear();
        self.form_error = None;
        self.notice = None;
        self.clear_secrets(window, cx);
        Self::clear(&self.email, window, cx);
        cx.notify();
    }

    /// Remembers the server address and the language, nothing else (never a password or a session).
    fn save_settings(&self, cx: &App) {
        let (Some(path), Some(client)) = (&self.settings_path, &self.client) else { return };
        let lang = match state(cx).lang {
            Lang::Id => "id",
            Lang::En => "en",
        };
        let _ = settings::save(path, &Settings { server_url: Some(client.base_url().to_string()), lang: Some(lang.to_string()) });
    }

    fn field(&self, label: &'static str, key: &'static str, input: &Entity<InputState>) -> FormField {
        FormField::new(label, Input::new(input)).error(self.errors.get(key).cloned())
    }
}

/// The API's field names for the fields this screen has.
fn field_key(name: &str) -> Option<&'static str> {
    match name {
        "email" => Some("email"),
        "password" | "current" => Some("password"),
        "name" => Some("name"),
        _ => None,
    }
}

impl Render for AuthGate {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        if let Some(shell) = &self.shell {
            return shell.clone().into_any_element();
        }
        let s = t(cx);
        let (eyebrow, title, intro, submit_label): (Option<&str>, &str, Option<&str>, &str) = match self.screen {
            Screen::Login => (None, s.auth_sign_in_title, Some(s.auth_sign_in_intro), if self.busy { s.auth_signing_in } else { s.auth_sign_in }),
            Screen::Setup => (Some(s.auth_setup_eyebrow), s.auth_setup_title, Some(s.auth_setup_info), if self.busy { s.common_saving } else { s.auth_setup_submit }),
            Screen::ForcedChange => (None, s.auth_change_title, Some(s.auth_change_forced_body), if self.busy { s.common_saving } else { s.auth_change_submit }),
        };
        let muted = color(cx, Token::MutedForeground);

        let mut fields: Vec<AnyElement> = Vec::new();
        match self.screen {
            Screen::Login => {
                fields.push(self.field(s.ui_server_address, "server", &self.server).hint(s.ui_server_address_hint).into_any_element());
                fields.push(self.field(s.fields_email, "email", &self.email).into_any_element());
                fields.push(self.field(s.fields_password, "password", &self.password).into_any_element());
            }
            Screen::Setup => {
                fields.push(self.field(s.fields_full_name, "name", &self.name).into_any_element());
                fields.push(self.field(s.fields_email, "email", &self.email).into_any_element());
                fields.push(self.field(s.fields_password, "password", &self.password).hint(s.auth_password_hint).into_any_element());
                fields.push(self.field(s.fields_confirm_password, "confirm", &self.confirm).into_any_element());
            }
            Screen::ForcedChange => {
                fields.push(self.field(s.fields_new_password, "password", &self.password).hint(s.auth_password_hint).into_any_element());
                fields.push(self.field(s.fields_confirm_password, "confirm", &self.confirm).into_any_element());
            }
        }

        let alert = |text: SharedString, bg: Token, cx: &App| {
            div()
                .px(px(theme::SPACE_3))
                .py(px(theme::SPACE_2))
                .rounded(px(theme::RADIUS))
                .bg(color(cx, bg))
                .text_size(px(theme::TEXT_TABLE))
                .text_color(color(cx, Token::Foreground))
                .child(text)
        };

        let secondary: Option<AnyElement> = match self.screen {
            Screen::Setup => Some(
                Button::new("to-sign-in")
                    .outline()
                    .w_full()
                    .label(s.auth_go_to_sign_in)
                    .disabled(self.busy)
                    .on_click(cx.listener(|this, _, window, cx| {
                        this.screen = Screen::Login;
                        this.notice = None;
                        this.errors.clear();
                        this.form_error = None;
                        this.clear_secrets(window, cx);
                        cx.notify();
                    }))
                    .into_any_element(),
            ),
            Screen::ForcedChange => Some(
                Button::new("leave")
                    .outline()
                    .w_full()
                    .label(s.user_sign_out)
                    .disabled(self.busy)
                    .on_click(cx.listener(|this, _, window, cx| this.sign_out(window, cx)))
                    .into_any_element(),
            ),
            Screen::Login => None,
        };

        div()
            .size_full()
            .flex()
            .items_center()
            .justify_center()
            .bg(color(cx, Token::Background))
            .text_color(color(cx, Token::Foreground))
            .child(
                div()
                    .w(px(theme::AUTH_CARD_WIDTH))
                    .flex()
                    .flex_col()
                    .gap(px(theme::SPACE_4))
                    .p(px(theme::SPACE_6))
                    .rounded(px(theme::RADIUS_CARD))
                    .border_1()
                    .border_color(color(cx, Token::Border))
                    .bg(color(cx, Token::Card))
                    .child(
                        div()
                            .flex()
                            .flex_col()
                            .child(div().text_size(px(theme::TEXT_SECTION)).font_weight(FontWeight::BOLD).child(s.app_name))
                            .child(div().text_size(px(theme::TEXT_TABLE)).text_color(muted).child(s.app_tagline)),
                    )
                    .children(eyebrow.map(|e| div().text_size(px(theme::TEXT_TABLE)).font_weight(FontWeight::SEMIBOLD).text_color(muted).child(e)))
                    .child(div().text_size(px(theme::TEXT_TITLE)).font_weight(FontWeight::SEMIBOLD).child(title))
                    .children(intro.map(|i| div().text_size(px(theme::TEXT_BODY)).text_color(muted).child(i)))
                    .children(self.notice.clone().map(|n| alert(n, Token::InfoSoft, cx)))
                    .children(fields)
                    .children(self.form_error.clone().map(|e| alert(e, Token::DangerSoft, cx)))
                    .child(Button::new("submit").primary().w_full().label(submit_label).disabled(self.busy).on_click(cx.listener(|this, _, window, cx| this.submit(window, cx))))
                    .children(secondary),
            )
            .into_any_element()
    }
}
