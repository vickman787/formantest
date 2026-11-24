"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createPublicClient, createWalletClient, custom, http, parseAbiItem } from "viem";
import { qieChain } from "@/lib/escrow";

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    };
  }
}

const QUSDC_ABI_CLIENT = [
  parseAbiItem("function approve(address spender, uint256 amount) returns (bool)"),
  parseAbiItem("function allowance(address owner, address spender) view returns (uint256)"),
] as const;
const ESCROW_FUND_ABI = [
  parseAbiItem("function fundJob(bytes32 jobId)"),
  parseAbiItem("function acceptDelivery(bytes32 jobId)"),
] as const;

export default function ProjectActions({
  orderId,
  state,
  paymentState,
  chainJobId,
  escrowAddress,
  qusdcAddress,
}: {
  orderId: string;
  state: string;
  paymentState: string;
  chainJobId: string | null;
  escrowAddress: string;
  qusdcAddress: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [problem, setProblem] = useState("");

  const active = ["queued", "running", "checking"].includes(state);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [active, router]);

  async function call(url: string, body: unknown, label: string) {
    setBusy(label);
    setMsg("");
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setMsg(j.error ?? "That did not work. Try again.");
      return;
    }
    setMsg("Done — refreshing…");
    // Give the worker a moment, then refresh.
    await fetch("/api/worker/tick", { method: "POST" }).catch(() => undefined);
    setTimeout(() => router.refresh(), 800);
  }

  async function fundLive() {
    setBusy("fund");
    setMsg("");
    try {
      if (!window.ethereum) throw new Error("No wallet found. Install a browser wallet and try again.");
      // 1. Operator creates the onchain job (server-side, fails closed).
      const cj = await fetch(`/api/orders/${orderId}/create-job`, { method: "POST" });
      const cjJson = await cj.json();
      if (!cj.ok) throw new Error(cjJson.error ?? "Could not create the escrow job.");
      const jobId = cjJson.chain_job_id as `0x${string}`;
      // 2. Customer approves exactly 1 QUSDC, then funds the escrow.
      const accounts = (await window.ethereum.request({ method: "eth_requestAccounts" })) as string[];
      const wallet = createWalletClient({ account: accounts[0] as `0x${string}`, chain: qieChain, transport: custom(window.ethereum) });
      const publicClient = createPublicClient({ chain: qieChain, transport: http(qieChain.rpcUrls.default.http[0]) });
      const allowance = await publicClient.readContract({
        address: qusdcAddress as `0x${string}`,
        abi: QUSDC_ABI_CLIENT,
        functionName: "allowance",
        args: [accounts[0] as `0x${string}`, escrowAddress as `0x${string}`],
      }).catch(() => 0n);
      if (allowance < 1_000_000n) {
        setMsg("Waiting for the approval signature in your wallet…");
        await wallet.writeContract({
          address: qusdcAddress as `0x${string}`,
          abi: QUSDC_ABI_CLIENT,
          functionName: "approve",
          args: [escrowAddress as `0x${string}`, 1_000_000n],
        });
      }
      setMsg("Waiting for the funding signature in your wallet…");
      const txHash = await wallet.writeContract({
        address: escrowAddress as `0x${string}`,
        abi: ESCROW_FUND_ABI,
        functionName: "fundJob",
        args: [jobId],
      });
      // 3. Server verifies the receipt + escrow event before work starts.
      setMsg("Verifying the funding onchain…");
      await call(`/api/orders/${orderId}/payment-sync`, { tx_hash: txHash }, "fund");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Funding did not complete. Nothing was charged twice — check the timeline before retrying.");
    } finally {
      setBusy(null);
    }
  }

  async function acceptLive() {
    setBusy("accept");
    setMsg("");
    try {
      if (!window.ethereum) throw new Error("No wallet found.");
      if (!chainJobId) throw new Error("No onchain job to accept.");
      const accounts = (await window.ethereum.request({ method: "eth_requestAccounts" })) as string[];
      const wallet = createWalletClient({ account: accounts[0] as `0x${string}`, chain: qieChain, transport: custom(window.ethereum) });
      setMsg("Waiting for the acceptance signature in your wallet…");
      await wallet.writeContract({
        address: escrowAddress as `0x${string}`,
        abi: ESCROW_FUND_ABI,
        functionName: "acceptDelivery",
        args: [chainJobId as `0x${string}`],
      });
      setMsg("Confirming the acceptance onchain…");
      await call(`/api/orders/${orderId}/decision-sync`, {}, "accept");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Acceptance did not complete.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      {msg && <div className="notice" role="status" style={{ marginBottom: 16 }}>{msg}</div>}

      {(state === "quoted" || state === "awaiting_funding") && paymentState === "unfunded" && (
        <div className="box" style={{ marginBottom: 16 }}>
          <h3>Payment</h3>
          <p style={{ fontSize: 13, color: "var(--muted)" }}>
            1 QUSDC · QIE Mainnet · escrow. Gas is separate and paid in QIE.
          </p>
          <p className="notice">Your wallet approves exactly 1 QUSDC, then funds the escrow. The server reads the receipt and the escrow event before any work starts — a hash alone proves nothing.</p>
          <button className="btn" disabled={!!busy || !escrowAddress} onClick={fundLive}>
            {busy === "fund" ? "Waiting for wallet…" : "Fund 1 QUSDC from my wallet ↗"}
          </button>
          {!escrowAddress && <p style={{ fontSize: 12, color: "#a33", marginTop: 8 }}>The escrow is not deployed yet, so funding is unavailable.</p>}
        </div>
      )}

      {state === "delivered" && (
        <div className="box" style={{ marginBottom: 16 }}>
          <h3>Your delivery is ready</h3>
          <p style={{ fontSize: 13, color: "var(--muted)" }}>Check the files below. Accepting releases 1 QUSDC to the Forma treasury. You have 48 hours to review; after that an unaccepted delivery is released automatically.</p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn" disabled={!!busy} onClick={acceptLive}>
              {busy === "accept" ? "Waiting for wallet…" : "Accept delivery onchain ✓"}
            </button>
          </div>
          <div style={{ marginTop: 16 }}>
            <label htmlFor="problem" style={{ fontSize: 12, fontWeight: 700 }}>Report a problem</label>
            <textarea id="problem" value={problem} onChange={(e) => setProblem(e.target.value)} placeholder="What is wrong with the delivery?" style={{ width: "100%", minHeight: 64, marginTop: 6, padding: 10, border: "1px solid #d9dedf", borderRadius: 6 }} />
            <button className="btn light" style={{ marginTop: 8 }} disabled={!!busy || problem.trim().length < 10} onClick={() => call(`/api/orders/${orderId}/issues`, { description: problem }, "issue")}>
              Send report
            </button>
          </div>
        </div>
      )}

      {active && <p style={{ fontSize: 13, color: "var(--muted)" }}>Working… this page refreshes itself while the job runs. You can leave and come back — progress is saved.</p>}
      {state === "failed" && <p style={{ fontSize: 13 }}>This job failed. Read the timeline below for the reason — a failed job can be retried or refunded. Tell us in <a href="/help">Help</a> and we will sort it out.</p>}
      <button className="btn light" onClick={() => router.refresh()}>Refresh status</button>
    </div>
  );
}
