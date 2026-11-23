//! The EZI HTTP API as the desktop client sees it: the same endpoints, envelope and error codes as the web app.
//! Every business rule stays on the server. This client only sends requests and returns what the server says.
//!
//! The session cookie is kept in memory only. Nothing here writes a password or a cookie to disk or to a log.

use std::collections::BTreeMap;
use std::fmt;
use std::sync::Mutex;
use std::time::Duration;

use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};

/// Name of the session cookie set by the server (`backend/src/auth.ts`).
const SESSION_COOKIE: &str = "ezi_session";
/// Header that sets the language of server messages (`frontend/src/lib/api/transport.ts`).
const LANG_HEADER: &str = "X-EZI-Lang";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Lang {
    Id,
    En,
}

impl Lang {
    fn code(self) -> &'static str {
        match self {
            Lang::Id => "id",
            Lang::En => "en",
        }
    }
}

/// A password that cannot be printed by accident: `Debug` and `Display` show `***`.
#[derive(Clone)]
pub struct Password(String);

impl Password {
    pub fn new(s: impl Into<String>) -> Self {
        Password(s.into())
    }
    /// Only for building a request body.
    fn expose(&self) -> &str {
        &self.0
    }
}
impl fmt::Debug for Password {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("***")
    }
}
impl fmt::Display for Password {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("***")
    }
}

/// The error codes of the API contract (PRD 6.6).
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ErrorCode {
    Validation,
    Unauthenticated,
    Forbidden,
    NotFound,
    Conflict,
    InsufficientStock,
    BusinessRule,
    RateLimited,
    Internal,
    /// A code this client does not know (a newer server).
    Other(String),
}

impl ErrorCode {
    fn parse(s: &str) -> Self {
        match s {
            "VALIDATION_ERROR" => Self::Validation,
            "UNAUTHENTICATED" => Self::Unauthenticated,
            "FORBIDDEN" => Self::Forbidden,
            "NOT_FOUND" => Self::NotFound,
            "CONFLICT" => Self::Conflict,
            "INSUFFICIENT_STOCK" => Self::InsufficientStock,
            "BUSINESS_RULE_VIOLATION" => Self::BusinessRule,
            "RATE_LIMITED" => Self::RateLimited,
            "INTERNAL_ERROR" => Self::Internal,
            other => Self::Other(other.to_string()),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ApiError {
    /// The server address is not a usable http address.
    InvalidUrl(String),
    /// The server could not be reached (wrong address, server off, no network).
    Network(String),
    /// The server did not answer in time.
    Timeout,
    /// The server answered with an error envelope. `message` is in the language set with `set_lang`.
    Server { status: u16, code: ErrorCode, message: String, fields: BTreeMap<String, String> },
    /// The answer was not what the API contract promises (for example a proxy error page).
    BadResponse { status: u16, detail: String },
}

impl ApiError {
    pub fn is_unauthenticated(&self) -> bool {
        matches!(self, ApiError::Server { code: ErrorCode::Unauthenticated, .. })
    }
    /// The server's code, when the error came from the server.
    pub fn code(&self) -> Option<&ErrorCode> {
        match self {
            ApiError::Server { code, .. } => Some(code),
            _ => None,
        }
    }
    /// The server's field messages (`fields` of the envelope), empty for other errors.
    pub fn fields(&self) -> BTreeMap<String, String> {
        match self {
            ApiError::Server { fields, .. } => fields.clone(),
            _ => BTreeMap::new(),
        }
    }
}

impl fmt::Display for ApiError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ApiError::InvalidUrl(u) => write!(f, "invalid server address: {u}"),
            ApiError::Network(e) => write!(f, "cannot reach the server: {e}"),
            ApiError::Timeout => f.write_str("the server did not answer in time"),
            ApiError::Server { message, .. } => f.write_str(message),
            ApiError::BadResponse { status, detail } => write!(f, "unexpected answer from the server (status {status}): {detail}"),
        }
    }
}
impl std::error::Error for ApiError {}

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Eq)]
pub struct ListMeta {
    pub page: u32,
    #[serde(rename = "pageSize")]
    pub page_size: u32,
    pub total: u32,
}

