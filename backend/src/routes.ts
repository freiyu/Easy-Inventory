// REST endpoints under /api, exactly as PRD 6.6. Routes stay thin (PRD 7.2): parse input, call a service, send.
import { Router, type Request, type Response } from "express";
import { changePassword, createFirstAdmin, login, logout, requireAdmin as admin, requireAuth, setupStatus } from "./auth";
import { notFound, parse, send, sendList } from "./http";
import { s } from "./schemas";
import { activityModules, createUser, listActivity, listUsers, oneUser, resetUserPassword, setUserStatus, updateUser } from "./services/admin";
import { backupPath, createBackup, listBackups } from "./services/backup";
import { reader } from "./services/core";
import * as loans from "./services/loans";
import * as m from "./services/master";
import * as pr from "./services/purchases";
import * as rep from "./services/reports";
import * as stock from "./services/stock";

export const api = Router();

const id = (req: Request) => {
  const n = Number(req.params.id);
  if (!Number.isInteger(n) || n <= 0) throw notFound();
  return n;
};
const me = (req: Request) => req.user!;
const ctx = (req: Request) => reader(req.user!);
const q = (req: Request) => req.query as Record<string, unknown>;
const xlsx = (res: Response, name: string, file: Buffer) => {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="ezi-${name}-${stamp}.xlsx"`);
  res.send(file);
};
const KINDS = ["activate", "deactivate"] as const;
const status = (kind: (typeof KINDS)[number]) => (kind === "activate" ? "Active" : "Inactive");

// ---------------------------------------------------------------- public
api.get("/setup/status", async (_req, res) => send(res, await setupStatus()));
api.post("/setup/first-admin", async (req, res) => send(res, await createFirstAdmin(parse(s.firstAdminSchema, req.body)), 201));
api.post("/auth/login", async (req, res) => send(res, await login(req, res, parse(s.loginSchema, req.body))));
// Public so an expired session can still clear its cookie.
api.post("/auth/logout", async (req, res) => send(res, await logout(req, res)));

// ------------------------------------------------------------ logged in
api.use(requireAuth);
api.get("/auth/me", (req, res) => send(res, me(req)));
api.post("/auth/change-password", async (req, res) => send(res, await changePassword(me(req), parse(s.changePasswordSchema, req.body))));
api.get("/dashboard/summary", async (req, res) => send(res, await rep.dashboardSummary(ctx(req))));

// Items (Staff read a limited view; the service leaves out the Admin fields)
api.get("/items", async (req, res) => sendList(res, await m.listItems(ctx(req), q(req))));
api.get("/items/locations", admin, async (req, res) => send(res, await m.itemLocations(ctx(req))));
api.post("/items/import/preview", admin, async (req, res) => send(res, await m.importPreview(ctx(req), parse(s.csvSchema, req.body).csv)));
api.post("/items/import", admin, async (req, res) => send(res, await m.importConfirm(me(req), parse(s.csvSchema, req.body).csv)));
api.get("/items/:id", async (req, res) => send(res, await m.oneItem(ctx(req), id(req))));
api.post("/items", admin, async (req, res) => send(res, await m.createItem(me(req), parse(s.itemSchema, req.body)), 201));
api.put("/items/:id", admin, async (req, res) => send(res, await m.updateItem(me(req), id(req), parse(s.itemSchema, req.body))));
api.delete("/items/:id", admin, async (req, res) => send(res, await m.deleteItem(me(req), id(req))));
for (const kind of KINDS) {
  api.post(`/items/:id/${kind}`, admin, async (req, res) => send(res, await m.setItemStatus(me(req), id(req), status(kind))));
}

// Categories and subcategories (v12, PRD 4.3A): same endpoints and rules; Staff read active names only
for (const [path, g] of [["/categories", "category"], ["/subcategories", "subcategory"]] as const) {
  api.get(path, async (req, res) => sendList(res, await m.listCategories(ctx(req), q(req), g)));
  api.post(path, admin, async (req, res) => send(res, await m.saveCategory(me(req), null, parse(s.categorySchema, req.body), g), 201));
  api.put(`${path}/:id`, admin, async (req, res) => send(res, await m.saveCategory(me(req), id(req), parse(s.categorySchema, req.body), g)));
  api.delete(`${path}/:id`, admin, async (req, res) => send(res, await m.deleteCategory(me(req), id(req), g)));
  for (const kind of KINDS) {
    api.post(`${path}/:id/${kind}`, admin, async (req, res) => send(res, await m.setCategoryStatus(me(req), id(req), status(kind), g)));
  }
}

// Suppliers
api.get("/suppliers", admin, async (req, res) => sendList(res, await m.listSuppliers(ctx(req), q(req))));
api.post("/suppliers", admin, async (req, res) => send(res, await m.saveSupplier(me(req), null, parse(s.supplierSchema, req.body)), 201));
api.put("/suppliers/:id", admin, async (req, res) => send(res, await m.saveSupplier(me(req), id(req), parse(s.supplierSchema, req.body))));
api.delete("/suppliers/:id", admin, async (req, res) => send(res, await m.deleteSupplier(me(req), id(req))));
for (const kind of KINDS) {
  api.post(`/suppliers/:id/${kind}`, admin, async (req, res) => send(res, await m.setSupplierStatus(me(req), id(req), status(kind))));
}

// Stock
api.get("/stock/transactions", admin, async (req, res) => sendList(res, await stock.listTransactions(ctx(req), q(req))));
api.get("/stock/transactions/:id", admin, async (req, res) => send(res, await stock.oneTransaction(ctx(req), id(req))));
api.get("/stock/history", admin, async (req, res) => sendList(res, await stock.ledger(ctx(req), q(req), { report: false })));
api.post("/stock/in", admin, async (req, res) => send(res, await stock.stockIn(me(req), parse(s.incomingSchema, req.body)), 201));
api.post("/stock/out", admin, async (req, res) => send(res, await stock.stockOut(me(req), parse(s.outgoingSchema, req.body)), 201));
api.post("/stock/adjustment", admin, async (req, res) => send(res, await stock.stockAdjustment(me(req), parse(s.adjustmentSchema, req.body)), 201));
api.post("/stock/transactions/:id/void", admin, async (req, res) =>
  send(res, await stock.voidTransaction(me(req), id(req), parse(s.reasonSchema, req.body).reason)));

// Loans (Staff: own only)
api.get("/loans", async (req, res) => sendList(res, await loans.listLoans(ctx(req), q(req))));
api.get("/loans/:id", async (req, res) => send(res, await loans.oneLoan(ctx(req), id(req))));
api.post("/loans", async (req, res) => send(res, await loans.createLoan(me(req), parse(s.loanSchema, req.body)), 201));
api.put("/loans/:id", async (req, res) => send(res, await loans.updateLoanDraft(me(req), id(req), parse(s.loanSchema, req.body))));
api.post("/loans/:id/submit", async (req, res) => send(res, await loans.submitLoan(me(req), id(req))));
api.post("/loans/:id/cancel", async (req, res) => send(res, await loans.cancelLoan(me(req), id(req))));
api.post("/loans/:id/approve", admin, async (req, res) => send(res, await loans.approveLoan(me(req), id(req))));
api.post("/loans/:id/reject", admin, async (req, res) => send(res, await loans.rejectLoan(me(req), id(req), parse(s.reasonSchema, req.body).reason)));
api.post("/loans/:id/issue", admin, async (req, res) => send(res, await loans.issueLoan(me(req), id(req))));
api.post("/loans/:id/return", admin, async (req, res) => send(res, await loans.returnLoan(me(req), id(req), parse(s.returnSchema, req.body))));

// Purchase requests (Staff: own only)
api.get("/purchase-requests", async (req, res) => sendList(res, await pr.listPurchases(ctx(req), q(req))));
api.get("/purchase-requests/:id", async (req, res) => send(res, await pr.onePurchase(ctx(req), id(req))));
api.post("/purchase-requests", async (req, res) => send(res, await pr.createPurchase(me(req), parse(s.purchaseSchema, req.body)), 201));
api.put("/purchase-requests/:id", async (req, res) => send(res, await pr.updatePurchaseDraft(me(req), id(req), parse(s.purchaseSchema, req.body))));
api.post("/purchase-requests/:id/submit", async (req, res) => send(res, await pr.submitPurchase(me(req), id(req))));
api.post("/purchase-requests/:id/cancel", async (req, res) => send(res, await pr.cancelPurchase(me(req), id(req))));
api.post("/purchase-requests/:id/approve", admin, async (req, res) => send(res, await pr.approvePurchase(me(req), id(req))));
api.post("/purchase-requests/:id/reject", admin, async (req, res) =>
  send(res, await pr.rejectPurchase(me(req), id(req), parse(s.reasonSchema, req.body).reason)));
api.post("/purchase-requests/:id/receive", admin, async (req, res) =>
  send(res, await pr.receivePurchase(me(req), id(req), parse(s.receiveSchema, req.body))));

// Expenses, reports, Excel export
api.get("/expenses/summary", admin, async (req, res) => send(res, await rep.expenseSummary(ctx(req), q(req))));
api.get("/reports/:type/export", admin, async (req, res) => xlsx(res, `report-${req.params.type}`, await rep.exportReport(ctx(req), String(req.params.type), q(req))));
api.get("/reports/stock", admin, async (req, res) => sendList(res, await rep.stockReport(ctx(req), q(req))));
api.get("/reports/movements", admin, async (req, res) => sendList(res, await rep.movementsReport(ctx(req), q(req))));
api.get("/reports/loans", admin, async (req, res) => sendList(res, await rep.loansReport(ctx(req), q(req))));
api.get("/export/items", admin, async (req, res) => xlsx(res, "items", await rep.exportItems(ctx(req), q(req))));

// Database backup (restore is a host tool, not an endpoint: PRD 2.6)
api.get("/backup/database", admin, async (req, res) => sendList(res, await listBackups(q(req))));
api.post("/backup/database", admin, async (req, res) => send(res, await createBackup(me(req), "Manual"), 201));
api.get("/backup/database/:id/download", admin, async (req, res) => {
  const file = await backupPath(id(req));
  res.download(file.path, file.fileName);
});

// Users and activity log
api.get("/users", admin, async (req, res) => sendList(res, await listUsers(ctx(req), q(req))));
api.get("/users/:id", admin, async (req, res) => send(res, await oneUser(ctx(req), id(req))));
api.post("/users", admin, async (req, res) => send(res, await createUser(me(req), parse(s.userSchema, req.body)), 201));
api.put("/users/:id", admin, async (req, res) => send(res, await updateUser(me(req), id(req), parse(s.userSchema, req.body))));
for (const kind of KINDS) {
  api.post(`/users/:id/${kind}`, admin, async (req, res) => send(res, await setUserStatus(me(req), id(req), status(kind))));
}
api.post("/users/:id/reset-password", admin, async (req, res) => send(res, await resetUserPassword(me(req), id(req))));
api.get("/activity-log/modules", admin, async (req, res) => send(res, await activityModules(ctx(req))));
api.get("/activity-log", admin, async (req, res) => sendList(res, await listActivity(ctx(req), q(req))));

api.use(() => {
  throw notFound();
});
