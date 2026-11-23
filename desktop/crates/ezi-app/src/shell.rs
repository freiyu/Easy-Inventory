//! The window around every signed-in screen: sidebar by role (224 px), user menu (theme, language, sign out), content area.

use std::rc::Rc;
use std::sync::Arc;

use ezi_core::api::{Client, Lang, Role};
use ezi_core::format::initials;
use ezi_core::models::Badges;
use ezi_core::i18n::Strings;
use ezi_core::nav::{self, Group, Page};
use ezi_core::theme::{self, Token};
use gpui_kit::component::button::*;
use gpui_kit::prelude::*;
use gpui_kit::*;

use crate::assets;
use crate::state::{color, state, t, AppState, ThemePref};
use crate::theme::set_pref;
use crate::widgets::Logo;

/// Builds the content of a page. Screens register here as they are added.
pub type PageBuilder = Rc<dyn Fn(Page, &mut Window, &mut App) -> AnyElement>;

pub struct AppShell {
    page: Page,
    content: PageBuilder,
    /// For the Admin sidebar numbers; without it the numbers are simply not shown.
    client: Option<Arc<Client>>,
    badges: Badges,
    menu_open: bool,
    on_sign_out: Option<Rc<dyn Fn(&mut Window, &mut App)>>,
    on_page: Option<Rc<dyn Fn(Page, &mut Window, &mut App)>>,
}

pub fn page_label(s: &Strings, page: Page) -> &'static str {
    match page {
        Page::Dashboard => s.nav_dashboard,
        Page::Items => s.nav_items,
        Page::Categories => s.nav_categories,
        Page::Suppliers => s.nav_suppliers,
        Page::Stock => s.nav_stock,
        Page::Loans => s.nav_loans,
        Page::Purchases => s.nav_purchases,
        Page::Expenses => s.nav_expenses,
        Page::Reports => s.nav_reports,
        Page::Backup => s.nav_backup,
        Page::Users => s.nav_users,
        Page::ActivityLog => s.nav_activity,
        Page::Profile => s.nav_profile,
    }
}

fn group_label(s: &Strings, g: Group) -> &'static str {
    match g {
        Group::Inventory => s.nav_group_inventory,
        Group::Operations => s.nav_group_operations,
        Group::Admin => s.nav_group_admin,
    }
}

impl AppShell {
    pub fn new(content: PageBuilder) -> Self {
        AppShell { page: Page::Dashboard, content, client: None, badges: Badges::default(), menu_open: false, on_sign_out: None, on_page: None }
    }

    /// The client the sidebar numbers are read with (Admin only: Staff get no numbers).
    pub fn client(mut self, client: Arc<Client>) -> Self {
        self.client = Some(client);
        self
    }

