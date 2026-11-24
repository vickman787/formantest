import { NextResponse } from "next/server";
import { requireCustomer } from "@/lib/auth";
import { ensureSchema, getPool, newId } from "@/lib/db";
import { brandKitSchema } from "@/lib/services";

export async function GET() {
  try {
    const c = await requireCustomer();
    await ensureSchema();
    const { rows } = await getPool().query(
      "SELECT id, name, business_name, description, industry, location, audience, contact, colors, website_or_social, version, updated_at FROM brand_kits WHERE customer_id=$1 ORDER BY updated_at DESC",
      [c.id],
    );
    return NextResponse.json({ kits: rows });
  } catch {
    return NextResponse.json({ error: "Sign in to see your brand kits." }, { status: 401 });
  }
}

export async function PUT(req: Request) {
  try {
    const c = await requireCustomer();
    const body = (await req.json()) as { name?: string } & Record<string, unknown>;
    const parsed = brandKitSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Check the brand details.", issues: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    await ensureSchema();
    const id = newId("kit");
    const name = body.name?.toString().trim() || parsed.data.business_name;
    const { rows } = await getPool().query(
      `INSERT INTO brand_kits(id, customer_id, name, business_name, description, industry, location, audience, contact, colors, website_or_social)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [id, c.id, name, parsed.data.business_name, parsed.data.description, parsed.data.industry, parsed.data.location, parsed.data.audience, parsed.data.contact, JSON.stringify(parsed.data.colors), parsed.data.website_or_social],
    );
    return NextResponse.json({ ok: true, id: rows[0].id });
  } catch {
    return NextResponse.json({ error: "Sign in to save a brand kit." }, { status: 401 });
  }
}
