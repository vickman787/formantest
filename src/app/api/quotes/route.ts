import { NextResponse } from "next/server";
import { requireCustomer } from "@/lib/auth";
import { SERVICE_PRICE_BASE_UNITS } from "@/lib/config";
import { addEvent, briefHash, createOrder, updateOrder } from "@/lib/jobs";
import { SERVICE_IDS, validateBrief, type ServiceId } from "@/lib/services";

/**
 * POST /api/quotes — validate a brief, freeze the price and terms, create
 * the order in `quoted` state with a 30-minute funding window.
 * One order per quote: the order id is the quote.
 */
export async function POST(req: Request) {
  try {
    const c = await requireCustomer();
    const body = (await req.json()) as { service?: string; brief?: unknown; brand_kit_id?: string | null };
    if (!body.service || !(SERVICE_IDS as readonly string[]).includes(body.service)) {
      return NextResponse.json({ error: "Choose one of the four services." }, { status: 400 });
    }
    const service = body.service as ServiceId;
    const parsed = validateBrief(service, body.brief);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "The brief needs a few fixes.", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const order = await createOrder(c.id, service, parsed.data as Record<string, unknown>, body.brand_kit_id ?? null);
    const fundDeadline = new Date(Date.now() + 30 * 60 * 1000);
    await updateOrder(order.id, { state: "quoted", fund_deadline: fundDeadline.toISOString() });
    await addEvent(order.id, "quoted", `Quote frozen: 1 QUSDC (${SERVICE_PRICE_BASE_UNITS} base units), QIE Mainnet. Fund within 30 minutes.`);
    return NextResponse.json({
      order_id: order.id,
      service,
      amount_base_units: SERVICE_PRICE_BASE_UNITS,
      asset: "QUSDC",
      chain_id: 1990,
      brief_hash: briefHash(parsed.data),
      fund_deadline: fundDeadline.toISOString(),
      terms_version: "v1",
      terms: {
        deliver_within_hours: 24,
        review_within_hours: 48,
        note: "Delivery within 24 hours of confirmed funding; review within 48 hours of delivery. After the review window, an unaccepted delivery is released automatically. A missed delivery deadline entitles you to a refund.",
      },
    });
  } catch {
    return NextResponse.json({ error: "Sign in to get a quote." }, { status: 401 });
  }
}
