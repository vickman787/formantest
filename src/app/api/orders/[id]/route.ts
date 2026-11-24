import { NextResponse } from "next/server";
import { requireCustomer } from "@/lib/auth";
import { getOrderOwned } from "@/lib/jobs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const c = await requireCustomer();
    const { id } = await params;
    const order = await getOrderOwned(id, c.id);
    if (!order) return NextResponse.json({ error: "Project not found." }, { status: 404 });
    return NextResponse.json({ order });
  } catch {
    return NextResponse.json({ error: "Sign in to view this project." }, { status: 401 });
  }
}