    /// Reads the numbers on the Admin sidebar again: low plus out items, overdue loans, requests waiting for approval.
    pub fn refresh_badges(&mut self, cx: &mut Context<Self>) {
        let Some(client) = self.client.clone().filter(|_| state(cx).role == Role::Admin) else { return };
        cx.spawn(async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.dashboard() }).await;
            this.update(cx, |this, cx| {
                // A failed read keeps the numbers that are there: the sidebar is not a place for an error.
                if let Ok(Some(badges)) = result.map(|d| d.badges) {
                    this.badges = badges;
                    cx.notify();
                }
            })
            .ok();
        })
        .detach();
    }

    fn badge_count(&self, page: Page) -> i64 {
        match page {
            Page::Items => self.badges.items,
            Page::Loans => self.badges.loans,
            Page::Purchases => self.badges.purchases,
            _ => 0,
        }
    }

    /// Called each time a sidebar item is chosen, with the page (a screen can fetch fresh data).
    pub fn on_page(mut self, f: impl Fn(Page, &mut Window, &mut App) + 'static) -> Self {
        self.on_page = Some(Rc::new(f));
        self
    }

    /// What the Sign out button does (the auth gate signs out on the server and shows the login screen).
    pub fn on_sign_out(mut self, f: impl Fn(&mut Window, &mut App) + 'static) -> Self {
        self.on_sign_out = Some(Rc::new(f));
        self
    }

    fn nav_item(&self, page: Page, cx: &mut Context<Self>) -> impl IntoElement {
        let active = self.page == page;
        let s = t(cx);
        let (fg, bg) = if active { (Token::Foreground, Token::SidebarActive) } else { (Token::SidebarForeground, Token::Sidebar) };
        let hover = color(cx, Token::Accent);
        let icon_color = color(cx, if active { Token::SidebarActiveIcon } else { Token::MutedForeground });
        let count = if state(cx).role == Role::Admin { self.badge_count(page) } else { 0 };
        let badge_bg = if page == Page::Purchases { Token::InfoSoft } else { Token::DangerSoft };
        div()
            .id(SharedString::from(format!("nav-{:?}", page)))
            .relative()
            .flex()
            .items_center()
            .gap(px(theme::SPACE_3))
            .h(px(theme::NAV_ITEM_HEIGHT))
            .px(px(theme::SPACE_3))
            .rounded(px(theme::RADIUS))
            .cursor_pointer()
            .bg(color(cx, bg))
            .text_color(color(cx, fg))
            .text_size(px(theme::TEXT_BODY))
            .font_weight(if active { FontWeight::SEMIBOLD } else { FontWeight::NORMAL })
            .when(!active, |d| d.hover(move |s| s.bg(hover)))
            // The active item has a short 3 px green bar on its left edge (docs/DESIGN.md).
            .when(active, |d| {
                d.child(div().absolute().left_0().top(px((theme::NAV_ITEM_HEIGHT - theme::NAV_BAR_HEIGHT) / 2.0)).w(px(theme::NAV_BAR_WIDTH)).h(px(theme::NAV_BAR_HEIGHT)).rounded_r(px(theme::NAV_BAR_WIDTH)).bg(color(cx, Token::SidebarActiveIcon)))
            })
            .on_click(cx.listener(move |this, _, window, cx| {
                this.page = page;
                if let Some(on_page) = this.on_page.clone() {
                    on_page(page, window, cx);
                }
                this.refresh_badges(cx);
                cx.notify();
            }))
            .child(svg().path(assets::page_icon(page.icon())).size(px(theme::NAV_ICON)).flex_none().text_color(icon_color))
            .child(div().flex_1().min_w_0().truncate().child(page_label(s, page)))
            .when(count > 0, |d| {
                d.child(div().min_w(px(theme::BADGE_MIN_WIDTH)).px(px(theme::SPACE_1_5)).rounded_full().bg(color(cx, badge_bg)).text_size(px(theme::TEXT_TABLE)).font_weight(FontWeight::SEMIBOLD).text_color(color(cx, Token::Foreground)).flex().justify_center().child(count.to_string()))
            })
    }

    fn choice(&self, id: &'static str, label: &'static str, selected: bool, cx: &App, on: impl Fn(&mut Window, &mut App) + 'static) -> impl IntoElement {
        let b = Button::new(id).label(label).w_full().on_click(move |_, w, cx| on(w, cx));
        let _ = cx;
        if selected { b.primary() } else { b.outline() }
    }

    fn user_menu(&self, cx: &mut Context<Self>) -> impl IntoElement {
        let s = t(cx);
        let (lang, pref) = (state(cx).lang, state(cx).pref);
        let row = |label: &'static str| div().text_size(px(theme::TEXT_TABLE)).text_color(color(cx, Token::MutedForeground)).child(label);
        div()
            .flex()
            .flex_col()
            .gap(px(theme::SPACE_2))
            .p(px(theme::SPACE_3))
            .m(px(theme::SPACE_2))
            .rounded(px(theme::RADIUS_CARD))
            .border_1()
            .border_color(color(cx, Token::Border))
            .bg(color(cx, Token::Popover))
            .child(row(s.user_theme))
            .child(
                div()
                    .flex()
                    .flex_col()
                    .gap(px(theme::SPACE_1))
                    .child(self.choice("theme-light", s.user_theme_light, pref == ThemePref::Light, cx, |w, cx| set_pref(ThemePref::Light, w, cx)))
                    .child(self.choice("theme-dark", s.user_theme_dark, pref == ThemePref::Dark, cx, |w, cx| set_pref(ThemePref::Dark, w, cx)))
                    .child(self.choice("theme-system", s.user_theme_system, pref == ThemePref::System, cx, |w, cx| set_pref(ThemePref::System, w, cx))),
            )
            .child(row(s.user_language))
            .child(
                div()
                    .flex()
                    .flex_col()
                    .gap(px(theme::SPACE_1))
                    .child(self.choice("lang-id", s.ui_language_id, lang == Lang::Id, cx, |_, cx| set_lang(Lang::Id, cx)))
                    .child(self.choice("lang-en", s.ui_language_en, lang == Lang::En, cx, |_, cx| set_lang(Lang::En, cx))),
            )
            .child({
                let out = self.on_sign_out.clone();
                Button::new("sign-out").outline().w_full().label(s.user_sign_out).on_click(move |_, w, cx| {
                    if let Some(out) = &out {
                        out(w, cx);
                    }
                })
            })
    }
}

