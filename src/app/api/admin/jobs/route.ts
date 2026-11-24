import { NextResponse } from "next/server";
import { currentCustomer } from "@/lib/auth";
import { ADMIN_WALLETS } from "@/lib/config";
import { ensureSchema, getPool } from "@/lib/db";

export async function GET() {
  const c = await currentCustomer();
  if (!c || !ADMIN_WALLETS.includes(c.wallet.toLowerCase())) {
    return NextResponse.json({ error: "Admin only." }, { status: 403 });
  }
  await ensureSchema();
  const orders = await getPool().query(
    "SELECT id, service, state, payment_state, amount_base_units, created_at FROM orders ORDER BY created_at DESC LIMIT 100",
  );
  const failed = await getPool().query(
    "SELECT order_id, stage, detail, created_at FROM job_steps WHERE status='failed' ORDER BY created_at DESC LIMIT 50",
  );
  const liabilities = await getPool().query(
    "SELECT COUNT(*)::int AS funded_unsettled, COALESCE(SUM(amount_base_units::bigint),0)::text AS base_units FROM orders WHERE payment_state IN ('funded','release_pending','refund_pending')",
  );
  return NextResponse.json({
    mode: "live",
    orders: orders.rows,
    failures: failed.rows,
    liabilities: liabilities.rows[0],
  });
}