/// A successful answer: the data and, for lists, the paging meta.
#[derive(Clone, Debug, PartialEq)]
pub struct Success<T> {
    pub data: T,
    pub meta: Option<ListMeta>,
}

/// A file answer (Excel export, backup download).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Download {
    pub file_name: String,
    pub bytes: Vec<u8>,
}

/// What `/auth/me` and `/auth/login` return.
#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
pub struct SessionUser {
    pub id: i64,
    pub name: String,
    pub email: String,
    pub role: Role,
    #[serde(rename = "mustChangePassword")]
    pub must_change_password: bool,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
pub enum Role {
    Admin,
    Staff,
}

enum Body {
    None,
    Json(Vec<u8>),
    Raw { bytes: Vec<u8>, content_type: String },
}

struct Reply {
    status: u16,
    headers: ureq::http::HeaderMap,
    body: Vec<u8>,
}

/// One server, one session. Cheap to share by reference between threads.
pub struct Client {
    base: String,
    agent: ureq::Agent,
    cookie: Mutex<Option<String>>,
    lang: Mutex<Lang>,
}

/// `192.168.1.10:3000`, `http://eziserver:3000/` and `HTTP://host` all become a base like `http://host:3000`.
/// Only http is accepted: the EZI server speaks plain http on the LAN. A path, query or fragment is refused.
pub fn normalize_server_url(input: &str) -> Result<String, ApiError> {
    let bad = || ApiError::InvalidUrl(input.trim().to_string());
    let s = input.trim();
    if s.is_empty() || s.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return Err(bad());
    }
    let lower = s.to_ascii_lowercase();
    let rest = if let Some(r) = lower.strip_prefix("http://") {
        &s[s.len() - r.len()..]
    } else if lower.starts_with("https://") || lower.contains("://") {
        return Err(bad());
    } else {
        s
    };
    let rest = rest.trim_end_matches('/');
    if rest.is_empty() || rest.contains(['/', '?', '#', '@', '\\']) {
        return Err(bad());
    }
    // shortcut: a host name or IPv4 address with an optional port; an IPv6 literal is refused (office LANs use names or IPv4).
    let (host, port) = match rest.split_once(':') {
        Some((h, p)) => (h, Some(p)),
        None => (rest, None),
    };
    if host.is_empty() {
        return Err(bad());
    }
    if let Some(p) = port {
        match p.parse::<u16>() {
            Ok(n) if n > 0 => {}
            _ => return Err(bad()),
        }
    }
    Ok(format!("http://{rest}"))
}

/// Percent-encodes a query component (everything except unreserved characters).
fn encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(b as char),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

impl Client {
    /// `server` is what the user typed, for example `192.168.1.10:3000`.
    pub fn new(server: &str) -> Result<Self, ApiError> {
        Self::with_timeout(server, Duration::from_secs(15))
    }

    pub fn with_timeout(server: &str, timeout: Duration) -> Result<Self, ApiError> {
        let base = normalize_server_url(server)?;
        let agent: ureq::Agent = ureq::Agent::config_builder()
            .timeout_global(Some(timeout))
            // An error status is an answer with an envelope we want to read, not a transport failure.
            .http_status_as_error(false)
            .max_redirects(0)
            .build()
            .into();
        Ok(Client { base, agent, cookie: Mutex::new(None), lang: Mutex::new(Lang::Id) })
    }

    pub fn base_url(&self) -> &str {
        &self.base
    }

    pub fn set_lang(&self, lang: Lang) {
        *self.lang.lock().unwrap() = lang;
    }

    /// True after a successful login and until logout or an `UNAUTHENTICATED` answer.
    pub fn has_session(&self) -> bool {
        self.cookie.lock().unwrap().is_some()
    }

    // ------------------------------------------------------------------ generic requests

