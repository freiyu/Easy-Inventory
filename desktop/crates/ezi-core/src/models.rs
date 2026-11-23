//! Shapes of what the API returns, only as far as the desktop client uses them. They follow
//! `frontend/src/lib/api/*.ts` and `frontend/src/lib/types.ts`; unknown fields are ignored.

use serde::Deserialize;

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Hash)]
pub enum StockStatus {
    Safe,
    Low,
    Out,
}

/// The status of a loan as shown to people (`Overdue` is computed by the server from `Borrowed` and the due date).
#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Hash)]
pub enum LoanStatus {
    Draft,
    #[serde(rename = "Pending Approval")]
    PendingApproval,
    Approved,
    Rejected,
    Borrowed,
    Completed,
    Cancelled,
    Overdue,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
pub struct LoanBrief {
    pub id: i64,
    pub number: String,
    /// "Item xQty, Item xQty"
    pub summary: String,
    #[serde(rename = "expectedReturnDate")]
    pub expected_return_date: String,
    pub status: LoanStatus,
    #[serde(rename = "daysOverdue")]
    pub days_overdue: i64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
pub struct AttentionItem {
    pub id: i64,
    pub name: String,
    #[serde(rename = "categoryName")]
    pub category_name: String,
    #[serde(rename = "currentStock")]
    pub current_stock: i64,
    #[serde(rename = "minimumStock")]
    pub minimum_stock: i64,
    #[serde(rename = "stockStatus")]
    pub stock_status: StockStatus,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
pub struct StockCounts {
    #[serde(rename = "Safe")]
    pub safe: i64,
    #[serde(rename = "Low")]
    pub low: i64,
    #[serde(rename = "Out")]
    pub out: i64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
pub struct AdminDashboard {
    /// Loan requests plus purchase requests waiting for this Admin (never their own).
    #[serde(rename = "pendingApprovals")]
    pub pending_approvals: i64,
    pub stock: StockCounts,
    #[serde(rename = "needsAttention")]
    pub needs_attention: Vec<AttentionItem>,
}

impl AdminDashboard {
    /// Total unique active items: Safe + Low + Out (the web dashboard's first card).
    pub fn total_items(&self) -> i64 {
        self.stock.safe + self.stock.low + self.stock.out
    }
}

/// Staff see only their own loans and counts: no stock numbers and no money (PRD 3.2).
#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
pub struct StaffDashboard {
    #[serde(rename = "activeLoans")]
    pub active_loans: Vec<LoanBrief>,
    #[serde(rename = "overdueCount")]
    pub overdue_count: i64,
    #[serde(rename = "overdueFirst")]
    pub overdue_first: Option<LoanBrief>,
    pub requestable: i64,
    #[serde(rename = "activeItems")]
    pub active_items: i64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
pub struct DashboardSummary {
    pub admin: Option<AdminDashboard>,
    pub staff: Option<StaffDashboard>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
pub struct Movement {
    pub id: i64,
    pub number: String,
    /// `IN`, `OUT`, `ADJUSTMENT`, `LOAN_ISSUE`, `LOAN_RETURN` or `REVERSAL`.
    #[serde(rename = "type")]
    pub kind: String,
    pub date: String,
    #[serde(rename = "quantityChange")]
    pub quantity_change: i64,
    #[serde(rename = "balanceAfter")]
    pub balance_after: i64,
    #[serde(rename = "userName")]
    pub user_name: String,
}

/// An item as the API sends it. Staff get only the first group of fields (the server leaves the rest out, PRD 3.2).
#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
pub struct Item {
    pub id: i64,
    pub name: String,
    #[serde(rename = "categoryId")]
    pub category_id: Option<i64>,
    #[serde(rename = "categoryName")]
    pub category_name: String,
    #[serde(rename = "subcategoryId")]
    pub subcategory_id: Option<i64>,
    #[serde(rename = "subcategoryName")]
    pub subcategory_name: String,
    #[serde(rename = "supplierId")]
    pub supplier_id: Option<i64>,
    pub unit: String,
    /// `Active` or `Inactive`.
    pub status: String,
    #[serde(rename = "stockStatus")]
    pub stock_status: StockStatus,
    #[serde(rename = "availableForLoan")]
    pub available_for_loan: i64,
    /// The stored photo file name, null when there is no photo (v1.2).
    #[serde(rename = "photoVersion")]
    pub photo_version: Option<String>,
    /// Item detail for Staff only (v1.2): the value to encode as a barcode. Never shown as text.
    pub barcode: Option<String>,
    // Admin only:
    pub code: Option<String>,
    #[serde(rename = "currentStock")]
    pub current_stock: Option<i64>,
    #[serde(rename = "minimumStock")]
    pub minimum_stock: Option<i64>,
    #[serde(rename = "lastPurchasePrice")]
    pub last_purchase_price: Option<i64>,
    #[serde(rename = "supplierName")]
    pub supplier_name: Option<String>,
    pub location: Option<String>,
    pub notes: Option<String>,
    #[serde(rename = "createdAt")]
    pub created_at: Option<String>,
    #[serde(rename = "updatedAt")]
    pub updated_at: Option<String>,
    pub reserved: Option<i64>,
    #[serde(default)]
    pub movements: Vec<Movement>,
}

impl Item {
    /// What to encode in the barcode: the code for Admin, the barcode value for Staff.
    pub fn barcode_value(&self) -> Option<&str> {
        self.code.as_deref().or(self.barcode.as_deref())
    }
}

/// A category, subcategory or supplier option for a filter: only the id and the name.
#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
pub struct NameOption {
    pub id: i64,
    pub name: String,
}

/// A category (area) or subcategory (kind of item) as the Admin lists show it: both have the same shape.
#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
pub struct GroupRow {
    pub id: i64,
    pub name: String,
    pub code: String,
    pub description: String,
    /// `Active` or `Inactive`.
    pub status: String,
    #[serde(rename = "itemCount")]
    pub item_count: i64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
pub struct SupplierRow {
    pub id: i64,
    pub name: String,
    #[serde(rename = "contactPerson")]
    pub contact_person: String,
    pub phone: String,
    pub email: String,
    pub address: String,
    pub notes: String,
    /// `Active` or `Inactive`.
    pub status: String,
    #[serde(rename = "itemCount")]
    pub item_count: i64,
}

/// The body of create and update category or subcategory (`categorySchema` in `backend/src/schemas.ts`).
#[derive(Clone, Debug, serde::Serialize, PartialEq, Eq)]
pub struct GroupInput {
    pub name: String,
    pub code: String,
    pub description: String,
    pub status: String,
}

/// The body of create and update supplier.
#[derive(Clone, Debug, serde::Serialize, PartialEq, Eq)]
pub struct SupplierInput {
    pub name: String,
    #[serde(rename = "contactPerson")]
    pub contact_person: String,
    pub phone: String,
    pub email: String,
    pub address: String,
    pub notes: String,
    pub status: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
pub struct StockLine {
    #[serde(rename = "itemId")]
    pub item_id: i64,
    #[serde(rename = "itemName")]
    pub item_name: String,
    pub unit: String,
    #[serde(rename = "quantityChange")]
    pub quantity_change: i64,
    #[serde(rename = "balanceAfter")]
    pub balance_after: i64,
    #[serde(rename = "unitPrice")]
    pub unit_price: Option<i64>,
    pub total: Option<i64>,
}

/// A stock transaction as the list and the detail show it (`StockTxDto` in `frontend/src/lib/api/stock.ts`).
#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
pub struct StockTx {
    pub id: i64,
    pub number: String,
    /// `IN`, `OUT`, `ADJUSTMENT`, `LOAN_ISSUE`, `LOAN_RETURN` or `REVERSAL`.
    #[serde(rename = "type")]
    pub kind: String,
    /// `Posted` or `Voided`.
    pub status: String,
    pub date: String,
    #[serde(rename = "userName")]
    pub user_name: String,
    pub reason: String,
    pub notes: String,
    /// Supplier for IN, destination for OUT, reason for ADJUSTMENT and REVERSAL.
    pub party: String,
    /// Sum of line totals (IN only).
    pub total: i64,
    #[serde(rename = "reversalOfId")]
    pub reversal_of_id: Option<i64>,
    #[serde(rename = "reversalOfNumber")]
    pub reversal_of_number: Option<String>,
    #[serde(rename = "voidedById")]
    pub voided_by_id: Option<i64>,
    #[serde(rename = "voidedByNumber")]
    pub voided_by_number: Option<String>,
    #[serde(rename = "loanNumber")]
    pub loan_number: Option<String>,
    pub lines: Vec<StockLine>,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "allowedActions", default)]
    pub allowed_actions: Vec<String>,
}

impl StockTx {
    pub fn can_void(&self) -> bool {
        self.allowed_actions.iter().any(|a| a == "void")
    }
}

#[derive(Clone, Debug, serde::Serialize, PartialEq, Eq)]
pub struct StockLineInput {
    #[serde(rename = "itemId")]
    pub item_id: i64,
    pub quantity: i64,
    #[serde(rename = "unitPrice", skip_serializing_if = "Option::is_none")]
    pub unit_price: Option<i64>,
}

/// Body of incoming stock (`supplier_id` set) and outgoing stock (`destination` set).
#[derive(Clone, Debug, serde::Serialize, PartialEq, Eq)]
pub struct StockMoveInput {
    pub date: String,
    #[serde(rename = "supplierId", skip_serializing_if = "Option::is_none")]
    pub supplier_id: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub destination: Option<String>,
    pub lines: Vec<StockLineInput>,
    pub notes: String,
    /// One per form, so a second click or a retry cannot post the same transaction twice.
    #[serde(rename = "clientRequestId")]
    pub client_request_id: String,
}

#[derive(Clone, Debug, serde::Serialize, PartialEq, Eq)]
pub struct AdjustmentInput {
    pub date: String,
    #[serde(rename = "itemId")]
    pub item_id: i64,
    pub physical: i64,
    pub reason: String,
    #[serde(rename = "clientRequestId")]
    pub client_request_id: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
pub struct LoanLine {
    #[serde(rename = "itemId")]
    pub item_id: i64,
    #[serde(rename = "itemName")]
    pub item_name: String,
    pub unit: String,
    pub quantity: i64,
    /// Admin only: stock on hand and what can still be lent.
    #[serde(rename = "currentStock")]
    pub current_stock: Option<i64>,
    #[serde(rename = "availableForLoan")]
    pub available_for_loan: Option<i64>,
}

/// A loan as the list and the detail show it (`LoanDto` in `frontend/src/lib/api/loans.ts`).
#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
pub struct Loan {
    pub id: i64,
    pub number: String,
    #[serde(rename = "borrowerId")]
    pub borrower_id: i64,
    #[serde(rename = "borrowerName")]
    pub borrower_name: String,
    /// The stored status; `Overdue` is only in `display_status`.
    pub status: LoanStatus,
    #[serde(rename = "displayStatus")]
    pub display_status: LoanStatus,
    #[serde(rename = "daysOverdue")]
    pub days_overdue: i64,
    #[serde(rename = "returnFloor")]
    pub return_floor: String,
    #[serde(rename = "itemsSummary")]
    pub items_summary: String,
    #[serde(rename = "loanDate")]
    pub loan_date: String,
    #[serde(rename = "expectedReturnDate")]
    pub expected_return_date: String,
    pub purpose: String,
    pub notes: String,
    #[serde(rename = "rejectReason")]
    pub reject_reason: String,
    #[serde(rename = "approvedBy")]
    pub approved_by: Option<i64>,
    #[serde(rename = "approvedByName")]
    pub approved_by_name: String,
    #[serde(rename = "approvedAt")]
    pub approved_at: Option<String>,
    #[serde(rename = "issuedBy")]
    pub issued_by: Option<i64>,
    #[serde(rename = "issuedByName")]
    pub issued_by_name: String,
    #[serde(rename = "issuedAt")]
    pub issued_at: Option<String>,
    #[serde(rename = "returnedAt")]
    pub returned_at: Option<String>,
    #[serde(rename = "receivedBy")]
    pub received_by: Option<i64>,
    #[serde(rename = "receivedByName")]
    pub received_by_name: String,
    #[serde(rename = "returnNotes")]
    pub return_notes: String,
    pub lines: Vec<LoanLine>,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    /// What the signed-in user may do with this loan now: `edit`, `submit`, `cancel`, `approve`, `reject`, `issue`, `return`.
    #[serde(rename = "allowedActions", default)]
    pub allowed_actions: Vec<String>,
}

impl Loan {
    pub fn can(&self, action: &str) -> bool {
        self.allowed_actions.iter().any(|a| a == action)
    }
}

/// Body of create and update loan. `client_request_id` is only sent when creating.
#[derive(Clone, Debug, serde::Serialize, PartialEq, Eq)]
pub struct LoanInput {
    #[serde(rename = "borrowerId")]
    pub borrower_id: i64,
    pub lines: Vec<StockLineInput>,
    #[serde(rename = "loanDate")]
    pub loan_date: String,
    #[serde(rename = "expectedReturnDate")]
    pub expected_return_date: String,
    pub purpose: String,
    pub notes: String,
    /// Send for approval now, or keep as a draft.
    pub submit: bool,
    #[serde(rename = "clientRequestId", skip_serializing_if = "Option::is_none")]
    pub client_request_id: Option<String>,
}

#[derive(Clone, Debug, serde::Serialize, PartialEq, Eq)]
pub struct ReturnInput {
    #[serde(rename = "returnDate")]
    pub return_date: String,
    pub notes: String,
}

/// A person for the borrower choice (Admin).
#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
pub struct UserOption {
    pub id: i64,
    pub name: String,
    pub role: String,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Hash)]
pub enum PurchaseStatus {
    Draft,
    #[serde(rename = "Pending Approval")]
    PendingApproval,
    Approved,
    Rejected,
    Received,
    Cancelled,
}

/// A new item proposed on a request line (BR-31): it becomes a real item only when the request is received.
#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
pub struct NewItem {
    pub name: String,
    #[serde(rename = "categoryId")]
    pub category_id: i64,
    #[serde(rename = "categoryName")]
    pub category_name: String,
    #[serde(rename = "subcategoryId")]
    pub subcategory_id: Option<i64>,
    #[serde(rename = "subcategoryName")]
    pub subcategory_name: String,
    pub unit: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
pub struct PurchaseLine {
    /// Null while the line is a new item.
    #[serde(rename = "itemId")]
    pub item_id: Option<i64>,
    #[serde(rename = "itemName")]
    pub item_name: String,
    pub unit: String,
    pub quantity: i64,
    #[serde(rename = "newItem")]
    pub new_item: Option<NewItem>,
    /// Admin only.
    #[serde(rename = "currentStock")]
    pub current_stock: Option<i64>,
    #[serde(rename = "minimumStock")]
    pub minimum_stock: Option<i64>,
    #[serde(rename = "lastPurchasePrice")]
    pub last_purchase_price: Option<i64>,
    #[serde(rename = "preferredSupplierId")]
    pub preferred_supplier_id: Option<i64>,
}

/// A purchase request as the list and the detail show it (`PurchaseDto` in `frontend/src/lib/api/purchases.ts`).
#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
pub struct Purchase {
    pub id: i64,
    pub number: String,
    #[serde(rename = "requesterId")]
    pub requester_id: i64,
    #[serde(rename = "requesterName")]
    pub requester_name: String,
    pub status: PurchaseStatus,
    #[serde(rename = "neededBy")]
    pub needed_by: String,
    pub reason: String,
    pub notes: String,
    #[serde(rename = "rejectReason")]
    pub reject_reason: String,
    #[serde(rename = "approvedBy")]
    pub approved_by: Option<i64>,
    #[serde(rename = "approvedByName")]
    pub approved_by_name: String,
    #[serde(rename = "approvedAt")]
    pub approved_at: Option<String>,
    #[serde(rename = "receivedBy")]
    pub received_by: Option<i64>,
    #[serde(rename = "receivedByName")]
    pub received_by_name: String,
    #[serde(rename = "receivedAt")]
    pub received_at: Option<String>,
    #[serde(rename = "lineSummary")]
    pub line_summary: String,
    pub lines: Vec<PurchaseLine>,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    /// `edit`, `submit`, `cancel`, `approve`, `reject`, `receive`: what the signed-in user may do now.
    #[serde(rename = "allowedActions", default)]
    pub allowed_actions: Vec<String>,
    /// Admin only: the incoming stock posted when the request was received, and whether it was voided afterwards.
    #[serde(rename = "transactionNumber")]
    pub transaction_number: Option<String>,
    #[serde(rename = "receiptVoided", default)]
    pub receipt_voided: bool,
}

impl Purchase {
    pub fn can(&self, action: &str) -> bool {
        self.allowed_actions.iter().any(|a| a == action)
    }
}

#[derive(Clone, Debug, serde::Serialize, PartialEq, Eq)]
pub struct NewItemInput {
    pub name: String,
    #[serde(rename = "categoryId")]
    pub category_id: i64,
    #[serde(rename = "subcategoryId")]
    pub subcategory_id: i64,
    pub unit: String,
}

#[derive(Clone, Debug, serde::Serialize, PartialEq, Eq)]
pub struct PurchaseLineInput {
    /// None for a new item.
    #[serde(rename = "itemId")]
    pub item_id: Option<i64>,
    pub quantity: i64,
    #[serde(rename = "newItem", skip_serializing_if = "Option::is_none")]
    pub new_item: Option<NewItemInput>,
}

/// Body of create and update purchase request. `client_request_id` is only sent when creating.
#[derive(Clone, Debug, serde::Serialize, PartialEq, Eq)]
pub struct PurchaseInput {
    #[serde(rename = "requesterId")]
    pub requester_id: i64,
    pub lines: Vec<PurchaseLineInput>,
    #[serde(rename = "neededBy")]
    pub needed_by: String,
    pub reason: String,
    pub notes: String,
    pub submit: bool,
    #[serde(rename = "clientRequestId", skip_serializing_if = "Option::is_none")]
    pub client_request_id: Option<String>,
}

#[derive(Clone, Debug, serde::Serialize, PartialEq, Eq)]
pub struct ReceiveLineInput {
    #[serde(rename = "unitPrice")]
    pub unit_price: i64,
    #[serde(rename = "minimumStock")]
    pub minimum_stock: i64,
}

/// Body of receive: one entry per request line, in order (full receipt only). A new item gets its code from the server.
#[derive(Clone, Debug, serde::Serialize, PartialEq, Eq)]
pub struct ReceiveInput {
    pub date: String,
    #[serde(rename = "supplierId")]
    pub supplier_id: i64,
    pub lines: Vec<ReceiveLineInput>,
    pub notes: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
pub struct ExpenseMonth {
    pub month: String,
    pub count: i64,
    pub value: i64,
}

/// The expenses of a date range: the server adds the months up (PRD 4.7).
#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
pub struct ExpenseSummary {
    pub total: i64,
    pub count: i64,
    pub months: Vec<ExpenseMonth>,
}

/// One line of the stock movements report.
#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
pub struct MovementRow {
    pub number: String,
    pub date: String,
    #[serde(rename = "itemName")]
    pub item_name: String,
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(rename = "quantityChange")]
    pub quantity_change: i64,
    #[serde(rename = "balanceAfter")]
    pub balance_after: i64,
    #[serde(rename = "userName")]
    pub user_name: String,
}

/// One line of the loans report.
#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
pub struct LoanReportRow {
    pub number: String,
    #[serde(rename = "borrowerName")]
    pub borrower_name: String,
    pub summary: String,
    #[serde(rename = "loanDate")]
    pub loan_date: String,
    #[serde(rename = "expectedReturnDate")]
    pub expected_return_date: String,
    #[serde(rename = "returnedAt")]
    pub returned_at: Option<String>,
    pub status: LoanStatus,
}

/// The body of create and update item, as the server expects it (`itemSchema` in `backend/src/schemas.ts`).
#[derive(Clone, Debug, serde::Serialize, PartialEq, Eq)]
pub struct ItemInput {
    pub name: String,
    #[serde(rename = "categoryId")]
    pub category_id: i64,
    #[serde(rename = "subcategoryId")]
    pub subcategory_id: i64,
    pub unit: String,
    /// Only used when creating: the server records it as an adjustment. Ignored by the server on update.
    #[serde(rename = "openingStock")]
    pub opening_stock: i64,
    #[serde(rename = "minimumStock")]
    pub minimum_stock: i64,
    #[serde(rename = "lastPurchasePrice")]
    pub last_purchase_price: i64,
    #[serde(rename = "supplierId")]
    pub supplier_id: Option<i64>,
    pub location: String,
    /// `Active` or `Inactive`.
    pub status: String,
    pub notes: String,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
pub enum ImportStatus {
    #[serde(rename = "ready")]
    Ready,
    #[serde(rename = "skipped")]
    Skipped,
    #[serde(rename = "error")]
    Error,
    #[serde(rename = "imported")]
    Imported,
}

/// One row of the CSV import preview (PRD 4.10).
#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
pub struct ImportRow {
    pub line: i64,
    pub status: ImportStatus,
    pub message: String,
    pub name: String,
    pub category: String,
    pub subcategory: String,
    pub unit: String,
    #[serde(rename = "openingStock")]
    pub opening_stock: i64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
pub struct NewGroup {
    pub name: String,
    pub code: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
pub struct ImportReport {
    pub rows: Vec<ImportRow>,
    pub total: i64,
    pub ready: i64,
    pub skipped: i64,
    pub errors: i64,
    /// Items created by a confirmed import; 0 in a preview.
    pub created: i64,
    #[serde(rename = "newCategories")]
    pub new_categories: Vec<NewGroup>,
    #[serde(rename = "newSubcategories")]
    pub new_subcategories: Vec<NewGroup>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_admin_dashboard_the_server_sends() {
        let json = r#"{"badges":{"items":2,"loans":0,"purchases":1},"admin":{"pendingApprovals":3,"stock":{"Safe":5,"Low":1,"Out":2},"attention":3,
          "loans":{"pending":1,"approved":0,"borrowed":2,"overdue":0,"active":3},
          "needsAttention":[{"id":9,"name":"Spidol","categoryName":"Gudang","currentStock":0,"minimumStock":2,"stockStatus":"Out"}],"overdueLoans":[]}}"#;
        let d: DashboardSummary = serde_json::from_str(json).unwrap();
        let a = d.admin.unwrap();
        assert_eq!((a.pending_approvals, a.total_items(), a.stock.out, a.stock.low), (3, 8, 2, 1));
        assert_eq!((a.needs_attention[0].stock_status, a.needs_attention[0].current_stock), (StockStatus::Out, 0));
        assert!(d.staff.is_none());
    }

