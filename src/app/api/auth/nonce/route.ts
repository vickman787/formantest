import { NextResponse } from "next/server";
import { createNonce } from "@/lib/auth";

export async function POST(req: Request) {
  const { wallet } = (await req.json()) as { wallet?: string };
  if (!wallet || !/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
    return NextResponse.json({ error: "A valid wallet address is required." }, { status: 400 });
  }
  const { nonce, message } = await createNonce(wallet);
  return NextResponse.json({ nonce, message });
}
