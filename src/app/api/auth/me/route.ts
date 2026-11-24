import { NextResponse } from "next/server";
import { currentCustomer } from "@/lib/auth";

export async function GET() {
  const c = await currentCustomer();
  if (!c) return NextResponse.json({ wallet: null });
  return NextResponse.json({ wallet: c.wallet });
}
