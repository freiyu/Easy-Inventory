//! Items: the list with search and filters, and the item detail with photo, QR code and stock movements.
//! Same data and the same filters as the web Items page; Staff get the limited view the server gives them.

use std::rc::Rc;
use std::sync::Arc;

use ezi_core::api::{Client, ListMeta};
use ezi_core::format::{format_date, format_number};
use ezi_core::i18n::{self, error_message};
use ezi_core::models::{Item, NameOption};
use ezi_core::theme::{self, Token};
use gpui_kit::component::button::*;
use gpui_kit::component::Disableable;
use gpui_kit::component::input::{Input, InputEvent, InputState};
use gpui_kit::component::select::{SearchableVec, Select, SelectEvent, SelectState};
use gpui_kit::component::IndexPath;
use gpui_kit::prelude::*;
use gpui_kit::*;

use crate::item_form::{Done, ItemForm};
use crate::item_import::ItemImport;
use crate::load::Load;
use crate::state::{color, state, t};
use crate::widgets::{confirm, stock_tone, toast, Badge, QrView, Cell, Column, DataTable, Paging, PhotoView, StatePanel, ToastKind};
use ezi_core::files;

/// Rows per page: the dense layout of the redesign (PRD_REDESIGN.md 10.2).
const PAGE_SIZE: u32 = 8;

type Choice = Entity<SelectState<SearchableVec<String>>>;

#[derive(Clone, Copy, PartialEq, Eq)]
enum View {
    List,
    Detail(i64),
    Form,
    Import,
}

#[derive(Default, Clone, PartialEq)]
struct Filters {
    category: Option<i64>,
    subcategory: Option<i64>,
    stock: Option<&'static str>,
    /// Admin only: `Active` (default), `Inactive`, or empty for all records.
    status: &'static str,
}

pub struct ItemsPage {
    client: Arc<Client>,
    admin: bool,
    view: View,
    search: Entity<InputState>,
    stock_select: Choice,
    status_select: Option<Choice>,
    category_select: Option<Choice>,
    subcategory_select: Option<Choice>,
    categories: Vec<NameOption>,
    subcategories: Vec<NameOption>,
    filters: Filters,
    page: u32,
    list: Load<(Vec<Item>, ListMeta)>,
    list_generation: u32,
    detail: Load<Item>,
    photo: Option<Arc<Vec<u8>>>,
    detail_generation: u32,
    form: Option<Entity<ItemForm>>,
    import: Option<Entity<ItemImport>>,
    exporting: bool,
    route: crate::motion::RouteTracker,
    _subscriptions: Vec<Subscription>,
}

fn choice(labels: Vec<String>, window: &mut Window, cx: &mut Context<ItemsPage>) -> Choice {
    cx.new(|cx| SelectState::new(SearchableVec::new(labels), Some(IndexPath::default()), window, cx))
}

