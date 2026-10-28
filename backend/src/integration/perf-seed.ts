// PRD 6.8 performance check (Stage 6): adds fake data at the design size to ezi_test, on top of what an E2E run
// left (the Admin account is needed): 10,000 items and 200,000 ledger lines. Never ezi_dev.
// Run: npx tsx src/integration/perf-seed.ts, then E2E_KEEP=1 npm run e2e:server and time the API.
import { assertTestDatabase, testEnv } from "./test-env";

const { databaseUrl } = testEnv();
assertTestDatabase(databaseUrl);
process.env.DATABASE_URL = databaseUrl;
const { prisma } = await import("../db");

const ITEMS = 10_000;
const LINES_PER_TX = 10;
const TXS = 20_000; // 200,000 ledger lines, about 21 per stocked item
const GROUPS = 20; // 20 categories x 20 subcategories

const admin = await prisma.user.findFirstOrThrow({ where: { role: { name: "Admin" } }, orderBy: { id: "asc" } });
if (await prisma.category.findFirst({ where: { code: "Q00" } })) throw new Error("perf data already seeded");

const code = (n: number) => `Q${String(n).padStart(2, "0")}`;
for (const table of ["categories", "subcategories"]) {
  const rows = Array.from({ length: GROUPS }, (_, i) => `('Perf ${table} ${i}', '${code(i)}', 1, '', 'Active', NOW(), NOW())`);
  await prisma.$executeRawUnsafe(`INSERT INTO ${table} (name, code, next_item_number, description, status, created_at, updated_at) VALUES ${rows.join(",")}`);
}
const cats = await prisma.category.findMany({ where: { code: { startsWith: "Q" } }, orderBy: { id: "asc" } });
const subs = await prisma.subcategory.findMany({ where: { code: { startsWith: "Q" } }, orderBy: { id: "asc" } });

// Items: 5% get no ledger lines (Out); current_stock is set from the ledger at the end.
const out = (i: number) => i % 20 === 0;
const qty = (i: number, k: number) => ((i + k) % 3) + 1;
for (let start = 0; start < ITEMS; start += 1000) {
  const rows = [];
  for (let i = start; i < start + 1000; i++) {
    const c = cats[i % GROUPS], s = subs[Math.floor(i / GROUPS) % GROUPS];
    rows.push(`('${c.code}-${s.code}-${String(i + 1).padStart(5, "0")}', 'Perf item ${i}', ${c.id}, ${s.id}, 'pcs', 0, ${i % 7 === 0 ? 50 : 5}, 10000, 'Rak ${i % 30}', 'Active', '', NOW(), NOW())`);
  }
  await prisma.$executeRawUnsafe(`INSERT INTO items (code, name, category_id, subcategory_id, unit, current_stock, minimum_stock, last_purchase_price, location, status, notes, created_at, updated_at) VALUES ${rows.join(",")}`);
}

// Real ids: auto-increment can skip numbers after deleted rows.
const itemIds = (await prisma.item.findMany({ where: { name: { startsWith: "Perf item " } }, select: { id: true, name: true } }))
  .sort((a, b) => Number(a.name.slice(10)) - Number(b.name.slice(10))).map((i) => i.id);
const firstItem = itemIds[0];

// Transactions: spread over the last 12 months, each with 10 lines of stocked items.
const stocked = Array.from({ length: ITEMS }, (_, i) => i).filter((i) => !out(i));
const seen = new Map<number, { lines: number; balance: number }>(); // per item, for balance_after
const firstTx = ((await prisma.stockTransaction.aggregate({ _max: { id: true } }))._max.id ?? 0) + 1;
let cursor = 0;
for (let start = 0; start < TXS; start += 1000) {
  const txRows = [], lineRows = [];
  for (let n = start; n < Math.min(start + 1000, TXS); n++) {
    const day = new Date(Date.now() - (n % 365) * 86_400_000).toISOString().slice(0, 10);
    txRows.push(`(${firstTx + n}, 'PERF-${String(n).padStart(6, "0")}', 'IN', 'Posted', '${day}', ${admin.id}, NULL, '', '', '', NOW())`);
    for (let l = 0; l < LINES_PER_TX; l++, cursor++) {
      const i = stocked[cursor % stocked.length];
      const prev = seen.get(i) ?? { lines: 0, balance: 0 };
      const q = qty(i, prev.lines);
      seen.set(i, { lines: prev.lines + 1, balance: prev.balance + q });
      lineRows.push(`(${firstTx + n}, ${itemIds[i]}, ${q}, ${prev.balance + q}, 10000, ${q * 10000})`);
    }
  }
  await prisma.$executeRawUnsafe(`INSERT INTO stock_transactions (id, transaction_number, type, status, transaction_date, user_id, supplier_id, destination, reason, notes, created_at) VALUES ${txRows.join(",")}`);
  await prisma.$executeRawUnsafe(`INSERT INTO stock_transaction_items (transaction_id, item_id, quantity_change, balance_after, unit_price, total) VALUES ${lineRows.join(",")}`);
}
await prisma.$executeRawUnsafe(
  `UPDATE items i JOIN (SELECT item_id, SUM(quantity_change) s FROM stock_transaction_items WHERE item_id >= ${firstItem} GROUP BY item_id) x ON x.item_id = i.id SET i.current_stock = x.s`,
);
console.log(`seeded ${ITEMS} items, ${TXS} transactions, ${cursor} ledger lines`);
await prisma.$disconnect();
