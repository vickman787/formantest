/** End-to-end demo run against a running dev server (http://localhost:3000).
 *  Uses a throwaway local wallet (anvil default key #0) and signs the real
 *  SIWE-style nonce flow. No funds move; demo mode only.
 *  Run: pnpm dev (in another shell), then `pnpm tsx scripts/e2e-demo.ts` */
import { privateKeyToAccount } from "viem/accounts";

const BASE = process.env.FORMA_URL ?? "http://localhost:3000";
const account = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f3ff80");
let cookie = "";

async function call(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...(init?.headers ?? {}) },
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  const text = await res.text();
  let json: unknown = null;
  try { json = JSON.parse(text); } catch { /* non-json body */ }
  return { status: res.status, json: json as Record<string, unknown> | null, text };
}

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  console.log("  ok —", msg);
}

const briefs: Record<string, Record<string, unknown>> = {
  business_website: {
    business_name: "Sunday Crumb", description: "A small Lagos bakery making slow-fermented sourdough, pastries, and coffee.",
    industry: "Food & bakery", location: "Lagos, Nigeria", audience: "Neighbours", contact: "hello@sundaycrumb.example",
    colors: ["#684425"], website_or_social: "", sections: ["hero", "about", "menu_or_services", "contact"],
    cta: "Explore our bakery", menu_or_prices: "Sourdough loaf — ₦2,500\nCroissant — ₦1,200", reference_style: "",
  },
  flyers_price_list: {
    business_name: "Sunday Crumb", description: "A small Lagos bakery making slow-fermented sourdough, pastries, and coffee.",
    industry: "Food & bakery", location: "Lagos, Nigeria", audience: "Neighbours", contact: "hello@sundaycrumb.example",
    colors: ["#D75B3E"], website_or_social: "", offer: "The weekend bake. Sourdough, coffee, good company.",
    currency: "₦", items: [{ name: "Sourdough loaf", price: "₦2,500" }, { name: "Croissant", price: "₦1,200" }], expiry: "",
  },
  promo_video: {
    business_name: "Sunday Crumb", description: "A small Lagos bakery making slow-fermented sourdough, pastries, and coffee.",
    industry: "Food & bakery", location: "Lagos, Nigeria", audience: "Neighbours", contact: "hello@sundaycrumb.example",
    colors: ["#172B36"], website_or_social: "", offer: "Fresh sourdough every morning in Lagos", cta: "Order today",
    tone: "bright", approved_photos_note: "",
  },
  market_report: {
    business_name: "Sunday Crumb", description: "A small Lagos bakery making slow-fermented sourdough, pastries, and coffee.",
    industry: "Food & bakery", location: "Lagos, Nigeria", audience: "Neighbours", contact: "hello@sundaycrumb.example",
    colors: [], website_or_social: "", geography: "Lagos, Nigeria",
    question: "Is there demand for a second bakery branch in Yaba?", competitors: [], urls: [],
  },
};

async function runService(service: string) {
  console.log(`\n== ${service} ==`);
  const q = await call("/api/quotes", { method: "POST", body: JSON.stringify({ service, brief: briefs[service] }) });
  assert(q.status === 200, `quote created (${q.status})`);
  const orderId = q.json?.order_id as string;
  assert(orderId?.startsWith("ord_"), `order id ${orderId}`);
  assert(q.json?.amount_base_units === "1000000", "price is exactly 1 QUSDC in base units");

  const pay = await call(`/api/orders/${orderId}/payment-sync`, { method: "POST", body: JSON.stringify({ demo: true }) });
  assert(pay.status === 200 && pay.json?.payment_state === "funded", "demo funding simulated, job queued");

  const tick = await call("/api/worker/tick", { method: "POST" });
  assert(tick.status === 200, "worker tick ran");

  const got = await call(`/api/orders/${orderId}`);
  const state = ((got.json as { order?: { state?: string } }).order?.state ?? "") as string;
  if (service === "market_report") {
    assert(state === "failed", `report fails honestly without OpenAI (state=${state})`);
    return orderId;
  }
  assert(state === "delivered", `delivered (state=${state})`);
  const arts = await call(`/api/orders/${orderId}/artifacts`);
  const files = (arts.json?.artifacts as { filename: string }[] | undefined) ?? [];
  assert(files.length > 0, `${files.length} artifact(s): ${files.map((f) => f.filename).join(", ")}`);
  assert(typeof arts.json?.manifest_hash === "string" && (arts.json.manifest_hash as string).length === 64, "manifest hash is a 64-char sha256");

  // Download a representative artifact and check its content.
  const first = service === "promo_video" ? "promo-vertical.mp4" : files[0].filename;
  const dl = await fetch(`${BASE}/api/orders/${orderId}/artifacts/${first}`, { headers: { Cookie: cookie } });
  assert(dl.status === 200, `download ${first} (${dl.status})`);
  if (service === "business_website") {
    const html = await dl.text();
    assert(html.includes("₦2,500"), "website preserves the exact price ₦2,500");
    assert(html.includes("hello@sundaycrumb.example"), "website preserves the exact contact");
  }
  if (service === "promo_video") {
    const buf = Buffer.from(await dl.arrayBuffer());
    assert(buf.length > 10_000, `mp4 is a real file (${(buf.length / 1024).toFixed(0)} KB)`);
    const probe = await call(`/api/orders/${orderId}/artifacts`);
    void probe;
  }

  const accept = await call(`/api/orders/${orderId}/decision-sync`, { method: "POST", body: JSON.stringify({ demo: true }) });
  assert(accept.status === 200 && accept.json?.payment_state === "released", "accept releases (demo) and closes the order");
  return orderId;
}

async function main() {
  console.log("Forma e2e demo —", BASE);
  // Auth: nonce -> sign -> verify (real signature, throwaway key).
  const n = await call("/api/auth/nonce", { method: "POST", body: JSON.stringify({ wallet: account.address }) });
  assert(n.status === 200, "nonce issued");
  const signature = await account.signMessage({ message: n.json?.message as string });
  const v = await call("/api/auth/verify", {
    method: "POST",
    body: JSON.stringify({ wallet: account.address, nonce: n.json?.nonce, signature }),
  });
  assert(v.status === 200, "wallet signature verified, session cookie set");

  // Unauthenticated access must fail.
  const saved = cookie; cookie = "";
  const anon = await call("/api/orders");
  assert(anon.status === 401, "anonymous order list is rejected");
  cookie = saved;

  for (const s of ["business_website", "flyers_price_list", "promo_video", "market_report"]) {
    await runService(s);
  }
  console.log("\nALL E2E CHECKS PASSED");
}

main().catch((e) => { console.error(e); process.exit(1); });