impl ItemsPage {
    pub fn new(client: Arc<Client>, admin: bool, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let s = t(cx);
        let lang = state(cx).lang;
        let stock_labels = [s.items_all_stock_status, i18n::stock_label(lang, admin, ezi_core::models::StockStatus::Safe), i18n::stock_label(lang, admin, ezi_core::models::StockStatus::Low), i18n::stock_label(lang, admin, ezi_core::models::StockStatus::Out)];
        let stock_select = choice(stock_labels.map(String::from).to_vec(), window, cx);
        let status_select = admin.then(|| choice([s.items_active_only, s.items_inactive_only, s.items_all_records].map(String::from).to_vec(), window, cx));
        let search = cx.new(|cx| InputState::new(window, cx).placeholder(s.items_search_placeholder.to_string()));

        let mut subs = Vec::new();
        subs.push(cx.subscribe_in(&search, window, |this, _, ev: &InputEvent, _, cx| {
            if let InputEvent::Change = ev {
                this.page = 1;
                this.fetch_list(cx);
            }
        }));
        subs.push(cx.subscribe_in(&stock_select, window, |this, _, ev: &SelectEvent<SearchableVec<String>>, _, cx| {
            if let SelectEvent::Confirm(Some(label)) = ev {
                let lang = state(cx).lang;
                let admin = this.admin;
                this.filters.stock = [("Safe", ezi_core::models::StockStatus::Safe), ("Low", ezi_core::models::StockStatus::Low), ("Out", ezi_core::models::StockStatus::Out)]
                    .into_iter()
                    .find(|(_, st)| i18n::stock_label(lang, admin, *st) == label)
                    .map(|(v, _)| v);
                this.page = 1;
                this.fetch_list(cx);
            }
        }));
        if let Some(status) = &status_select {
            subs.push(cx.subscribe_in(status, window, |this, _, ev: &SelectEvent<SearchableVec<String>>, _, cx| {
                if let SelectEvent::Confirm(Some(label)) = ev {
                    let s = t(cx);
                    this.filters.status = if label == s.items_inactive_only {
                        "Inactive"
                    } else if label == s.items_all_records {
                        ""
                    } else {
                        "Active"
                    };
                    this.page = 1;
                    this.fetch_list(cx);
                }
            }));
        }

        let mut page = ItemsPage {
            client,
            admin,
            view: View::List,
            search,
            stock_select,
            status_select,
            category_select: None,
            subcategory_select: None,
            categories: Vec::new(),
            subcategories: Vec::new(),
            filters: Filters { status: "Active", ..Filters::default() },
            page: 1,
            list: Load::Loading,
            list_generation: 0,
            detail: Load::Loading,
            photo: None,
            detail_generation: 0,
            form: None,
            import: None,
            exporting: false,
            route: Default::default(),
            _subscriptions: subs,
        };
        page.fetch_list(cx);
        page.fetch_options(window, cx);
        page
    }

    /// Loads the category and subcategory choices, then builds their selects.
    fn fetch_options(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let client = self.client.clone();
        cx.spawn_in(window, async move |this, cx| {
            let result = cx
                .background_executor()
                .spawn(async move { Ok::<_, ezi_core::api::ApiError>((client.name_options("/categories")?, client.name_options("/subcategories")?)) })
                .await;
            this.update_in(cx, |this, window, cx| {
                // A failed options request only means the two filters are missing; the list itself still works.
                let Ok((categories, subcategories)) = result else { return };
                let all = t(cx);
                let label = |first: &str, items: &[NameOption]| std::iter::once(first.to_string()).chain(items.iter().map(|o| o.name.clone())).collect::<Vec<_>>();
                let category_select = choice(label(all.items_all_categories, &categories), window, cx);
                let subcategory_select = choice(label(all.items_all_subcategories, &subcategories), window, cx);
                this._subscriptions.push(cx.subscribe_in(&category_select, window, |this, _, ev: &SelectEvent<SearchableVec<String>>, _, cx| {
                    let SelectEvent::Confirm(label) = ev;
                    {
                        this.filters.category = label.as_ref().and_then(|l| this.categories.iter().find(|c| &c.name == l)).map(|c| c.id);
                        this.page = 1;
                        this.fetch_list(cx);
                    }
                }));
                this._subscriptions.push(cx.subscribe_in(&subcategory_select, window, |this, _, ev: &SelectEvent<SearchableVec<String>>, _, cx| {
                    let SelectEvent::Confirm(label) = ev;
                    {
                        this.filters.subcategory = label.as_ref().and_then(|l| this.subcategories.iter().find(|c| &c.name == l)).map(|c| c.id);
                        this.page = 1;
                        this.fetch_list(cx);
                    }
                }));
                this.categories = categories;
                this.subcategories = subcategories;
                this.category_select = Some(category_select);
                this.subcategory_select = Some(subcategory_select);
                cx.notify();
            })
            .ok();
        })
        .detach();
    }

    /// Back to the list, with the numbers fetched again.
    pub fn show_list(&mut self, cx: &mut Context<Self>) {
        self.view = View::List;
        self.fetch_list(cx);
    }

