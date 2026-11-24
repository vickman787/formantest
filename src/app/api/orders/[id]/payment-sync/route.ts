import { NextResponse } from "next/server";
import { requireCustomer } from "@/lib/auth";
import { verifyFunding } from "@/lib/escrow";
import { addEvent, getOrderOwned, updateOrder } from "@/lib/jobs";

/**
 * POST /api/orders/:id/payment-sync — server-verified reconciliation.
 * The client never proves payment with a hash alone; the server reads the
 * receipt and the escrow event. There is no simulated funding.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const c = await requireCustomer();
    const { id } = await params;
    const order = await getOrderOwned(id, c.id);
    if (!order) return NextResponse.json({ error: "Project not found." }, { status: 404 });
    if (order.payment_state === "funded" || order.payment_state === "released") {
      return NextResponse.json({ ok: true, payment_state: order.payment_state, already: true });
    }
    if (order.state === "draft") {
      return NextResponse.json({ error: "Get a quote first — the price and funding window are frozen at quote time." }, { status: 400 });
    }
    const body = (await req.json().catch(() => ({}))) as { tx_hash?: string };

    // Verify the receipt + escrow event onchain.
    if (!body.tx_hash || !/^0x[0-9a-fA-F]{64}$/.test(body.tx_hash)) {
      return NextResponse.json({ error: "A funding transaction hash is required." }, { status: 400 });
    }
    if (!order.chain_job_id) {
      return NextResponse.json({ error: "This order has no onchain job yet. Create the escrow job first." }, { status: 400 });
    }
    const v = await verifyFunding(body.tx_hash as `0x${string}`, order.chain_job_id as `0x${string}`, c.wallet as `0x${string}`);
    if (!v.ok) return NextResponse.json({ error: v.reason ?? "Funding could not be verified.", payment_state: "unknown" }, { status: 422 });
    await updateOrder(id, {
      payment_state: "funded",
      state: "queued",
      delivery_deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
    await addEvent(id, "funded", `Funding verified onchain: ${body.tx_hash}. Job queued for generation.`);
    return NextResponse.json({ ok: true, payment_state: "funded", state: "queued", tx_hash: body.tx_hash });
  } catch {
    return NextResponse.json({ error: "Sign in to sync payment." }, { status: 401 });
  }
}
