import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { PURCHASE_ORDER_STATUSES, SALES_ORDER_STATUSES } from "../../domain/workflow";

/**
 * PostgreSQL is the system of record. Everything here is durable business
 * data; nothing in this file lives in EmberKV.
 *
 * Money columns are `bigint` minor units (sen). Integrity rules that must hold
 * no matter which code path writes are enforced by the database itself:
 * CHECK constraints here, plus triggers in `drizzle/0001_ledger_integrity.sql`
 * (balanced journal entries, append-only ledgers).
 */

const money = (name: string) => bigint(name, { mode: "number" });
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const roleEnum = pgEnum("role", ["admin", "sales", "purchasing", "warehouse", "finance"]);
export const salesStatusEnum = pgEnum("sales_order_status", SALES_ORDER_STATUSES);
export const purchaseStatusEnum = pgEnum("purchase_order_status", PURCHASE_ORDER_STATUSES);
export const movementKindEnum = pgEnum("stock_movement_kind", ["receipt", "shipment", "adjustment"]);
export const accountTypeEnum = pgEnum("account_type", ["asset", "liability", "equity", "revenue", "expense"]);
export const invoiceStatusEnum = pgEnum("invoice_status", ["open", "paid"]);

// --- Identity & audit ---------------------------------------------------------

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    actorId: uuid("actor_id").references(() => users.id),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id").notNull(),
    summary: text("summary").notNull(),
    data: jsonb("data"),
  },
  (t) => [index("audit_log_at_idx").on(t.at.desc()), index("audit_log_entity_idx").on(t.entity, t.entityId)],
);

/** Gap-free document numbers (SO-2026-00042). Incremented inside the business transaction. */
export const documentSequences = pgTable("document_sequences", {
  key: text("key").primaryKey(),
  last: integer("last").notNull().default(0),
});

// --- Master data --------------------------------------------------------------

export const warehouses = pgTable("warehouses", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  city: text("city").notNull(),
});

export const products = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    sku: text("sku").notNull().unique(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    unit: text("unit").notNull().default("pcs"),
    salePrice: money("sale_price").notNull(),
    reorderPoint: integer("reorder_point").notNull().default(0),
    /** Total value of all units on hand across warehouses (weighted-average costing). */
    inventoryValue: money("inventory_value").notNull().default(0),
    /** Cost of the most recent receipt; values count gains when nothing is on hand. */
    lastCost: money("last_cost").notNull().default(0),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    check("products_sale_price_nonneg", sql`${t.salePrice} >= 0`),
    check("products_inventory_value_nonneg", sql`${t.inventoryValue} >= 0`),
    check("products_reorder_point_nonneg", sql`${t.reorderPoint} >= 0`),
  ],
);

export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  city: text("city"),
  taxId: text("tax_id"),
  paymentTermsDays: integer("payment_terms_days").notNull().default(30),
  createdAt: createdAt(),
});

export const suppliers = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  city: text("city"),
  taxId: text("tax_id"),
  paymentTermsDays: integer("payment_terms_days").notNull().default(30),
  createdAt: createdAt(),
});

// --- Inventory ----------------------------------------------------------------

export const stockLevels = pgTable(
  "stock_levels",
  {
    productId: integer("product_id")
      .notNull()
      .references(() => products.id),
    warehouseId: integer("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    onHand: integer("on_hand").notNull().default(0),
    /** Promised to confirmed sales orders but not yet shipped. */
    reserved: integer("reserved").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.productId, t.warehouseId] }),
    // The last line of defense against overselling, whatever the application does.
    check("stock_levels_on_hand_nonneg", sql`${t.onHand} >= 0`),
    check("stock_levels_reserved_nonneg", sql`${t.reserved} >= 0`),
    check("stock_levels_reserved_le_on_hand", sql`${t.reserved} <= ${t.onHand}`),
  ],
);

/** Append-only. Corrections are new movements, never edits (enforced by trigger). */
export const stockMovements = pgTable(
  "stock_movements",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id),
    warehouseId: integer("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    kind: movementKindEnum("kind").notNull(),
    qty: integer("qty").notNull(),
    /** Value moved in (positive) or out (negative), in minor units. */
    value: money("value").notNull(),
    reference: text("reference").notNull(),
    note: text("note"),
    occurredOn: date("occurred_on", { mode: "string" }).notNull(),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    check("stock_movements_qty_nonzero", sql`${t.qty} <> 0`),
    index("stock_movements_product_idx").on(t.productId, t.id.desc()),
  ],
);

// --- Sales --------------------------------------------------------------------