pub fn set_lang(lang: Lang, cx: &mut App) {
    cx.update_global::<AppState, _>(|s, _| s.lang = lang);
    cx.refresh_windows();
}

impl Render for AppShell {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let s = t(cx);
        let role = state(cx).role;
        let name = state(cx).user_name.clone();

        let mut groups: Vec<AnyElement> = Vec::new();
        for (group, pages) in nav::sidebar(role) {
            let mut items: Vec<AnyElement> = Vec::new();
            for p in pages {
                items.push(self.nav_item(p, cx).into_any_element());
            }
            let heading = group.filter(|_| nav::show_group_labels(role)).map(|g| {
                div()
                    .flex()
                    .items_center()
                    .h(px(theme::NAV_GROUP_HEIGHT))
                    .px(px(theme::SPACE_3))
                    .text_size(px(theme::TEXT_TABLE))
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(color(cx, Token::MutedForeground))
                    .child(group_label(s, g))
            });
            groups.push(div().flex().flex_col().gap(px(theme::SPACE_HALF)).children(heading).children(items).into_any_element());
        }

        let sidebar = div()
            .flex()
            .flex_col()
            .flex_none()
            .w(px(theme::SIDEBAR_WIDTH))
            .h_full()
            .bg(color(cx, Token::Sidebar))
            .border_r_1()
            .border_color(color(cx, Token::SidebarBorder))
            .text_color(color(cx, Token::SidebarForeground))
            .child(div().flex().items_center().h(px(theme::LOGO_ROW_HEIGHT)).flex_none().px(px(theme::SPACE_4)).child(Logo::new(false)))
            .child(div().id("nav").flex().flex_col().flex_1().gap(px(theme::SPACE_3)).px(px(theme::SPACE_2)).overflow_y_scroll().children(groups))
            .when(self.menu_open, |d| d.child(self.user_menu(cx)))
            .child(
                div()
                    .id("user-row")
                    .flex()
                    .items_center()
                    .gap(px(theme::SPACE_3))
                    .h(px(theme::USER_ROW_HEIGHT))
                    .px(px(theme::SPACE_4))
                    .border_t_1()
                    .border_color(color(cx, Token::SidebarBorder))
                    .cursor_pointer()
                    // An avatar with the initials, the name over the role, and the up-down chevrons: the web user menu button.
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .justify_center()
                            .size(px(theme::AVATAR_SIZE))
                            .flex_none()
                            .rounded_full()
                            .bg(color(cx, Token::InfoSoft))
                            .text_size(px(theme::TEXT_TABLE))
                            .font_weight(FontWeight::SEMIBOLD)
                            .child(initials(&name)),
                    )
                    .child(
                        div()
                            .flex()
                            .flex_col()
                            .flex_1()
                            .min_w_0()
                            .child(div().truncate().text_size(px(theme::TEXT_BODY)).font_weight(FontWeight::SEMIBOLD).child(name.clone()))
                            .child(div().text_size(px(theme::TEXT_TABLE)).text_color(color(cx, Token::MutedForeground)).child(format!("{:?}", role))),
                    )
                    .child(svg().path(assets::chevrons()).size(px(theme::NAV_ICON)).flex_none().text_color(color(cx, Token::MutedForeground)))
                    .on_click(cx.listener(|this, _, _, cx| {
                        this.menu_open = !this.menu_open;
                        cx.notify();
                    })),
            );

        let page = (self.content)(self.page, window, cx);
        div()
            .flex()
            .size_full()
            .bg(color(cx, Token::Background))
            .text_color(color(cx, Token::Foreground))
            .child(sidebar)
            .child(
                div()
                    .id("content")
                    .flex_1()
                    .h_full()
                    .overflow_y_scroll()
                    .child(div().w_full().max_w(px(theme::CONTENT_MAX)).mx_auto().p(px(theme::SPACE_6)).child(page)),
            )
    }
}
