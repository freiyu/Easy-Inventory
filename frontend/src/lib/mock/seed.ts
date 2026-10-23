// Fictional demo data (the repository is public: no real names, offices or credentials).
// The seed is built by calling the same mock operations the UI uses, so the stock
// ledger is consistent by construction (current_stock = sum of ledger changes).
import { daysFromToday } from "../format";
import type { BackupFile, Category, Supplier, User } from "../types";
import {
  approveLoan,
  cancelLoan,
  createItem,
  createLoan,
  issueLoan,
  log,
  rejectLoan,
  returnLoan,
  setItemStatus,
  stockAdjustment,
  stockIn,
  stockOut,
  voidTransaction,
  type Ctx,
  type DB,
} from "./ops";

const stamp = (offset: number, hour = 3) => `${daysFromToday(offset)}T${String(hour).padStart(2, "0")}:00:00Z`;

const users: User[] = [
  { id: 1, name: "Rina Wulandari", email: "rina.wulandari@kantor.example", role: "Admin", status: "Active", mustChangePassword: false, lastLoginAt: stamp(0, 1), createdAt: stamp(-200) },
  { id: 2, name: "Hendra Kusuma", email: "hendra.kusuma@kantor.example", role: "Admin", status: "Active", mustChangePassword: false, lastLoginAt: stamp(-2, 2), createdAt: stamp(-190) },
  { id: 3, name: "Budi Santoso", email: "budi.santoso@kantor.example", role: "Staff", status: "Active", mustChangePassword: false, lastLoginAt: stamp(-1, 4), createdAt: stamp(-180) },
  { id: 4, name: "Dewi Lestari", email: "dewi.lestari@kantor.example", role: "Staff", status: "Active", mustChangePassword: false, lastLoginAt: stamp(-3, 5), createdAt: stamp(-170) },
  { id: 5, name: "Agus Prabowo", email: "agus.prabowo@kantor.example", role: "Staff", status: "Active", mustChangePassword: true, lastLoginAt: null, createdAt: stamp(-3) },
  { id: 6, name: "Siti Rahmawati", email: "siti.rahmawati@kantor.example", role: "Staff", status: "Inactive", mustChangePassword: false, lastLoginAt: stamp(-80, 3), createdAt: stamp(-160) },
];

const categories: Category[] = [
  { id: 1, name: "Paper", code: "PPR", description: "Printing and copy paper", status: "Active", createdAt: stamp(-200) },
  { id: 2, name: "Stationery", code: "STN", description: "Pens, markers, staplers and desk supplies", status: "Active", createdAt: stamp(-200) },
  { id: 3, name: "Printer supplies", code: "PRN", description: "Toner and ink cartridges", status: "Active", createdAt: stamp(-200) },
  { id: 4, name: "Electronics", code: "ELC", description: "Chargers, cables and presentation equipment", status: "Active", createdAt: stamp(-200) },
  { id: 5, name: "Cleaning", code: "CLN", description: "Soap and floor cleaning supplies", status: "Active", createdAt: stamp(-200) },
  { id: 6, name: "Pantry", code: "PNT", description: "Drinking water, coffee and tea", status: "Active", createdAt: stamp(-200) },
  { id: 7, name: "Promotional items", code: "", description: "Old event merchandise (no longer stocked)", status: "Inactive", createdAt: stamp(-200) },
];

