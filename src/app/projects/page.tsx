import Link from "next/link";
import { currentCustomer } from "@/lib/auth";
import { listOrders } from "@/lib/jobs";
import { SERVICES } from "@/lib/services";
import WalletButton from "@/components/WalletButton";

export default async function Projects() {
  const c = await currentCustomer();
  if (!c) {
    return (
      <div className="wrap" style={{ paddingTop: 48 }}>
        <h1 style={{ fontSize: 33 }}>My projects</h1>
        <p style={{ color: "var(--muted)" }}>Connect your wallet and sign in to see your projects. Connecting alone is not enough — the signature proves you own the wallet.</p>
        <WalletButton />
        <p style={{ marginTop: 24 }}><Link href="/new">Start a new project →</Link></p>
      </div>
    );
  }
  const orders = await listOrders(c.id);
  return (
    <div className="wrap" style={{ paddingTop: 32 }}>
      <h1 style={{ fontSize: 33, marginBottom: 8 }}>My projects</h1>
      <p style={{ color: "var(--muted)" }}>Signed in as <span className="mono">{c.wallet}</span></p>
      {orders.length === 0 ? (
        <div className="box" style={{ marginTop: 24 }}>
          <p>No projects yet.</p>
          <Link href="/new" className="btn">Start a project ↗</Link>
        </div>
      ) : (
        <table className="plain" style={{ marginTop: 24 }}>
          <thead><tr><th>Project</th><th>Service</th><th>Status</th><th>Payment</th><th>Created</th></tr></thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td><Link href={`/projects/${o.id}`}>{(o.brief.business_name as string) ?? o.id}</Link><br /><span className="mono">{o.id}</span></td>
                <td>{SERVICES[o.service]?.name ?? o.service}</td>
                <td><span className="pill">{o.state}</span></td>
                <td>{o.payment_state}</td>
                <td>{new Date(o.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
