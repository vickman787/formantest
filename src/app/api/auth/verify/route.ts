import { NextResponse } from "next/server";
import { verifySignature } from "@/lib/auth";

export async function POST(req: Request) {
  const { wallet, nonce, signature } = (await req.json()) as { wallet?: string; nonce?: string; signature?: `0x${string}` };
  if (!wallet || !nonce || !signature) {
    return NextResponse.json({ error: "Wallet, nonce and signature are required." }, { status: 400 });
  }
  const ok = await verifySignature(wallet, nonce, signature);
  if (!ok) return NextResponse.json({ error: "Signature did not verify. Try connecting again." }, { status: 401 });
  return NextResponse.json({ ok: true, wallet: wallet.toLowerCase() });
}
