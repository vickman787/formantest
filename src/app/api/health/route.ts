import { NextResponse } from "next/server";
import { APP_MODE, QIE_CHAIN_ID, QUSDC_ADDRESS, SERVICE_PRICE_BASE_UNITS, liveReady } from "@/lib/config";

export async function GET() {
  return NextResponse.json({ status: "ok", mode: APP_MODE, chain_id: QIE_CHAIN_ID, qusdc: QUSDC_ADDRESS, price_base_units: SERVICE_PRICE_BASE_UNITS, live_ready: liveReady() });
}
