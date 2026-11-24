import { NextResponse } from "next/server";
import { requireCustomer } from "@/lib/auth";
import { ensureSchema, getPool, newId } from "@/lib/db";
import { addEvent, getOrderOwned } from "@/lib/jobs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const c = await requireCustomer();
    const { id } = await params;
    const order = await getOrderOwned(id, c.id);
    if (!order) return NextResponse.json({ error: "Project not found." }, { status: 404 });
    const { description } = (await req.json()) as { description?: string };
    if (!description || description.trim().length < 10) {
      return NextResponse.json({ error: "Describe the problem in at least 10 characters." }, { status: 400 });
    }
    await ensureSchema();
    const issueId = newId("iss");
    await getPool().query(
      "INSERT INTO support_issues(id, order_id, customer_id, description) VALUES ($1,$2,$3,$4)",
      [issueId, id, c.id, description.trim()],
    );
    await addEvent(id, "issue_reported", "Problem reported. The Forma team reviews it; a genuine failure before settlement can be refunded by the operator.");
    return NextResponse.json({ ok: true, issue_id: issueId });
  } catch {
    return NextResponse.json({ error: "Sign in to report a problem." }, { status: 401 });
  }
}