export const salesOrders = pgTable(
  "sales_orders",
  {
    id: serial("id").primaryKey(),
    number: text("number").notNull().unique(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id),
    warehouseId: integer("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    status: salesStatusEnum("status").notNull().default("draft"),
    orderDate: date("order_date", { mode: "string" }).notNull(),
    taxRateBp: integer("tax_rate_bp").notNull(),
    subtotal: money("subtotal").notNull(),
    tax: money("tax").notNull(),
    total: money("total").notNull(),
    /** Cost of goods shipped, recorded at delivery. */
    costOfGoods: money("cost_of_goods"),
    notes: text("notes"),
    /** Bumped on every write; edits carry the version they started from. */
    version: integer("version").notNull().default(1),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  },
  (t) => [
    check("sales_orders_totals", sql`${t.total} = ${t.subtotal} + ${t.tax}`),
    index("sales_orders_status_idx").on(t.status, t.orderDate.desc()),
    index("sales_orders_customer_idx").on(t.customerId),
  ],
);

export const salesOrderLines = pgTable(
  "sales_order_lines",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => salesOrders.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id),
    qty: integer("qty").notNull(),
    unitPrice: money("unit_price").notNull(),
    lineTotal: money("line_total").notNull(),
    /** Cost removed from inventory when this line shipped. */
    cost: money("cost"),
  },
  (t) => [
    check("sales_order_lines_qty_pos", sql`${t.qty} > 0`),
    check("sales_order_lines_total", sql`${t.lineTotal} = ${t.qty} * ${t.unitPrice}`),
    uniqueIndex("sales_order_lines_product_uq").on(t.orderId, t.productId),
  ],
);

export const invoices = pgTable(
  "invoices",
  {
    id: serial("id").primaryKey(),
    number: text("number").notNull().unique(),
    salesOrderId: integer("sales_order_id")
      .notNull()
      .unique()
      .references(() => salesOrders.id),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id),
    status: invoiceStatusEnum("status").notNull().default("open"),
    issueDate: date("issue_date", { mode: "string" }).notNull(),
    dueDate: date("due_date", { mode: "string" }).notNull(),
    subtotal: money("subtotal").notNull(),
    tax: money("tax").notNull(),
    total: money("total").notNull(),
    amountPaid: money("amount_paid").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    check("invoices_paid_range", sql`${t.amountPaid} >= 0 AND ${t.amountPaid} <= ${t.total}`),
    check("invoices_status_matches", sql`(${t.status} = 'paid') = (${t.amountPaid} = ${t.total})`),
    index("invoices_status_due_idx").on(t.status, t.dueDate),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: serial("id").primaryKey(),
    invoiceId: integer("invoice_id")
      .notNull()
      .references(() => invoices.id),
    amount: money("amount").notNull(),
    paidOn: date("paid_on", { mode: "string" }).notNull(),
    method: text("method").notNull(),
    reference: text("reference"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [check("payments_amount_pos", sql`${t.amount} > 0`)],
);

// --- Purchasing ---------------------------------------------------------------

export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    id: serial("id").primaryKey(),
    number: text("number").notNull().unique(),
    supplierId: integer("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    warehouseId: integer("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    status: purchaseStatusEnum("status").notNull().default("draft"),
    orderDate: date("order_date", { mode: "string" }).notNull(),
    expectedDate: date("expected_date", { mode: "string" }),
    taxRateBp: integer("tax_rate_bp").notNull(),
    subtotal: money("subtotal").notNull(),
    tax: money("tax").notNull(),
    total: money("total").notNull(),
    notes: text("notes"),
    version: integer("version").notNull().default(1),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
    receivedOn: date("received_on", { mode: "string" }),
    paidOn: date("paid_on", { mode: "string" }),
  },
  (t) => [
    check("purchase_orders_totals", sql`${t.total} = ${t.subtotal} + ${t.tax}`),
    index("purchase_orders_status_idx").on(t.status, t.orderDate.desc()),
  ],
);

export const purchaseOrderLines = pgTable(
  "purchase_order_lines",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id),
    qty: integer("qty").notNull(),
    unitCost: money("unit_cost").notNull(),
    lineTotal: money("line_total").notNull(),
  },
  (t) => [
    check("purchase_order_lines_qty_pos", sql`${t.qty} > 0`),
    check("purchase_order_lines_total", sql`${t.lineTotal} = ${t.qty} * ${t.unitCost}`),
    uniqueIndex("purchase_order_lines_product_uq").on(t.orderId, t.productId),
  ],
);

// --- General ledger -----------------------------------------------------------

export const accounts = pgTable("accounts", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  type: accountTypeEnum("type").notNull(),
});

/** Append-only. Mistakes are fixed with reversing entries (enforced by trigger). */
export const journalEntries = pgTable(
  "journal_entries",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    number: text("number").notNull().unique(),
    entryDate: date("entry_date", { mode: "string" }).notNull(),
    memo: text("memo").notNull(),
    /** Business document that produced this entry, e.g. "SO-2026-00042". */
    source: text("source"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("journal_entries_date_idx").on(t.entryDate.desc(), t.id.desc())],
);

export const journalLines = pgTable(
  "journal_lines",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    entryId: bigint("entry_id", { mode: "number" })
      .notNull()
      .references(() => journalEntries.id),
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id),
    debit: money("debit").notNull().default(0),
    credit: money("credit").notNull().default(0),
  },
  (t) => [
    check("journal_lines_one_sided", sql`(${t.debit} > 0 AND ${t.credit} = 0) OR (${t.credit} > 0 AND ${t.debit} = 0)`),
    index("journal_lines_entry_idx").on(t.entryId),
    index("journal_lines_account_idx").on(t.accountId),
  ],
);