    pub fn get<T: DeserializeOwned>(&self, path: &str, query: &[(&str, &str)]) -> Result<Success<T>, ApiError> {
        self.json(self.send("GET", path, query, Body::None)?)
    }

    pub fn post<T: DeserializeOwned, B: Serialize>(&self, path: &str, body: &B) -> Result<Success<T>, ApiError> {
        self.json(self.send("POST", path, &[], Self::json_body(body)?)?)
    }

    pub fn put<T: DeserializeOwned, B: Serialize>(&self, path: &str, body: &B) -> Result<Success<T>, ApiError> {
        self.json(self.send("PUT", path, &[], Self::json_body(body)?)?)
    }

    pub fn delete<T: DeserializeOwned>(&self, path: &str) -> Result<Success<T>, ApiError> {
        self.json(self.send("DELETE", path, &[], Body::None)?)
    }

    /// POST or PUT without a body (the `/items/:id/activate` style endpoints).
    pub fn post_empty<T: DeserializeOwned>(&self, path: &str) -> Result<Success<T>, ApiError> {
        self.json(self.send("POST", path, &[], Body::None)?)
    }

    /// Downloads a file (Excel export, backup) with its file name from `Content-Disposition`.
    pub fn get_file(&self, path: &str, query: &[(&str, &str)]) -> Result<Download, ApiError> {
        let reply = self.send("GET", path, query, Body::None)?;
        if !(200..300).contains(&reply.status) {
            return Err(self.error_of(&reply));
        }
        let disposition = reply.headers.get("content-disposition").and_then(|v| v.to_str().ok()).unwrap_or("");
        Ok(Download { file_name: file_name_of(disposition), bytes: reply.body })
    }

    /// Uploads a file as the raw body (item photo): `content_type` is the file's own type, for example `image/png`.
    pub fn put_file<T: DeserializeOwned>(&self, path: &str, bytes: Vec<u8>, content_type: &str) -> Result<Success<T>, ApiError> {
        self.json(self.send("PUT", path, &[], Body::Raw { bytes, content_type: content_type.to_string() })?)
    }

    /// GET raw bytes (item photo). A missing photo is `NotFound`.
    pub fn get_bytes(&self, path: &str) -> Result<Vec<u8>, ApiError> {
        let reply = self.send("GET", path, &[], Body::None)?;
        if (200..300).contains(&reply.status) { Ok(reply.body) } else { Err(self.error_of(&reply)) }
    }

    // ------------------------------------------------------------------ session

