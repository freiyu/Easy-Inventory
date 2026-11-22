//! Add and edit an item (Admin). Same fields, rules and messages as the web form; the photo is chosen by file location
//! (with a Choose file button) and sent after the item is saved, because a new item has no id yet.
//! shortcut: notes are a single-line input and the record status is changed from the item page, not in this form.

use std::path::PathBuf;
use std::rc::Rc;
use std::sync::Arc;

use ezi_core::api::{ApiError, Client};
use ezi_core::forms::{self, Errors, ItemFields, UNITS};
use ezi_core::i18n::error_message;
use ezi_core::models::{Item, NameOption};
use ezi_core::photo;
use ezi_core::theme::{self, Token};
use gpui_kit::component::button::*;
use gpui_kit::component::input::{Input, InputEvent, InputState};
use gpui_kit::component::select::{SearchableVec, Select, SelectEvent, SelectState};
use gpui_kit::component::{Disableable, IndexPath};
use gpui_kit::prelude::*;
use gpui_kit::*;

use crate::state::{color, state, t};
use crate::widgets::{toast, FormField, PhotoView, StatePanel, ToastKind};

type Choice = Entity<SelectState<SearchableVec<String>>>;
pub type Done = Rc<dyn Fn(Option<i64>, &mut Window, &mut App)>;

struct Selects {
    category: Choice,
    subcategory: Choice,
    unit: Choice,
    supplier: Choice,
}

enum Outcome {
    Failed(ApiError),
    Saved { id: i64, photo_error: Option<ApiError> },
}

pub struct ItemForm {
    client: Arc<Client>,
    editing: Option<Item>,
    photo: Option<Arc<Vec<u8>>>,
    options: Option<Result<(), ApiError>>,
    selects: Option<Selects>,
    categories: Vec<NameOption>,
    subcategories: Vec<NameOption>,
    suppliers: Vec<NameOption>,
    category_pick: Option<i64>,
    subcategory_pick: Option<i64>,
    supplier_pick: Option<i64>,
    unit_pick: String,
    name: Entity<InputState>,
    opening: Entity<InputState>,
    minimum: Entity<InputState>,
    price: Entity<InputState>,
    location: Entity<InputState>,
    notes: Entity<InputState>,
    photo_path: Entity<InputState>,
    remove_photo: bool,
    errors: Errors,
    form_error: Option<SharedString>,
    busy: bool,
    on_done: Done,
    _subscriptions: Vec<Subscription>,
}

fn choice(labels: Vec<String>, selected: Option<usize>, window: &mut Window, cx: &mut Context<ItemForm>) -> Choice {
    cx.new(|cx| SelectState::new(SearchableVec::new(labels), selected.map(|i| IndexPath::default().row(i)), window, cx))
}

impl ItemForm {
    pub fn new(client: Arc<Client>, editing: Option<Item>, photo: Option<Arc<Vec<u8>>>, on_done: Done, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let text = |window: &mut Window, cx: &mut Context<Self>, value: String| cx.new(|cx| InputState::new(window, cx).default_value(value));
        let e = editing.as_ref();
        let name = text(window, cx, e.map(|i| i.name.clone()).unwrap_or_default());
        let opening = text(window, cx, "0".into());
        let minimum = text(window, cx, e.and_then(|i| i.minimum_stock).unwrap_or(0).to_string());
        let price = text(window, cx, e.and_then(|i| i.last_purchase_price).unwrap_or(0).to_string());
        let location = text(window, cx, e.and_then(|i| i.location.clone()).unwrap_or_default());
        let notes = text(window, cx, e.and_then(|i| i.notes.clone()).unwrap_or_default());
        let photo_path = cx.new(|cx| InputState::new(window, cx).placeholder("/home/me/photo.png"));
        let mut subs = Vec::new();
        for field in [&name, &opening, &minimum, &price, &location, &notes, &photo_path] {
            subs.push(cx.subscribe_in(field, window, |this, _, ev: &InputEvent, window, cx| {
                if let InputEvent::PressEnter { .. } = ev {
                    this.save(window, cx);
                }
            }));
        }
        let mut form = ItemForm {
            category_pick: e.and_then(|i| i.category_id),
            subcategory_pick: e.and_then(|i| i.subcategory_id),
            supplier_pick: e.and_then(|i| i.supplier_id),
            unit_pick: e.map(|i| i.unit.clone()).unwrap_or_default(),
            client,
            editing,
            photo,
            options: None,
            selects: None,
            categories: Vec::new(),
            subcategories: Vec::new(),
            suppliers: Vec::new(),
            name,
            opening,
            minimum,
            price,
            location,
            notes,
            photo_path,
            remove_photo: false,
            errors: Errors::new(),
            form_error: None,
            busy: false,
            on_done,
            _subscriptions: subs,
        };
        form.load_options(window, cx);
        form
    }

