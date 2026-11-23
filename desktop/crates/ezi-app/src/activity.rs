//! Activity log (Admin only): who did what, with search and the same filters as the web page: module, user, and a date range.
//! The log is read only. System entries have no user and are shown as "System".

use std::sync::Arc;

use ezi_core::api::{ApiError, Client, ListMeta};
use ezi_core::format::format_date_time;
use ezi_core::i18n::error_message;
use ezi_core::models::{ActivityRow, UserOption};
use ezi_core::theme::{self, Token};
use gpui_kit::component::button::*;
use gpui_kit::component::input::{Input, InputEvent, InputState};
use gpui_kit::component::select::{SearchableVec, Select, SelectEvent, SelectState};
use gpui_kit::component::IndexPath;
use gpui_kit::prelude::*;
use gpui_kit::*;

use crate::load::Load;
use crate::state::{color, state, t};
use crate::widgets::{Cell, Column, DataTable, Paging, StatePanel};

/// Rows per page: the dense layout of the redesign (PRD_REDESIGN.md 10.2).
const PAGE_SIZE: u32 = 8;

type Choice = Entity<SelectState<SearchableVec<String>>>;

pub struct ActivityPage {
    client: Arc<Client>,
    search: Entity<InputState>,
    from: Entity<InputState>,
    to: Entity<InputState>,
    module_select: Option<Choice>,
    user_select: Option<Choice>,
    modules: Vec<String>,
    people: Vec<UserOption>,
    module: Option<String>,
    user: Option<i64>,
    page: u32,
    list: Load<(Vec<ActivityRow>, ListMeta)>,
    generation: u32,
    _subscriptions: Vec<Subscription>,
}

impl ActivityPage {
    pub fn new(client: Arc<Client>, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let s = t(cx);
        let search = cx.new(|cx| InputState::new(window, cx).placeholder(s.activity_search_placeholder.to_string()));
        let from = cx.new(|cx| InputState::new(window, cx).placeholder(s.common_from.to_string()));
        let to = cx.new(|cx| InputState::new(window, cx).placeholder(s.common_to.to_string()));
        let subs = [&search, &from, &to].map(|input| {
            cx.subscribe_in(input, window, |this, _, ev: &InputEvent, _, cx| {
                if let InputEvent::Change = ev {
                    this.page = 1;
                    this.fetch(cx);
                }
            })
        });
        let mut page = ActivityPage {
            client,
            search,
            from,
            to,
            module_select: None,
            user_select: None,
            modules: Vec::new(),
            people: Vec::new(),
            module: None,
            user: None,
            page: 1,
            list: Load::Loading,
            generation: 0,
            _subscriptions: subs.into(),
        };
        page.reload(window, cx);
        page
    }

    /// Fetches the rows again, and the filter choices once (the shell calls this when the page is opened).
    pub fn reload(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.fetch(cx);
        if self.module_select.is_some() {
            return;
        }
        let client = self.client.clone();
        cx.spawn_in(window, async move |this, cx| {
            let result = cx.background_executor().spawn(async move { Ok::<_, ApiError>((client.activity_modules()?, client.all_people()?)) }).await;
            this.update_in(cx, |this, window, cx| {
                // Without the choices only the two filters are missing; the log itself still works.
                let Ok((modules, people)) = result else { return };
                let s = t(cx);
                let labels = |all: &str, v: Vec<String>| std::iter::once(all.to_string()).chain(v).collect::<Vec<_>>();
                let module_select = cx.new(|cx| SelectState::new(SearchableVec::new(labels(s.activity_all_modules, modules.clone())), Some(IndexPath::default()), window, cx));
                let user_select = cx.new(|cx| SelectState::new(SearchableVec::new(labels(s.activity_all_users, people.iter().map(|u| u.name.clone()).collect())), Some(IndexPath::default()), window, cx));
                this._subscriptions.push(cx.subscribe_in(&module_select, window, |this, _, ev: &SelectEvent<SearchableVec<String>>, _, cx| {
                    let SelectEvent::Confirm(label) = ev;
                    this.module = label.clone().filter(|l| this.modules.contains(l));
                    this.page = 1;
                    this.fetch(cx);
                }));
                this._subscriptions.push(cx.subscribe_in(&user_select, window, |this, _, ev: &SelectEvent<SearchableVec<String>>, _, cx| {
                    let SelectEvent::Confirm(label) = ev;
                    this.user = label.as_ref().and_then(|l| this.people.iter().find(|u| &u.name == l)).map(|u| u.id);
                    this.page = 1;
                    this.fetch(cx);
                }));
                (this.modules, this.people) = (modules, people);
                this.module_select = Some(module_select);
                this.user_select = Some(user_select);
                cx.notify();
            })
            .ok();
        })
        .detach();
    }

    fn dirty(&self, cx: &App) -> bool {
        [&self.search, &self.from, &self.to].iter().any(|i| !i.read(cx).value().trim().is_empty()) || self.module.is_some() || self.user.is_some()
    }

