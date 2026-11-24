import { NextResponse } from "next/server";
import { requireCustomer } from "@/lib/auth";
import { createOrder, listOrders } from "@/lib/jobs";
import { SERVICE_IDS, validateBrief, type ServiceId } from "@/lib/services";

/** GET /api/orders — my project history. POST — save a draft brief. */
export async function GET() {
  try {
    const c = await requireCustomer();
    const orders = await listOrders(c.id);
    return NextResponse.json({ orders });
  } catch {
    return NextResponse.json({ error: "Sign in to see your projects." }, { status: 401 });
  }
}

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
        { error: "The brief needs a few fixes before it can be saved.", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const order = await createOrder(c.id, service, parsed.data as Record<string, unknown>, body.brand_kit_id ?? null);
    return NextResponse.json({ ok: true, order_id: order.id });
  } catch {
    return NextResponse.json({ error: "Sign in to save a draft." }, { status: 401 });
  }
}
