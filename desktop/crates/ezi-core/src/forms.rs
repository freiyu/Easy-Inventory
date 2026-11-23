//! Form checks before anything is sent, with the same rules and messages as the web app (`frontend/src/lib/schemas.ts`).
//! The server checks everything again; this only saves a round trip and gives the message at the right field.

use std::collections::BTreeMap;

use crate::api::Lang;
use crate::i18n::{at_least, required, strings, too_long, whole_number};
use crate::models::{GroupInput, ItemInput, SupplierInput};

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
