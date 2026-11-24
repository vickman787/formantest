/**
 * End-to-end live-flow test against a local anvil chain (chain 1990).
 * Real escrow, real MockQUSDC, real wallet signatures, real onchain
 * verification, real onchain sealing — no simulation anywhere.
 *
 * Run: `pnpm tsx scripts/e2e-anvil.ts`
 *
 * It starts anvil, deploys MockQUSDC + ServiceEscrow, builds the app,
 * starts a production server + the pipeline on port 3001 with the anvil
 * env, and runs website + flyer + video end to end (quote → create-job →
 * approve + fund → server-verified funding → worker delivery + onchain
 * seal → private downloads → onchain accept → server-verified release).
 * The market report order is expected to FAIL honestly (no OPENAI_API_KEY
 * in the app env) and that is asserted, including that its 1 QUSDC stays
 * locked in the escrow — a failed job never moves money.
 *
 * The dev background worker is stopped for the run (it has no escrow in
 * its env, so it could lease a funded job and deliver it unsealed) and
 * restarted at the end.
 */
import { spawn, execFile } from "node:child_process";
import { createPublicClient, createWalletClient, http, parseAbiItem } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const ROOT = process.cwd();
const BASE = "http://localhost:3001";
const ANVIL_RPC = "http://127.0.0.1:8545";

// Well-known anvil accounts (test only — never mainnet).
// Verified against this anvil's own output: account 0's key ends f2ff80
// (not f3ff80 — one digit differs from the key often quoted online).
const OPERATOR_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
const CUSTOMER_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const;
const OPERATOR = privateKeyToAccount(OPERATOR_KEY);
const CUSTOMER = privateKeyToAccount(CUSTOMER_KEY);

const chain = {
  id: 1990,
  name: "QIE Local",
  nativeCurrency: { name: "QIE", symbol: "QIE", decimals: 18 },
  rpcUrls: { default: { http: [ANVIL_RPC] } },
} as const;

const TOKEN_ABI = [
  parseAbiItem("function approve(address spender, uint256 amount) returns (bool)"),
  parseAbiItem("function balanceOf(address account) view returns (uint256)"),
] as const;
const ESCROW_ABI = [
  parseAbiItem("function fundJob(bytes32 jobId)"),
  parseAbiItem("function acceptDelivery(bytes32 jobId)"),
  parseAbiItem("function getJob(bytes32 jobId) view returns (address customer, uint256 amount, uint8 status, bytes32 manifestHash, uint64 fundDeadline, uint64 deliveryDeadline, uint64 reviewDeadline)"),
] as const;

let checks = 0;
function assert(cond: unknown, label: string) {
  checks++;
  if (!cond) throw new Error(`CHECK FAILED: ${label}`);
  console.log(`  ok — ${label}`);
}

