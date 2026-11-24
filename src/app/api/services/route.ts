import { NextResponse } from "next/server";
import { SERVICES, SERVICE_IDS } from "@/lib/services";
import { SERVICE_PRICE_BASE_UNITS, SERVICE_PRICE_LABEL } from "@/lib/config";

export async function GET() {
  return NextResponse.json({
    price_base_units: SERVICE_PRICE_BASE_UNITS,
    price_label: SERVICE_PRICE_LABEL,
    services: SERVICE_IDS.map((id) => ({ ...SERVICES[id] })),
  });
}
