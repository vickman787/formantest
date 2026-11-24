import { NextResponse } from "next/server";
import { requireCustomer } from "@/lib/auth";
import { getOrderOwned, listEvents, listSteps } from "@/lib/jobs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const c = await requireCustomer();
    const { id } = await params;
    const order = await getOrderOwned(id, c.id);
    if (!order) return NextResponse.json({ error: "Project not found." }, { status: 404 });
    const events = await listEvents(id);
    const steps = await listSteps(id);
    return NextResponse.json({ order, events, steps });
  } catch {
    return NextResponse.json({ error: "Sign in to view this project." }, { status: 401 });
  }
}
