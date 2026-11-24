import Link from "next/link";
import { SERVICES, SERVICE_IDS } from "@/lib/services";
import { SERVICE_PRICE_LABEL } from "@/lib/config";

const THUMBS: Record<string, { bg: string; label: string }> = {
  business_website: { bg: "#e8e6dc", label: "Fresh ideas. Fresh bread." },
  promo_video: { bg: "#d5e0dc", label: "Make them stop scrolling." },
  flyers_price_list: { bg: "#f0d8c9", label: "Good taste. Great prices." },
  market_report: { bg: "#dde6ed", label: "Know your next move." },
};

export default function Home() {
  return (
    <div className="wrap">
      <section className="hero">
        <div>
          <span className="eyebrow">A little help. A bigger business.</span>
          <h1>Your next big idea.<br /><em>Ready to launch.</em></h1>
          <p>Websites, videos, flyers, and market insights.<br />Give your business the creative team it deserves.</p>
          <Link href="#services" className="btn">Choose a service ↗</Link>
          <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 16 }}>{SERVICE_PRICE_LABEL}. Network fees are separate and paid in QIE.</p>
        </div>
        <div className="hero-art" aria-hidden>
          <span className="eyebrow">Example · Sunday Crumb, Lagos</span>
          <strong>Slow mornings. Good bread.</strong>
          <p style={{ fontSize: 13, color: "#846443", maxWidth: 300 }}>Fresh from our oven in Lagos. A welcoming website, a flyer and a promo video — each made from one brief.</p>
        </div>
      </section>

      <div className="section-head" id="services">
        <h2>What are we making today?</h2>
        <p>Four services. One simple starting point.</p>
      </div>
      <section className="cards" aria-label="Services">
        {SERVICE_IDS.map((id) => {
          const s = SERVICES[id];
          const t = THUMBS[id];
          return (
            <article className="card" key={id}>
              <div className="thumb" style={{ background: t.bg }}>{t.label}</div>
              <div className="body">
                <h3>{s.name}</h3>
                <p>{s.tagline}</p>
                <ul>{s.scope.map((x) => <li key={x}>{x}</li>)}</ul>
                <div className="price-foot">
                  <b>1 QUSDC</b>
                  <span>Launch<br />price</span>
                  <Link href={`/new?service=${id}`} className="btn" style={{ marginLeft: "auto", padding: "10px 14px" }} aria-label={`Start ${s.name}`}>Start ↗</Link>
                </div>
              </div>
            </article>
          );
        })}
      </section>

      <section className="how" aria-label="How it works">
        <b>From brief to better business</b>
        <span><span className="num">01</span> Tell us what you need</span>
        <span><span className="num">02</span> We make it happen</span>
        <span><span className="num">03</span> Review your delivery</span>
        <span style={{ marginLeft: "auto" }}><Link href="/help">Payment, delivery and refund terms →</Link></span>
      </section>
    </div>
  );
}
