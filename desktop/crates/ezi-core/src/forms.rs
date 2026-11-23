//! Form checks before anything is sent, with the same rules and messages as the web app (`frontend/src/lib/schemas.ts`).
//! The server checks everything again; this only saves a round trip and gives the message at the right field.

use std::collections::BTreeMap;

use crate::api::Lang;
use crate::i18n::{at_least, greater_than_zero, required, strings, too_long, whole_number};
use crate::models::{AdjustmentInput, GroupInput, ItemInput, LoanInput, NewItemInput, PurchaseInput, PurchaseLineInput, ReceiveInput, ReceiveLineInput, ReturnInput, StockLineInput, StockMoveInput, SupplierInput};

/// Field key to message. An empty map means the form is valid.
pub type Errors = BTreeMap<&'static str, String>;

/// `/^\S+@\S+\.\S+$/`: no spaces, and an `@` followed by a `.` that has something on both sides.
pub fn looks_like_email(s: &str) -> bool {
    if s.is_empty() || s.chars().any(char::is_whitespace) {
        return false;
    }
    s.match_indices('@').any(|(i, _)| {
        let (local, domain) = (&s[..i], &s[i + 1..]);
        !local.is_empty() && domain.char_indices().any(|(j, c)| c == '.' && j > 0 && j + 1 < domain.len())
    })
}

fn password_ok(p: &str) -> bool {
    (8..=200).contains(&p.chars().count())
}

pub fn login(lang: Lang, email: &str, password: &str) -> Errors {
    let s = strings(lang);
    let mut e = Errors::new();
    if email.trim().is_empty() {
        e.insert("email", required(lang, s.fields_email));
    }
    if password.is_empty() {
        e.insert("password", required(lang, s.fields_password));
    }
    e
}

pub fn first_admin(lang: Lang, name: &str, email: &str, password: &str, confirm: &str) -> Errors {
    let s = strings(lang);
    let mut e = Errors::new();
    if name.trim().is_empty() {
        e.insert("name", required(lang, s.fields_full_name));
    }
    if email.trim().is_empty() {
        e.insert("email", required(lang, s.fields_email));
    } else if !looks_like_email(email.trim()) {
        e.insert("email", s.validation_email.to_string());
    }
    new_password(lang, password, confirm, &mut e);
    e
}

/// The new password and its confirmation (the current password is checked by the server).
pub fn change_password(lang: Lang, password: &str, confirm: &str) -> Errors {
    let mut e = Errors::new();
    new_password(lang, password, confirm, &mut e);
    e
}

fn new_password(lang: Lang, password: &str, confirm: &str, e: &mut Errors) {
    let s = strings(lang);
    if !password_ok(password) {
        e.insert("password", s.validation_password_length.to_string());
    } else if password != confirm {
        e.insert("confirm", s.validation_password_match.to_string());
    }
}

/// The units an item can have (`UNITS` in `frontend/src/lib/constants.ts`; a test compares them).
pub const UNITS: [&str; 9] = ["pcs", "box", "pack", "unit", "ream", "bottle", "set", "roll", "pair"];

/// The raw values of the item form, as typed or chosen.
pub struct ItemFields<'a> {
    pub name: &'a str,
    pub category_id: Option<i64>,
    pub subcategory_id: Option<i64>,
    pub unit: &'a str,
    pub opening_stock: &'a str,
    pub minimum_stock: &'a str,
    pub last_price: &'a str,
    pub supplier_id: Option<i64>,
    pub location: &'a str,
    pub status: &'a str,
    pub notes: &'a str,
}

/// A whole number of at least 0, typed as digits only. Empty is "required".
fn whole(lang: Lang, label: &str, raw: &str, errors: &mut Errors, key: &'static str) -> i64 {
    let raw = raw.trim();
    if raw.is_empty() {
        errors.insert(key, required(lang, label));
        return 0;
    }
    if !raw.bytes().all(|b| b.is_ascii_digit()) {
        errors.insert(key, whole_number(lang, label));
        return 0;
    }
    match raw.parse::<i64>() {
        Ok(n) if n <= 1_000_000_000 => n,
        _ => {
            errors.insert(key, at_least(lang, label, 0)); // too large to be a real count: refused like the server does
            0
        }
    }
}

