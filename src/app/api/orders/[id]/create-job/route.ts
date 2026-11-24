import { NextResponse } from "next/server";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { requireCustomer } from "@/lib/auth";
import { ESCROW_ADDRESS, QUSDC_ADDRESS, SERVICE_PRICE_BASE_UNITS } from "@/lib/config";
import { ESCROW_WRITE_ABI, escrowDeployed, jobIdFor, qieChain } from "@/lib/escrow";
import { addEvent, getOrderOwned, updateOrder } from "@/lib/jobs";

/**
 * POST /api/orders/:id/create-job — operator binds the order to an onchain
 * escrow job. Fails closed: no escrow, no operator key, or a non-quoted
 * order all refuse. The operator key lives in server env only and is
 * never in the repo or the client bundle.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const c = await requireCustomer();
    const { id } = await params;
    const order = await getOrderOwned(id, c.id);
    if (!order) return NextResponse.json({ error: "Project not found." }, { status: 404 });
    if (order.chain_job_id) {
      return NextResponse.json({ ok: true, chain_job_id: order.chain_job_id, already: true });
    }
    if (order.state !== "quoted") {
      return NextResponse.json({ error: `Get a quote first — this project is ${order.state}.` }, { status: 400 });
    }
    if (!escrowDeployed()) {
      return NextResponse.json({ error: "The escrow contract is not deployed yet. Live checkout is unavailable." }, { status: 503 });
    }
    const key = process.env.OPERATOR_PRIVATE_KEY as `0x${string}` | undefined;
    if (!key) {
      return NextResponse.json({ error: "The operator signer is not configured on the server." }, { status: 503 });
    }
    const operator = privateKeyToAccount(key);
    const client = createWalletClient({ account: operator, chain: qieChain, transport: http(qieChain.rpcUrls.default.http[0]) });
    const jobId = jobIdFor(id);
    const now = Math.floor(Date.now() / 1000);
    const hash = await client.writeContract({
      address: ESCROW_ADDRESS as `0x${string}`,
      abi: ESCROW_WRITE_ABI,
      functionName: "createJob",
      args: [
        jobId,
        c.wallet as `0x${string}`,
        BigInt(SERVICE_PRICE_BASE_UNITS),
        BigInt(now + 30 * 60),
        BigInt(now + 24 * 60 * 60),
        BigInt(now + 24 * 60 * 60 + 48 * 60 * 60),
      ],
    });
    await updateOrder(id, {
      chain_job_id: jobId,
      state: "awaiting_funding",
      fund_deadline: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      delivery_deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      review_deadline: new Date(Date.now() + 24 * 60 * 60 * 1000 + 48 * 60 * 60 * 1000).toISOString(),
    });
    await addEvent(id, "job_created", `Escrow job created onchain: ${hash}. Fund exactly 1 QUSDC within 30 minutes.`);
    return NextResponse.json({ ok: true, chain_job_id: jobId, create_tx: hash, escrow: ESCROW_ADDRESS, qusdc: QUSDC_ADDRESS });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not create the escrow job." }, { status: 500 });
  }
}
