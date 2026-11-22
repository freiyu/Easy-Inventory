//! The window around every signed-in screen: sidebar by role (224 px), user menu (theme, language, sign out), content area.

use std::rc::Rc;

use ezi_core::api::Lang;
use ezi_core::i18n::Strings;
use ezi_core::nav::{self, Group, Page};
use ezi_core::theme::{self, Token};
use gpui_kit::component::button::*;
use gpui_kit::prelude::*;
use gpui_kit::*;

use crate::state::{color, state, t, AppState, ThemePref};
use crate::theme::set_pref;

/// Builds the content of a page. Screens register here as they are added.
pub type PageBuilder = Rc<dyn Fn(Page, &mut Window, &mut App) -> AnyElement>;

pub struct AppShell {
    page: Page,
    content: PageBuilder,
    menu_open: bool,
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
        AppShell { page: Page::Dashboard, content, menu_open: false }
    }

    fn nav_item(&self, page: Page, cx: &mut Context<Self>) -> impl IntoElement {
        let active = self.page == page;
        let s = t(cx);
        let (fg, bg) = if active { (Token::SidebarActiveIcon, Token::SidebarActive) } else { (Token::SidebarForeground, Token::Sidebar) };
        let hover = color(cx, Token::Accent);
        div()
            .id(SharedString::from(format!("nav-{:?}", page)))
            .flex()
            .items_center()
            .h(px(theme::NAV_ITEM_HEIGHT))
            .pl(px(theme::SPACE_3 - theme::NAV_BAR_WIDTH))
            .pr(px(theme::SPACE_3))
            .rounded(px(theme::RADIUS))
            .cursor_pointer()
            .bg(color(cx, bg))
            .text_color(color(cx, fg))
            .text_size(px(theme::TEXT_LABEL))
            .font_weight(if active { FontWeight::SEMIBOLD } else { FontWeight::NORMAL })
            // The active item has a 3 px green bar on its left edge (docs/DESIGN.md).
            .border_l(px(theme::NAV_BAR_WIDTH))
            .border_color(if active { color(cx, Token::SuccessIcon) } else { color(cx, Token::Sidebar) })
            .when(!active, |d| d.hover(move |s| s.bg(hover)))
            .on_click(cx.listener(move |this, _, _, cx| {
                this.page = page;
                cx.notify();
            }))
            .child(page_label(s, page))
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
            .child(Button::new("sign-out").outline().w_full().label(s.user_sign_out))
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
            let heading = group.map(|g| {
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
            .child(
                div()
                    .flex()
                    .flex_col()
                    .px(px(theme::SPACE_4))
                    .py(px(theme::SPACE_4))
                    .child(div().text_size(px(theme::TEXT_SECTION)).font_weight(FontWeight::BOLD).child(s.app_name))
                    .child(div().text_size(px(theme::TEXT_TABLE)).text_color(color(cx, Token::MutedForeground)).child(s.app_product)),
            )
            .child(div().id("nav").flex().flex_col().flex_1().gap(px(theme::SPACE_3)).px(px(theme::SPACE_2)).overflow_y_scroll().children(groups))
            .when(self.menu_open, |d| d.child(self.user_menu(cx)))
            .child(
                div()
                    .id("user-row")
                    .flex()
                    .items_center()
                    .h(px(theme::USER_ROW_HEIGHT))
                    .px(px(theme::SPACE_4))
                    .border_t_1()
                    .border_color(color(cx, Token::SidebarBorder))
                    .cursor_pointer()
                    .text_size(px(theme::TEXT_LABEL))
                    .font_weight(FontWeight::SEMIBOLD)
                    .child(name)
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