/// Checks the item form like the web `itemSchema` and builds the body for the server.
/// `creating` decides whether the opening stock is read (it cannot be changed after creation).
pub fn item(lang: Lang, f: &ItemFields, creating: bool) -> Result<ItemInput, Errors> {
    let s = strings(lang);
    let mut e = Errors::new();
    let name = f.name.trim();
    if name.is_empty() {
        e.insert("name", required(lang, s.fields_name));
    } else if name.chars().count() > 150 {
        e.insert("name", too_long(lang, s.fields_name, 150));
    }
    if f.category_id.is_none() {
        e.insert("category", s.validation_select_category.to_string());
    }
    if f.subcategory_id.is_none() {
        e.insert("subcategory", s.validation_select_subcategory.to_string());
    }
    if !UNITS.contains(&f.unit) {
        e.insert("unit", s.validation_select_unit.to_string());
    }
    let opening = if creating { whole(lang, s.fields_opening_stock, f.opening_stock, &mut e, "opening") } else { 0 };
    let minimum = whole(lang, s.fields_minimum_stock, f.minimum_stock, &mut e, "minimum");
    let price = whole(lang, s.fields_last_price, f.last_price, &mut e, "price");
    let location = f.location.trim();
    if location.chars().count() > 100 {
        e.insert("location", too_long(lang, s.fields_location, 100));
    }
    if !e.is_empty() {
        return Err(e);
    }
    Ok(ItemInput {
        name: name.to_string(),
        category_id: f.category_id.unwrap_or_default(),
        subcategory_id: f.subcategory_id.unwrap_or_default(),
        unit: f.unit.to_string(),
        opening_stock: opening,
        minimum_stock: minimum,
        last_purchase_price: price,
        supplier_id: f.supplier_id,
        location: location.to_string(),
        status: if f.status == "Inactive" { "Inactive" } else { "Active" }.to_string(),
        notes: f.notes.trim().to_string(),
    })
}

/// Field key to message for the forms with item lines: keys like `lines.0.quantity` are made as the form is checked.
pub type FieldErrors = BTreeMap<String, String>;

/// One line as typed or chosen.
pub struct LineFields<'a> {
    pub item_id: Option<i64>,
    pub quantity: &'a str,
    pub unit_price: &'a str,
}

/// A whole number of at least `min` (0 or 1), like the web's `wholeNumber`: empty is "required", `min` 1 says "greater than 0".
fn whole_at_least(lang: Lang, label: &str, raw: &str, min: i64) -> Result<i64, String> {
    let raw = raw.trim();
    if raw.is_empty() {
        return Err(required(lang, label));
    }
    if !raw.bytes().all(|b| b.is_ascii_digit()) {
        return Err(whole_number(lang, label));
    }
    match raw.parse::<i64>() {
        Ok(n) if n >= min && n <= 1_000_000_000 => Ok(n),
        _ if min == 0 => Err(at_least(lang, label, 0)),
        _ => Err(greater_than_zero(lang, label)),
    }
}

fn date_field(lang: Lang, raw: &str, e: &mut FieldErrors) {
    date_field_as(lang, "date", strings(lang).fields_date, raw, e);
}

fn date_field_as(lang: Lang, key: &str, label: &str, raw: &str, e: &mut FieldErrors) {
    if raw.trim().is_empty() {
        e.insert(key.into(), required(lang, label));
    } else if !crate::format::is_date(raw.trim()) {
        e.insert(key.into(), strings(lang).ui_invalid_date.to_string());
    }
}

fn check_lines(lang: Lang, lines: &[LineFields], with_price: bool, e: &mut FieldErrors) -> Vec<StockLineInput> {
    let s = strings(lang);
    if lines.is_empty() {
        e.insert("lines".into(), s.validation_at_least_one_line.to_string());
    }
    let mut out = Vec::new();
    for (i, l) in lines.iter().enumerate() {
        let mut ok = true;
        if l.item_id.is_none() {
            e.insert(format!("lines.{i}.itemId"), s.validation_select_item.to_string());
            ok = false;
        }
        let quantity = whole_at_least(lang, s.fields_quantity, l.quantity, 1).map_err(|m| e.insert(format!("lines.{i}.quantity"), m)).ok();
        let price = if with_price { whole_at_least(lang, s.fields_unit_price, l.unit_price, 0).map_err(|m| e.insert(format!("lines.{i}.unitPrice"), m)).ok() } else { Some(0) };
        if let (true, Some(quantity), Some(price), Some(item_id)) = (ok, quantity, price, l.item_id) {
            out.push(StockLineInput { item_id, quantity, unit_price: with_price.then_some(price) });
        }
    }
    out
}

/// Incoming stock (`incomingSchema`): a date, a supplier, one or more lines with quantity and unit price.
pub fn stock_in(lang: Lang, date: &str, supplier_id: Option<i64>, lines: &[LineFields], notes: &str, request_id: &str) -> Result<StockMoveInput, FieldErrors> {
    let s = strings(lang);
    let mut e = FieldErrors::new();
    date_field(lang, date, &mut e);
    if supplier_id.is_none() {
        e.insert("supplierId".into(), s.validation_select_supplier.to_string());
    }
    let checked = check_lines(lang, lines, true, &mut e);
    if !e.is_empty() {
        return Err(e);
    }
    Ok(StockMoveInput { date: date.trim().to_string(), supplier_id, destination: None, lines: checked, notes: notes.trim().to_string(), client_request_id: request_id.to_string() })
}

