//! Categories, subcategories and suppliers (Admin only): a searchable list and one add or edit form for all three.
//! Same fields, rules and messages as the web pages; the server decides what may be deleted ("in use" is its answer).
//! shortcut: a row opens the edit form, which also holds Deactivate/Activate and Delete (the web has a row menu);
//! description and notes are single-line inputs and there is no status filter (all records are listed, inactive ones are tagged).

use std::rc::Rc;
use std::sync::Arc;

use ezi_core::api::{ApiError, Client, ListMeta};
use ezi_core::forms::{self, Errors, SupplierFields};
use ezi_core::format::format_number;
use ezi_core::i18n::{self, error_message, Strings};
use ezi_core::models::{GroupInput, GroupRow, SupplierInput, SupplierRow};
use ezi_core::theme::{self, Token};
use gpui_kit::component::button::*;
use gpui_kit::component::input::{Input, InputEvent, InputState};
use gpui_kit::component::Disableable;
use gpui_kit::prelude::*;
use gpui_kit::*;

use crate::load::Load;
use crate::state::{color, state, t};
use crate::widgets::{confirm, toast, Badge, Callback, Cell, Column, DataTable, FormField, Paging, StatePanel, Tone, ToastKind};

/// Rows per page: the dense layout of the redesign (PRD_REDESIGN.md 10.2).
const PAGE_SIZE: u32 = 8;

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    Category,
    Subcategory,
    Supplier,
}

impl Kind {
    fn base(self) -> &'static str {
        match self {
            Kind::Category => "/categories",
            Kind::Subcategory => "/subcategories",
            Kind::Supplier => "/suppliers",
        }
    }
}

/// The texts that differ per kind (all of them are the web app's texts).
struct Words {
    add: &'static str,
    add_title: &'static str,
    edit_title: &'static str,
    save: &'static str,
    saved: &'static str,
    search: &'static str,
    empty_title: &'static str,
    empty_body: &'static str,
    code_hint: &'static str,
    deactivate_body: &'static str,
    activate_body: &'static str,
    delete_body: &'static str,
    deactivated: &'static str,
    activated: &'static str,
    deleted: &'static str,
}

fn words(kind: Kind, s: &Strings) -> Words {
    match kind {
        Kind::Category => Words { add: s.categories_add, add_title: s.categories_add_title, edit_title: s.categories_edit_title, save: s.categories_save, saved: s.categories_saved, search: s.categories_search_placeholder, empty_title: s.categories_empty_title, empty_body: s.categories_empty_body, code_hint: s.categories_code_hint, deactivate_body: s.categories_deactivate_body, activate_body: s.categories_activate_body, delete_body: s.categories_delete_body, deactivated: s.categories_deactivated, activated: s.categories_activated, deleted: s.categories_deleted },
        Kind::Subcategory => Words { add: s.subcategories_add, add_title: s.subcategories_add_title, edit_title: s.subcategories_edit_title, save: s.subcategories_save, saved: s.subcategories_saved, search: s.subcategories_search_placeholder, empty_title: s.subcategories_empty_title, empty_body: s.subcategories_empty_body, code_hint: s.subcategories_code_hint, deactivate_body: s.subcategories_deactivate_body, activate_body: s.subcategories_activate_body, delete_body: s.subcategories_delete_body, deactivated: s.subcategories_deactivated, activated: s.subcategories_activated, deleted: s.subcategories_deleted },
        Kind::Supplier => Words { add: s.suppliers_add, add_title: s.suppliers_add_title, edit_title: s.suppliers_edit_title, save: s.suppliers_save, saved: s.suppliers_saved, search: s.suppliers_search_placeholder, empty_title: s.suppliers_empty_title, empty_body: s.suppliers_empty_body, code_hint: "", deactivate_body: s.suppliers_deactivate_body, activate_body: s.suppliers_activate_body, delete_body: s.suppliers_delete_body, deactivated: s.suppliers_deactivated, activated: s.suppliers_activated, deleted: s.suppliers_deleted },
    }
}

#[derive(Clone)]
enum Record {
    Group(GroupRow),
    Supplier(SupplierRow),
}

impl Record {
    fn id(&self) -> i64 {
        match self {
            Record::Group(g) => g.id,
            Record::Supplier(s) => s.id,
        }
    }
    fn name(&self) -> &str {
        match self {
            Record::Group(g) => &g.name,
            Record::Supplier(s) => &s.name,
        }
    }
    fn status(&self) -> &str {
        match self {
            Record::Group(g) => &g.status,
            Record::Supplier(s) => &s.status,
        }
    }
}