    #[test]
    fn reads_the_staff_dashboard_and_loan_statuses() {
        let json = r#"{"staff":{"activeLoans":[{"id":1,"number":"LN-0001","summary":"Proyektor x1","expectedReturnDate":"2026-11-20","status":"Pending Approval","daysOverdue":0},
          {"id":2,"number":"LN-0002","summary":"Kabel x2","expectedReturnDate":"2026-11-01","status":"Overdue","daysOverdue":21}],
          "overdueCount":1,"overdueFirst":{"id":2,"number":"LN-0002","summary":"Kabel x2","expectedReturnDate":"2026-11-01","status":"Overdue","daysOverdue":21},
          "requestable":4,"activeItems":6}}"#;
        let s = serde_json::from_str::<DashboardSummary>(json).unwrap().staff.unwrap();
        assert_eq!((s.active_loans[0].status, s.active_loans[1].status), (LoanStatus::PendingApproval, LoanStatus::Overdue));
        assert_eq!((s.overdue_count, s.requestable, s.active_items), (1, 4, 6));
        assert_eq!(s.overdue_first.unwrap().days_overdue, 21);
    }

    #[test]
    fn reads_an_admin_item_with_movements_and_a_staff_item_with_a_barcode() {
        let admin = r#"{"id":1,"name":"Proyektor","categoryId":1,"categoryName":"Kantor","subcategoryId":1,"subcategoryName":"Elektronik","unit":"pcs","status":"Active","stockStatus":"Safe","availableForLoan":2,"photoVersion":"ab.png",
          "code":"KTR-ELK-0001","currentStock":3,"minimumStock":1,"lastPurchasePrice":1000,"supplierId":1,"supplierName":"Toko","location":"Aula","notes":"","createdAt":"2026-11-22T00:00:00.000Z","updatedAt":"2026-11-22T00:00:00.000Z","reserved":1,
          "movements":[{"id":4,"number":"ADJ-1","type":"ADJUSTMENT","date":"2026-11-22","quantityChange":3,"balanceAfter":3,"userName":"Admin"}]}"#;
        let i: Item = serde_json::from_str(admin).unwrap();
        assert_eq!((i.barcode_value(), i.current_stock, i.reserved, i.photo_version.as_deref()), (Some("KTR-ELK-0001"), Some(3), Some(1), Some("ab.png")));
        assert_eq!((i.movements[0].kind.as_str(), i.movements[0].quantity_change), ("ADJUSTMENT", 3));
        let staff = r#"{"id":1,"name":"Proyektor","categoryId":1,"categoryName":"Kantor","subcategoryId":1,"subcategoryName":"Elektronik","unit":"pcs","status":"Active","stockStatus":"Safe","availableForLoan":2,"photoVersion":null,"barcode":"KTR-ELK-0001"}"#;
        let s: Item = serde_json::from_str(staff).unwrap();
        assert_eq!((s.code.as_deref(), s.barcode_value(), s.current_stock), (None, Some("KTR-ELK-0001"), None));
        assert!(s.movements.is_empty() && s.photo_version.is_none());
    }
}
