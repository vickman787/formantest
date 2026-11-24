import { NextResponse } from "next/server";
import { runNext } from "@/lib/worker";

/** POST /api/worker/tick — run one queued order through the pipeline.
 *  The background worker (`pnpm worker`) calls this loop; the endpoint
 *  exists so a hosted cron can drive it too. It only processes orders
 *  already queued after verified funding. */
export async function POST() {
  const id = await runNext();
  return NextResponse.json({ ok: true, processed: id });
}

export async function GET() {
  const id = await runNext();
  return NextResponse.json({ ok: true, processed: id });
}