enum Body {
    Group(GroupInput),
    Supplier(SupplierInput),
}

// ------------------------------------------------------------------ the form

struct Field {
    /// The name the server uses for the field, so a server message lands at the right input.
    key: &'static str,
    label: &'static str,
    hint: Option<&'static str>,
    required: bool,
    input: Entity<InputState>,
}

struct MasterForm {
    client: Arc<Client>,
    kind: Kind,
    editing: Option<Record>,
    fields: Vec<Field>,
    errors: Errors,
    form_error: Option<SharedString>,
    busy: bool,
    on_done: Callback,
    _subscriptions: Vec<Subscription>,
}

impl MasterForm {
    fn new(client: Arc<Client>, kind: Kind, editing: Option<Record>, on_done: Callback, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let s = t(cx);
        let w = words(kind, s);
        let text = |window: &mut Window, cx: &mut Context<Self>, value: &str| cx.new(|cx| InputState::new(window, cx).default_value(value.to_string()));
        let field = |window: &mut Window, cx: &mut Context<Self>, key, label, hint, required, value: &str| Field { key, label, hint, required, input: text(window, cx, value) };
        let fields = match (kind, &editing) {
            (Kind::Supplier, e) => {
                let v = match e {
                    Some(Record::Supplier(r)) => [r.name.as_str(), r.contact_person.as_str(), r.phone.as_str(), r.email.as_str(), r.address.as_str(), r.notes.as_str()],
                    _ => [""; 6],
                };
                vec![
                    field(window, cx, "name", s.fields_name, None, true, v[0]),
                    field(window, cx, "contactPerson", s.fields_contact_person, None, false, v[1]),
                    field(window, cx, "phone", s.fields_phone, None, false, v[2]),
                    field(window, cx, "email", s.fields_email, None, false, v[3]),
                    field(window, cx, "address", s.fields_address, None, false, v[4]),
                    field(window, cx, "notes", s.common_notes, None, false, v[5]),
                ]
            }
            (_, e) => {
                let v = match e {
                    Some(Record::Group(r)) => [r.name.as_str(), r.code.as_str(), r.description.as_str()],
                    _ => [""; 3],
                };
                vec![
                    field(window, cx, "name", s.fields_name, None, true, v[0]),
                    field(window, cx, "code", s.fields_code, Some(w.code_hint), true, v[1]),
                    field(window, cx, "description", s.fields_description, None, false, v[2]),
                ]
            }
        };
        let mut subs = Vec::new();
        for f in &fields {
            subs.push(cx.subscribe_in(&f.input, window, |this, _, ev: &InputEvent, window, cx| {
                if let InputEvent::PressEnter { .. } = ev {
                    this.save(window, cx);
                }
            }));
        }
        MasterForm { client, kind, editing, fields, errors: Errors::new(), form_error: None, busy: false, on_done, _subscriptions: subs }
    }

    fn value(&self, key: &str, cx: &App) -> String {
        self.fields.iter().find(|f| f.key == key).map(|f| f.input.read(cx).value().to_string()).unwrap_or_default()
    }

