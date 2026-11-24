/** Check the background worker picks up a funded demo job on its own. */
import { privateKeyToAccount } from "viem/accounts";

const BASE = "http://localhost:3000";
const account = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f3ff80");
let cookie = "";

async function call(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
  });
  const sc = res.headers.get("set-cookie");
  if (sc) cookie = sc.split(";")[0];
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

async function main() {
  const n = await call("/api/auth/nonce", { method: "POST", body: JSON.stringify({ wallet: account.address }) });
  const sig = await account.signMessage({ message: n.json.message as string });
  const v = await call("/api/auth/verify", { method: "POST", body: JSON.stringify({ wallet: account.address, nonce: n.json.nonce, signature: sig }) });
  if (v.status !== 200) throw new Error("auth failed");
  const q = await call("/api/quotes", {
    method: "POST",
    body: JSON.stringify({
      service: "business_website",
      brief: {
        business_name: "Sunday Crumb", description: "A small Lagos bakery making sourdough, pastries, and coffee.",
        industry: "Food & bakery", location: "Lagos, Nigeria", audience: "Neighbours", contact: "hello@sundaycrumb.example",
        colors: ["#684425"], website_or_social: "", sections: ["hero", "about", "contact"],
        cta: "Explore our bakery", menu_or_prices: "Sourdough loaf — ₦2,500", reference_style: "",
      },
    }),
  });
  const id = q.json.order_id as string;
  console.log("order", id);
  await call(`/api/orders/${id}/payment-sync`, { method: "POST", body: JSON.stringify({ demo: true }) });
  console.log("funded — waiting for the background worker (no manual tick)…");
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const got = await call(`/api/orders/${id}`);
    const state = (got.json.order as { state: string })?.state;
    console.log(`  ${i * 5 + 5}s: ${state}`);
    if (state === "delivered") {
      console.log("WORKER CHECK PASSED — background worker delivered the job on its own");
      return;
    }
    if (state === "failed") throw new Error("job failed");
  }
  throw new Error("worker did not deliver within 60s");
}

main().catch((e) => { console.error(e); process.exit(1); });