/// Outgoing stock (`outgoingSchema`): a date, a destination, lines with a quantity.
pub fn stock_out(lang: Lang, date: &str, destination: &str, lines: &[LineFields], notes: &str, request_id: &str) -> Result<StockMoveInput, FieldErrors> {
    let s = strings(lang);
    let mut e = FieldErrors::new();
    date_field(lang, date, &mut e);
    if destination.trim().is_empty() {
        e.insert("destination".into(), required(lang, s.fields_destination));
    }
    let checked = check_lines(lang, lines, false, &mut e);
    if !e.is_empty() {
        return Err(e);
    }
    Ok(StockMoveInput { date: date.trim().to_string(), supplier_id: None, destination: Some(destination.trim().to_string()), lines: checked, notes: notes.trim().to_string(), client_request_id: request_id.to_string() })
}

/// A stock adjustment (`adjustmentSchema`): the counted stock must differ from the system stock.
pub fn adjustment(lang: Lang, date: &str, item_id: Option<i64>, physical: &str, system_stock: i64, reason: &str, request_id: &str) -> Result<AdjustmentInput, FieldErrors> {
    let s = strings(lang);
    let mut e = FieldErrors::new();
    date_field(lang, date, &mut e);
    if item_id.is_none() {
        e.insert("itemId".into(), s.validation_select_item.to_string());
    }
    let counted = whole_at_least(lang, s.fields_physical_stock, physical, 0).map_err(|m| e.insert("physical".into(), m)).ok();
    if counted == Some(system_stock) && item_id.is_some() {
        e.insert("physical".into(), s.validation_difference_zero.to_string());
    }
    if reason.trim().is_empty() {
        e.insert("reason".into(), required(lang, s.fields_reason));
    }
    match (e.is_empty(), item_id, counted) {
        (true, Some(item_id), Some(physical)) => Ok(AdjustmentInput { date: date.trim().to_string(), item_id, physical, reason: reason.trim().to_string(), client_request_id: request_id.to_string() }),
        _ => Err(e),
    }
}

/// A loan request or draft (`loanSchema`): borrower, lines with a quantity, both dates, a purpose. Nothing here decides
/// whether the stock is enough: that is the server's rule (BR-08) and comes back as its message.
#[allow(clippy::too_many_arguments)]
pub fn loan(lang: Lang, borrower_id: Option<i64>, lines: &[LineFields], loan_date: &str, expected: &str, purpose: &str, notes: &str, submit: bool, request_id: Option<&str>) -> Result<LoanInput, FieldErrors> {
    let s = strings(lang);
    let mut e = FieldErrors::new();
    if borrower_id.is_none() {
        e.insert("borrowerId".into(), s.validation_select_borrower.to_string());
    }
    let checked = check_lines(lang, lines, false, &mut e);
    for (key, raw, label) in [("loanDate", loan_date, s.fields_loan_date), ("expectedReturnDate", expected, s.fields_expected_return)] {
        if raw.trim().is_empty() {
            e.insert(key.into(), required(lang, label));
        } else if !crate::format::is_date(raw.trim()) {
            e.insert(key.into(), s.ui_invalid_date.to_string());
        }
    }
    if !e.contains_key("loanDate") && !e.contains_key("expectedReturnDate") && expected.trim() < loan_date.trim() {
        e.insert("expectedReturnDate".into(), s.validation_expected_after_loan.to_string());
    }
    if purpose.trim().is_empty() {
        e.insert("purpose".into(), required(lang, s.fields_purpose));
    }
    match (e.is_empty(), borrower_id) {
        (true, Some(borrower_id)) => Ok(LoanInput {
            borrower_id,
            lines: checked,
            loan_date: loan_date.trim().to_string(),
            expected_return_date: expected.trim().to_string(),
            purpose: purpose.trim().to_string(),
            notes: notes.trim().to_string(),
            submit,
            client_request_id: request_id.map(String::from),
        }),
        _ => Err(e),
    }
}

/// The return of a loan (`returnSchema`): a date and an optional note. The date limits are the server's.
pub fn loan_return(lang: Lang, date: &str, notes: &str) -> Result<ReturnInput, FieldErrors> {
    let mut e = FieldErrors::new();
    date_field_as(lang, "returnDate", strings(lang).fields_return_date, date, &mut e);
    if !e.is_empty() {
        return Err(e);
    }
    Ok(ReturnInput { return_date: date.trim().to_string(), notes: notes.trim().to_string() })
}

/// One purchase line as typed: an existing item, or a new one (name, area, kind, unit).
pub struct PurchaseLineFields<'a> {
    pub is_new: bool,
    pub item_id: Option<i64>,
    pub quantity: &'a str,
    pub name: &'a str,
    pub category_id: Option<i64>,
    pub subcategory_id: Option<i64>,
    pub unit: &'a str,
}

