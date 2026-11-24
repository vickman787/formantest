import { NextResponse } from "next/server";
import { requireCustomer } from "@/lib/auth";
import { readJobStatus } from "@/lib/escrow";
import { addEvent, getOrderOwned, updateOrder } from "@/lib/jobs";

/**
 * POST /api/orders/:id/decision-sync — reconcile the customer's onchain
 * acceptance. Clicking Accept in the UI only starts the decision; this
 * endpoint confirms it onchain. Only the recorded customer can accept,
 * and only once.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const c = await requireCustomer();
    const { id } = await params;
    const order = await getOrderOwned(id, c.id);
    if (!order) return NextResponse.json({ error: "Project not found." }, { status: 404 });
    if (order.state !== "delivered") {
      return NextResponse.json({ error: `Nothing to accept yet — this project is ${order.state}.` }, { status: 400 });
    }
    if (order.payment_state === "released") {
      return NextResponse.json({ ok: true, payment_state: "released", already: true });
    }

    if (!order.chain_job_id) return NextResponse.json({ error: "No onchain job to accept." }, { status: 400 });
    const status = await readJobStatus(order.chain_job_id as `0x${string}`);
    if (status !== 3) {
      return NextResponse.json({ error: "Onchain acceptance not found yet. Sign the accept transaction in your wallet, then sync again.", payment_state: order.payment_state }, { status: 422 });
    }
    await updateOrder(id, { payment_state: "released", state: "closed" });
    await addEvent(id, "accepted", "Delivery accepted onchain. 1 QUSDC released to the Forma treasury.");
    return NextResponse.json({ ok: true, payment_state: "released", state: "closed" });
  } catch {
    return NextResponse.json({ error: "Sign in to accept a delivery." }, { status: 401 });
  }
}