    fn query(&self, cx: &App) -> Vec<(String, String)> {
        let mut q = vec![("page".to_string(), self.page.to_string()), ("pageSize".to_string(), PAGE_SIZE.to_string()), ("sort".to_string(), "name:asc".to_string())];
        let search = self.search.read(cx).value().trim().to_string();
        if !search.is_empty() {
            q.push(("search".into(), search));
        }
        if let Some(c) = self.filters.category {
            q.push(("categoryId".into(), c.to_string()));
        }
        if let Some(c) = self.filters.subcategory {
            q.push(("subcategoryId".into(), c.to_string()));
        }
        if let Some(s) = self.filters.stock {
            q.push(("stockStatus".into(), s.into()));
        }
        if self.admin && !self.filters.status.is_empty() {
            q.push(("status".into(), self.filters.status.into()));
        }
        q
    }

    fn dirty(&self, cx: &App) -> bool {
        !self.search.read(cx).value().trim().is_empty() || self.filters.category.is_some() || self.filters.subcategory.is_some() || self.filters.stock.is_some() || (self.admin && self.filters.status != "Active")
    }

    fn fetch_list(&mut self, cx: &mut Context<Self>) {
        self.list_generation += 1;
        let (generation, client, query) = (self.list_generation, self.client.clone(), self.query(cx));
        if !matches!(self.list, Load::Ready(_)) {
            self.list = Load::Loading;
        }
        cx.notify();
        cx.spawn(async move |this, cx| {
            let result = cx
                .background_executor()
                .spawn(async move {
                    let q: Vec<(&str, &str)> = query.iter().map(|(k, v)| (k.as_str(), v.as_str())).collect();
                    client.items(&q).map(|s| {
                        let meta = s.meta.unwrap_or(ListMeta { page: 1, page_size: PAGE_SIZE, total: s.data.len() as u32 });
                        (s.data, meta)
                    })
                })
                .await;
            this.update(cx, |this, cx| {
                if this.list_generation == generation {
                    this.list = Load::from_result(result);
                    cx.notify();
                }
            })
            .ok();
        })
        .detach();
    }

    fn clear_filters(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.filters = Filters { status: "Active", ..Filters::default() };
        self.page = 1;
        self.search.update(cx, |s, cx| s.set_value("", window, cx));
        for select in [Some(&self.stock_select), self.status_select.as_ref(), self.category_select.as_ref(), self.subcategory_select.as_ref()].into_iter().flatten() {
            select.update(cx, |s, cx| s.set_selected_index(Some(IndexPath::default()), window, cx));
        }
        self.fetch_list(cx);
    }


    /// What the form and the import screen call when they finish: `Some(id)` opens that item, `None` goes back to the list.
    fn finished(&self, cx: &mut Context<Self>) -> Done {
        let this = cx.entity().downgrade();
        Rc::new(move |id, _window, cx| {
            this.update(cx, |page, cx| {
                page.form = None;
                page.import = None;
                match id {
                    Some(id) => page.open_detail(id, cx),
                    None => page.show_list(cx),
                }
            })
            .ok();
        })
    }

    /// The add form (`edit` None) or the edit form for the item shown on the detail page.
    fn open_form(&mut self, edit: bool, window: &mut Window, cx: &mut Context<Self>) {
        let (item, photo) = match (&self.detail, edit) {
            (Load::Ready(item), true) => (Some(item.clone()), self.photo.clone()),
            _ => (None, None),
        };
        let (client, done) = (self.client.clone(), self.finished(cx));
        self.form = Some(cx.new(|cx| ItemForm::new(client, item, photo, done, window, cx)));
        self.view = View::Form;
        cx.notify();
    }

    fn open_import(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let (client, done) = (self.client.clone(), self.finished(cx));
        self.import = Some(cx.new(|cx| ItemImport::new(client, done, window, cx)));
        self.view = View::Import;
        cx.notify();
    }