    fn save(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.busy {
            return;
        }
        let lang = state(cx).lang;
        let status = self.editing.as_ref().map_or("Active", |r| r.status()).to_string();
        let built = match self.kind {
            Kind::Supplier => {
                let (name, contact, phone, email, address, notes) = (self.value("name", cx), self.value("contactPerson", cx), self.value("phone", cx), self.value("email", cx), self.value("address", cx), self.value("notes", cx));
                forms::supplier(lang, &SupplierFields { name: &name, contact_person: &contact, phone: &phone, email: &email, address: &address, notes: &notes }, &status).map(Body::Supplier)
            }
            _ => forms::group(lang, &self.value("name", cx), &self.value("code", cx), &self.value("description", cx), &status).map(Body::Group),
        };
        let body = match built {
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
        let (client, base, id) = (self.client.clone(), self.kind.base(), self.editing.as_ref().map(Record::id));
        cx.spawn_in(window, async move |this, cx| {
            let result = cx
                .background_executor()
                .spawn(async move {
                    match body {
                        Body::Group(b) => client.save_record(base, id, &b),
                        Body::Supplier(b) => client.save_record(base, id, &b),
                    }
                })
                .await;
            this.update_in(cx, |this, window, cx| {
                this.busy = false;
                match result {
                    Ok(()) => {
                        let text = words(this.kind, t(cx)).saved;
                        toast(window, cx, ToastKind::Success, text);
                        (this.on_done.clone())(window, cx);
                    }
                    Err(e) => this.show_failure(&e, cx),
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
    }

    fn show_failure(&mut self, error: &ApiError, cx: &App) {
        self.errors = error.fields().into_iter().filter_map(|(k, v)| Some((self.fields.iter().find(|f| f.key == k)?.key, v))).collect();
        self.form_error = Some(error_message(state(cx).lang, error).into());
    }

    fn confirm_status(&mut self, active: bool, window: &mut Window, cx: &mut Context<Self>) {
        let Some(record) = self.editing.clone() else { return };
        let (s, lang) = (t(cx), state(cx).lang);
        let w = words(self.kind, s);
        let this = cx.entity();
        let (title, body, label) = if active { (i18n::activate_title(lang, record.name()), w.activate_body, s.items_activate) } else { (i18n::deactivate_title(lang, record.name()), w.deactivate_body, s.items_deactivate) };
        confirm(window, cx, title, body, label, false, move |window, cx| {
            this.update(cx, |form, cx| form.run(false, active, window, cx));
        });
    }

    fn confirm_delete(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let Some(record) = self.editing.clone() else { return };
        let (s, lang) = (t(cx), state(cx).lang);
        let this = cx.entity();
        confirm(window, cx, i18n::delete_title(lang, record.name()), words(self.kind, s).delete_body, s.common_delete, true, move |window, cx| {
            this.update(cx, |form, cx| form.run(true, false, window, cx));
        });
    }

    /// Deletes the record (`delete`) or sets it active or inactive. A refusal such as "in use" is shown as the server words it.
    fn run(&mut self, delete: bool, active: bool, window: &mut Window, cx: &mut Context<Self>) {
        let Some(id) = self.editing.as_ref().map(Record::id) else { return };
        let (client, base) = (self.client.clone(), self.kind.base());
        cx.spawn_in(window, async move |this, cx| {
            let result = cx.background_executor().spawn(async move { if delete { client.delete_record(base, id) } else { client.set_record_active(base, id, active) } }).await;
            this.update_in(cx, |this, window, cx| match result {
                Ok(()) => {
                    let w = words(this.kind, t(cx));
                    toast(window, cx, ToastKind::Success, if delete { w.deleted } else if active { w.activated } else { w.deactivated });
                    (this.on_done.clone())(window, cx);
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

impl Render for MasterForm {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let s = t(cx);
        let w = words(self.kind, s);
        let editing = self.editing.is_some();
        let active = self.editing.as_ref().is_some_and(|r| r.status() == "Active");
        let fields = self.fields.iter().map(|f| {
            let mut field = FormField::new(f.label.to_string(), Input::new(&f.input)).error(self.errors.get(f.key).cloned());
            if f.required {
                field = field.required();
            }
            if let Some(hint) = f.hint {
                field = field.hint(hint);
            }
            field
        });
        div()
            .flex()
            .flex_col()
            .gap(px(theme::SPACE_4))
            .max_w(px(theme::FORM_MAX_WIDTH))
            .child(div().text_size(px(theme::TEXT_TITLE)).font_weight(FontWeight::SEMIBOLD).child(if editing { w.edit_title } else { w.add_title }))
            .children(fields)
            // A message that belongs to one field is shown there only; this banner is for what belongs to no field.
            .children(self.form_error.clone().filter(|_| self.errors.is_empty()).map(|e| {
                div().px(px(theme::SPACE_3)).py(px(theme::SPACE_2)).rounded(px(theme::RADIUS)).bg(color(cx, Token::DangerSoft)).text_size(px(theme::TEXT_TABLE)).text_color(color(cx, Token::Foreground)).child(e)
            }))
            .child(
                div()
                    .flex()
                    .flex_wrap()
                    .gap(px(theme::SPACE_2))
                    .child(Button::new("master-save").primary().label(if self.busy { s.common_saving } else { w.save }).disabled(self.busy).on_click(cx.listener(|this, _, window, cx| this.save(window, cx))))
                    .child(Button::new("master-cancel").outline().label(s.common_cancel).disabled(self.busy).on_click({
                        let done = self.on_done.clone();
                        move |_, w, cx| done(w, cx)
                    }))
                    .when(editing, |d| {
                        d.child(Button::new("master-status").outline().label(if active { s.items_deactivate } else { s.items_activate }).on_click(cx.listener(move |this, _, window, cx| this.confirm_status(!active, window, cx))))
                            .child(Button::new("master-delete").danger().label(s.common_delete).on_click(cx.listener(|this, _, window, cx| this.confirm_delete(window, cx))))
                    }),
            )
    }
}

// ------------------------------------------------------------------ the list

enum Rows {
    Groups(Vec<GroupRow>),
    Suppliers(Vec<SupplierRow>),
}

/// Area and kind lists (two tabs) when built with `Kind::Category`, the supplier list with `Kind::Supplier`.
pub struct MasterPage {
    client: Arc<Client>,
    tabs: bool,
    kind: Kind,
    search: Entity<InputState>,
    page: u32,
    list: Load<(Rows, ListMeta)>,
    generation: u32,
    form: Option<Entity<MasterForm>>,
    _subscriptions: Vec<Subscription>,
}

impl MasterPage {
    pub fn new(client: Arc<Client>, kind: Kind, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let search = cx.new(|cx| InputState::new(window, cx).placeholder(words(kind, t(cx)).search.to_string()));
        let sub = cx.subscribe_in(&search, window, |this, _, ev: &InputEvent, _, cx| {
            if let InputEvent::Change = ev {
                this.page = 1;
                this.fetch(cx);
            }
        });
        let mut page = MasterPage { client, tabs: kind != Kind::Supplier, kind, search, page: 1, list: Load::Loading, generation: 0, form: None, _subscriptions: vec![sub] };
        page.fetch(cx);
        page
    }

    /// Back to the list, with the rows fetched again (the shell calls this when the page is opened).
    pub fn show_list(&mut self, cx: &mut Context<Self>) {
        self.form = None;
        self.fetch(cx);
    }

    fn fetch(&mut self, cx: &mut Context<Self>) {
        self.generation += 1;
        let generation = self.generation;
        let (client, kind, page) = (self.client.clone(), self.kind, self.page);
        let search = self.search.read(cx).value().trim().to_string();
        if !matches!(self.list, Load::Ready(_)) {
            self.list = Load::Loading;
        }
        cx.notify();
        cx.spawn(async move |this, cx| {
            let result = cx
                .background_executor()
                .spawn(async move {
                    let page = page.to_string();
                    let size = PAGE_SIZE.to_string();
                    let mut query = vec![("page", page.as_str()), ("pageSize", size.as_str()), ("sort", "name:asc")];
                    if !search.is_empty() {
                        query.push(("search", search.as_str()));
                    }
                    let meta = |m: Option<ListMeta>, n: usize| m.unwrap_or(ListMeta { page: 1, page_size: PAGE_SIZE, total: n as u32 });
                    match kind {
                        Kind::Supplier => client.get::<Vec<SupplierRow>>(kind.base(), &query).map(|s| (meta(s.meta, s.data.len()), Rows::Suppliers(s.data))),
                        _ => client.get::<Vec<GroupRow>>(kind.base(), &query).map(|s| (meta(s.meta, s.data.len()), Rows::Groups(s.data))),
                    }
                    .map(|(m, rows)| (rows, m))
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

    fn switch(&mut self, kind: Kind, window: &mut Window, cx: &mut Context<Self>) {
        if self.kind == kind {
            return;
        }
        self.kind = kind;
        self.page = 1;
        self.list = Load::Loading;
        // Each tab starts with an empty search (like the web page); the placeholder names the kind.
        let placeholder = words(kind, t(cx)).search.to_string();
        self.search.update(cx, |s, cx| {
            s.set_value("", window, cx);
            s.set_placeholder(placeholder, window, cx);
        });
        self.fetch(cx);
    }

    fn open_form(&mut self, record: Option<Record>, window: &mut Window, cx: &mut Context<Self>) {
        let (client, kind) = (self.client.clone(), self.kind);
        let this = cx.entity().downgrade();
        let done: Callback = Rc::new(move |_window, cx| {
            this.update(cx, |page, cx| page.show_list(cx)).ok();
        });
        self.form = Some(cx.new(|cx| MasterForm::new(client, kind, record, done, window, cx)));
        cx.notify();
    }

    fn render_list(&mut self, cx: &mut Context<Self>) -> AnyElement {
        let s = t(cx);
        let lang = state(cx).lang;
        let w = words(self.kind, s);
        let this = cx.entity();
        let searching = !self.search.read(cx).value().trim().is_empty();

        let empty = |cx: &mut Context<Self>| -> AnyElement {
            if searching {
                StatePanel::message(cx, s.states_empty_title, "").into_any_element()
            } else {
                let this = cx.entity();
                StatePanel::action(w.empty_title, w.empty_body, w.add, move |window, cx| this.update(cx, |p, cx| p.open_form(None, window, cx))).into_any_element()
            }
        };
        let tag = |status: &str| -> Cell {
            if status == "Active" { Badge::new(Tone::Success, s.ui_active_tag).into() } else { Badge::new(Tone::Neutral, s.items_inactive_tag).into() }
        };

        let body: AnyElement = match &self.list {
            Load::Loading => StatePanel::loading(cx).into_any_element(),
            Load::Failed(e) => {
                let message = error_message(lang, e);
                let this = this.clone();
                StatePanel::error(cx, message, move |_, cx| this.update(cx, |p, cx| p.fetch(cx))).into_any_element()
            }
            Load::Ready((rows, meta)) => {
                let (columns, cells, records): (Vec<Column>, Vec<Vec<Cell>>, Vec<Record>) = match rows {
                    Rows::Groups(groups) => (
                        vec![Column::new(s.categories_col_name), Column::new(s.categories_col_code).width(90.), Column::new(s.categories_col_description), Column::new(s.categories_col_items).right().width(90.), Column::new(s.common_status).width(120.)],
                        groups.iter().map(|g| vec![g.name.clone().into(), g.code.clone().into(), g.description.clone().into(), format_number(g.item_count).into(), tag(&g.status)]).collect(),
                        groups.iter().cloned().map(Record::Group).collect(),
                    ),
                    Rows::Suppliers(suppliers) => (
                        vec![Column::new(s.suppliers_col_name), Column::new(s.suppliers_col_contact).width(150.), Column::new(s.suppliers_col_phone).width(130.), Column::new(s.suppliers_col_email), Column::new(s.suppliers_col_items).width(130.), Column::new(s.common_status).width(120.)],
                        suppliers.iter().map(|r| vec![r.name.clone().into(), dash(&r.contact_person).into(), dash(&r.phone).into(), dash(&r.email).into(), i18n::supplier_items_count(lang, r.item_count).into(), tag(&r.status)]).collect(),
                        suppliers.iter().cloned().map(Record::Supplier).collect(),
                    ),
                };
                let (this_page, this_row) = (this.clone(), this.clone());
                DataTable::new("master", columns)
                    .rows(cells)
                    .empty(empty(cx))
                    .paging(Paging { page: meta.page, page_size: meta.page_size, total: meta.total }, move |p, _, cx| {
                        this_page.update(cx, |page, cx| {
                            page.page = p;
                            page.fetch(cx);
                        })
                    })
                    .on_row_click(move |i, window, cx| {
                        if let Some(record) = records.get(i).cloned() {
                            this_row.update(cx, |page, cx| page.open_form(Some(record), window, cx));
                        }
                    })
                    .into_any_element()
            }
        };

        let (title, description) = if self.tabs { (s.categories_title, s.categories_description) } else { (s.suppliers_title, s.suppliers_description) };
        let tab = |id: &'static str, label: &'static str, kind: Kind, cx: &mut Context<Self>| {
            let b = Button::new(id).label(label).on_click(cx.listener(move |this, _, window, cx| this.switch(kind, window, cx)));
            if self.kind == kind { b.primary() } else { b.outline() }
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
                            .child(div().text_size(px(theme::TEXT_TITLE)).font_weight(FontWeight::SEMIBOLD).child(title))
                            .child(div().text_size(px(theme::TEXT_BODY)).text_color(color(cx, Token::MutedForeground)).child(description)),
                    )
                    .child(Button::new("master-add").primary().label(w.add).on_click(cx.listener(|this, _, window, cx| this.open_form(None, window, cx)))),
            )
            .when(self.tabs, |d| {
                d.child(div().flex().gap(px(theme::SPACE_2)).child(tab("tab-categories", s.categories_tab_categories, Kind::Category, cx)).child(tab("tab-subcategories", s.categories_tab_subcategories, Kind::Subcategory, cx)))
            })
            .child(div().w(px(theme::FILTER_SEARCH_WIDTH)).child(Input::new(&self.search)))
            .child(body)
            .into_any_element()
    }
}

fn dash(text: &str) -> String {
    if text.is_empty() { "-".into() } else { text.to_string() }
}

impl Render for MasterPage {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        match self.form.clone() {
            Some(form) => form.into_any_element(),
            None => self.render_list(cx),
        }
    }
}