/// A purchase request or draft (`purchaseSchema`).
#[allow(clippy::too_many_arguments)]
pub fn purchase(lang: Lang, requester_id: Option<i64>, lines: &[PurchaseLineFields], needed_by: &str, reason: &str, notes: &str, submit: bool, request_id: Option<&str>) -> Result<PurchaseInput, FieldErrors> {
    let s = strings(lang);
    let mut e = FieldErrors::new();
    if requester_id.is_none() {
        e.insert("requesterId".into(), s.validation_select_requester.to_string());
    }
    if lines.is_empty() {
        e.insert("lines".into(), s.validation_at_least_one_line.to_string());
    }
    let mut checked = Vec::new();
    for (i, l) in lines.iter().enumerate() {
        let quantity = whole_at_least(lang, s.fields_quantity, l.quantity, 1).map_err(|m| e.insert(format!("lines.{i}.quantity"), m)).ok();
        if !l.is_new {
            if l.item_id.is_none() {
                e.insert(format!("lines.{i}.itemId"), s.validation_select_item.to_string());
            }
            if let (Some(quantity), Some(item_id)) = (quantity, l.item_id) {
                checked.push(PurchaseLineInput { item_id: Some(item_id), quantity, new_item: None });
            }
            continue;
        }
        let mut ok = true;
        if l.name.trim().is_empty() {
            e.insert(format!("lines.{i}.name"), required(lang, s.fields_item_name));
            ok = false;
        }
        if l.category_id.is_none() {
            e.insert(format!("lines.{i}.categoryId"), s.validation_select_category.to_string());
            ok = false;
        }
        if l.subcategory_id.is_none() {
            e.insert(format!("lines.{i}.subcategoryId"), s.validation_select_subcategory.to_string());
            ok = false;
        }
        if l.unit.is_empty() {
            e.insert(format!("lines.{i}.unit"), s.validation_select_unit.to_string());
            ok = false;
        }
        if let (true, Some(quantity), Some(category_id), Some(subcategory_id)) = (ok, quantity, l.category_id, l.subcategory_id) {
            checked.push(PurchaseLineInput { item_id: None, quantity, new_item: Some(NewItemInput { name: l.name.trim().to_string(), category_id, subcategory_id, unit: l.unit.to_string() }) });
        }
    }
    date_field_as(lang, "neededBy", s.fields_needed_by, needed_by, &mut e);
    if reason.trim().is_empty() {
        e.insert("reason".into(), required(lang, s.fields_reason));
    }
    match (e.is_empty(), requester_id) {
        (true, Some(requester_id)) => Ok(PurchaseInput { requester_id, lines: checked, needed_by: needed_by.trim().to_string(), reason: reason.trim().to_string(), notes: notes.trim().to_string(), submit, client_request_id: request_id.map(String::from) }),
        _ => Err(e),
    }
}

/// One line of the receive form: the real unit price, and for a new item its minimum stock.
pub struct ReceiveLineFields<'a> {
    pub is_new: bool,
    pub unit_price: &'a str,
    pub minimum_stock: &'a str,
}

/// Receiving a request (`receiveSchema`): the date, the supplier, and a price (and minimum stock for new items) per line.
pub fn receive(lang: Lang, date: &str, supplier_id: Option<i64>, lines: &[ReceiveLineFields], notes: &str) -> Result<ReceiveInput, FieldErrors> {
    let s = strings(lang);
    let mut e = FieldErrors::new();
    date_field_as(lang, "date", s.fields_received_date, date, &mut e);
    if supplier_id.is_none() {
        e.insert("supplierId".into(), s.validation_select_supplier.to_string());
    }
    let mut checked = Vec::new();
    for (i, l) in lines.iter().enumerate() {
        let price = whole_at_least(lang, s.fields_unit_price, l.unit_price, 0).map_err(|m| e.insert(format!("lines.{i}.unitPrice"), m)).ok();
        let minimum = if l.is_new { whole_at_least(lang, s.fields_minimum_stock, l.minimum_stock, 0).map_err(|m| e.insert(format!("lines.{i}.minimumStock"), m)).ok() } else { Some(0) };
        if let (Some(unit_price), Some(minimum_stock)) = (price, minimum) {
            checked.push(ReceiveLineInput { unit_price, minimum_stock });
        }
    }
    match (e.is_empty(), supplier_id) {
        (true, Some(supplier_id)) => Ok(ReceiveInput { date: date.trim().to_string(), supplier_id, lines: checked, notes: notes.trim().to_string() }),
        _ => Err(e),
    }
}

/// The check before asking for expenses (the server repeats it): the end is not before the start, and the range is under 12 months.
/// None means the range is fine (or not complete yet).
pub fn expense_range_error(lang: Lang, from: &str, to: &str) -> Option<&'static str> {
    let s = strings(lang);
    let (from, to) = (from.trim(), to.trim());
    if from.is_empty() || to.is_empty() || !crate::format::is_date(from) || !crate::format::is_date(to) {
        return None;
    }
    if to < from {
        return Some(s.expenses_range_invalid);
    }
    let months = |d: &str| d[..4].parse::<i64>().unwrap_or(0) * 12 + d[5..7].parse::<i64>().unwrap_or(0);
    (months(to) - months(from) >= 12).then_some(s.expenses_range_too_long)
}

