import { readFile } from "node:fs/promises";
import Link from "next/link";
import { notFound } from "next/navigation";
import { currentCustomer } from "@/lib/auth";
import { artifactPath } from "@/lib/artifacts";
import { APP_MODE, ESCROW_ADDRESS, QUSDC_ADDRESS } from "@/lib/config";
import { ensureSchema, getPool } from "@/lib/db";
import { getOrderOwned, listEvents } from "@/lib/jobs";
import { SERVICES } from "@/lib/services";
import ProjectActions from "@/components/ProjectActions";
import WalletButton from "@/components/WalletButton";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await currentCustomer();
  if (!c) {
    return (
      <div className="wrap" style={{ paddingTop: 48 }}>
        <h1 style={{ fontSize: 33 }}>Sign in to see this project</h1>
        <p style={{ color: "var(--muted)" }}>Projects belong to the wallet that created them.</p>
        <WalletButton />
      </div>
    );
  }
  const order = await getOrderOwned(id, c.id);
  if (!order) notFound();
  const events = await listEvents(id);
  await ensureSchema();
  const { rows: artifacts } = await getPool().query(
    "SELECT filename, mime, size_bytes, sha256, version FROM artifacts WHERE order_id=$1 ORDER BY version, filename",
    [id],
  );
  const s = SERVICES[order.service];
  const brief = order.brief as Record<string, unknown>;

  // Website preview: read the generated index.html and sandbox it.
  let previewHtml: string | null = null;
  const htmlArt = artifacts.find((a: { filename: string }) => a.filename === "index.html");
  if (htmlArt) {
    try {
      previewHtml = await readFile(artifactPath(`${id}/index.html`), "utf8");
    } catch {
      previewHtml = null;
    }
  }
  const videoArt = artifacts.find((a: { filename: string }) => a.filename === "promo-vertical.mp4");
  const flyerArt = artifacts.find((a: { filename: string }) => a.filename === "flyer.png");

  return (
    <div className="wrap" style={{ paddingTop: 32 }}>
      <p className="eyebrow">Project {order.id} · {s?.name ?? order.service}</p>
      <h1 style={{ fontSize: 33, marginTop: 12 }}>
        {order.state === "delivered" ? "Made for your next big moment." : order.state === "failed" ? "This job hit a problem." : "Your project is taking shape."}
      </h1>
      <p style={{ color: "var(--muted)" }}>
        {String(brief.business_name ?? "")} · {s?.name} · <span className="pill">{order.state}</span>{" "}
        <span className="pill warn">Payment: {order.payment_state}</span>
      </p>

      <div className="twocol" style={{ marginTop: 24 }}>
        <div>
          {previewHtml && (
            <div className="box" style={{ padding: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                <b style={{ fontSize: 13 }}>Website preview</b><span className="pill">Version 1</span>
              </div>
              <iframe title="Website preview" sandbox="" srcDoc={previewHtml} style={{ width: "100%", height: 480, border: "1px solid var(--line)", borderRadius: 8, background: "#fff" }} />
              <p style={{ fontSize: 12, color: "var(--muted)" }}>Preview is sandboxed: it cannot run scripts against this site or reach your data.</p>
            </div>
          )}
          {videoArt && (
            <div className="box" style={{ padding: 20 }}>
              <b style={{ fontSize: 13 }}>Promo video</b>
              <video controls playsInline src={`/api/orders/${id}/artifacts/promo-vertical.mp4`} style={{ width: "100%", maxWidth: 360, margin: "12px auto", display: "block", borderRadius: 8 }} />
            </div>
          )}
          {flyerArt && (
            <div className="box" style={{ padding: 20 }}>
              <b style={{ fontSize: 13 }}>Flyer</b>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt={`Flyer for ${String(brief.business_name ?? "your business")}`} src={`/api/orders/${id}/artifacts/flyer.png`} style={{ width: "100%", marginTop: 12, borderRadius: 8 }} />
            </div>
          )}
          {!previewHtml && !videoArt && !flyerArt && order.state !== "delivered" && (
            <div className="box"><p style={{ color: "var(--muted)" }}>No preview yet — the first preview appears after the quality check.</p></div>
          )}

          {artifacts.length > 0 && (
            <div className="box" style={{ marginTop: 16 }}>
              <h3 style={{ fontSize: 15, marginBottom: 8 }}>Your deliverables</h3>
              {artifacts.map((a: { filename: string; mime: string; size_bytes: number }) => (
                <div className="file-row" key={a.filename}>
                  <span style={{ fontWeight: 700 }}>{a.mime.split("/")[1]?.toUpperCase() ?? "FILE"}</span>
                  <span style={{ flex: 1 }}>{a.filename}<small>{a.mime} · {(a.size_bytes / 1024).toFixed(1)} KB</small></span>
                  <Link href={`/api/orders/${id}/artifacts/${a.filename}`}>Download ↓</Link>
                </div>
              ))}
              {order.manifest_hash && (
                <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 12 }}>
                  Delivery manifest: <span className="mono">{order.manifest_hash.slice(0, 24)}…</span><br />
                  The manifest lists every file, its checksum and the checks it passed. It is the version commitment for this delivery.
                </p>
              )}
            </div>
          )}

          <div className="box" style={{ marginTop: 16 }}>
            <h3 style={{ fontSize: 15, marginBottom: 8 }}>Your brief</h3>
            <table className="plain"><tbody>
              <tr><td>Business</td><td>{String(brief.business_name ?? "")} · {String(brief.industry ?? "")} · {String(brief.location ?? "")}</td></tr>
              <tr><td>What you asked for</td><td>{String(brief.description ?? brief.offer ?? brief.question ?? "")}</td></tr>
              <tr><td>Contact (exact)</td><td>{String(brief.contact ?? "")}</td></tr>
              <tr><td>Price</td><td>1 QUSDC · QIE Mainnet · {QUSDC_ADDRESS}</td></tr>
              {order.fund_deadline && <tr><td>Fund by</td><td>{new Date(order.fund_deadline).toLocaleString()}</td></tr>}
              {order.delivery_deadline && <tr><td>Deliver by</td><td>{new Date(order.delivery_deadline).toLocaleString()}</td></tr>}
              {order.review_deadline && <tr><td>Review by</td><td>{new Date(order.review_deadline).toLocaleString()}</td></tr>}
            </tbody></table>
          </div>
        </div>

        <aside>
          <div className="box">
            <h2 style={{ fontSize: 18 }}>Behind the scenes</h2>
            <p style={{ fontSize: 13, color: "var(--muted)" }}>A clear view of every step. Progress comes from real saved stages, not percentages.</p>
            <div className="timeline">
              {events.length === 0 && <p style={{ fontSize: 13, color: "var(--muted)" }}>No events yet.</p>}
              {events.map((e: { kind: string; message: string; created_at: string }, i: number) => (
                <div className="event" key={i}>
                  <strong>{e.kind.replaceAll("_", " ")}</strong>
                  <span>{e.message}</span>
                  <span>{new Date(e.created_at).toLocaleString()}</span>
                </div>
              ))}
            </div>
            <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12, fontSize: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--muted)" }}>Service price</span><b>1 QUSDC</b></div>
              <p style={{ fontSize: 12, color: "var(--muted)" }}>
                {APP_MODE === "demo" ? "Demo mode — no funds have moved." : "Live on QIE Mainnet."} Escrow status: {order.payment_state}.
              </p>
            </div>
          </div>
          <div style={{ marginTop: 16 }}>
            <ProjectActions orderId={id} state={order.state} paymentState={order.payment_state} mode={APP_MODE} chainJobId={order.chain_job_id} escrowAddress={ESCROW_ADDRESS} qusdcAddress={QUSDC_ADDRESS} />
          </div>
        </aside>
      </div>
    </div>
  );
}