function run(cmd: string, args: string[], env: Record<string, string | undefined> = {}, cwd = ROOT): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd, env: { ...process.env, ...env }, timeout: 180_000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`${cmd} ${args.join(" ")} failed: ${stderr || err.message}`));
      else resolve(stdout);
    });
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitFor(fn: () => Promise<boolean>, label: string, timeoutMs = 120_000) {
  const start = Date.now();
  for (;;) {
    if (await fn().catch(() => false)) return;
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out waiting for: ${label}`);
    await sleep(2000);
  }
}

let cookie = "";
async function call(path: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...(init.headers ?? {}) },
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text);
  } catch {
    json = { _raw: text };
  }
  return { status: res.status, json, text, buf: Buffer.from(text) };
}

async function callBytes(path: string) {
  const res = await fetch(`${BASE}${path}`, { headers: cookie ? { Cookie: cookie } : {} });
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, buf };
}

const BRAND = {
  business_name: "Sunday Crumb",
  description: "A neighbourhood bakery in Yaba baking sourdough, croissants and celebration cakes every morning.",
  industry: "Bakery",
  location: "Yaba, Lagos",
  audience: "Families and offices in Yaba",
  contact: "hello@sundaycrumb.example",
  colors: ["#D75B3E", "#172B36"],
  website_or_social: "",
};

const BRIEFS: Record<string, Record<string, unknown>> = {
  business_website: { ...BRAND, sections: ["hero", "about", "menu_or_services", "contact"], cta: "Order fresh today", menu_or_prices: "Sourdough loaf — ₦2,500\nButter croissant — ₦1,200", reference_style: "warm and simple" },
  flyers_price_list: { ...BRAND, offer: "Weekend bake sale — fresh loaves every Saturday morning.", currency: "₦", items: [{ name: "Sourdough loaf", price: "₦2,500" }, { name: "Butter croissant", price: "₦1,200" }], expiry: "" },
  promo_video: { ...BRAND, offer: "Fresh sourdough every Saturday morning — order by Friday.", cta: "Order today", tone: "bright", approved_photos_note: "" },
  market_report: { ...BRAND, geography: "Yaba, Lagos", question: "Is there demand for a second bakery branch in Yaba?", competitors: ["Oven Fresh"], urls: ["https://example.com"] },
};

async function main() {
  const children: ReturnType<typeof spawn>[] = [];
  const killAll = () => {
    for (const c of children) {
      try {
        c.kill("SIGKILL");
      } catch {
        /* already gone */
      }
    }
  };
  process.on("exit", killAll);

  // 0. Stop the dev background worker so it cannot lease a funded job
  //    and deliver it without the onchain seal (its env has no escrow).
  console.log("Stopping the dev background worker for the run…");
  await run("bash", ["-c", "ps -eo pid,args | grep '[w]orker-run.ts' | awk '{print $1}' | xargs -r kill"]).catch(() => undefined);
  await sleep(2000);

  // 1. Anvil.
  console.log("Starting anvil (chain 1990)…");
  const anvil = spawn("anvil", ["--chain-id", "1990", "--port", "8545", "--silent"], { stdio: "ignore" });
  children.push(anvil);
  const publicClient = createPublicClient({ chain, transport: http(ANVIL_RPC) });
  await waitFor(async () => (await publicClient.getBlockNumber().catch(() => null)) !== null, "anvil RPC", 30_000);
  assert(true, "anvil is up on chain 1990");

  // 2. Deploy MockQUSDC + ServiceEscrow. Clear any stale broadcast/cache
  //    state from an interrupted run first, or forge refuses to broadcast.
  console.log("Deploying MockQUSDC + ServiceEscrow…");
  await run("bash", ["-c", "rm -rf contracts/broadcast/DeployLocal.s.sol contracts/cache/DeployLocal.s.sol"]).catch(() => undefined);
  const out = await run("forge", [
    "script", "script/DeployLocal.s.sol:DeployLocal",
    "--rpc-url", ANVIL_RPC,
    "--private-key", OPERATOR_KEY,
    "--broadcast",
  ], { PATH: `${process.env.HOME}/.foundry/bin:${process.env.PATH}` }, `${ROOT}/contracts`);
  const pick = (label: string) => {
    const m = out.match(new RegExp(`${label}\\n\\s*(0x[0-9a-fA-F]{40})`));
    if (!m) throw new Error(`Deploy output missing ${label}:\n${out}`);
    return m[1] as `0x${string}`;
  };
  const qusdc = pick("QUSDC");
  const escrow = pick("ESCROW");
  const treasury = pick("TREASURY");
  console.log(`  QUSDC=${qusdc} ESCROW=${escrow} TREASURY=${treasury}`);
  assert(true, "contracts deployed on anvil");

  const appEnv: Record<string, string> = {
    PORT: "3001",
    QIE_RPC_URL: ANVIL_RPC,
    QIE_CHAIN_ID: "1990",
    QUSDC_ADDRESS: qusdc,
    ESCROW_ADDRESS: escrow,
    TREASURY_ADDRESS: treasury,
    OPERATOR_PRIVATE_KEY: OPERATOR_KEY,
    APP_URL: BASE,
  };

  // 3. Build, then start a production server on :3001 with the anvil env.
  console.log("Building the app…");
  await run("pnpm", ["build"], { PATH: `${process.env.HOME}/.local/bin:${process.env.PATH}` });
  console.log("Starting the app server on :3001…");
  const server = spawn("pnpm", ["exec", "next", "start", "-p", "3001"], { cwd: ROOT, env: { ...process.env, ...appEnv, PATH: `${process.env.HOME}/.local/bin:${process.env.PATH}` }, stdio: "ignore" });
  children.push(server);
  await waitFor(async () => {
    const r = await call("/api/health");
    return r.status === 200 && r.json.mode === "live" && r.json.live_ready === true;
  }, "app server live + live_ready", 60_000);
  assert(true, "app server is live with the escrow configured");

  const wallet = createWalletClient({ account: CUSTOMER, chain, transport: http(ANVIL_RPC) });

  // 4. Sign in as the customer (real wallet signature).
  const nonceRes = await call("/api/auth/nonce", { method: "POST", body: JSON.stringify({ wallet: CUSTOMER.address }) });
  assert(nonceRes.status === 200 && typeof nonceRes.json.message === "string", "nonce issued");
  const signature = await CUSTOMER.signMessage({ message: nonceRes.json.message as string });
  const verify = await call("/api/auth/verify", { method: "POST", body: JSON.stringify({ wallet: CUSTOMER.address, nonce: nonceRes.json.nonce, signature }) });
  assert(verify.status === 200 && verify.json.ok === true, "signed in with a real wallet signature");
  const anon = await fetch(`${BASE}/api/orders`);
  assert(anon.status === 401, "anonymous order list is rejected");

  let accepted = 0;
  async function runService(service: string) {
    console.log(`\n— ${service} —`);
    const quote = await call("/api/quotes", { method: "POST", body: JSON.stringify({ service, brief: BRIEFS[service] }) });
    assert(quote.status === 200, `${service}: quote issued`);
    assert(quote.json.amount_base_units === "1000000", `${service}: price is exactly 1,000,000 base units`);
    const orderId = quote.json.order_id as string;

    const cj = await call(`/api/orders/${orderId}/create-job`, { method: "POST", body: JSON.stringify({}) });
    assert(cj.status === 200 && typeof cj.json.chain_job_id === "string", `${service}: escrow job created onchain`);
    const jobId = cj.json.chain_job_id as `0x${string}`;

    const allowance = await publicClient.readContract({ address: qusdc, abi: TOKEN_ABI, functionName: "balanceOf", args: [CUSTOMER.address] });
    assert(allowance >= 1_000_000n, `${service}: customer holds at least 1 QUSDC`);
    await wallet.writeContract({ address: qusdc, abi: TOKEN_ABI, functionName: "approve", args: [escrow, 1_000_000n] });
    const fundTx = await wallet.writeContract({ address: escrow, abi: ESCROW_ABI, functionName: "fundJob", args: [jobId] });
    assert(/^0x[0-9a-f]{64}$/.test(fundTx), `${service}: fundJob sent (${fundTx.slice(0, 12)}…)`);

    const pay = await call(`/api/orders/${orderId}/payment-sync`, { method: "POST", body: JSON.stringify({ tx_hash: fundTx }) });
    assert(pay.status === 200 && pay.json.payment_state === "funded", `${service}: funding verified onchain by the server`);

    // Drive the pipeline via the tick endpoint, then poll.
    await call("/api/worker/tick", { method: "POST" });
    await waitFor(async () => {
      const r = await call(`/api/orders/${orderId}/events`);
      const state = (r.json.order as { state?: string } | undefined)?.state;
      if (state === "delivered" || state === "failed") return true;
      await call("/api/worker/tick", { method: "POST" }).catch(() => undefined);
      return false;
    }, `${service}: delivery`, 180_000);
    const eventsRes = await call(`/api/orders/${orderId}/events`);
    const order = eventsRes.json.order as { state?: string; manifest_hash?: string; payment_state?: string };
    const events = eventsRes.json.events as { kind: string; message: string }[];
    assert(order.state === "delivered", `${service}: order delivered`);
    assert(typeof order.manifest_hash === "string" && /^[0-9a-f]{64}$/.test(order.manifest_hash), `${service}: manifest hash is 64 hex chars`);
    assert(events.some((e) => e.kind === "sealed"), `${service}: delivery sealed onchain (sealed event)`);
    const job = await publicClient.readContract({ address: escrow, abi: ESCROW_ABI, functionName: "getJob", args: [jobId] });
    assert(job[2] === 2, `${service}: onchain job is Delivered`);

    const arts = await call(`/api/orders/${orderId}/artifacts`);
    const files = arts.json.artifacts as { filename: string; size_bytes: number | string }[];
    assert(files.length > 0, `${service}: artifacts listed`);
    for (const f of files) {
      const expected = Number(f.size_bytes);
      const dl = await callBytes(`/api/orders/${orderId}/artifacts/${encodeURIComponent(f.filename)}`);
      assert(dl.status === 200 && dl.buf.length === expected && dl.buf.length > 0, `${service}: download ${f.filename} (${expected} bytes)`);
      if (service === "business_website" && f.filename === "index.html") {
        assert(dl.buf.toString().includes("₦2,500") && dl.buf.toString().includes("hello@sundaycrumb.example"), "website keeps the exact ₦2,500 price and contact");
      }
      if (service === "flyers_price_list" && f.filename === "flyer.png") {
        assert(dl.buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])), "flyer PNG has a real PNG header");
      }
      if (service === "promo_video" && f.filename === "promo.mp4") {
        assert(dl.buf.subarray(4, 8).toString() === "ftyp", "promo video is a real MP4 (ftyp)");
      }
    }

    const acceptTx = await wallet.writeContract({ address: escrow, abi: ESCROW_ABI, functionName: "acceptDelivery", args: [jobId] });
    assert(/^0x[0-9a-f]{64}$/.test(acceptTx), `${service}: acceptDelivery sent onchain`);
    const dec = await call(`/api/orders/${orderId}/decision-sync`, { method: "POST", body: JSON.stringify({}) });
    assert(dec.status === 200 && dec.json.payment_state === "released", `${service}: acceptance verified, payment released`);
    const jobAfter = await publicClient.readContract({ address: escrow, abi: ESCROW_ABI, functionName: "getJob", args: [jobId] });
    assert(jobAfter[2] === 3, `${service}: onchain job is Released`);
    accepted++;
    const treasuryBal = await publicClient.readContract({ address: qusdc, abi: TOKEN_ABI, functionName: "balanceOf", args: [treasury] });
    assert(treasuryBal === BigInt(accepted * 1_000_000), `${service}: treasury holds exactly ${accepted} QUSDC after ${accepted} accepted job(s)`);
  }

  for (const s of ["business_website", "flyers_price_list", "promo_video"]) {
    await runService(s);
  }

  // 5. Market report: funds for real, then fails honestly (no OpenAI key).
  console.log("\n— market_report (honest failure) —");
  const quote = await call("/api/quotes", { method: "POST", body: JSON.stringify({ service: "market_report", brief: BRIEFS.market_report }) });
  assert(quote.status === 200, "market_report: quote issued");
  const orderId = quote.json.order_id as string;
  const cj = await call(`/api/orders/${orderId}/create-job`, { method: "POST", body: JSON.stringify({}) });
  assert(cj.status === 200, "market_report: escrow job created");
  const jobId = cj.json.chain_job_id as `0x${string}`;
  await wallet.writeContract({ address: qusdc, abi: TOKEN_ABI, functionName: "approve", args: [escrow, 1_000_000n] });
  const fundTx = await wallet.writeContract({ address: escrow, abi: ESCROW_ABI, functionName: "fundJob", args: [jobId] });
  const pay = await call(`/api/orders/${orderId}/payment-sync`, { method: "POST", body: JSON.stringify({ tx_hash: fundTx }) });
  assert(pay.status === 200 && pay.json.payment_state === "funded", "market_report: funding verified");
  await call("/api/worker/tick", { method: "POST" });
  await waitFor(async () => {
    const r = await call(`/api/orders/${orderId}/events`);
    const state = (r.json.order as { state?: string } | undefined)?.state;
    return state === "failed";
  }, "market_report: honest failure", 120_000);
  const jobReport = await publicClient.readContract({ address: escrow, abi: ESCROW_ABI, functionName: "getJob", args: [jobId] });
  assert(jobReport[2] === 1, "market_report: failed job stays Funded — its 1 QUSDC is still locked in the escrow, nothing was sold");
  const arts = await call(`/api/orders/${orderId}/artifacts`);
  assert((arts.json.artifacts as unknown[]).length === 0, "market_report: no artifacts were delivered");

  killAll();
  // Restart the dev background worker for normal dev work.
  spawn("pnpm", ["worker"], { cwd: ROOT, env: { ...process.env, PATH: `${process.env.HOME}/.local/bin:${process.env.PATH}` }, detached: true, stdio: "ignore" }).unref();
  console.log(`\nALL E2E CHECKS PASSED (${checks} checks)`);
}

main().catch((e) => {
  console.error("\nE2E FAILED:", e instanceof Error ? e.message : String(e));
  // Restart the dev background worker even on failure.
  spawn("pnpm", ["worker"], { cwd: ROOT, env: { ...process.env, PATH: `${process.env.HOME}/.local/bin:${process.env.PATH}` }, detached: true, stdio: "ignore" }).unref();
  process.exit(1);
});
