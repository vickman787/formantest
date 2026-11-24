"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SERVICES, SERVICE_FIELDS, type ServiceId } from "@/lib/services";
import WalletButton from "./WalletButton";

const SHARED = [
  { key: "business_name", label: "Business name", kind: "text" },
  { key: "industry", label: "Industry", kind: "text" },
  { key: "description", label: "What does your business do?", kind: "textarea" },
  { key: "location", label: "Location", kind: "text" },
  { key: "audience", label: "Who is it for? (optional)", kind: "text" },
  { key: "contact", label: "Business contact", kind: "text", help: "Approved email or WhatsApp — printed exactly as you type it." },
  { key: "website_or_social", label: "Website or social profile (optional)", kind: "text" },
] as const;

export default function BriefForm({ service }: { service: ServiceId }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>({
    business_name: "Sunday Crumb",
    industry: "Food & bakery",
    description: "We're a small Lagos bakery making slow-fermented sourdough, pastries, and coffee. We want a welcoming website with our menu and a way for customers to get in touch.",
    location: "Lagos, Nigeria",
    audience: "Neighbours and office workers nearby",
    contact: "hello@sundaycrumb.example",
    website_or_social: "",
    cta: "Explore our bakery",
    offer: "Fresh sourdough every morning — order before 9am for same-day pickup.",
    currency: "₦",
    tone: "bright",
    geography: "Lagos, Nigeria",
    question: "Is there demand for a second bakery branch in Yaba?",
    competitors: "",
    urls: "",
    expiry: "",
    menu_or_prices: "Sourdough loaf — ₦2,500\nCroissant — ₦1,200\nCoffee — ₦1,500",
    reference_style: "",
    approved_photos_note: "",
  });
  const [sections, setSections] = useState<string[]>(["hero", "about", "menu_or_services", "contact"]);
  const [items, setItems] = useState<{ name: string; price: string }[]>([
    { name: "Sourdough loaf", price: "₦2,500" },
    { name: "Croissant", price: "₦1,200" },
    { name: "Coffee", price: "₦1,500" },
  ]);
  const [kits, setKits] = useState<{ id: string; name: string; business_name: string }[]>([]);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState<"draft" | "quote" | null>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/brand-kit").then((r) => r.json()).then((j) => setKits(j.kits ?? [])).catch(() => undefined);
  }, []);

  function set(k: string, v: string) {
    setValues((prev) => ({ ...prev, [k]: v }));
  }

  function buildBrief(): Record<string, unknown> {
    const b: Record<string, unknown> = {
      business_name: values.business_name,
      description: values.description,
      industry: values.industry,
      location: values.location,
      audience: values.audience,
      contact: values.contact,
      colors: [],
      website_or_social: values.website_or_social,
    };
    if (service === "business_website") {
      b.sections = sections;
      b.cta = values.cta;
      b.menu_or_prices = values.menu_or_prices;
      b.reference_style = values.reference_style;
    } else if (service === "promo_video") {
      b.offer = values.offer;
      b.cta = values.cta;
      b.tone = values.tone;
      b.approved_photos_note = values.approved_photos_note;
    } else if (service === "flyers_price_list") {
      b.offer = values.offer;
      b.currency = values.currency;
      b.items = items.filter((i) => i.name.trim());
      b.expiry = values.expiry;
    } else {
      b.geography = values.geography;
      b.question = values.question;
      b.competitors = values.competitors.split(",").map((s) => s.trim()).filter(Boolean);
      b.urls = values.urls.split(",").map((s) => s.trim()).filter(Boolean);
    }
    return b;
  }

  async function submit(kind: "draft" | "quote") {
    setBusy(kind);
    setMsg("");
    setErrors({});
    const endpoint = kind === "draft" ? "/api/orders" : "/api/quotes";
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ service, brief: buildBrief() }),
    });
    const j = await res.json();
    setBusy(null);
    if (!res.ok) {
      if (j.issues) setErrors(j.issues);
      setMsg(j.error ?? "Something went wrong. Your draft is still on this page.");
      return;
    }
    // Save the brand kit for reuse (best effort).
    fetch("/api/brand-kit", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildBrief()),
    }).catch(() => undefined);
    router.push(`/projects/${j.order_id}`);
  }

  const s = SERVICES[service];
  const extra = SERVICE_FIELDS[service];

  return (
    <div>
      <div className="tabs" role="tablist" aria-label="Services">
        {(Object.keys(SERVICES) as ServiceId[]).map((id) => (
          <a key={id} href={`/new?service=${id}`} className={`tab${id === service ? " selected" : ""}`} role="tab" aria-selected={id === service}>
            {SERVICES[id].name}
          </a>
        ))}
      </div>

      <div className="twocol">
        <div className="box">
          <div className="steps" aria-label="Progress">
            <span className="on"><b>1</b> Your brief</span><span><b>2</b> Review</span><span><b>3</b> Payment</span>
          </div>
          <h2>Tell us about your business</h2>
          <p style={{ fontSize: 13, color: "var(--muted)" }}>The details that make it yours. We never invent prices, testimonials or contact details — if it is not here, it is not in your delivery.</p>

          {kits.length > 0 && (
            <div className="field">
              <label htmlFor="kit">Reuse a brand kit</label>
              <select id="kit" onChange={async (e) => {
                const kit = kits.find((k) => k.id === e.target.value);
                if (!kit) return;
                const r = await fetch("/api/brand-kit").then((x) => x.json());
                const full = r.kits.find((k: { id: string }) => k.id === kit.id);
                if (full) setValues((p) => ({ ...p, business_name: full.business_name, description: full.description, industry: full.industry, location: full.location, audience: full.audience ?? "", contact: full.contact, website_or_social: full.website_or_social ?? "" }));
              }} defaultValue="">
                <option value="">Start fresh…</option>
                {kits.map((k) => <option key={k.id} value={k.id}>{k.name} — {k.business_name}</option>)}
              </select>
            </div>
          )}

          <div className="grid2" style={{ marginTop: 20 }}>
            {SHARED.map((f) => (
              <div className="field" key={f.key} style={f.kind === "textarea" ? { gridColumn: "1 / -1" } : undefined}>
                <label htmlFor={f.key}>{f.label}</label>
                {f.kind === "textarea" ? (
                  <textarea id={f.key} value={values[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} />
                ) : (
                  <input id={f.key} value={values[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} />
                )}
                {"help" in f && f.help ? <div className="help">{f.help}</div> : null}
                {errors[f.key] ? <div className="err">{errors[f.key].join(" ")}</div> : null}
              </div>
            ))}
          </div>

          <h3 style={{ marginTop: 8 }}>{s.name} — details</h3>
          {extra.map((f) => {
            if (f.key === "sections") {
              return (
                <fieldset key={f.key} className="field" style={{ border: 0, padding: 0 }}>
                  <legend style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>{f.label}</legend>
                  {f.options?.map((o) => (
                    <label key={o} style={{ display: "inline-flex", gap: 6, marginRight: 16, fontSize: 13 }}>
                      <input type="checkbox" checked={sections.includes(o)} onChange={(e) => setSections(e.target.checked ? [...sections, o] : sections.filter((x) => x !== o))} />
                      {o.replaceAll("_", " ")}
                    </label>
                  ))}
                </fieldset>
              );
            }
            if (f.key === "items") {
              return (
                <div className="field" key={f.key}>
                  <label>{f.label}</label>
                  {items.map((it, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                      <input aria-label={`Item ${i + 1} name`} placeholder="Item name" value={it.name} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                      <input aria-label={`Item ${i + 1} price`} placeholder="Price" value={it.price} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} style={{ maxWidth: 140 }} />
                      <button type="button" className="btn light" onClick={() => setItems(items.filter((_, j) => j !== i))} aria-label={`Remove item ${i + 1}`}>✕</button>
                    </div>
                  ))}
                  <button type="button" className="btn light" onClick={() => setItems([...items, { name: "", price: "" }])} disabled={items.length >= 20}>+ Add item</button>
                  {f.help ? <div className="help">{f.help}</div> : null}
                  {errors.items ? <div className="err">{errors.items.join(" ")}</div> : null}
                </div>
              );
            }
            if (f.kind === "select") {
              return (
                <div className="field" key={f.key}>
                  <label htmlFor={f.key}>{f.label}</label>
                  <select id={f.key} value={values[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)}>
                    {f.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                  {f.help ? <div className="help">{f.help}</div> : null}
                </div>
              );
            }
            return (
              <div className="field" key={f.key}>
                <label htmlFor={f.key}>{f.label}</label>
                {f.kind === "textarea" ? (
                  <textarea id={f.key} value={values[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} />
                ) : (
                  <input id={f.key} value={values[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} />
                )}
                {f.help ? <div className="help">{f.help}</div> : null}
                {errors[f.key] ? <div className="err">{errors[f.key].join(" ")}</div> : null}
              </div>
            );
          })}

          {msg && <div className="notice" role="alert" style={{ marginBottom: 16 }}>{msg}</div>}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button className="btn" onClick={() => submit("quote")} disabled={!!busy}>{busy === "quote" ? "Checking brief…" : "Review project ↗"}</button>
            <button className="btn light" onClick={() => submit("draft")} disabled={!!busy}>{busy === "draft" ? "Saving…" : "Save draft"}</button>
          </div>
          <p style={{ fontSize: 12, color: "var(--muted)" }}>Drafts are saved to your account. Sign in with your wallet to keep them private.</p>
        </div>

        <aside>
          <div className="box">
            <span className="eyebrow">Your project</span>
            <h2 style={{ fontSize: 20, marginTop: 12 }}>{s.name}</h2>
            <ul className="checklist">{s.scope.map((x) => <li key={x}>{x}</li>)}</ul>
            <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--line)", paddingTop: 16 }}>
              <span>Launch price</span><b style={{ fontSize: 26 }}>1 QUSDC</b>
            </div>
            <p style={{ fontSize: 12, color: "var(--muted)" }}>Approximately $1. Network fees are separate and paid in QIE.</p>
            <WalletButton />
          </div>
        </aside>
      </div>
    </div>
  );
}