    fn fetch(&mut self, cx: &mut Context<Self>) {
        self.generation += 1;
        let (generation, client, page, module, user) = (self.generation, self.client.clone(), self.page, self.module.clone(), self.user);
        let text = |i: &Entity<InputState>| i.read(cx).value().trim().to_string();
        let (search, from, to) = (text(&self.search), text(&self.from), text(&self.to));
        if !matches!(self.list, Load::Ready(_)) {
            self.list = Load::Loading;
        }
        cx.notify();
        cx.spawn(async move |this, cx| {
            let result = cx
                .background_executor()
                .spawn(async move {
                    let (page, size, user) = (page.to_string(), PAGE_SIZE.to_string(), user.map(|u| u.to_string()));
                    let mut q = vec![("page", page.as_str()), ("pageSize", size.as_str()), ("sort", "time:desc")];
                    for (k, v) in [("search", Some(&search)), ("module", module.as_ref()), ("userId", user.as_ref()), ("from", Some(&from)), ("to", Some(&to))] {
                        if let Some(v) = v.filter(|v| !v.is_empty()) {
                            q.push((k, v.as_str()));
                        }
                    }
                    client.activity(&q).map(|s| {
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
        (self.module, self.user, self.page) = (None, None, 1);
        for input in [&self.search, &self.from, &self.to] {
            input.update(cx, |i, cx| i.set_value("", window, cx));
        }
        for select in [self.module_select.as_ref(), self.user_select.as_ref()].into_iter().flatten() {
            select.update(cx, |s, cx| s.set_selected_index(Some(IndexPath::default()), window, cx));
        }
        self.fetch(cx);
    }
}

impl Render for ActivityPage {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let s = t(cx);
        let lang = state(cx).lang;
        let this = cx.entity();
        let body: AnyElement = match &self.list {
            Load::Loading => StatePanel::loading(cx).into_any_element(),
            Load::Failed(e) => {
                let message = error_message(lang, e);
                let this = this.clone();
                StatePanel::error(cx, message, move |_, cx| this.update(cx, |p, cx| p.fetch(cx))).into_any_element()
            }
            Load::Ready((rows, meta)) => {
                let columns = vec![Column::new(s.activity_col_time).width(145.), Column::new(s.activity_col_user).width(130.), Column::new(s.activity_col_action), Column::new(s.activity_col_module).width(120.), Column::new(s.activity_col_ref).width(160.), Column::new(s.activity_col_details)];
                let cells: Vec<Vec<Cell>> = rows
                    .iter()
                    .map(|a| {
                        let dash = |v: &str| if v.is_empty() { "-".to_string() } else { v.to_string() };
                        vec![format_date_time(&a.created_at).into(), a.user_name.clone().unwrap_or_else(|| s.activity_system.to_string()).into(), a.action.clone().into(), a.module.clone().into(), dash(&a.reference).into(), dash(&a.metadata).into()]
                    })
                    .collect();
                let empty: AnyElement = if self.dirty(cx) {
                    let this = this.clone();
                    StatePanel::action(s.activity_empty_filtered, "", s.common_clear, move |w, cx| this.update(cx, |p, cx| p.clear_filters(w, cx))).into_any_element()
                } else {
                    StatePanel::message(cx, s.activity_empty_title, "").into_any_element()
                };
                let this_page = this.clone();
                DataTable::new("activity", columns).rows(cells).empty(empty).paging(Paging { page: meta.page, page_size: meta.page_size, total: meta.total }, move |p, _, cx| {
                    this_page.update(cx, |page, cx| {
                        page.page = p;
                        page.fetch(cx);
                    })
                }).into_any_element()
            }
        };
        div()
            .flex()
            .flex_col()
            .gap(px(theme::SPACE_4))
            .child(
                div()
                    .flex()
                    .flex_col()
                    .gap(px(theme::SPACE_1))
                    .child(div().text_size(px(theme::TEXT_TITLE)).font_weight(FontWeight::SEMIBOLD).child(s.activity_title))
                    .child(div().text_size(px(theme::TEXT_BODY)).text_color(color(cx, Token::MutedForeground)).child(s.activity_description)),
            )
            .child(
                div()
                    .flex()
                    .flex_wrap()
                    .items_center()
                    .gap(px(theme::SPACE_2))
                    .child(div().w(px(theme::FILTER_SEARCH_WIDTH)).child(Input::new(&self.search)))
                    .children(self.module_select.as_ref().map(|sel| div().w(px(theme::FILTER_SELECT_WIDTH)).child(Select::new(sel))))
                    .children(self.user_select.as_ref().map(|sel| div().w(px(theme::FILTER_SELECT_WIDTH)).child(Select::new(sel))))
                    .child(div().w(px(theme::FILTER_STATUS_WIDTH)).child(Input::new(&self.from)))
                    .child(div().w(px(theme::FILTER_STATUS_WIDTH)).child(Input::new(&self.to)))
                    .when(self.dirty(cx), |d| d.child(Button::new("activity-clear").outline().label(s.common_clear).on_click(cx.listener(|this, _, w, cx| this.clear_filters(w, cx))))),
            )
            .child(body)
    }
}