/// A reason typed for a void, a rejection or a cancel (`reasonSchema`).
pub fn reason(lang: Lang, text: &str) -> Result<String, FieldErrors> {
    if text.trim().is_empty() {
        return Err(FieldErrors::from([("reason".into(), required(lang, strings(lang).fields_reason))]));
    }
    Ok(text.trim().to_string())
}

/// A fresh id for one form (`clientRequestId`, at most 48 characters): time, process and a counter.
pub fn new_request_id() -> String {
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let nanos = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_nanos());
    format!("ezi-{nanos:x}-{:x}-{:x}", std::process::id(), COUNTER.fetch_add(1, Ordering::Relaxed))
}

/// The raw values of the category and subcategory form (`categorySchema`). The code is three letters, kept in capitals.
pub fn group(lang: Lang, name: &str, code: &str, description: &str, status: &str) -> Result<GroupInput, Errors> {
    let s = strings(lang);
    let mut e = Errors::new();
    if name.trim().is_empty() {
        e.insert("name", required(lang, s.fields_name));
    }
    let code = code.trim();
    if code.is_empty() {
        e.insert("code", required(lang, s.fields_code));
    } else if code.chars().count() != 3 || !code.chars().all(|c| c.is_ascii_alphabetic()) {
        e.insert("code", s.validation_category_code.to_string());
    }
    if !e.is_empty() {
        return Err(e);
    }
    Ok(GroupInput { name: name.trim().to_string(), code: code.to_ascii_uppercase(), description: description.trim().to_string(), status: active_or_inactive(status) })
}

/// The raw values of the supplier form (`supplierSchema`): only the name is required, the email must look like one.
pub fn supplier(lang: Lang, f: &SupplierFields, status: &str) -> Result<SupplierInput, Errors> {
    let s = strings(lang);
    let mut e = Errors::new();
    if f.name.trim().is_empty() {
        e.insert("name", required(lang, s.fields_name));
    }
    let email = f.email.trim();
    if !email.is_empty() && !looks_like_email(email) {
        e.insert("email", s.validation_email.to_string());
    }
    if !e.is_empty() {
        return Err(e);
    }
    Ok(SupplierInput {
        name: f.name.trim().to_string(),
        contact_person: f.contact_person.trim().to_string(),
        phone: f.phone.trim().to_string(),
        email: email.to_string(),
        address: f.address.trim().to_string(),
        notes: f.notes.trim().to_string(),
        status: active_or_inactive(status),
    })
}

pub struct SupplierFields<'a> {
    pub name: &'a str,
    pub contact_person: &'a str,
    pub phone: &'a str,
    pub email: &'a str,
    pub address: &'a str,
    pub notes: &'a str,
}

