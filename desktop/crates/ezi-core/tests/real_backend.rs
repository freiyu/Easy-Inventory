//! The API client against the real EZI backend on the TEST database. Ignored by default: it needs a server that
//! was started on an empty ezi_test, and it creates data (fake only). Run it with:
//!   cd backend && E2E_PORT=4101 npm run e2e:server        (rebuilds ezi_test, never ezi_dev)
//!   cd desktop && EZI_TEST_URL=127.0.0.1:4101 cargo test -p ezi-core --test real_backend -- --ignored --nocapture

use ezi_core::api::{Client, ErrorCode, Password, Role};
use ezi_core::api::Lang;
use ezi_core::forms;
use ezi_core::models::{AdjustmentInput, GroupInput, GroupRow, ImportStatus, ItemInput, StockLineInput, StockMoveInput, SupplierInput, SupplierRow};
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

    // Item writes through the typed calls: create, edit, deactivate, activate, delete, and the history rule.
    let input = |name: &str| ItemInput {
        name: name.into(), category_id: cat["id"].as_i64().unwrap(), subcategory_id: sub["id"].as_i64().unwrap(), unit: "pcs".into(), opening_stock: 0,
        minimum_stock: 1, last_purchase_price: 100, supplier_id: None, location: "Gudang".into(), status: "Active".into(), notes: "".into(),
    };
    let made = admin.create_item(&input("Item Baru")).unwrap();
    assert_eq!((made.code.as_deref(), made.current_stock), (Some("KTR-ELK-0004"), Some(0)));
    let renamed = admin.update_item(made.id, &ItemInput { name: "Item Ubah".into(), minimum_stock: 4, ..input("Item Ubah") }).unwrap();
    assert_eq!((renamed.name.as_str(), renamed.minimum_stock), ("Item Ubah", Some(4)));
    admin.set_item_active(made.id, false).unwrap();
    assert_eq!(admin.item(made.id).unwrap().status, "Inactive");
    assert!(staff.item(made.id).unwrap_err().code() == Some(&ErrorCode::NotFound), "Staff never see inactive items");
    admin.set_item_active(made.id, true).unwrap();
    assert_eq!(admin.item(made.id).unwrap().status, "Active");
    assert_eq!(admin.delete_item(id).unwrap_err().code(), Some(&ErrorCode::Conflict), "an item with history cannot be deleted");
    let invalid_item = admin.create_item(&ItemInput { name: "".into(), ..input("x") }).unwrap_err();
    assert_eq!(invalid_item.code(), Some(&ErrorCode::Validation));
    admin.delete_item(made.id).unwrap();
    assert_eq!(admin.item(made.id).unwrap_err().code(), Some(&ErrorCode::NotFound));
    // Staff cannot write, import or export.
    assert_eq!(staff.create_item(&input("Nope")).unwrap_err().code(), Some(&ErrorCode::Forbidden));
    assert_eq!(staff.import_preview("name\nx\n").unwrap_err().code(), Some(&ErrorCode::Forbidden));
    assert_eq!(staff.export_items(&[]).unwrap_err().code(), Some(&ErrorCode::Forbidden));
    assert_eq!(staff.remove_item_photo(id).unwrap_err().code(), Some(&ErrorCode::Forbidden));

    // Photo removal, then the CSV import: a preview saves nothing, the confirm creates only the ready rows.
    admin.remove_item_photo(id).unwrap();
    assert_eq!(admin.item_photo(id).unwrap_err().code(), Some(&ErrorCode::NotFound));
    admin.remove_item_photo(id).unwrap(); // nothing to remove is fine
    let csv = "name,category,subcategory,unit,opening_stock\nKertas HVS,Kantor,ELK,ream,10\nKabel Rust,Kantor,ELK,pcs,1\nPenggaris,Gudang Baru,ELK,kardus,1\n";
    let before = admin.items(&[("pageSize", "1")]).unwrap().meta.unwrap().total;
    let preview = admin.import_preview(csv).unwrap();
    assert_eq!((preview.ready, preview.skipped, preview.errors, preview.created), (1, 1, 1, 0));
    assert_eq!(preview.rows.iter().map(|r| r.status).collect::<Vec<_>>(), [ImportStatus::Ready, ImportStatus::Skipped, ImportStatus::Error]);
    assert_eq!(admin.items(&[("pageSize", "1")]).unwrap().meta.unwrap().total, before, "a preview saves nothing");
    let done = admin.import_confirm(csv).unwrap();
    assert_eq!(done.created, 1);
    assert_eq!(admin.items(&[("search", "kertas")]).unwrap().data.len(), 1);
    let export = admin.export_items(&[("search", "kertas")]).unwrap();
    assert!(export.file_name.ends_with(".xlsx") && export.bytes.starts_with(b"PK"));

    // Master data through the typed calls the screens use: create, list with the row shape, edit, deactivate, activate, delete,
    // and the server's rules (a used record cannot be deleted, a duplicate code is refused, a bad email is refused, Staff cannot write).
    let rows = |base: &str| admin.get::<Vec<GroupRow>>(base, &[("search", "Ruang")]).unwrap().data;
    let group = |name: &str, code: &str| forms::group(Lang::En, name, code, "Uji", "Active").unwrap();
    admin.save_record("/categories", None, &group("Ruang Rapat", "rap")).unwrap();
    let made = rows("/categories");
    assert_eq!((made.len(), made[0].code.as_str(), made[0].item_count, made[0].status.as_str()), (1, "RAP", 0, "Active"), "the code is kept in capitals");
    let rap = made[0].id;
    admin.save_record("/categories", Some(rap), &GroupInput { name: "Ruang Rapat 2".into(), ..group("x", "rap") }).unwrap();
    assert_eq!(rows("/categories")[0].name, "Ruang Rapat 2");
    let dup = admin.save_record("/categories", None, &group("Lain", "KTR")).unwrap_err();
    assert_eq!(dup.code(), Some(&ErrorCode::Conflict), "a category code is unique: {dup:?}");
    admin.set_record_active("/categories", rap, false).unwrap();
    assert_eq!(rows("/categories")[0].status, "Inactive");
    admin.set_record_active("/categories", rap, true).unwrap();
    assert_eq!(rows("/categories")[0].status, "Active");
    admin.delete_record("/categories", rap).unwrap();
    assert!(rows("/categories").is_empty());
    let used = admin.get::<Vec<GroupRow>>("/categories", &[("search", "Kantor")]).unwrap().data[0].clone();
    assert!(used.item_count > 0);
    assert_eq!(admin.delete_record("/categories", used.id).unwrap_err().code(), Some(&ErrorCode::Conflict), "a category that items use cannot be deleted");
    admin.save_record("/subcategories", None, &group("Ruang Uji", "ruj")).unwrap();
    let ruj = rows("/subcategories")[0].id;
    admin.delete_record("/subcategories", ruj).unwrap();

    let supplier = |name: &str, email: &str| SupplierInput { name: name.into(), contact_person: "Budi".into(), phone: "0812".into(), email: email.into(), address: "".into(), notes: "".into(), status: "Active".into() };
    admin.save_record("/suppliers", None, &supplier("Toko Ruang", "toko@rust.test")).unwrap();
    let toko = admin.get::<Vec<SupplierRow>>("/suppliers", &[("search", "Ruang")]).unwrap().data;
    assert_eq!((toko.len(), toko[0].contact_person.as_str(), toko[0].item_count), (1, "Budi", 0));
    let bad_email = admin.save_record("/suppliers", Some(toko[0].id), &supplier("Toko Ruang", "bukan-email")).unwrap_err();
    assert!(bad_email.fields().contains_key("email"), "{:?}", bad_email.fields());
    admin.set_record_active("/suppliers", toko[0].id, false).unwrap();
    admin.delete_record("/suppliers", toko[0].id).unwrap();
    let rust_supplier = admin.get::<Vec<SupplierRow>>("/suppliers", &[("search", "Toko Rust")]).unwrap().data;
    assert_eq!(admin.delete_record("/suppliers", rust_supplier[0].id).unwrap_err().code(), Some(&ErrorCode::Conflict), "a supplier that items use cannot be deleted");
    assert_eq!(staff.save_record("/suppliers", None, &supplier("Nope", "")).unwrap_err().code(), Some(&ErrorCode::Forbidden));
    assert_eq!(staff.get::<Vec<GroupRow>>("/suppliers", &[]).unwrap_err().code(), Some(&ErrorCode::Forbidden), "Staff cannot list suppliers");

    // Stock transactions through the typed calls: incoming, outgoing, the refusal of an outgoing request over the stock,
    // an adjustment, the list filters and the void with its reason. Staff may not use any of it.
    let today = ezi_core::format::today();
    let lines = |q: i64, p: Option<i64>| vec![StockLineInput { item_id: id, quantity: q, unit_price: p }];
    let mv = |lines: Vec<StockLineInput>, supplier: Option<i64>, destination: Option<&str>| StockMoveInput {
        date: today.clone(), supplier_id: supplier, destination: destination.map(String::from), lines, notes: "uji".into(), client_request_id: forms::new_request_id(),
    };
    let stock_before = admin.item(id).unwrap().current_stock.unwrap();
    let incoming = admin.stock_move("in", &mv(lines(5, Some(2000)), sup["id"].as_i64(), None)).unwrap();
    assert_eq!((incoming.kind.as_str(), incoming.status.as_str(), incoming.total, incoming.lines[0].balance_after), ("IN", "Posted", 10_000, stock_before + 5));
    assert!(incoming.can_void());
    let same_request = mv(lines(1, Some(1)), sup["id"].as_i64(), None);
    let first = admin.stock_move("in", &same_request).unwrap();
    let repeat = admin.stock_move("in", &same_request).unwrap();
    assert_eq!(first.id, repeat.id, "the same clientRequestId never posts twice");
    let outgoing = admin.stock_move("out", &mv(lines(2, None), None, Some("Ruang A"))).unwrap();
    assert_eq!((outgoing.kind.as_str(), outgoing.party.as_str(), outgoing.lines[0].quantity_change), ("OUT", "Ruang A", -2));
    let too_many = admin.stock_move("out", &mv(lines(1_000_000, None), None, Some("Ruang A"))).unwrap_err();
    assert_eq!(too_many.code(), Some(&ErrorCode::InsufficientStock), "{too_many:?}");
    assert!(too_many.fields().contains_key("lines.0.quantity"), "the message lands on the quantity of the line: {:?}", too_many.fields());
    let now = admin.item(id).unwrap().current_stock.unwrap();
    assert_eq!(now, stock_before + 5 + 1 - 2, "the refused request changed nothing");
    let adjust = admin.stock_adjust(&AdjustmentInput { date: today.clone(), item_id: id, physical: now + 4, reason: "Opname".into(), client_request_id: forms::new_request_id() }).unwrap();
    assert_eq!((adjust.kind.as_str(), adjust.lines[0].quantity_change, adjust.reason.as_str()), ("ADJUSTMENT", 4, "Opname"));
    let bad_adjust = admin.stock_adjust(&AdjustmentInput { date: today.clone(), item_id: id, physical: now + 4, reason: "Lagi".into(), client_request_id: forms::new_request_id() }).unwrap_err();
    assert!(matches!(bad_adjust.code(), Some(ErrorCode::Validation | ErrorCode::Conflict)), "an adjustment that changes nothing is refused: {bad_adjust:?}");
    let listed = admin.stock_transactions(&[("type", "OUT"), ("search", "Proyektor"), ("pageSize", "8")]).unwrap();
    assert!(listed.data.iter().all(|t| t.kind == "OUT") && listed.data.iter().any(|t| t.id == outgoing.id), "type and search filters");
    assert!(listed.meta.is_some());
    assert_eq!(admin.stock_transaction(outgoing.id).unwrap().number, outgoing.number);
    assert_eq!(admin.stock_transaction(9_999_999).unwrap_err().code(), Some(&ErrorCode::NotFound));
    let voided = admin.void_stock(outgoing.id, "Salah catat").unwrap();
    assert_eq!((voided.id, voided.status.as_str(), voided.can_void()), (outgoing.id, "Voided", false), "the answer is the original, now voided");
    let reversal_number = voided.voided_by_number.clone().expect("the original names its reversal");
    let reversal = admin.stock_transaction(voided.voided_by_id.unwrap()).unwrap();
    assert_eq!((reversal.kind.as_str(), reversal.number.as_str(), reversal.reversal_of_number.as_deref()), ("REVERSAL", reversal_number.as_str(), Some(outgoing.number.as_str())));
    assert_eq!(admin.stock_transaction(outgoing.id).unwrap().status, "Voided");
    assert_eq!(admin.void_stock(outgoing.id, "Lagi").unwrap_err().code(), Some(&ErrorCode::BusinessRule), "a voided transaction cannot be voided again");
    assert_eq!(staff.stock_transactions(&[]).unwrap_err().code(), Some(&ErrorCode::Forbidden));
    assert_eq!(staff.stock_move("out", &mv(lines(1, None), None, Some("x"))).unwrap_err().code(), Some(&ErrorCode::Forbidden));

    // Logout ends the session on the server too.
    admin.logout().unwrap();
    assert!(!admin.has_session());
    assert!(admin.me().unwrap_err().is_unauthenticated());
}