    /// Signs in. The password goes only into the request body. Check `must_change_password` on the result:
    /// when true the server allows nothing but a password change until it is done.
    pub fn login(&self, email: &str, password: &Password) -> Result<SessionUser, ApiError> {
        #[derive(Serialize)]
        struct Login<'a> {
            email: &'a str,
            password: &'a str,
            #[serde(rename = "keepSignedIn")]
            keep_signed_in: bool,
        }
        // keepSignedIn is false: the session cookie lives in memory only and ends with the program.
        let body = Self::json_body(&Login { email, password: password.expose(), keep_signed_in: false })?;
        let reply = self.send("POST", "/auth/login", &[], body)?;
        let user: Success<SessionUser> = self.json(Reply { status: reply.status, headers: reply.headers.clone(), body: reply.body })?;
        if !self.has_session() {
            return Err(ApiError::BadResponse { status: reply.status, detail: "the server set no session cookie".into() });
        }
        Ok(user.data)
    }

    pub fn logout(&self) -> Result<(), ApiError> {
        let r = self.post_empty::<Option<()>>("/auth/logout");
        *self.cookie.lock().unwrap() = None;
        r.map(|_| ())
    }

    pub fn me(&self) -> Result<SessionUser, ApiError> {
        Ok(self.get::<SessionUser>("/auth/me", &[])?.data)
    }

    /// `current` is required by the server except when a temporary password must be replaced.
    /// Returns the updated user (its `must_change_password` is then false), or `me()` when the answer has no user.
    pub fn change_password(&self, current: Option<&Password>, new: &Password) -> Result<SessionUser, ApiError> {
        #[derive(Serialize)]
        struct Change<'a> {
            #[serde(skip_serializing_if = "Option::is_none")]
            current: Option<&'a str>,
            password: &'a str,
        }
        // The server answers with the updated user (found by the real-backend test), not null.
        let answer = self.post::<serde_json::Value, _>("/auth/change-password", &Change { current: current.map(Password::expose), password: new.expose() })?;
        match serde_json::from_value::<SessionUser>(answer.data) {
            Ok(user) => Ok(user),
            Err(_) => self.me(),
        }
    }

    /// The dashboard numbers: the `admin` part for an Admin, the `staff` part for Staff.
    pub fn dashboard(&self) -> Result<crate::models::DashboardSummary, ApiError> {
        Ok(self.get::<crate::models::DashboardSummary>("/dashboard/summary", &[])?.data)
    }

    /// A page of items. `query` takes the same names as the web app: `page`, `pageSize`, `search`, `categoryId`, `subcategoryId`,
    /// `stockStatus`, `status` (Admin), `supplierId`, `location`, `sort`. Empty values are left out.
    pub fn items(&self, query: &[(&str, &str)]) -> Result<Success<Vec<crate::models::Item>>, ApiError> {
        self.get("/items", query)
    }

    pub fn item(&self, id: i64) -> Result<crate::models::Item, ApiError> {
        Ok(self.get::<crate::models::Item>(&format!("/items/{id}"), &[])?.data)
    }

    /// The item's photo file, or `NotFound` when it has none.
    pub fn item_photo(&self, id: i64) -> Result<Vec<u8>, ApiError> {
        self.get_bytes(&format!("/items/{id}/photo"))
    }

    /// Active categories or subcategories (`path` is `/categories` or `/subcategories`) as filter options.
    pub fn name_options(&self, path: &str) -> Result<Vec<crate::models::NameOption>, ApiError> {
        Ok(self.get::<Vec<crate::models::NameOption>>(path, &[("status", "Active"), ("pageSize", "500"), ("sort", "name:asc")])?.data)
    }

    pub fn create_item(&self, input: &crate::models::ItemInput) -> Result<crate::models::Item, ApiError> {
        Ok(self.post::<crate::models::Item, _>("/items", input)?.data)
    }

    pub fn update_item(&self, id: i64, input: &crate::models::ItemInput) -> Result<crate::models::Item, ApiError> {
        Ok(self.put::<crate::models::Item, _>(&format!("/items/{id}"), input)?.data)
    }

    /// Fails with `Conflict` when the item has history (it must be deactivated instead).
    pub fn delete_item(&self, id: i64) -> Result<(), ApiError> {
        self.delete::<Option<()>>(&format!("/items/{id}")).map(|_| ())
    }

    pub fn set_item_active(&self, id: i64, active: bool) -> Result<(), ApiError> {
        self.set_record_active("/items", id, active)
    }

    // The master data records (categories, subcategories, suppliers, `base` like `/suppliers`) share these four calls.

    /// Creates the record (`id` None) or updates it.
    pub fn save_record<B: Serialize>(&self, base: &str, id: Option<i64>, body: &B) -> Result<(), ApiError> {
        match id {
            Some(id) => self.put::<serde_json::Value, _>(&format!("{base}/{id}"), body).map(|_| ()),
            None => self.post::<serde_json::Value, _>(base, body).map(|_| ()),
        }
    }

    /// Fails with `Conflict` when something uses the record (it must be deactivated instead).
    pub fn delete_record(&self, base: &str, id: i64) -> Result<(), ApiError> {
        self.delete::<Option<()>>(&format!("{base}/{id}")).map(|_| ())
    }

    pub fn set_record_active(&self, base: &str, id: i64, active: bool) -> Result<(), ApiError> {
        let kind = if active { "activate" } else { "deactivate" };
        self.post_empty::<serde_json::Value>(&format!("{base}/{id}/{kind}")).map(|_| ())
    }

    /// Sets or replaces an item's photo. `content_type` is the file's own type; the server checks the bytes.
    pub fn upload_item_photo(&self, id: i64, bytes: Vec<u8>, content_type: &str) -> Result<(), ApiError> {
        self.put_file::<serde_json::Value>(&format!("/items/{id}/photo"), bytes, content_type).map(|_| ())
    }

    pub fn remove_item_photo(&self, id: i64) -> Result<(), ApiError> {
        self.delete::<Option<()>>(&format!("/items/{id}/photo")).map(|_| ())
    }

    /// Validates a CSV file and returns one result per row. Saves nothing.
    pub fn import_preview(&self, csv: &str) -> Result<crate::models::ImportReport, ApiError> {
        #[derive(Serialize)]
        struct Body<'a> {
            csv: &'a str,
        }
        Ok(self.post::<crate::models::ImportReport, _>("/items/import/preview", &Body { csv })?.data)
    }

    /// Confirms the import: the server re-validates, takes a backup and creates the ready rows in one transaction.
    pub fn import_confirm(&self, csv: &str) -> Result<crate::models::ImportReport, ApiError> {
        #[derive(Serialize)]
        struct Body<'a> {
            csv: &'a str,
        }
        Ok(self.post::<crate::models::ImportReport, _>("/items/import", &Body { csv })?.data)
    }

    /// Excel export of the items list with the same filters as `items`.
    pub fn export_items(&self, query: &[(&str, &str)]) -> Result<Download, ApiError> {
        self.get_file("/export/items", query)
    }

    /// True when the server has no user yet and wants the first-run setup.
    // Stock transactions (Admin only).

    pub fn stock_transactions(&self, query: &[(&str, &str)]) -> Result<Success<Vec<crate::models::StockTx>>, ApiError> {
        self.get("/stock/transactions", query)
    }

    pub fn stock_transaction(&self, id: i64) -> Result<crate::models::StockTx, ApiError> {
        Ok(self.get::<crate::models::StockTx>(&format!("/stock/transactions/{id}"), &[])?.data)
    }

    /// Incoming (`kind` "in") or outgoing ("out") stock. An outgoing request over the stock is refused by the server.
    pub fn stock_move(&self, kind: &str, body: &crate::models::StockMoveInput) -> Result<crate::models::StockTx, ApiError> {
        Ok(self.post::<crate::models::StockTx, _>(&format!("/stock/{kind}"), body)?.data)
    }

    pub fn stock_adjust(&self, body: &crate::models::AdjustmentInput) -> Result<crate::models::StockTx, ApiError> {
        Ok(self.post::<crate::models::StockTx, _>("/stock/adjustment", body)?.data)
    }

    pub fn void_stock(&self, id: i64, reason: &str) -> Result<crate::models::StockTx, ApiError> {
        Ok(self.post::<crate::models::StockTx, _>(&format!("/stock/transactions/{id}/void"), &serde_json::json!({ "reason": reason }))?.data)
    }

    /// Active items for the item pickers of the forms, by name. shortcut: the first 500 (the server's page limit),
    /// searched in the picker; upgrade to a server search when an office has more active items than that.
    pub fn pickable_items(&self) -> Result<Vec<crate::models::Item>, ApiError> {
        Ok(self.items(&[("status", "Active"), ("pageSize", "500"), ("sort", "name:asc")])?.data)
    }

    // Loans.

    pub fn loans(&self, query: &[(&str, &str)]) -> Result<Success<Vec<crate::models::Loan>>, ApiError> {
        self.get("/loans", query)
    }

    pub fn loan(&self, id: i64) -> Result<crate::models::Loan, ApiError> {
        Ok(self.get::<crate::models::Loan>(&format!("/loans/{id}"), &[])?.data)
    }

    /// Creates the loan (`id` None) or updates a draft; `input.submit` sends it for approval.
    pub fn save_loan(&self, id: Option<i64>, input: &crate::models::LoanInput) -> Result<crate::models::Loan, ApiError> {
        Ok(match id {
            Some(id) => self.put::<crate::models::Loan, _>(&format!("/loans/{id}"), input)?.data,
            None => self.post::<crate::models::Loan, _>("/loans", input)?.data,
        })
    }

    /// `submit`, `cancel`, `approve` or `issue`: the loan moves on and the server says whether that is allowed now.
    pub fn loan_action(&self, id: i64, action: &str) -> Result<crate::models::Loan, ApiError> {
        Ok(self.post_empty::<crate::models::Loan>(&format!("/loans/{id}/{action}"))?.data)
    }

    pub fn reject_loan(&self, id: i64, reason: &str) -> Result<crate::models::Loan, ApiError> {
        Ok(self.post::<crate::models::Loan, _>(&format!("/loans/{id}/reject"), &serde_json::json!({ "reason": reason }))?.data)
    }

    /// A loan is returned in full: there is no quantity to send.
    pub fn return_loan(&self, id: i64, input: &crate::models::ReturnInput) -> Result<crate::models::Loan, ApiError> {
        Ok(self.post::<crate::models::Loan, _>(&format!("/loans/{id}/return"), input)?.data)
    }

    /// Active people for the borrower choice. Admin only (Staff always borrow for themselves).
    pub fn borrower_options(&self) -> Result<Vec<crate::models::UserOption>, ApiError> {
        Ok(self.get::<Vec<crate::models::UserOption>>("/users", &[("status", "Active"), ("pageSize", "500"), ("sort", "name:asc")])?.data)
    }

    // Purchase requests.

    pub fn purchases(&self, query: &[(&str, &str)]) -> Result<Success<Vec<crate::models::Purchase>>, ApiError> {
        self.get("/purchase-requests", query)
    }

    pub fn purchase(&self, id: i64) -> Result<crate::models::Purchase, ApiError> {
        Ok(self.get::<crate::models::Purchase>(&format!("/purchase-requests/{id}"), &[])?.data)
    }

    /// Creates the request (`id` None) or updates a draft; `input.submit` sends it for approval.
    pub fn save_purchase(&self, id: Option<i64>, input: &crate::models::PurchaseInput) -> Result<crate::models::Purchase, ApiError> {
        Ok(match id {
            Some(id) => self.put::<crate::models::Purchase, _>(&format!("/purchase-requests/{id}"), input)?.data,
            None => self.post::<crate::models::Purchase, _>("/purchase-requests", input)?.data,
        })
    }

    /// `submit`, `cancel` or `approve`.
    pub fn purchase_action(&self, id: i64, action: &str) -> Result<crate::models::Purchase, ApiError> {
        Ok(self.post_empty::<crate::models::Purchase>(&format!("/purchase-requests/{id}/{action}"))?.data)
    }

    pub fn reject_purchase(&self, id: i64, reason: &str) -> Result<crate::models::Purchase, ApiError> {
        Ok(self.post::<crate::models::Purchase, _>(&format!("/purchase-requests/{id}/reject"), &serde_json::json!({ "reason": reason }))?.data)
    }

    /// The items arrived, all of them: the server posts the incoming stock and creates the new items with their codes.
    pub fn receive_purchase(&self, id: i64, input: &crate::models::ReceiveInput) -> Result<crate::models::Purchase, ApiError> {
        Ok(self.post::<crate::models::Purchase, _>(&format!("/purchase-requests/{id}/receive"), input)?.data)
    }

    /// Everyone, active or not, for the requester filter of the purchase list. Admin only.
    pub fn all_people(&self) -> Result<Vec<crate::models::UserOption>, ApiError> {
        Ok(self.get::<Vec<crate::models::UserOption>>("/users", &[("pageSize", "500"), ("sort", "name:asc")])?.data)
    }

    pub fn needs_setup(&self) -> Result<bool, ApiError> {
        #[derive(Deserialize)]
        struct Status {
            #[serde(rename = "needsSetup")]
            needs_setup: bool,
        }
        Ok(self.get::<Status>("/setup/status", &[])?.data.needs_setup)
    }

    pub fn create_first_admin(&self, name: &str, email: &str, password: &Password) -> Result<(), ApiError> {
        #[derive(Serialize)]
        struct Admin<'a> {
            name: &'a str,
            email: &'a str,
            password: &'a str,
        }
        self.post::<serde_json::Value, _>("/setup/first-admin", &Admin { name, email, password: password.expose() })?;
        Ok(())
    }

    // ------------------------------------------------------------------ plumbing

    fn json_body<B: Serialize>(body: &B) -> Result<Body, ApiError> {
        serde_json::to_vec(body).map(Body::Json).map_err(|e| ApiError::BadResponse { status: 0, detail: format!("cannot encode the request: {e}") })
    }

    fn send(&self, method: &str, path: &str, query: &[(&str, &str)], body: Body) -> Result<Reply, ApiError> {
        let mut url = format!("{}/api{}", self.base, path);
        let qs: Vec<String> = query.iter().filter(|(_, v)| !v.is_empty()).map(|(k, v)| format!("{}={}", encode(k), encode(v))).collect();
        if !qs.is_empty() {
            url.push('?');
            url.push_str(&qs.join("&"));
        }
        let mut req = ureq::http::Request::builder().method(method).uri(&url).header(LANG_HEADER, self.lang.lock().unwrap().code());
        if let Some(cookie) = self.cookie.lock().unwrap().as_deref() {
            req = req.header("Cookie", cookie);
        }
        let (content_type, bytes) = match body {
            Body::None => (None, Vec::new()),
            Body::Json(b) => (Some("application/json".to_string()), b),
            Body::Raw { bytes, content_type } => (Some(content_type), bytes),
        };
        if let Some(ct) = content_type {
            req = req.header("Content-Type", ct);
        }
        let request = req.body(bytes).map_err(|_| ApiError::InvalidUrl(url.clone()))?;

        let mut response = self.agent.run(request).map_err(|e| match e {
            ureq::Error::Timeout(_) => ApiError::Timeout,
            ureq::Error::Io(ref io) if io.kind() == std::io::ErrorKind::TimedOut => ApiError::Timeout,
            other => ApiError::Network(other.to_string()),
        })?;
        let status = response.status().as_u16();
        let headers = response.headers().clone();
        let body = response.body_mut().read_to_vec().map_err(|e| match e {
            ureq::Error::Timeout(_) => ApiError::Timeout,
            other => ApiError::Network(other.to_string()),
        })?;
        self.remember_cookie(&headers);
        Ok(Reply { status, headers, body })
    }

    /// Keeps the session cookie the server sets, and drops it when the server clears it (logout, expired session).
    fn remember_cookie(&self, headers: &ureq::http::HeaderMap) {
        for value in headers.get_all("set-cookie") {
            let Ok(line) = value.to_str() else { continue };
            let pair = line.split(';').next().unwrap_or("").trim();
            if let Some(token) = pair.strip_prefix(&format!("{SESSION_COOKIE}=")) {
                let cleared = token.is_empty() || line.to_ascii_lowercase().contains("expires=thu, 01 jan 1970");
                *self.cookie.lock().unwrap() = if cleared { None } else { Some(pair.to_string()) };
            }
        }
    }

    fn json<T: DeserializeOwned>(&self, reply: Reply) -> Result<Success<T>, ApiError> {
        #[derive(Deserialize)]
        struct Envelope<T> {
            success: bool,
            data: Option<T>,
            meta: Option<ListMeta>,
        }
        if !(200..300).contains(&reply.status) {
            return Err(self.error_of(&reply));
        }
        match serde_json::from_slice::<Envelope<T>>(&reply.body) {
            Ok(Envelope { success: true, data: Some(data), meta }) => Ok(Success { data, meta }),
            // `data: null` for endpoints that return nothing: T must then accept null (Option or ()).
            Ok(Envelope { success: true, data: None, meta }) => match serde_json::from_slice::<serde_json::Value>(b"null").and_then(serde_json::from_value::<T>) {
                Ok(data) => Ok(Success { data, meta }),
                Err(e) => Err(ApiError::BadResponse { status: reply.status, detail: format!("empty data: {e}") }),
            },
            _ => Err(self.error_of(&reply)),
        }
    }

    /// Turns an answer that is not a success into an error: the server's envelope when there is one, else a generic one.
    fn error_of(&self, reply: &Reply) -> ApiError {
        #[derive(Deserialize)]
        struct Failure {
            error: Detail,
        }
        #[derive(Deserialize)]
        struct Detail {
            code: String,
            message: String,
            #[serde(default)]
            fields: BTreeMap<String, String>,
        }
        match serde_json::from_slice::<Failure>(&reply.body) {
            Ok(Failure { error }) => {
                let code = ErrorCode::parse(&error.code);
                if code == ErrorCode::Unauthenticated {
                    // The session ended on the server (or the login failed): forget the cookie so `has_session` is honest.
                    *self.cookie.lock().unwrap() = None;
                }
                ApiError::Server { status: reply.status, code, message: error.message, fields: error.fields }
            }
            Err(_) => {
                let text = String::from_utf8_lossy(&reply.body);
                ApiError::BadResponse { status: reply.status, detail: text.chars().take(120).collect() }
            }
        }
    }
}

