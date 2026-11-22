//! The API client against the real EZI backend on the TEST database. Ignored by default: it needs a server that
//! was started on an empty ezi_test, and it creates data (fake only). Run it with:
//!   cd backend && E2E_PORT=4101 npm run e2e:server        (rebuilds ezi_test, never ezi_dev)
//!   cd desktop && EZI_TEST_URL=127.0.0.1:4101 cargo test -p ezi-core --test real_backend -- --ignored --nocapture

use ezi_core::api::{Client, ErrorCode, Password, Role};
use serde_json::{json, Value};

const PNG: [u8; 8] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

#[test]
#[ignore = "needs a backend on an empty ezi_test, see the file header"]
fn the_client_works_against_the_real_backend() {
    let url = std::env::var("EZI_TEST_URL").expect("set EZI_TEST_URL, for example 127.0.0.1:4101");
    let admin = Client::new(&url).unwrap();

    // First-run setup, then a wrong and a right password.
    assert!(admin.needs_setup().unwrap(), "start the backend on an empty ezi_test");
    admin.create_first_admin("Admin Rust", "admin@rust.test", &Password::new("admin-pass-1")).unwrap();
    assert!(!admin.needs_setup().unwrap());
    let wrong = admin.login("admin@rust.test", &Password::new("wrong-pass")).unwrap_err();
    assert!(wrong.is_unauthenticated() && !admin.has_session(), "{wrong:?}");
    let me = admin.login("admin@rust.test", &Password::new("admin-pass-1")).unwrap();
    assert_eq!((me.role, me.must_change_password), (Role::Admin, false));
    assert_eq!(admin.me().unwrap().email, "admin@rust.test");

    // Master data through the generic helpers, a server rule error and a validation error with field messages.
    let cat: Value = admin.post("/categories", &json!({ "name": "Kantor", "code": "KTR" })).unwrap().data;
    let sub: Value = admin.post("/subcategories", &json!({ "name": "Elektronik", "code": "ELK" })).unwrap().data;
    let sup: Value = admin.post("/suppliers", &json!({ "name": "Toko Rust" })).unwrap().data;
    let dup = admin.post::<Value, _>("/categories", &json!({ "name": "Lain", "code": "KTR" })).unwrap_err(); // a category code must be unique
    assert_eq!(dup.code(), Some(&ErrorCode::Conflict), "{dup:?}");
    let invalid = admin.post::<Value, _>("/suppliers", &json!({ "name": "" })).unwrap_err();
    assert_eq!(invalid.code(), Some(&ErrorCode::Validation));
    assert!(invalid.fields().contains_key("name"), "{:?}", invalid.fields());

    let item: Value = admin
        .post("/items", &json!({ "name": "Proyektor Rust", "categoryId": cat["id"], "subcategoryId": sub["id"], "unit": "pcs", "openingStock": 3, "minimumStock": 1, "lastPurchasePrice": 1000, "supplierId": sup["id"] }))
        .unwrap()
        .data;
    let id = item["id"].as_i64().unwrap();
    assert_eq!(item["code"], "KTR-ELK-0001");

    // Dashboards: numbers are checked against the item list, an independent route to the same data.
    for (name, stock) in [("Kabel Rust", 1), ("Lampu Rust", 0)] {
        admin.post::<Value, _>("/items", &json!({ "name": name, "categoryId": cat["id"], "subcategoryId": sub["id"], "unit": "pcs", "openingStock": stock, "minimumStock": 1, "lastPurchasePrice": 500, "supplierId": sup["id"] })).unwrap();
    }
    let d = admin.dashboard().unwrap();
    assert!(d.staff.is_none());
    let a = d.admin.unwrap();
    let items = admin.get::<Vec<Value>>("/items", &[("pageSize", "100")]).unwrap().data;
    let count = |status: &str| items.iter().filter(|i| i["status"] == "Active" && i["stockStatus"] == status).count() as i64;
    assert_eq!((a.stock.safe, a.stock.low, a.stock.out), (count("Safe"), count("Low"), count("Out")));
    assert_eq!((a.stock.safe, a.stock.low, a.stock.out, a.total_items(), a.pending_approvals), (1, 1, 1, 3, 0));
    let names: Vec<&str> = a.needs_attention.iter().map(|i| i.name.as_str()).collect();
    assert_eq!(names, ["Lampu Rust", "Kabel Rust"], "out of stock first, then low");

    // The typed item calls: paging, a stock filter and a search, with the same meta the web app reads.
    let page2 = admin.items(&[("page", "2"), ("pageSize", "2"), ("sort", "name:asc")]).unwrap();
    assert_eq!((page2.data.len(), page2.meta.as_ref().map(|m| (m.page, m.page_size, m.total))), (1, Some((2, 2, 3))));
    let low = admin.items(&[("stockStatus", "Low")]).unwrap().data;
    assert_eq!(low.iter().map(|i| i.name.as_str()).collect::<Vec<_>>(), ["Kabel Rust"]);
    assert_eq!(admin.items(&[("search", "lampu")]).unwrap().data.len(), 1);
    assert_eq!(admin.name_options("/categories").unwrap().iter().map(|c| c.name.as_str()).collect::<Vec<_>>(), ["Kantor"]);
    let detail = admin.item(id).unwrap();
    assert_eq!((detail.barcode_value(), detail.current_stock, detail.movements.len()), (Some("KTR-ELK-0001"), Some(3), 1)); // one opening-stock adjustment

    // A list with paging meta and a query, a photo upload and download, and an Excel download.
    let list = admin.get::<Vec<Value>>("/items", &[("page", "1"), ("pageSize", "8"), ("search", "proyektor")]).unwrap();
    assert_eq!(list.data.len(), 1);
    assert_eq!((list.meta.as_ref().map(|m| m.total), list.meta.as_ref().map(|m| m.page_size)), (Some(1), Some(8)));
    let mut png = PNG.to_vec();
    png.extend([1, 2, 3, 4]);
    let up = admin.put_file::<Value>(&format!("/items/{id}/photo"), png.clone(), "image/png").unwrap();
    assert!(up.data["photoVersion"].as_str().unwrap().ends_with(".png"));
    assert_eq!(admin.get_bytes(&format!("/items/{id}/photo")).unwrap(), png);
    let bad = admin.put_file::<Value>(&format!("/items/{id}/photo"), b"plain text".to_vec(), "image/jpeg").unwrap_err();
    assert_eq!(bad.code(), Some(&ErrorCode::Validation), "{bad:?}");
    let xlsx = admin.get_file("/export/items", &[]).unwrap();
    assert!(xlsx.file_name.starts_with("ezi-items-") && xlsx.file_name.ends_with(".xlsx"), "{}", xlsx.file_name);
    assert_eq!(&xlsx.bytes[..2], b"PK");

    // A Staff account with a temporary password: forced change, then a normal login that sees no admin fields.
    let created: Value = admin.post("/users", &json!({ "name": "Staf Rust", "email": "staf@rust.test", "role": "Staff" })).unwrap().data;
    let temp = created["tempPassword"].as_str().unwrap().to_string();
    let staff = Client::new(&url).unwrap();
    assert!(staff.login("staf@rust.test", &Password::new(temp)).unwrap().must_change_password);
    staff.change_password(None, &Password::new("staf-pass-1")).unwrap();
    assert!(!staff.login("staf@rust.test", &Password::new("staf-pass-1")).unwrap().must_change_password);
    let forbidden = staff.get::<Value>("/users", &[]).unwrap_err();
    assert_eq!(forbidden.code(), Some(&ErrorCode::Forbidden));
    let seen: Value = staff.get::<Value>(&format!("/items/{id}"), &[]).unwrap().data;
    assert!(seen.get("code").is_none() && seen.get("currentStock").is_none(), "Staff must not get code or stock: {seen}");
    assert_eq!(seen["barcode"], "KTR-ELK-0001", "Staff get only the barcode value");
    let staff_item = staff.item(id).unwrap();
    assert_eq!((staff_item.code.as_deref(), staff_item.barcode_value(), staff_item.current_stock, staff_item.movements.len()), (None, Some("KTR-ELK-0001"), None, 0));
    assert!(staff_item.photo_version.is_some(), "Staff see the photo version");
    assert_eq!(staff.item_photo(id).unwrap().len(), 12, "Staff can download the photo");
    let no_write = staff.put_file::<Value>(&format!("/items/{id}/photo"), png, "image/png").unwrap_err();
    assert_eq!(no_write.code(), Some(&ErrorCode::Forbidden));

    // The Staff dashboard has their own loans and counts, and nothing about stock numbers.
    let sd = staff.dashboard().unwrap();
    assert!(sd.admin.is_none());
    let st = sd.staff.unwrap();
    assert_eq!((st.active_items, st.requestable, st.overdue_count, st.active_loans.len()), (3, 2, 0, 0));
    assert!(st.overdue_first.is_none());

    // Logout ends the session on the server too.
    admin.logout().unwrap();
    assert!(!admin.has_session());
    assert!(admin.me().unwrap_err().is_unauthenticated());
}