    /// Excel export of the list as filtered now, saved to the Downloads folder (never over an existing file).
    fn export(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.exporting {
            return;
        }
        self.exporting = true;
        cx.notify();
        let (client, query) = (self.client.clone(), self.query(cx));
        cx.spawn_in(window, async move |this, cx| {
            let result = cx
                .background_executor()
                .spawn(async move {
                    // The export is of the whole filtered list, not one page.
                    let q: Vec<(&str, &str)> = query.iter().filter(|(k, _)| k != "page" && k != "pageSize").map(|(k, v)| (k.as_str(), v.as_str())).collect();
                    let file = client.export_items(&q).map_err(|e| (false, e.to_string(), Some(e)))?;
                    let dir = files::downloads_dir().ok_or((true, "no Downloads folder".to_string(), None))?;
                    std::fs::create_dir_all(&dir).map_err(|e| (true, e.to_string(), None))?;
                    let path = files::unique_path(&dir, &file.file_name);
                    std::fs::write(&path, &file.bytes).map_err(|e| (true, e.to_string(), None))?;
                    Ok::<_, (bool, String, Option<ezi_core::api::ApiError>)>(path)
                })
                .await;
            this.update_in(cx, |this, window, cx| {
                this.exporting = false;
                let lang = state(cx).lang;
                match result {
                    Ok(path) => toast(window, cx, ToastKind::Success, i18n::export_saved(lang, &path.to_string_lossy())),
                    Err((_, text, Some(api))) => {
                        let _ = text;
                        toast(window, cx, ToastKind::Error, error_message(lang, &api))
                    }
                    Err((_, text, None)) => toast(window, cx, ToastKind::Error, text),
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
    }

    /// The QR code as a PNG file in the Downloads folder (never over an existing file). The file is named after the item,
    /// not the code, so Staff, who may not read the code, do not learn it from the name.
    fn download_qr(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let Load::Ready(item) = &self.detail else { return };
        let Some(value) = item.barcode_value() else { return };
        let lang = state(cx).lang;
        let saved = ezi_core::qr::png(value, 8).ok_or_else(|| "this value cannot be drawn as a QR code".to_string()).and_then(|bytes| {
            let dir = files::downloads_dir().ok_or_else(|| "no Downloads folder".to_string())?;
            std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
            let path = files::unique_path(&dir, &files::qr_png_name(&item.name));
            std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
            Ok(path)
        });
        match saved {
            Ok(path) => toast(window, cx, ToastKind::Success, i18n::export_saved(lang, &path.to_string_lossy())),
            Err(text) => toast(window, cx, ToastKind::Error, text),
        }
    }

    fn confirm_status(&mut self, id: i64, name: String, active: bool, window: &mut Window, cx: &mut Context<Self>) {
        let (s, lang) = (t(cx), state(cx).lang);
        let this = cx.entity();
        let (title, body, label) = if active { (i18n::activate_title(lang, &name), s.items_activate_body, s.items_activate) } else { (i18n::deactivate_title(lang, &name), s.items_deactivate_body, s.items_deactivate) };
        confirm(window, cx, title, body, label, false, move |window, cx| {
            this.update(cx, |page, cx| page.set_active(id, active, window, cx));
        });
    }

    fn set_active(&mut self, id: i64, active: bool, window: &mut Window, cx: &mut Context<Self>) {
        let client = self.client.clone();
        cx.spawn_in(window, async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.set_item_active(id, active) }).await;
            this.update_in(cx, |this, window, cx| match result {
                Ok(()) => {
                    let s = t(cx);
                    toast(window, cx, ToastKind::Success, if active { s.items_activated } else { s.items_deactivated });
                    this.open_detail(id, cx);
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

    fn confirm_delete(&mut self, id: i64, name: String, window: &mut Window, cx: &mut Context<Self>) {
        let (s, lang) = (t(cx), state(cx).lang);
        let this = cx.entity();
        confirm(window, cx, i18n::delete_title(lang, &name), s.items_delete_body, s.items_delete, true, move |window, cx| {
            this.update(cx, |page, cx| page.delete(id, window, cx));
        });
    }

    fn delete(&mut self, id: i64, window: &mut Window, cx: &mut Context<Self>) {
        let client = self.client.clone();
        cx.spawn_in(window, async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.delete_item(id) }).await;
            this.update_in(cx, |this, window, cx| match result {
                Ok(()) => {
                    let text = t(cx).items_deleted;
                    toast(window, cx, ToastKind::Success, text);
                    this.show_list(cx);
                }
                // For example "has history": the server's own message says to deactivate instead.
                Err(e) => {
                    let message = error_message(state(cx).lang, &e);
                    toast(window, cx, ToastKind::Error, message)
                }
            })
            .ok();
        })
        .detach();
    }

    fn open_detail(&mut self, id: i64, cx: &mut Context<Self>) {
        self.view = View::Detail(id);
        self.detail = Load::Loading;
        self.photo = None;
        self.detail_generation += 1;
        let (generation, client) = (self.detail_generation, self.client.clone());
        cx.notify();
        cx.spawn(async move |this, cx| {
            let result = cx
                .background_executor()
                .spawn(async move {
                    let item = client.item(id)?;
                    // The photo is optional: a failed download leaves the empty state, the item itself is shown.
                    let photo = item.photo_version.as_ref().and_then(|_| client.item_photo(id).ok());
                    Ok::<_, ezi_core::api::ApiError>((item, photo))
                })
                .await;
            this.update(cx, |this, cx| {
                if this.detail_generation == generation {
                    match result {
                        Ok((item, photo)) => {
                            this.photo = photo.map(Arc::new);
                            this.detail = Load::Ready(item);
                        }
                        Err(e) => this.detail = Load::Failed(e),
                    }
                    cx.notify();
                }
            })
            .ok();
        })
        .detach();
    }
}

fn heading(cx: &App, text: &str) -> impl IntoElement {
    div().text_size(px(theme::TEXT_SECTION)).font_weight(FontWeight::SEMIBOLD).text_color(color(cx, Token::Foreground)).child(text.to_string())
}

fn card(cx: &App) -> Div {
    div().flex().flex_col().gap(px(theme::SPACE_3)).p(px(theme::SPACE_4)).rounded(px(theme::RADIUS_CARD)).border_1().border_color(color(cx, Token::Border)).bg(color(cx, Token::Card))
}

fn labelled(cx: &App, label: &str, value: impl IntoElement) -> impl IntoElement {
    div()
        .flex()
        .flex_col()
        .gap(px(theme::SPACE_HALF))
        .child(div().text_size(px(theme::TEXT_TABLE)).text_color(color(cx, Token::MutedForeground)).child(label.to_string()))
        .child(div().text_size(px(theme::TEXT_BODY)).font_weight(FontWeight::SEMIBOLD).child(value))
}

impl ItemsPage {
    fn render_list(&mut self, cx: &mut Context<Self>) -> AnyElement {
        let s = t(cx);
        let lang = state(cx).lang;
        let admin = self.admin;
        let this = cx.entity();

        let body: AnyElement = match &self.list {
            Load::Loading => StatePanel::loading(cx).into_any_element(),
            Load::Failed(e) => {
                let message = error_message(lang, e);
                let this = this.clone();
                StatePanel::error(cx, message, move |_, cx| this.update(cx, |p, cx| p.fetch_list(cx))).into_any_element()
            }
            Load::Ready((items, meta)) => {
                let columns = if admin {
                    vec![Column::new(s.items_col_name), Column::new(s.items_col_category).width(160.), Column::new(s.items_col_subcategory).width(150.), Column::new(s.items_col_stock).right().width(110.), Column::new(s.items_col_minimum).right().width(90.), Column::new(s.common_status).width(130.)]
                } else {
                    vec![Column::new(s.items_col_name), Column::new(s.items_col_category).width(170.), Column::new(s.items_col_subcategory).width(170.), Column::new(s.items_col_unit).width(90.), Column::new(s.items_col_availability).width(150.)]
                };
                let rows: Vec<Vec<Cell>> = items
                    .iter()
                    .map(|i| {
                        let name = if i.status == "Inactive" { format!("{}  ·  {}", i.name, s.items_inactive_tag) } else { i.name.clone() };
                        let badge = Badge::new(stock_tone(i.stock_status), i18n::stock_label(lang, admin, i.stock_status)).into();
                        if admin {
                            vec![name.into(), i.category_name.clone().into(), i.subcategory_name.clone().into(), format!("{} {}", format_number(i.current_stock.unwrap_or(0)), i.unit).into(), format_number(i.minimum_stock.unwrap_or(0)).into(), badge]
                        } else {
                            vec![name.into(), i.category_name.clone().into(), i.subcategory_name.clone().into(), i.unit.clone().into(), badge]
                        }
                    })
                    .collect();
                let ids: Vec<i64> = items.iter().map(|i| i.id).collect();
                let empty: AnyElement = if self.dirty(cx) {
                    let this = this.clone();
                    StatePanel::action(s.items_empty_filtered, s.items_empty_filtered_body, s.common_clear, move |w, cx| this.update(cx, |p, cx| p.clear_filters(w, cx))).into_any_element()
                } else {
                    StatePanel::message(cx, s.items_empty_title, "").into_any_element()
                };
                let this_page = this.clone();
                let this_row = this.clone();
                DataTable::new("items", columns)
                    .rows(rows)
                    .empty(empty)
                    .paging(Paging { page: meta.page, page_size: meta.page_size, total: meta.total }, move |p, _, cx| {
                        this_page.update(cx, |page, cx| {
                            page.page = p;
                            page.fetch_list(cx);
                        })
                    })
                    .on_row_click(move |i, _, cx| {
                        if let Some(id) = ids.get(i).copied() {
                            this_row.update(cx, |page, cx| page.open_detail(id, cx));
                        }
                    })
                    .into_any_element()
            }
        };

        let select = |sel: &Option<Choice>| sel.as_ref().map(|s| div().w(px(theme::FILTER_SELECT_WIDTH)).child(Select::new(s)));
        div()
            .flex()
            .flex_col()
            .gap(px(theme::SPACE_4))
            .child(
                div()
                    .flex()
                    .items_start()
                    .justify_between()
                    .child(
                        div()
                            .flex()
                            .flex_col()
                            .gap(px(theme::SPACE_1))
                            .child(div().text_size(px(theme::TEXT_TITLE)).font_weight(FontWeight::SEMIBOLD).child(s.items_title))
                            .child(div().text_size(px(theme::TEXT_BODY)).text_color(color(cx, Token::MutedForeground)).child(if admin { s.items_desc_admin } else { s.items_desc_staff })),
                    )
                    .when(admin, |d| {
                        d.child(
                            div()
                                .flex()
                                .gap(px(theme::SPACE_2))
                                .child(Button::new("items-export").outline().label(if self.exporting { s.common_exporting } else { s.common_export_excel }).disabled(self.exporting).on_click(cx.listener(|this, _, window, cx| this.export(window, cx))))
                                .child(Button::new("items-import").outline().label(s.item_import_button).on_click(cx.listener(|this, _, window, cx| this.open_import(window, cx))))
                                .child(Button::new("items-add").primary().label(s.items_add).on_click(cx.listener(|this, _, window, cx| this.open_form(false, window, cx)))),
                        )
                    }),
            )
            .child(
                div()
                    .flex()
                    .flex_wrap()
                    .items_center()
                    .gap(px(theme::SPACE_2))
                    .child(div().w(px(theme::FILTER_SEARCH_WIDTH)).child(Input::new(&self.search)))
                    .children(select(&self.category_select))
                    .children(select(&self.subcategory_select))
                    .child(div().w(px(theme::FILTER_STOCK_WIDTH)).child(Select::new(&self.stock_select)))
                    .children(self.status_select.as_ref().map(|s| div().w(px(theme::FILTER_STATUS_WIDTH)).child(Select::new(s)))),
            )
            .child(body)
            .into_any_element()
    }

    fn render_detail(&mut self, cx: &mut Context<Self>) -> AnyElement {
        let s = t(cx);
        let lang = state(cx).lang;
        let admin = self.admin;
        let this = cx.entity();
        let back = Button::new("items-back").outline().label(s.common_back).on_click({
            let this = this.clone();
            move |_, _, cx| this.update(cx, |p, cx| p.show_list(cx))
        });
        let content: AnyElement = match &self.detail {
            Load::Loading => StatePanel::loading(cx).into_any_element(),
            Load::Failed(e) => {
                let message = error_message(lang, e);
                let id = match self.view {
                    View::Detail(id) => id,
                    _ => 0,
                };
                let this = this.clone();
                StatePanel::error(cx, message, move |_, cx| this.update(cx, |p, cx| p.open_detail(id, cx))).into_any_element()
            }
            Load::Ready(item) => {
                let header_desc = if admin { format!("{}  ·  {}", item.code.clone().unwrap_or_default(), item.category_name) } else { item.category_name.clone() };
                let fields = div()
                    .flex()
                    .flex_wrap()
                    .gap_x(px(theme::SPACE_6))
                    .gap_y(px(theme::SPACE_3))
                    .flex_1()
                    .min_w_0()
                    .child(labelled(cx, s.fields_category, item.category_name.clone()))
                    .child(labelled(cx, s.fields_subcategory, item.subcategory_name.clone()))
                    .child(labelled(cx, s.fields_unit, item.unit.clone()))
                    .when(admin, |d| {
                        d.child(labelled(cx, s.fields_preferred_supplier, item.supplier_name.clone().unwrap_or_else(|| "-".into())))
                            .child(labelled(cx, s.items_last_price, format!("Rp {}", format_number(item.last_purchase_price.unwrap_or(0)))))
                            .child(labelled(cx, s.fields_location, item.location.clone().filter(|l| !l.is_empty()).unwrap_or_else(|| "-".into())))
                            .child(labelled(cx, s.items_created_at, item.created_at.as_deref().map(|d| format_date(&d[..10.min(d.len())])).unwrap_or_else(|| "-".into())))
                            .child(labelled(cx, s.items_updated_at, item.updated_at.as_deref().map(|d| format_date(&d[..10.min(d.len())])).unwrap_or_else(|| "-".into())))
                            .children(item.notes.clone().filter(|n| !n.is_empty()).map(|n| labelled(cx, s.common_notes, n)))
                    });
                // The QR code sits under the photo, as wide as the photo, with a text button below it (nothing is drawn over the symbol).
                let qr = item.barcode_value().map(|v| {
                    let download = Button::new("item-qr-download")
                        .outline()
                        .w_full()
                        .label(s.items_qr_download)
                        .on_click(cx.listener(|this, _, window, cx| this.download_qr(window, cx)));
                    div().flex().flex_col().gap(px(theme::SPACE_2)).w_full().child(QrView::new(v, admin)).child(download)
                });
                let picture = div().flex().flex_col().flex_none().gap(px(theme::SPACE_2)).w(px(theme::PHOTO_SIZE)).child(PhotoView::new(self.photo.clone(), s.items_photo_none)).children(qr);
                let details = card(cx).flex_1().child(heading(cx, s.items_details_card)).child(div().flex().gap(px(theme::SPACE_4)).child(fields).child(picture));

                let stock_card = card(cx).w(px(theme::SIDE_CARD_WIDTH)).child(heading(cx, s.items_stock_card)).child(if admin {
                    div()
                        .flex()
                        .flex_col()
                        .gap(px(theme::SPACE_3))
                        .child(labelled(cx, s.items_current_stock, format!("{} {}", format_number(item.current_stock.unwrap_or(0)), item.unit)))
                        .child(labelled(cx, s.items_minimum_stock, format_number(item.minimum_stock.unwrap_or(0))))
                        .child(labelled(cx, s.items_reserved, format_number(item.reserved.unwrap_or(0))))
                        .child(labelled(cx, s.items_available_for_loan, format_number(item.available_for_loan)))
                        .into_any_element()
                } else {
                    div().text_size(px(theme::TEXT_BODY)).text_color(color(cx, Token::MutedForeground)).child(s.items_staff_stock_note).into_any_element()
                });


                let movements: Option<AnyElement> = admin.then(|| {
                    let rows: Vec<Vec<Cell>> = item
                        .movements
                        .iter()
                        .map(|m| {
                            let tone = if m.quantity_change < 0 { Token::DangerIcon } else { Token::SuccessIcon };
                            let sign = if m.quantity_change > 0 { "+" } else { "" };
                            vec![
                                format_date(&m.date).into(),
                                i18n::tx_type_label(lang, &m.kind).into(),
                                Cell::Element(div().text_color(color(cx, tone)).font_weight(FontWeight::SEMIBOLD).child(format!("{sign}{}", format_number(m.quantity_change))).into_any_element()),
                                format_number(m.balance_after).into(),
                                m.number.clone().into(),
                                m.user_name.clone().into(),
                            ]
                        })
                        .collect();
                    div()
                        .flex()
                        .flex_col()
                        .gap(px(theme::SPACE_3))
                        .child(heading(cx, s.items_movements))
                        .child(
                            DataTable::new("movements", vec![Column::new(s.items_col_date).width(110.), Column::new(s.items_col_type).width(170.), Column::new(s.items_col_change).right().width(100.), Column::new(s.items_col_balance).right().width(130.), Column::new(s.items_col_ref).width(180.), Column::new(s.items_col_user)])
                                .rows(rows)
                                .empty(div().text_size(px(theme::TEXT_BODY)).text_color(color(cx, Token::MutedForeground)).child(s.items_movements_empty)),
                        )
                        .into_any_element()
                });

                div()
                    .flex()
                    .flex_col()
                    .gap(px(theme::SPACE_4))
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap(px(theme::SPACE_3))
                            .child(div().text_size(px(theme::TEXT_TITLE)).font_weight(FontWeight::SEMIBOLD).child(item.name.clone()))
                            .child(Badge::new(stock_tone(item.stock_status), i18n::stock_label(lang, admin, item.stock_status)))
                            .when(item.status == "Inactive", |d| d.child(Badge::new(crate::widgets::Tone::Neutral, s.items_inactive_tag))),
                    )
                    .child(div().text_size(px(theme::TEXT_BODY)).text_color(color(cx, Token::MutedForeground)).child(header_desc))
                    .child(div().flex().items_start().gap(px(theme::SPACE_4)).child(details).child(div().flex().flex_col().gap(px(theme::SPACE_4)).child(stock_card)))
                    .children(movements)
                    .into_any_element()
            }
        };
        let actions = match (&self.detail, admin) {
            (Load::Ready(item), true) => {
                let (id, name, active) = (item.id, item.name.clone(), item.status == "Active");
                let (name_a, name_d) = (name.clone(), name);
                Some(
                    div()
                        .flex()
                        .gap(px(theme::SPACE_2))
                        .child(Button::new("item-edit").outline().label(s.items_edit).on_click(cx.listener(|this, _, window, cx| this.open_form(true, window, cx))))
                        .child(Button::new("item-status").outline().label(if active { s.items_deactivate } else { s.items_activate }).on_click(cx.listener(move |this, _, window, cx| this.confirm_status(id, name_a.clone(), !active, window, cx))))
                        .child(Button::new("item-delete").danger().label(s.items_delete).on_click(cx.listener(move |this, _, window, cx| this.confirm_delete(id, name_d.clone(), window, cx)))),
                )
            }
            _ => None,
        };
        div().flex().flex_col().gap(px(theme::SPACE_4)).child(div().flex().items_center().justify_between().child(back).children(actions)).child(content).into_any_element()
    }
}

impl Render for ItemsPage {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let tag = match self.view {
            View::List => 0,
            View::Detail(id) => (1 << 32) | id as u64,
            View::Form => 2,
            View::Import => 3,
        };
        let element = match self.view {
            View::List => self.render_list(cx),
            View::Detail(_) => self.render_detail(cx),
            View::Form => self.form.clone().map(|f| f.into_any_element()).unwrap_or_else(|| div().into_any_element()),
            View::Import => self.import.clone().map(|i| i.into_any_element()).unwrap_or_else(|| div().into_any_element()),
        };
        crate::motion::routed(cx, "items", self.route.epoch(tag), element)
    }
}
