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
}
