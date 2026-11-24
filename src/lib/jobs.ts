import { ensureSchema, getPool, newId } from "./db";
import { sha256, canonical } from "./manifest";
import type { ServiceId } from "./services";

export type OrderState =
  | "draft" | "quoted" | "awaiting_funding" | "queued" | "running"
  | "checking" | "delivered" | "failed" | "closed";
export type PaymentState =
  | "unfunded" | "pending" | "funded" | "release_pending"
  | "released" | "refund_pending" | "refunded" | "unknown";

export interface OrderRow {
  id: string;
  customer_id: string;
  service: ServiceId;
  brief: Record<string, unknown>;
  brief_hash: string;
  brand_kit_id: string | null;
  state: OrderState;
  payment_state: PaymentState;
  amount_base_units: string;
  asset: string;
  chain_id: number;
  chain_job_id: string | null;
  terms_version: string;
  fund_deadline: string | null;
  delivery_deadline: string | null;
  review_deadline: string | null;
  manifest_hash: string | null;
  manifest: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export async function getOrder(id: string): Promise<OrderRow | null> {
  await ensureSchema();
  const { rows } = await getPool().query("SELECT * FROM orders WHERE id=$1", [id]);
  return (rows[0] as OrderRow | undefined) ?? null;
}

export async function getOrderOwned(id: string, customerId: string): Promise<OrderRow | null> {
  const o = await getOrder(id);
  return o && o.customer_id === customerId ? o : null;
}

export async function listOrders(customerId: string): Promise<OrderRow[]> {
  await ensureSchema();
  const { rows } = await getPool().query(
    "SELECT * FROM orders WHERE customer_id=$1 ORDER BY created_at DESC LIMIT 50",
    [customerId],
  );
  return rows as OrderRow[];
}

export function briefHash(brief: unknown): string {
  return sha256(canonical(brief));
}

export async function createOrder(customerId: string, service: ServiceId, brief: Record<string, unknown>, brandKitId: string | null): Promise<OrderRow> {
  await ensureSchema();
  const id = newId("ord");
  const hash = briefHash(brief);
  const { rows } = await getPool().query(
    `INSERT INTO orders(id, customer_id, service, brief, brief_hash, brand_kit_id, state, payment_state)
     VALUES ($1,$2,$3,$4,$5,$6,'draft','unfunded') RETURNING *`,
    [id, customerId, service, JSON.stringify(brief), hash, brandKitId],
  );
  await addEvent(id, "brief_saved", "Brief saved as a draft.");
  return rows[0] as OrderRow;
}

export async function updateOrder(id: string, patch: Partial<Pick<OrderRow, "state" | "payment_state" | "brief" | "chain_job_id" | "fund_deadline" | "delivery_deadline" | "review_deadline" | "manifest_hash" | "manifest">>): Promise<void> {
  await ensureSchema();
  const sets: string[] = ["updated_at=now()"];
  const vals: unknown[] = [];
  for (const [k, v] of Object.entries(patch)) {
    vals.push(k === "brief" || k === "manifest" ? JSON.stringify(v) : v);
    sets.push(`${k}=$${vals.length}`);
  }
  vals.push(id);
  await getPool().query(`UPDATE orders SET ${sets.join(", ")} WHERE id=$${vals.length}`, vals as never[]);
}

export async function addEvent(orderId: string, kind: string, message: string): Promise<void> {
  await ensureSchema();
  await getPool().query("INSERT INTO order_events(order_id, kind, message) VALUES ($1,$2,$3)", [orderId, kind, message]);
}

export async function listEvents(orderId: string) {
  await ensureSchema();
  const { rows } = await getPool().query(
    "SELECT kind, message, created_at FROM order_events WHERE order_id=$1 ORDER BY created_at ASC, id ASC",
    [orderId],
  );
  return rows as { kind: string; message: string; created_at: string }[];
}

export async function setStep(orderId: string, stage: string, status: string, detail = "", attempt = 0): Promise<void> {
  await ensureSchema();
  await getPool().query(
    `INSERT INTO job_steps(order_id, stage, status, attempt, detail, started_at, finished_at)
     VALUES ($1,$2,$3,$4,$5, now(), CASE WHEN $3 IN ('done','failed') THEN now() ELSE NULL END)
     ON CONFLICT (order_id, stage, attempt) DO UPDATE SET status=EXCLUDED.status, detail=EXCLUDED.detail,
       finished_at=CASE WHEN EXCLUDED.status IN ('done','failed') THEN now() ELSE job_steps.finished_at END`,
    [orderId, stage, status, attempt, detail],
  );
}

export async function listSteps(orderId: string) {
  await ensureSchema();
  const { rows } = await getPool().query(
    "SELECT stage, status, detail, attempt, created_at FROM job_steps WHERE order_id=$1 ORDER BY created_at ASC",
    [orderId],
  );
  return rows;
}

/** Claim the next queued order for the worker. One active lease per order. */
export async function claimNextQueued(): Promise<OrderRow | null> {
  await ensureSchema();
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      "SELECT * FROM orders WHERE state='queued' ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED",
    );
    if (rows.length === 0) {
      await client.query("COMMIT");
      return null;
    }
    const order = rows[0] as OrderRow;
    await client.query("UPDATE orders SET state='running', updated_at=now() WHERE id=$1", [order.id]);
    await client.query("COMMIT");
    return { ...order, state: "running" };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}