fn active_or_inactive(status: &str) -> String {
    if status == "Inactive" { "Inactive" } else { "Active" }.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stock_forms_follow_the_web_schemas() {
        let line = |item: Option<i64>, q: &'static str, p: &'static str| LineFields { item_id: item, quantity: q, unit_price: p };
        let ok = stock_in(Lang::En, "2026-11-23", Some(4), &[line(Some(1), "2", "1500"), line(Some(2), " 3 ", "0")], " hi ", "rid").unwrap();
        assert_eq!((ok.supplier_id, ok.lines.len(), ok.lines[0].quantity, ok.lines[0].unit_price, ok.lines[1].unit_price, ok.notes.as_str()), (Some(4), 2, 2, Some(1500), Some(0), "hi"));
        let json = serde_json::to_value(&ok).unwrap();
        assert!(json.get("destination").is_none() && json["lines"][0]["unitPrice"] == 1500 && json["clientRequestId"] == "rid", "{json}");

        let e = stock_in(Lang::En, "", None, &[line(None, "", "x"), line(Some(1), "0", "-1")], "", "r").unwrap_err();
        assert_eq!(e["date"], "Date is required.");
        assert_eq!(e["supplierId"], "Select a supplier.");
        assert_eq!((e["lines.0.itemId"].as_str(), e["lines.0.quantity"].as_str(), e["lines.0.unitPrice"].as_str()), ("Select an item.", "Quantity is required.", "Unit price (IDR) must be a whole number."));
        assert_eq!((e["lines.1.quantity"].as_str(), e["lines.1.unitPrice"].as_str()), ("Quantity must be greater than 0.", "Unit price (IDR) must be a whole number."));
        assert_eq!(stock_in(Lang::En, "2026-11-23", Some(1), &[], "", "r").unwrap_err()["lines"], "Add at least one item.");
        assert_eq!(stock_in(Lang::Id, "2026-02-30", Some(1), &[line(Some(1), "1", "1")], "", "r").unwrap_err()["date"], "Pakai format tanggal TTTT-BB-HH.");

        let out = stock_out(Lang::En, "2026-11-23", " Ruang A ", &[line(Some(1), "2", "")], "", "r").unwrap();
        let json = serde_json::to_value(&out).unwrap();
        assert!(json.get("supplierId").is_none() && json["destination"] == "Ruang A" && json["lines"][0].get("unitPrice").is_none(), "{json}");
        assert_eq!(stock_out(Lang::En, "2026-11-23", " ", &[line(Some(1), "1", "")], "", "r").unwrap_err()["destination"], "Destination is required.");

        let adj = adjustment(Lang::En, "2026-11-23", Some(1), "7", 3, " Opname ", "r").unwrap();
        assert_eq!((adj.physical, adj.reason.as_str()), (7, "Opname"));
        assert_eq!(adjustment(Lang::En, "2026-11-23", Some(1), "3", 3, "x", "r").unwrap_err()["physical"], "Physical stock equals system stock. There is nothing to adjust.");
        let e = adjustment(Lang::En, "2026-11-23", None, "-1", 3, " ", "r").unwrap_err();
        assert_eq!((e["itemId"].as_str(), e["physical"].as_str(), e["reason"].as_str()), ("Select an item.", "Physical stock must be a whole number.", "Reason is required."));
        assert_eq!(reason(Lang::Id, "  ").unwrap_err()["reason"], "Alasan wajib diisi.");
        assert_eq!(reason(Lang::En, " rusak ").unwrap(), "rusak");
        let (a, b) = (new_request_id(), new_request_id());
        assert!(a != b && a.len() <= 48, "{a}");
    }

    #[test]
    fn loan_forms_follow_the_web_schemas() {
        let line = |item: Option<i64>, q: &'static str| LineFields { item_id: item, quantity: q, unit_price: "" };
        let ok = loan(Lang::En, Some(2), &[line(Some(1), "2")], "2026-11-23", "2026-11-26", " Rapat ", "", false, Some("rid")).unwrap();
        let json = serde_json::to_value(&ok).unwrap();
        assert!(json["submit"] == false && json["clientRequestId"] == "rid" && json["purpose"] == "Rapat" && json["lines"][0].get("unitPrice").is_none(), "{json}");
        let update = loan(Lang::En, Some(2), &[line(Some(1), "2")], "2026-11-23", "2026-11-23", "x", "", true, None).unwrap();
        assert!(serde_json::to_value(&update).unwrap().get("clientRequestId").is_none(), "an update sends no request id; same-day return is allowed");
        let e = loan(Lang::En, None, &[], "", "2026-11-26", " ", "", true, None).unwrap_err();
        assert_eq!((e["borrowerId"].as_str(), e["lines"].as_str(), e["loanDate"].as_str(), e["purpose"].as_str()), ("Select a borrower.", "Add at least one item.", "Loan date is required.", "Purpose is required."));
        let e = loan(Lang::En, Some(1), &[line(Some(1), "1")], "2026-11-26", "2026-11-23", "x", "", true, None).unwrap_err();
        assert_eq!(e["expectedReturnDate"], "Expected return date cannot be before the loan date.");
        assert_eq!(loan(Lang::Id, Some(1), &[line(Some(1), "1")], "2026-11-26", "2026-11-23", "x", "", true, None).unwrap_err()["expectedReturnDate"], "Tanggal kembali tidak boleh sebelum tanggal pinjam.");
        let r = loan_return(Lang::En, " 2026-11-24 ", " ok ").unwrap();
        assert_eq!((r.return_date.as_str(), r.notes.as_str()), ("2026-11-24", "ok"));
        assert_eq!(loan_return(Lang::En, "", "").unwrap_err()["returnDate"], "Return date is required.");
        assert_eq!(loan_return(Lang::En, "24-11-2026", "").unwrap_err()["returnDate"], "Use the date format YYYY-MM-DD.");
    }

    #[test]
    fn purchase_forms_follow_the_web_schemas() {
        let existing = |item: Option<i64>, q: &'static str| PurchaseLineFields { is_new: false, item_id: item, quantity: q, name: "", category_id: None, subcategory_id: None, unit: "" };
        let new_item = |name: &'static str, cat: Option<i64>, sub: Option<i64>, unit: &'static str| PurchaseLineFields { is_new: true, item_id: None, quantity: "4", name, category_id: cat, subcategory_id: sub, unit };
        let ok = purchase(Lang::En, Some(2), &[existing(Some(1), "3"), new_item(" Spidol ", Some(1), Some(2), "box")], "2026-12-01", " Habis ", "", false, Some("rid")).unwrap();
        let json = serde_json::to_value(&ok).unwrap();
        assert!(json["lines"][0].get("newItem").is_none() && json["lines"][0]["itemId"] == 1, "{json}");
        assert!(json["lines"][1]["itemId"].is_null() && json["lines"][1]["newItem"]["name"] == "Spidol" && json["lines"][1]["newItem"]["unit"] == "box", "{json}");
        assert!(json["clientRequestId"] == "rid" && json["reason"] == "Habis", "{json}");
        let e = purchase(Lang::En, None, &[existing(None, "0"), new_item(" ", None, None, "")], "", " ", "", true, None).unwrap_err();
        assert_eq!((e["requesterId"].as_str(), e["lines.0.itemId"].as_str(), e["lines.0.quantity"].as_str()), ("Select who the request is for.", "Select an item.", "Quantity must be greater than 0."));
        assert_eq!((e["lines.1.name"].as_str(), e["lines.1.categoryId"].as_str(), e["lines.1.subcategoryId"].as_str(), e["lines.1.unit"].as_str()), ("Item name is required.", "Select a category.", "Select a subcategory.", "Select a unit."));
        assert_eq!((e["neededBy"].as_str(), e["reason"].as_str()), ("Needed by is required.", "Reason is required."));
        assert_eq!(purchase(Lang::En, Some(1), &[], "2026-12-01", "x", "", true, None).unwrap_err()["lines"], "Add at least one item.");

        let r = receive(Lang::En, "2026-11-23", Some(3), &[ReceiveLineFields { is_new: false, unit_price: "1500", minimum_stock: "" }, ReceiveLineFields { is_new: true, unit_price: "2000", minimum_stock: "5" }], " ok ").unwrap();
        assert_eq!((r.supplier_id, r.lines[0].unit_price, r.lines[0].minimum_stock, r.lines[1].minimum_stock, r.notes.as_str()), (3, 1500, 0, 5, "ok"));
        let e = receive(Lang::En, "", None, &[ReceiveLineFields { is_new: true, unit_price: "x", minimum_stock: "" }, ReceiveLineFields { is_new: false, unit_price: "", minimum_stock: "" }], "").unwrap_err();
        assert_eq!((e["date"].as_str(), e["supplierId"].as_str()), ("Date received is required.", "Select a supplier."));
        assert_eq!((e["lines.0.unitPrice"].as_str(), e["lines.0.minimumStock"].as_str(), e["lines.1.unitPrice"].as_str()), ("Unit price (IDR) must be a whole number.", "Minimum stock is required.", "Unit price (IDR) is required."));
    }

    #[test]
    fn the_expense_range_check_follows_the_web_page() {
        assert_eq!(expense_range_error(Lang::En, "2026-11-01", "2026-11-23"), None);
        assert_eq!(expense_range_error(Lang::En, "2026-11-23", "2026-11-01"), Some("The end date cannot be before the start date."));
        assert_eq!(expense_range_error(Lang::En, "2025-11-01", "2026-10-31"), None, "11 months apart is allowed");
        assert!(expense_range_error(Lang::En, "2025-11-01", "2026-11-01").is_some(), "12 months apart is too long");
        assert_eq!((expense_range_error(Lang::En, "", "2026-11-01"), expense_range_error(Lang::En, "2026-11-0", "2026-11-01")), (None, None), "an unfinished date is not an error yet");
    }

    #[test]
    fn category_and_supplier_forms_follow_the_web_schemas() {
        let ok = group(Lang::En, " Aula ", "aul", " Hall ", "Active").unwrap();
        assert_eq!((ok.name.as_str(), ok.code.as_str(), ok.description.as_str()), ("Aula", "AUL", "Hall"), "trimmed, code in capitals");
        assert_eq!(group(Lang::En, "A", "AUL", "", "Inactive").unwrap().status, "Inactive");
        let e = group(Lang::En, " ", "", "", "Active").unwrap_err();
        assert_eq!((e["name"].as_str(), e["code"].as_str()), ("Name is required.", "Code is required."));
        for bad in ["AU", "AULA", "AU1", "A-L", "ÄÖÜ"] {
            assert_eq!(group(Lang::En, "A", bad, "", "Active").unwrap_err()["code"], "Use exactly 3 letters, for example KTR.", "{bad}");
        }
        assert_eq!(group(Lang::Id, "", "AUL", "", "Active").unwrap_err()["name"], "Nama wajib diisi.");

        let f = SupplierFields { name: " Toko ", contact_person: " Budi ", phone: "", email: " a@b.co ", address: "", notes: " " };
        let s = supplier(Lang::En, &f, "Active").unwrap();
        assert_eq!((s.name.as_str(), s.contact_person.as_str(), s.email.as_str(), s.notes.as_str()), ("Toko", "Budi", "a@b.co", ""));
        assert!(supplier(Lang::En, &SupplierFields { email: "", ..f }, "Active").is_ok(), "the email is optional");
        let e = supplier(Lang::En, &SupplierFields { name: "", email: "nope", ..f }, "Active").unwrap_err();
        assert_eq!((e["name"].as_str(), e["email"].as_str()), ("Name is required.", "Enter a valid email address."));
    }

    #[test]
    fn email_shape_matches_the_web_regex() {
        for ok in ["a@b.co", "admin@test.example", "a.b@c.d.e", "x@y.z", "a@@b.co"] {
            assert!(looks_like_email(ok), "{ok}");
        }
        for bad in ["", "a", "a@b", "@b.co", "a@.co", "a@b.", "a b@c.d", "a@b .c", "a@b.c "] {
            assert!(!looks_like_email(bad), "{bad:?}");
        }
    }

    #[test]
    fn login_needs_an_email_and_a_password_and_nothing_more() {
        assert!(login(Lang::En, "x", "y").is_empty(), "the server decides whether the account exists");
        let e = login(Lang::En, "  ", "");
        assert_eq!(e["email"], "Email is required.");
        assert_eq!(e["password"], "Password is required.");
        assert_eq!(login(Lang::Id, "", "x")["email"], "Email wajib diisi.");
    }

    #[test]
    fn setup_checks_name_email_password_length_and_match() {
        assert!(first_admin(Lang::En, "Admin", "a@b.co", "longenough", "longenough").is_empty());
        let e = first_admin(Lang::En, "", "nope", "short", "short");
        assert_eq!((e["name"].as_str(), e["email"].as_str()), ("Full name is required.", "Enter a valid email address."));
        assert_eq!(e["password"], "Password must be at least 8 characters.");
        assert_eq!(first_admin(Lang::En, "A", "a@b.co", "longenough", "different1")["confirm"], "The passwords do not match.");
        assert_eq!(first_admin(Lang::Id, "A", "a@b.co", "pendek", "pendek")["password"], "Password minimal 8 karakter.");
        assert!(first_admin(Lang::En, "A", "a@b.co", &"x".repeat(201), &"x".repeat(201)).contains_key("password"));
        assert!(first_admin(Lang::En, "A", "a@b.co", &"x".repeat(200), &"x".repeat(200)).is_empty());
    }

    #[test]
    fn change_password_follows_the_same_password_rules() {
        assert!(change_password(Lang::En, "newpass123", "newpass123").is_empty());
        assert!(change_password(Lang::En, "short", "short").contains_key("password"));
        assert!(change_password(Lang::En, "newpass123", "newpass124").contains_key("confirm"));
    }

    fn fields() -> ItemFields<'static> {
        ItemFields { name: "Kabel", category_id: Some(1), subcategory_id: Some(2), unit: "pcs", opening_stock: "5", minimum_stock: "1", last_price: "1500", supplier_id: None, location: " Gudang ", status: "Active", notes: " " }
    }

    #[test]
    fn a_valid_item_form_builds_the_body_with_trimmed_text() {
        let b = item(Lang::En, &fields(), true).unwrap();
        assert_eq!((b.name.as_str(), b.category_id, b.subcategory_id, b.opening_stock, b.minimum_stock, b.last_purchase_price, b.location.as_str(), b.notes.as_str()), ("Kabel", 1, 2, 5, 1, 1500, "Gudang", ""));
        assert_eq!(item(Lang::En, &fields(), false).unwrap().opening_stock, 0, "opening stock is not read when editing");
    }

    #[test]
    fn an_invalid_item_form_gives_the_web_messages_per_field() {
        let f = ItemFields { name: " ", category_id: None, subcategory_id: None, unit: "", opening_stock: "-1", minimum_stock: "", last_price: "1.5", ..fields() };
        let e = item(Lang::En, &f, true).unwrap_err();
        assert_eq!(e["name"], "Name is required."); // the web schema labels it `fields.name`
        assert_eq!((e["category"].as_str(), e["subcategory"].as_str(), e["unit"].as_str()), ("Select a category.", "Select a subcategory.", "Select a unit."));
        assert_eq!(e["opening"], "Opening stock must be a whole number.");
        assert_eq!(e["minimum"], "Minimum stock is required.");
        assert_eq!(e["price"], "Last purchase price (IDR) must be a whole number.");
        assert_eq!(item(Lang::Id, &ItemFields { name: "", ..fields() }, true).unwrap_err()["name"], "Nama wajib diisi.");
        assert!(item(Lang::En, &ItemFields { name: &"x".repeat(151), ..fields() }, true).unwrap_err().contains_key("name"));
        assert!(item(Lang::En, &ItemFields { unit: "kg", ..fields() }, true).unwrap_err().contains_key("unit"));
    }

    #[test]
    fn units_equal_the_web_apps_units() {
        let ts = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/../../../frontend/src/lib/constants.ts")).unwrap();
        let line = ts.lines().find(|l| l.starts_with("export const UNITS")).expect("UNITS in constants.ts");
        let web: Vec<&str> = line.split('"').skip(1).step_by(2).collect();
        assert_eq!(web, UNITS);
    }
}