/// `attachment; filename="ezi-items-20261122.xlsx"` gives `ezi-items-20261122.xlsx` (quoted or not), else `download`.
fn file_name_of(disposition: &str) -> String {
    let Some(i) = disposition.find("filename=") else { return "download".into() };
    let name = disposition[i + "filename=".len()..].split(';').next().unwrap_or("").trim().trim_matches('"');
    if name.is_empty() { "download".into() } else { name.to_string() }
}

#[cfg(test)]
mod unit {
    use super::*;

    #[test]
    fn normalizes_server_addresses() {
        for (input, want) in [
            ("192.168.1.10:3000", "http://192.168.1.10:3000"),
            ("  eziserver:3000/ ", "http://eziserver:3000"),
            ("http://host", "http://host"),
            ("HTTP://Host:80/", "http://Host:80"),
            ("localhost:3000", "http://localhost:3000"),
        ] {
            assert_eq!(normalize_server_url(input).as_deref(), Ok(want), "{input}");
        }
    }

    #[test]
    fn refuses_bad_server_addresses() {
        for bad in ["", "   ", "https://host", "ftp://host", "host/path", "host?x=1", "host:0", "host:99999", "host:abc", "ho st", "http://", "user@host", ":3000"] {
            assert!(matches!(normalize_server_url(bad), Err(ApiError::InvalidUrl(_))), "{bad:?} should be refused");
        }
    }

    #[test]
    fn encodes_query_values() {
        assert_eq!(encode("kertas a4"), "kertas%20a4");
        assert_eq!(encode("a&b=c"), "a%26b%3Dc");
        assert_eq!(encode("é"), "%C3%A9");
        assert_eq!(encode("safe-_.~09azAZ"), "safe-_.~09azAZ");
    }

    #[test]
    fn reads_file_names() {
        assert_eq!(file_name_of(r#"attachment; filename="ezi-items-20261122.xlsx""#), "ezi-items-20261122.xlsx");
        assert_eq!(file_name_of("attachment; filename=backup.sql.gz"), "backup.sql.gz");
        assert_eq!(file_name_of("inline"), "download");
        assert_eq!(file_name_of(r#"attachment; filename="""#), "download");
    }

    #[test]
    fn a_password_never_prints() {
        let p = Password::new("hunter2-secret");
        assert_eq!(format!("{p:?}"), "***");
        assert_eq!(format!("{p}"), "***");
        assert!(!format!("{:?}", Some(&p)).contains("hunter2"));
    }
}