const suppliers: Supplier[] = [
  { id: 1, name: "PT Sinar Kertas Nusantara", contactPerson: "Wahyu Hidayat", phone: "0812-5550-0101", email: "order@sinarkertas.example", address: "Jl. Industri Raya No. 12, Bandung", notes: "Delivery within 2 days", status: "Active", createdAt: stamp(-200) },
  { id: 2, name: "Toko Alat Tulis Maju Jaya", contactPerson: "Lilis Suryani", phone: "0813-5550-0202", email: "lilis@majujaya.example", address: "Jl. Pasar Baru No. 45, Jakarta", notes: "", status: "Active", createdAt: stamp(-200) },
  { id: 3, name: "CV Mitra Printer Solusi", contactPerson: "Dedi Kurniawan", phone: "0821-5550-0303", email: "dedi@mitraprinter.example", address: "Jl. Mangga Dua Blok C No. 8, Jakarta", notes: "Original cartridges only", status: "Active", createdAt: stamp(-200) },
  { id: 4, name: "PT Cipta Elektronik Digital", contactPerson: "Fajar Ramadhan", phone: "0857-5550-0404", email: "sales@ciptaelektronik.example", address: "Jl. Glodok Plaza Lt. 2, Jakarta", notes: "", status: "Active", createdAt: stamp(-200) },
  { id: 5, name: "Toko Sumber Rezeki", contactPerson: "Ratna Dewanti", phone: "0878-5550-0505", email: "", address: "Jl. Cemara No. 3, Depok", notes: "No longer used", status: "Inactive", createdAt: stamp(-200) },
];

function backups(): BackupFile[] {
  const list: BackupFile[] = [];
  for (let i = 0; i < 12; i++) {
    const d = daysFromToday(-i - 1);
    list.push({ id: 14 - i, fileName: `ezi-backup-${d.replaceAll("-", "")}-0200.sql.gz`, createdAt: `${d}T19:00:00Z`, kind: "Automatic", sizeKb: 2480 - i * 14 });
  }
  list.splice(3, 0, { id: 15, fileName: `ezi-backup-${daysFromToday(-4).replaceAll("-", "")}-1430.sql.gz`, createdAt: `${daysFromToday(-4)}T07:30:00Z`, kind: "Manual", sizeKb: 2440 });
  list.push({ id: 16, fileName: `ezi-backup-${daysFromToday(-20).replaceAll("-", "")}-0900.sql.gz`, createdAt: `${daysFromToday(-20)}T02:00:00Z`, kind: "Before update", sizeKb: 2310 });
  return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 14);
}

type ItemRow = [code: string, name: string, cat: number, unit: string, min: number, price: number, supplier: number | null, location: string];
const itemRows: ItemRow[] = [
  ["ATK-001", "A4 Paper 80 gsm", 1, "ream", 20, 52500, 1, "Cabinet A1"],
  ["ATK-002", "F4 Paper 70 gsm", 1, "ream", 10, 58000, 1, "Cabinet A1"],
  ["ATK-003", "Ballpoint Pen, Blue", 2, "box", 5, 38000, 2, "Cabinet B2"],
  ["ATK-004", "Whiteboard Marker, Black", 2, "pcs", 12, 9500, 2, "Cabinet B2"],
  ["ATK-005", "Stapler No. 10", 2, "pcs", 4, 22000, 2, "Cabinet B1"],
  ["ATK-006", "Staples No. 10", 2, "box", 10, 4500, 2, "Cabinet B1"],
  ["ATK-007", "Sticky Notes 76x76", 2, "pack", 15, 17500, 2, "Cabinet B2"],
  ["ATK-008", "Correction Tape", 2, "pcs", 10, 8000, 2, "Cabinet B2"],
  ["PRN-001", "Black Toner HP 85A", 3, "unit", 3, 780000, 3, "Storage C1"],
  ["PRN-002", "Cyan Ink Cartridge", 3, "pcs", 4, 185000, 3, "Storage C1"],
  ["ELC-001", "Laptop Charger 65W", 4, "unit", 2, 320000, 4, "Storage C2"],
  ["ELC-002", "HDMI Cable 2 m", 4, "pcs", 3, 65000, 4, "Storage C2"],
  ["ELC-003", "Portable Projector", 4, "unit", 1, 4200000, 4, "Storage C2"],
  ["ELC-004", "Extension Cord 5 m", 4, "pcs", 4, 85000, 4, "Storage C2"],
  ["CLN-001", "Hand Soap Refill 500 ml", 5, "bottle", 8, 18500, null, "Pantry shelf"],
  ["CLN-002", "Floor Cleaner 1 L", 5, "bottle", 6, 24000, null, "Pantry shelf"],
  ["PNT-001", "Mineral Water Gallon 19 L", 6, "pcs", 4, 21000, null, "Pantry floor"],
  ["PNT-002", "Instant Coffee, box of 30", 6, "box", 5, 62000, null, "Pantry shelf"],
  ["ATK-009", "Document Folder, Blue", 2, "pcs", 30, 3500, 2, "Cabinet B3"],
];

