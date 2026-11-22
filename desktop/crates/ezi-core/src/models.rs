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
