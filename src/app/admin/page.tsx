"use client";

import { useEffect, useState } from "react";

export default function AdminPage() {
  const [data, setData] = useState<{ mode?: string; orders?: { id: string; service: string; state: string; payment_state: string; created_at: string }[]; failures?: { order_id: string; stage: string; detail: string }[]; liabilities?: { funded_unsettled: number; base_units: string } } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/jobs").then(async (r) => {
      const j = await r.json();
      if (!r.ok) setError(j.error ?? "Not allowed.");
      else setData(j);
    }).catch(() => setError("Could not load the dashboard."));
  }, []);

  if (error) return <div className="wrap" style={{ paddingTop: 48 }}><h1>Admin</h1><p>{error}</p><p style={{ fontSize: 13, color: "var(--muted)" }}>Admin access is granted by wallet address in ADMIN_WALLETS. Sign in with an admin wallet first.</p></div>;
  if (!data) return <div className="wrap" style={{ paddingTop: 48 }}><p>Loading…</p></div>;

  return (
    <div className="wrap" style={{ paddingTop: 32 }}>
      <h1 style={{ fontSize: 33 }}>Owner dashboard</h1>
      <p style={{ color: "var(--muted)" }}>Mode: {data.mode} · Funded but unsettled: {data.liabilities?.funded_unsettled ?? 0} orders · {data.liabilities?.base_units ?? "0"} base units held in escrow (a liability, not operating cash).</p>
      <div className="box" style={{ marginTop: 24 }}>
        <h2>Recent orders</h2>
        <table className="plain"><thead><tr><th>Order</th><th>Service</th><th>State</th><th>Payment</th><th>Created</th></tr></thead>
        <tbody>{(data.orders ?? []).map((o) => <tr key={o.id}><td className="mono">{o.id}</td><td>{o.service}</td><td>{o.state}</td><td>{o.payment_state}</td><td>{new Date(o.created_at).toLocaleString()}</td></tr>)}</tbody></table>
      </div>
      <div className="box" style={{ marginTop: 16 }}>
        <h2>Failures</h2>
        {(data.failures ?? []).length === 0 ? <p>No failures recorded.</p> : (
          <table className="plain"><thead><tr><th>Order</th><th>Stage</th><th>Detail</th></tr></thead>
          <tbody>{data.failures?.map((f, i) => <tr key={i}><td className="mono">{f.order_id}</td><td>{f.stage}</td><td>{f.detail}</td></tr>)}</tbody></table>
        )}
      </div>
    </div>
  );
}