type Line = [itemId: number, quantity: number];
const toLines = (pairs: Line[]) => pairs.map(([itemId, quantity]) => ({ itemId, quantity }));

export function createSeed(): DB {
  const db: DB = {
    users: structuredClone(users),
    categories: structuredClone(categories),
    suppliers: structuredClone(suppliers),
    items: [],
    transactions: [],
    loans: [],
    activity: [],
    backups: backups(),
    seq: {},
    ids: { user: 6, category: 7, supplier: 5, backup: 16 },
  };
  const rina = db.users[0];
  const as = (offset: number, actor = rina): Ctx => ({ db, actor, now: stamp(offset), today: daysFromToday(offset) });

  // Events run in date order so every ledger line has a correct "balance after".
  const events: [day: number, run: () => void][] = [];
  const ev = (day: number, run: () => void) => events.push([day, run]);

  ev(-140, () => {
    for (const [code, name, categoryId, unit, minimumStock, lastPurchasePrice, supplierId, location] of itemRows) {
      createItem(as(-140), { code, name, categoryId, unit, openingStock: 0, minimumStock, lastPurchasePrice, supplierId, location, status: "Active", notes: "" });
    }
  });
  ev(-135, () => {
    for (const [itemId, physical] of [[15, 24], [16, 12], [17, 10], [18, 18]]) {
      stockAdjustment(as(-135), { date: daysFromToday(-135), itemId, physical, reason: "Opening stock" });
    }
  });

  const buy = (day: number, supplierId: number, pairs: [number, number, number?][], notes = "") =>
    ev(day, () => {
      const r = stockIn(as(day), {
        date: daysFromToday(day), supplierId, notes,
        lines: pairs.map(([itemId, quantity, price]) => ({ itemId, quantity, unitPrice: price ?? itemRows[itemId - 1][5] })),
      });
      if (!r.ok) throw new Error(`seed purchase failed: ${r.error.message}`);
    });
  buy(-130, 1, [[1, 100, 51000], [2, 30, 56500]]);
  buy(-130, 2, [[3, 20], [4, 36], [5, 8], [6, 30], [7, 40], [8, 20], [19, 40]]);
  buy(-120, 3, [[9, 6], [10, 6]]);
  buy(-110, 4, [[11, 5], [12, 10], [13, 3], [14, 11]]);
  buy(-95, 2, [[3, 10]]);
  buy(-70, 1, [[1, 60, 52000]]);
  buy(-62, 3, [[9, 3]]);
  buy(-38, 4, [[12, 4]]);
  buy(-6, 1, [[1, 15, 54000], [2, 8, 59500]], "Monthly paper order");

  const out = (day: number, destination: string, pairs: Line[]) =>
    ev(day, () => {
      const r = stockOut(as(day), { date: daysFromToday(day), destination, notes: "", lines: toLines(pairs) });
      if (!r.ok) throw new Error(`seed outgoing failed: ${r.error.message}`);
    });
  out(-100, "Finance department", [[1, 25], [3, 8]]);
  out(-60, "HR department", [[2, 10], [1, 15]]);
  out(-50, "Operations", [[3, 7], [4, 12], [7, 15]]);
  out(-45, "Reception", [[4, 8], [7, 13]]);
  out(-40, "Operations", [[5, 2], [6, 19], [8, 12]]);
  out(-30, "Marketing", [[1, 40], [14, 5]]);
  out(-26, "Reception", [[8, 8], [10, 6]]);
  out(-20, "Finance department", [[2, 6], [9, 7], [15, 4]]);
  out(-18, "Operations", [[4, 7], [16, 8]]);
  out(-12, "Marketing", [[1, 35], [12, 2], [17, 7]]);

  // A mistaken entry that was voided: shows the reversal flow and the voided state.
  ev(-9, () => {
    const wrong = stockIn(as(-9), { date: daysFromToday(-9), supplierId: 2, notes: "Entered by mistake (wrong item)", lines: [{ itemId: 6, quantity: 50, unitPrice: 4500 }] });
    if (wrong.ok) voidTransaction(as(-9), wrong.data.id, "Wrong item selected; the purchase was for staples No. 3");
  });
  ev(-4, () => {
    stockAdjustment(as(-4), { date: daysFromToday(-4), itemId: 18, physical: 16, reason: "Stock count: 2 boxes damaged by moisture" });
  });
  ev(-3, () => {
    setItemStatus(as(-3), 19, "Inactive");
  });

  const request = (day: number, borrowerId: number, pairs: Line[], loanDay: number, dueDay: number, purpose: string, submit = true) => {
    const actor = db.users.find((u) => u.id === borrowerId)!;
    const r = createLoan(as(day, actor), {
      borrowerId, lines: toLines(pairs), loanDate: daysFromToday(loanDay), expectedReturnDate: daysFromToday(dueDay), purpose, notes: "",
    }, submit);
    if (!r.ok) throw new Error(`seed loan failed: ${r.error.message}`);
    return r.data.id;
  };

  ev(-30, () => {
    const id = request(-30, 4, [[12, 2]], -30, -23, "Training room setup");
    approveLoan(as(-30), id);
    issueLoan(as(-30), id);
    ev(-24, () => returnLoan(as(-24), id, { returnDate: daysFromToday(-24), notes: "Returned in good condition" }));
  });
  ev(-20, () => {
    const id = request(-20, 4, [[14, 1]], -20, -9, "Extra power for the meeting room");
    approveLoan(as(-20), id);
    issueLoan(as(-20), id);
  });
  ev(-14, () => {
    const id = request(-14, 5, [[5, 1]], -13, -10, "Desk setup");
    cancelLoan(as(-14, db.users[4]), id);
  });
  ev(-12, () => {
    const id = request(-12, 3, [[11, 2]], -12, -5, "Offsite training, Surabaya branch");
    approveLoan(as(-12), id);
    issueLoan(as(-12), id);
  });
  ev(-7, () => {
    const id = request(-7, 3, [[14, 2]], -6, 0, "Weekend family event at home");
    rejectLoan(as(-6), id, "Office items cannot be borrowed for personal use.");
  });
  ev(-2, () => {
    const id = request(-2, 5, [[13, 1]], -2, 4, "Quarterly review presentation");
    approveLoan(as(-2), id);
    issueLoan(as(-2), id);
  });
  ev(-1, () => {
    const id = request(-1, 3, [[11, 1]], 0, 2, "Field visit, laptop charger for the team");
    approveLoan(as(-1), id);
  });
  ev(0, () => {
    request(0, 4, [[13, 1], [12, 1]], 1, 3, "Client presentation, Meeting Room 2");
    request(0, 2, [[12, 1]], 0, 2, "Demo at the partner office"); // an Admin's own request: needs another Admin (BR-13)
    request(0, 3, [[12, 1]], 1, 2, "Meeting room demo", false);
  });

  // Sign-in entries so the activity log looks lived in.
  ev(0, () => {
    for (const [uid, offset] of [[3, -1], [4, -3], [2, -2], [1, 0]]) {
      const actor = db.users.find((u) => u.id === uid)!;
      log(as(offset, actor), "Login", "Auth", actor.email);
    }
  });

  // Events may schedule later events (a return after an issue); run the earliest first.
  while (events.length) {
    events.sort((a, b) => a[0] - b[0]);
    events.shift()![1]();
  }
  db.activity.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id);
  return db;
}