    fn load_options(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.options = None;
        cx.notify();
        let client = self.client.clone();
        cx.spawn_in(window, async move |this, cx| {
            let result = cx
                .background_executor()
                .spawn(async move { Ok::<_, ApiError>((client.name_options("/categories")?, client.name_options("/subcategories")?, client.name_options("/suppliers")?)) })
                .await;
            this.update_in(cx, |this, window, cx| {
                match result {
                    Ok((categories, subcategories, suppliers)) => {
                        this.build_selects(categories, subcategories, suppliers, window, cx);
                        this.options = Some(Ok(()));
                    }
                    Err(e) => this.options = Some(Err(e)),
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
    }

    fn build_selects(&mut self, categories: Vec<NameOption>, subcategories: Vec<NameOption>, suppliers: Vec<NameOption>, window: &mut Window, cx: &mut Context<Self>) {
        let names = |v: &[NameOption]| v.iter().map(|o| o.name.clone()).collect::<Vec<_>>();
        let position = |v: &[NameOption], id: Option<i64>| id.and_then(|id| v.iter().position(|o| o.id == id));
        let category = choice(names(&categories), position(&categories, self.category_pick), window, cx);
        let subcategory = choice(names(&subcategories), position(&subcategories, self.subcategory_pick), window, cx);
        let unit = choice(UNITS.map(String::from).to_vec(), UNITS.iter().position(|u| *u == self.unit_pick), window, cx);
        let none = t(cx).items_no_supplier.to_string();
        let supplier_labels: Vec<String> = std::iter::once(none).chain(names(&suppliers)).collect();
        let supplier = choice(supplier_labels, Some(position(&suppliers, self.supplier_pick).map_or(0, |p| p + 1)), window, cx);
        self._subscriptions.push(cx.subscribe_in(&category, window, |this, _, ev: &SelectEvent<SearchableVec<String>>, _, _| {
            let SelectEvent::Confirm(label) = ev;
            this.category_pick = label.as_ref().and_then(|l| this.categories.iter().find(|c| &c.name == l)).map(|c| c.id);
        }));
        self._subscriptions.push(cx.subscribe_in(&subcategory, window, |this, _, ev: &SelectEvent<SearchableVec<String>>, _, _| {
            let SelectEvent::Confirm(label) = ev;
            this.subcategory_pick = label.as_ref().and_then(|l| this.subcategories.iter().find(|c| &c.name == l)).map(|c| c.id);
        }));
        self._subscriptions.push(cx.subscribe_in(&unit, window, |this, _, ev: &SelectEvent<SearchableVec<String>>, _, _| {
            let SelectEvent::Confirm(label) = ev;
            this.unit_pick = label.clone().unwrap_or_default();
        }));
        self._subscriptions.push(cx.subscribe_in(&supplier, window, |this, _, ev: &SelectEvent<SearchableVec<String>>, _, _| {
            let SelectEvent::Confirm(label) = ev;
            this.supplier_pick = label.as_ref().and_then(|l| this.suppliers.iter().find(|c| &c.name == l)).map(|c| c.id);
        }));
        self.categories = categories;
        self.subcategories = subcategories;
        self.suppliers = suppliers;
        self.selects = Some(Selects { category, subcategory, unit, supplier });
    }

    fn value(input: &Entity<InputState>, cx: &App) -> String {
        input.read(cx).value().to_string()
    }

    fn choose_file(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let rx = cx.prompt_for_paths(PathPromptOptions { files: true, directories: false, multiple: false, prompt: None });
        cx.spawn_in(window, async move |this, cx| {
            // Without a system file dialog (some Linux setups) this stays empty: the location can be typed instead.
            if let Ok(Ok(Some(paths))) = rx.await {
                if let Some(path) = paths.first() {
                    let shown = path.to_string_lossy().to_string();
                    this.update_in(cx, |this, window, cx| this.photo_path.update(cx, |s, cx| s.set_value(shown, window, cx))).ok();
                }
            }
        })
        .detach();
    }

    fn save(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.busy || self.selects.is_none() {
            return;
        }
        let lang = state(cx).lang;
        let s = t(cx);
        let creating = self.editing.is_none();
        let (name, opening, minimum, price, location, notes) = (
            Self::value(&self.name, cx),
            Self::value(&self.opening, cx),
            Self::value(&self.minimum, cx),
            Self::value(&self.price, cx),
            Self::value(&self.location, cx),
            Self::value(&self.notes, cx),
        );
        let fields = ItemFields {
            name: &name,
            category_id: self.category_pick,
            subcategory_id: self.subcategory_pick,
            unit: &self.unit_pick,
            opening_stock: &opening,
            minimum_stock: &minimum,
            last_price: &price,
            supplier_id: self.supplier_pick,
            location: &location,
            status: self.editing.as_ref().map_or("Active", |i| i.status.as_str()),
            notes: &notes,
        };
        let mut errors = Errors::new();
        let input = match forms::item(lang, &fields, creating) {
            Ok(i) => Some(i),
            Err(e) => {
                errors = e;
                None
            }
        };
        // The photo is checked here, before anything is sent, with the same messages as the server.
        let path = Self::value(&self.photo_path, cx).trim().to_string();
        let mut upload: Option<(Vec<u8>, &'static str)> = None;
        if !path.is_empty() {
            match std::fs::read(PathBuf::from(&path)) {
                Err(_) => {
                    errors.insert("photo", s.ui_file_unreadable.to_string());
                }
                Ok(bytes) => match photo::check(lang, &bytes) {
                    Ok(content_type) => upload = Some((bytes, content_type)),
                    Err(message) => {
                        errors.insert("photo", message);
                    }
                },
            }
        }
        let Some(input) = input.filter(|_| errors.is_empty()) else {
            self.errors = errors;
            self.form_error = None;
            cx.notify();
            return;
        };

        self.busy = true;
        self.errors.clear();
        self.form_error = None;
        cx.notify();
        let (client, editing_id) = (self.client.clone(), self.editing.as_ref().map(|i| i.id));
        let remove_photo = self.remove_photo && self.editing.as_ref().is_some_and(|i| i.photo_version.is_some());
        cx.spawn_in(window, async move |this, cx| {
            let outcome = cx
                .background_executor()
                .spawn(async move {
                    let saved = match editing_id {
                        Some(id) => client.update_item(id, &input),
                        None => client.create_item(&input),
                    };
                    match saved {
                        Err(e) => Outcome::Failed(e),
                        Ok(item) => {
                            let photo_error = match upload {
                                Some((bytes, content_type)) => client.upload_item_photo(item.id, bytes, content_type).err(),
                                None if remove_photo => client.remove_item_photo(item.id).err(),
                                None => None,
                            };
                            Outcome::Saved { id: item.id, photo_error }
                        }
                    }
                })
                .await;
            this.update_in(cx, |this, window, cx| {
                this.busy = false;
                match outcome {
                    Outcome::Failed(e) => this.show_failure(&e, cx),
                    Outcome::Saved { id, photo_error } => {
                        let s = t(cx);
                        toast(window, cx, ToastKind::Success, if creating { s.items_saved_add } else { s.items_saved_edit });
                        if photo_error.is_some() {
                            toast(window, cx, ToastKind::Error, s.items_photo_save_failed);
                        }
                        (this.on_done.clone())(Some(id), window, cx);
                    }
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
    }

    fn show_failure(&mut self, error: &ApiError, cx: &App) {
        let key = |name: &str| match name {
            "name" => Some("name"),
            "categoryId" => Some("category"),
            "subcategoryId" => Some("subcategory"),
            "unit" => Some("unit"),
            "openingStock" => Some("opening"),
            "minimumStock" => Some("minimum"),
            "lastPurchasePrice" => Some("price"),
            "supplierId" => Some("supplier"),
            "location" => Some("location"),
            _ => None,
        };
        self.errors = error.fields().into_iter().filter_map(|(k, v)| Some((key(&k)?, v))).collect();
        self.form_error = Some(error_message(state(cx).lang, error).into());
    }

    fn field(&self, label: &str, key: &'static str, control: impl IntoElement) -> FormField {
        FormField::new(label.to_string(), control).error(self.errors.get(key).cloned())
    }
}

fn section(cx: &App, title: &str) -> impl IntoElement {
    div().text_size(px(theme::TEXT_SECTION)).font_weight(FontWeight::SEMIBOLD).text_color(color(cx, Token::Foreground)).child(title.to_string())
}

impl Render for ItemForm {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let s = t(cx);
        let creating = self.editing.is_none();
        let this = cx.entity();
        let head = div()
            .flex()
            .flex_col()
            .gap(px(theme::SPACE_1))
            .child(div().text_size(px(theme::TEXT_TITLE)).font_weight(FontWeight::SEMIBOLD).child(if creating { s.items_add_title } else { s.items_edit_title }));

        let body: AnyElement = match (&self.options, &self.selects) {
            (None, _) => StatePanel::loading(cx).into_any_element(),
            (Some(Err(e)), _) => {
                let message = error_message(state(cx).lang, e);
                StatePanel::error(cx, message, move |w, cx| this.update(cx, |f, cx| f.load_options(w, cx))).into_any_element()
            }
            (Some(Ok(())), Some(sel)) => {
                let code = self.editing.as_ref().and_then(|i| i.code.clone()).unwrap_or_else(|| s.items_code_auto.to_string());
                let stock_field: AnyElement = if creating {
                    self.field(s.fields_opening_stock, "opening", Input::new(&self.opening)).hint(s.items_opening_hint).into_any_element()
                } else {
                    let current = self.editing.as_ref().and_then(|i| i.current_stock).unwrap_or(0);
                    FormField::new(s.items_current_stock.to_string(), div().text_size(px(theme::TEXT_BODY)).child(ezi_core::format::format_number(current))).hint(s.items_opening_read_only).into_any_element()
                };
                let photo_actions = div()
                    .flex()
                    .gap(px(theme::SPACE_2))
                    .child(Button::new("photo-choose").outline().label(s.ui_browse).on_click(cx.listener(|this, _, window, cx| this.choose_file(window, cx))))
                    .when(self.editing.as_ref().is_some_and(|i| i.photo_version.is_some()) && !self.remove_photo, |d| {
                        d.child(Button::new("photo-remove").outline().label(s.items_photo_remove).on_click(cx.listener(|this, _, _, cx| {
                            this.remove_photo = true;
                            this.photo = None;
                            cx.notify();
                        })))
                    });
                div()
                    .flex()
                    .flex_col()
                    .gap(px(theme::SPACE_4))
                    .max_w(px(theme::FORM_MAX_WIDTH))
                    .child(section(cx, s.items_section_basic))
                    .child(FormField::new(s.items_field_code.to_string(), div().text_size(px(theme::TEXT_BODY)).text_color(color(cx, Token::MutedForeground)).child(code)).hint(s.items_code_hint))
                    .child(self.field(s.fields_name, "name", Input::new(&self.name)).required())
                    .child(self.field(s.fields_category, "category", Select::new(&sel.category).placeholder(s.validation_select_category)).required())
                    .child(self.field(s.fields_subcategory, "subcategory", Select::new(&sel.subcategory).placeholder(s.validation_select_subcategory)).required())
                    .child(self.field(s.fields_unit, "unit", Select::new(&sel.unit).placeholder(s.validation_select_unit)).required())
                    .child(section(cx, s.items_section_stock))
                    .child(stock_field)
                    .child(self.field(s.fields_minimum_stock, "minimum", Input::new(&self.minimum)).hint(s.items_minimum_hint).required())
                    .child(section(cx, s.items_section_purchasing))
                    .child(self.field(s.fields_last_price, "price", Input::new(&self.price)))
                    .child(self.field(s.fields_preferred_supplier, "supplier", Select::new(&sel.supplier)))
                    .child(self.field(s.fields_location, "location", Input::new(&self.location)))
                    .child(self.field(s.common_notes, "notes", Input::new(&self.notes)))
                    .child(section(cx, s.items_field_photo))
                    .child(
                        div()
                            .flex()
                            .gap(px(theme::SPACE_4))
                            .child(PhotoView::new(self.photo.clone(), s.items_photo_none))
                            .child(
                                div()
                                    .flex()
                                    .flex_col()
                                    .flex_1()
                                    .gap(px(theme::SPACE_2))
                                    .child(self.field(s.ui_file_path, "photo", Input::new(&self.photo_path)).hint(s.items_photo_hint))
                                    .child(photo_actions),
                            ),
                    )
                    .children(self.form_error.clone().map(|e| {
                        div().px(px(theme::SPACE_3)).py(px(theme::SPACE_2)).rounded(px(theme::RADIUS)).bg(color(cx, Token::DangerSoft)).text_size(px(theme::TEXT_TABLE)).text_color(color(cx, Token::Foreground)).child(e)
                    }))
                    .child(
                        div()
                            .flex()
                            .gap(px(theme::SPACE_2))
                            .child(Button::new("item-save").primary().label(if self.busy { s.common_saving } else { s.items_save_item }).disabled(self.busy).on_click(cx.listener(|this, _, window, cx| this.save(window, cx))))
                            .child(Button::new("item-cancel").outline().label(s.common_cancel).disabled(self.busy).on_click({
                                let done = self.on_done.clone();
                                move |_, w, cx| done(None, w, cx)
                            })),
                    )
                    .into_any_element()
            }
            _ => div().into_any_element(),
        };
        div().flex().flex_col().gap(px(theme::SPACE_4)).child(head).child(body)
    }
}
