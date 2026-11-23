//! The API client against a real HTTP server on a random local port that plays the EZI server.
//! Each test starts its own server, so tests do not share state.

use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use ezi_core::api::{ApiError, Client, ErrorCode, Lang, Password, Role};
use serde::Deserialize;
use serde_json::{json, Value};
use tiny_http::{Header, Response, Server};

#[derive(Clone, Debug)]
struct Seen {
    method: String,
    url: String,
    cookie: Option<String>,
    lang: Option<String>,
    content_type: Option<String>,
    body: Vec<u8>,
}

struct Reply {
    status: u16,
    headers: Vec<(&'static str, String)>,
    body: Vec<u8>,
    delay: Duration,
}

fn json_reply(status: u16, v: Value) -> Reply {
    Reply { status, headers: vec![("Content-Type", "application/json; charset=utf-8".into())], body: v.to_string().into_bytes(), delay: Duration::ZERO }
}
fn ok(data: Value) -> Reply {
    json_reply(200, json!({ "success": true, "data": data }))
}
fn err(status: u16, code: &str, message: &str, fields: Value) -> Reply {
    json_reply(status, json!({ "success": false, "error": { "code": code, "message": message, "fields": fields } }))
}
impl Reply {
    fn header(mut self, k: &'static str, v: &str) -> Self {
        self.headers.push((k, v.to_string()));
        self
    }
}

/// Starts a server that answers every request with `handler(&seen)` and records what it saw.
fn serve(handler: impl Fn(&Seen) -> Reply + Send + 'static) -> (String, Arc<Mutex<Vec<Seen>>>) {
    let server = Server::http("127.0.0.1:0").unwrap();
    let addr = server.server_addr().to_ip().unwrap();
    let log: Arc<Mutex<Vec<Seen>>> = Arc::default();
    let log2 = log.clone();
    thread::spawn(move || {
        for mut request in server.incoming_requests() {
            let header = |name: &str| request.headers().iter().find(|h| h.field.as_str().as_str().eq_ignore_ascii_case(name)).map(|h| h.value.as_str().to_string());
            let (cookie, lang, content_type) = (header("Cookie"), header("X-EZI-Lang"), header("Content-Type"));
            let mut body = Vec::new();
            request.as_reader().read_to_end(&mut body).unwrap();
            let seen = Seen { method: request.method().as_str().to_string(), url: request.url().to_string(), cookie, lang, content_type, body };
            log2.lock().unwrap().push(seen.clone());
            let reply = handler(&seen);
            thread::sleep(reply.delay);
            let mut response = Response::from_data(reply.body).with_status_code(reply.status);
            for (k, v) in reply.headers {
                response.add_header(Header::from_bytes(k.as_bytes(), v.as_bytes()).unwrap());
            }
            let _ = request.respond(response); // the client may have given up already (timeout test)
        }
    });
    (format!("127.0.0.1:{}", addr.port()), log)
}

const COOKIE_SET: &str = "ezi_session=s%3Atoken123.signature; Path=/; HttpOnly; SameSite=Lax";
fn user(must_change: bool) -> Value {
    json!({ "id": 7, "name": "Admin One", "email": "admin@test.example", "role": "Admin", "status": "Active", "mustChangePassword": must_change, "lastLoginAt": null, "createdAt": "2026-11-22T00:00:00.000Z" })
}

#[test]
fn login_sends_the_credentials_once_keeps_the_cookie_and_sends_it_back() {
    let (addr, log) = serve(|s| match s.url.as_str() {
        "/api/auth/login" => ok(user(false)).header("Set-Cookie", COOKIE_SET),
        "/api/auth/me" => ok(user(false)),
        _ => err(404, "NOT_FOUND", "no", json!({})),
    });
    let client = Client::new(&addr).unwrap();
    assert!(!client.has_session());
    let me = client.login("Admin@Test.example", &Password::new("pa55-word")).unwrap();
    assert_eq!((me.id, me.role, me.must_change_password), (7, Role::Admin, false));
    assert!(client.has_session());
    assert_eq!(client.me().unwrap().email, "admin@test.example");

    let seen = log.lock().unwrap().clone();
    let login: Value = serde_json::from_slice(&seen[0].body).unwrap();
    assert_eq!(login, json!({ "email": "Admin@Test.example", "password": "pa55-word", "keepSignedIn": false }));
    assert_eq!(seen[0].content_type.as_deref(), Some("application/json"));
    assert_eq!(seen[0].cookie, None, "nothing to send before login");
    assert_eq!(seen[1].cookie.as_deref(), Some("ezi_session=s%3Atoken123.signature"), "only name=value goes back, not the attributes");
    assert_eq!(seen[0].lang.as_deref(), Some("id"));
}

#[test]
fn a_wrong_password_is_the_servers_unauthenticated_error_and_leaves_no_session_and_no_password_in_the_error() {
    let (addr, _) = serve(|_| err(401, "UNAUTHENTICATED", "Email or password is wrong.", json!({})));
    let client = Client::new(&addr).unwrap();
    let e = client.login("a@b.c", &Password::new("never-print-me")).unwrap_err();
    assert!(e.is_unauthenticated());
    assert_eq!(e.code(), Some(&ErrorCode::Unauthenticated));
    assert_eq!(e.to_string(), "Email or password is wrong.");
    assert!(!client.has_session());
    for text in [format!("{e}"), format!("{e:?}")] {
        assert!(!text.contains("never-print-me"));
    }
}

#[test]
fn a_login_that_sets_no_cookie_is_refused() {
    let (addr, _) = serve(|_| ok(user(false)));
    let client = Client::new(&addr).unwrap();
    let e = client.login("a@b.c", &Password::new("x")).unwrap_err();
    assert!(matches!(e, ApiError::BadResponse { .. }), "{e:?}");
    assert!(!client.has_session());
}

#[test]
fn a_forced_password_change_is_visible_and_the_temporary_password_change_has_no_current_field() {
    let (addr, log) = serve(|s| match s.url.as_str() {
        "/api/auth/login" => ok(user(true)).header("Set-Cookie", COOKIE_SET),
        "/api/auth/change-password" => ok(user(false)), // like the real server: the updated user, not null
        _ => err(404, "NOT_FOUND", "no", json!({})),
    });
    let client = Client::new(&addr).unwrap();
    assert!(client.login("a@b.c", &Password::new("temp-pass")).unwrap().must_change_password);
    client.change_password(None, &Password::new("new-pass-1")).unwrap();
    client.change_password(Some(&Password::new("old-pass")), &Password::new("new-pass-2")).unwrap();
    let seen = log.lock().unwrap().clone();
    assert_eq!(serde_json::from_slice::<Value>(&seen[1].body).unwrap(), json!({ "password": "new-pass-1" }));
    assert_eq!(serde_json::from_slice::<Value>(&seen[2].body).unwrap(), json!({ "current": "old-pass", "password": "new-pass-2" }));
}

#[test]
fn an_error_body_keeps_status_code_message_and_field_messages() {
    let (addr, _) = serve(|s| match s.url.as_str() {
        "/api/items" => err(422, "VALIDATION_ERROR", "Check the fields.", json!({ "name": "Required.", "lines.0.quantity": "Too small." })),
        "/api/items/1" => err(409, "CONFLICT", "Has history.", json!({})),
        "/api/stock/out" => err(422, "INSUFFICIENT_STOCK", "Not enough.", json!({})),
        _ => err(500, "SOMETHING_NEW", "?", json!({})),
    });
    let client = Client::new(&addr).unwrap();
    let e = client.post::<Value, _>("/items", &json!({})).unwrap_err();
    match &e {
        ApiError::Server { status, code, message, fields } => {
            assert_eq!((*status, code, message.as_str()), (422, &ErrorCode::Validation, "Check the fields."));
            assert_eq!(fields.get("name").map(String::as_str), Some("Required."));
            assert_eq!(fields.get("lines.0.quantity").map(String::as_str), Some("Too small."));
        }
        other => panic!("{other:?}"),
    }
    assert_eq!(e.fields().len(), 2);
    assert_eq!(client.delete::<Value>("/items/1").unwrap_err().code(), Some(&ErrorCode::Conflict));
    assert_eq!(client.post::<Value, _>("/stock/out", &json!({})).unwrap_err().code(), Some(&ErrorCode::InsufficientStock));
    assert_eq!(client.get::<Value>("/nope", &[]).unwrap_err().code(), Some(&ErrorCode::Other("SOMETHING_NEW".into())));
}

#[test]
fn an_answer_that_is_not_an_envelope_is_a_bad_response_not_a_crash() {
    let (addr, _) = serve(|_| Reply { status: 502, headers: vec![("Content-Type", "text/html".into())], body: b"<html>Bad gateway</html>".to_vec(), delay: Duration::ZERO });
    let client = Client::new(&addr).unwrap();
    match client.get::<Value>("/items", &[]).unwrap_err() {
        ApiError::BadResponse { status, detail } => assert_eq!((status, detail.as_str()), (502, "<html>Bad gateway</html>")),
        other => panic!("{other:?}"),
    }
    let (addr, _) = serve(|_| Reply { status: 200, headers: vec![], body: b"not json".to_vec(), delay: Duration::ZERO });
    assert!(matches!(Client::new(&addr).unwrap().get::<Value>("/items", &[]), Err(ApiError::BadResponse { status: 200, .. })));
}

#[test]
fn a_slow_server_is_a_timeout() {
    let (addr, _) = serve(|_| Reply { delay: Duration::from_millis(700), ..ok(json!([])) });
    let client = Client::with_timeout(&addr, Duration::from_millis(150)).unwrap();
    assert_eq!(client.get::<Value>("/items", &[]).unwrap_err(), ApiError::Timeout);
}

#[test]
fn a_server_that_is_down_is_a_network_error_and_a_bad_address_is_refused_before_any_request() {
    let port = {
        let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        l.local_addr().unwrap().port()
    }; // listener dropped: nothing listens on this port now
    let client = Client::with_timeout(&format!("127.0.0.1:{port}"), Duration::from_secs(3)).unwrap();
    assert!(matches!(client.get::<Value>("/items", &[]), Err(ApiError::Network(_))));
    assert!(matches!(Client::new("https://secure-host"), Err(ApiError::InvalidUrl(_))));
    assert!(matches!(Client::new(""), Err(ApiError::InvalidUrl(_))));
}

#[test]
fn a_list_gives_its_paging_meta_and_the_query_is_encoded_and_empty_values_are_dropped() {
    let (addr, log) = serve(|_| json_reply(200, json!({ "success": true, "data": [{ "id": 1, "name": "Kertas A4" }], "meta": { "page": 2, "pageSize": 8, "total": 17 } })));
    #[derive(Deserialize, Debug, PartialEq)]
    struct Item {
        id: i64,
        name: String,
    }
    let client = Client::new(&addr).unwrap();
    let got = client.get::<Vec<Item>>("/items", &[("page", "2"), ("search", "kertas a4&x"), ("status", "")]).unwrap();
    assert_eq!(got.data, vec![Item { id: 1, name: "Kertas A4".into() }]);
    let meta = got.meta.unwrap();
    assert_eq!((meta.page, meta.page_size, meta.total), (2, 8, 17));
    assert_eq!(log.lock().unwrap()[0].url, "/api/items?page=2&search=kertas%20a4%26x");
}

#[test]
fn the_language_header_follows_set_lang() {
    let (addr, log) = serve(|_| ok(json!(null)));
    let client = Client::new(&addr).unwrap();
    client.get::<Option<()>>("/a", &[]).unwrap();
    client.set_lang(Lang::En);
    client.get::<Option<()>>("/b", &[]).unwrap();
    let seen = log.lock().unwrap().clone();
    assert_eq!((seen[0].lang.as_deref(), seen[1].lang.as_deref()), (Some("id"), Some("en")));
}

#[test]
fn put_post_delete_and_empty_posts_use_the_right_method_and_accept_null_data() {
    let (addr, log) = serve(|_| ok(json!(null)));
    let client = Client::new(&addr).unwrap();
    client.put::<Option<()>, _>("/items/3", &json!({ "name": "x" })).unwrap();
    client.post::<Option<()>, _>("/items", &json!({ "name": "y" })).unwrap();
    client.delete::<Option<()>>("/items/3").unwrap();
    client.post_empty::<Option<()>>("/items/3/activate").unwrap();
    let seen = log.lock().unwrap().clone();
    let got: Vec<(&str, &str)> = seen.iter().map(|s| (s.method.as_str(), s.url.as_str())).collect();
    assert_eq!(got, [("PUT", "/api/items/3"), ("POST", "/api/items"), ("DELETE", "/api/items/3"), ("POST", "/api/items/3/activate")]);
    assert_eq!(seen[3].body, Vec::<u8>::new());
}

#[test]
fn a_file_download_gives_the_bytes_and_the_name_and_an_error_is_still_an_error() {
    let bytes: Vec<u8> = (0..=255).collect();
    let expected = bytes.clone();
    let (addr, _) = serve(move |s| {
        if s.url.starts_with("/api/export/items") {
            Reply { status: 200, headers: vec![("Content-Disposition", r#"attachment; filename="ezi-items-20261122.xlsx""#.into())], body: bytes.clone(), delay: Duration::ZERO }
        } else {
            err(403, "FORBIDDEN", "No access.", json!({}))
        }
    });
    let client = Client::new(&addr).unwrap();
    let file = client.get_file("/export/items", &[("search", "a")]).unwrap();
    assert_eq!((file.file_name.as_str(), file.bytes), ("ezi-items-20261122.xlsx", expected));
    assert_eq!(client.get_file("/backup/x", &[]).unwrap_err().code(), Some(&ErrorCode::Forbidden));
}

#[test]
fn a_file_upload_sends_the_raw_bytes_with_the_files_own_type() {
    let (addr, log) = serve(|_| ok(json!({ "photoVersion": "abc.png" })));
    #[derive(Deserialize)]
    struct Done {
        #[serde(rename = "photoVersion")]
        photo_version: String,
    }
    let png = vec![0x89, b'P', b'N', b'G', 0, 1, 2, 3, 255];
    let done = Client::new(&addr).unwrap().put_file::<Done>("/items/5/photo", png.clone(), "image/png").unwrap();
    assert_eq!(done.data.photo_version, "abc.png");
    let seen = log.lock().unwrap().clone();
    assert_eq!((seen[0].method.as_str(), seen[0].url.as_str(), seen[0].content_type.as_deref()), ("PUT", "/api/items/5/photo", Some("image/png")));
    assert_eq!(seen[0].body, png);
}

#[test]
fn raw_bytes_download_and_a_missing_photo_is_not_found() {
    let (addr, _) = serve(|s| if s.url == "/api/items/1/photo" { Reply { status: 200, headers: vec![], body: vec![1, 2, 3], delay: Duration::ZERO } } else { err(404, "NOT_FOUND", "Not found.", json!({})) });
    let client = Client::new(&addr).unwrap();
    assert_eq!(client.get_bytes("/items/1/photo").unwrap(), vec![1, 2, 3]);
    assert_eq!(client.get_bytes("/items/2/photo").unwrap_err().code(), Some(&ErrorCode::NotFound));
}

#[test]
fn logout_and_an_expired_session_both_forget_the_cookie() {
    let (addr, log) = serve(|s| match s.url.as_str() {
        "/api/auth/login" => ok(user(false)).header("Set-Cookie", COOKIE_SET),
        "/api/auth/logout" => ok(json!(null)).header("Set-Cookie", "ezi_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT"),
        "/api/items" => err(401, "UNAUTHENTICATED", "Sign in again.", json!({})),
        _ => ok(json!(null)),
    });
    let client = Client::new(&addr).unwrap();
    client.login("a@b.c", &Password::new("x")).unwrap();
    client.logout().unwrap();
    assert!(!client.has_session());

    client.login("a@b.c", &Password::new("x")).unwrap();
    assert!(client.has_session());
    assert!(client.get::<Value>("/items", &[]).unwrap_err().is_unauthenticated());
    assert!(!client.has_session(), "the server ended the session");
    let after = log.lock().unwrap().last().unwrap().clone();
    assert_eq!(after.url, "/api/items");
}

#[test]
fn setup_status_and_first_admin_use_the_setup_endpoints() {
    let (addr, log) = serve(|s| match s.url.as_str() {
        "/api/setup/status" => ok(json!({ "needsSetup": true })),
        _ => ok(user(false)),
    });
    let client = Client::new(&addr).unwrap();
    assert!(client.needs_setup().unwrap());
    client.create_first_admin("Admin One", "admin@test.example", &Password::new("first-pass-1")).unwrap();
    let seen = log.lock().unwrap().clone();
    assert_eq!(serde_json::from_slice::<Value>(&seen[1].body).unwrap(), json!({ "name": "Admin One", "email": "admin@test.example", "password": "first-pass-1" }));
    assert_eq!(seen[1].url, "/api/setup/first-admin");
}

#[test]
fn the_item_choices_load_every_page_not_just_the_first_500() {
    // 1,200 active items: the server gives 500, 500 and 200. The first version of the form stopped after 500.
    let (addr, log) = serve(|s| {
        let page: usize = s.url.split("page=").nth(1).and_then(|p| p.split('&').next()).and_then(|p| p.parse().ok()).unwrap_or(1);
        let (from, to) = ((page - 1) * 500, (page * 500).min(1200));
        let rows: Vec<Value> = (from..to).map(|i| json!({ "id": i, "name": format!("Barang {i:04}"), "categoryName": "K", "subcategoryName": "S", "unit": "pcs", "status": "Active", "stockStatus": "Safe", "availableForLoan": 1 })).collect();
        json_reply(200, json!({ "success": true, "data": rows, "meta": { "page": page, "pageSize": 500, "total": 1200 } }))
    });
    let client = Client::new(&addr).unwrap();
    let items = client.pickable_items().unwrap();
    assert_eq!(items.len(), 1200);
    assert_eq!((items[0].name.as_str(), items[1199].name.as_str()), ("Barang 0000", "Barang 1199"));
    let urls: Vec<String> = log.lock().unwrap().iter().map(|s| s.url.clone()).collect();
    assert_eq!(urls.len(), 3, "{urls:?}");
    assert!(urls.iter().all(|u| u.contains("status=Active") && u.contains("pageSize=500")));
}

#[test]
fn a_short_list_of_items_is_one_request() {
    let (addr, log) = serve(|_| json_reply(200, json!({ "success": true, "data": [{ "id": 1, "name": "A", "categoryName": "K", "subcategoryName": "S", "unit": "pcs", "status": "Active", "stockStatus": "Safe", "availableForLoan": 1 }], "meta": { "page": 1, "pageSize": 500, "total": 1 } })));
    assert_eq!(Client::new(&addr).unwrap().pickable_items().unwrap().len(), 1);
    assert_eq!(log.lock().unwrap().len(), 1);
}
