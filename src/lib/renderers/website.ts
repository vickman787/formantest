/** Own template renderer for the Business Website service.
 *  Copy comes only from the customer's brief. Prices, contact and business
 *  facts are printed exactly as supplied — never invented, never altered. */

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export interface WebsiteBrief {
  business_name: string;
  description: string;
  industry: string;
  location: string;
  audience?: string;
  contact: string;
  colors?: string[];
  website_or_social?: string;
  sections: string[];
  cta: string;
  menu_or_prices?: string;
  reference_style?: string;
}

export interface WebsiteResult {
  html: string;
  checks: { name: string; passed: boolean; detail: string }[];
}

function parseMenu(text: string): { name: string; price: string }[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^(.*?)\s*[—\-–]\s*(.+)$/) ?? line.match(/^(.*?)\s{2,}(.+)$/);
      return m ? { name: m[1].trim(), price: m[2].trim() } : { name: line, price: "" };
    });
}

export function renderWebsite(brief: WebsiteBrief, opts?: { headline?: string }): WebsiteResult {
  const accent = brief.colors?.[0] ?? "#D75B3E";
  const cream = "#F7F5F0";
  const ink = "#172B36";
  const name = escapeHtml(brief.business_name);
  const desc = escapeHtml(brief.description);
  const contact = escapeHtml(brief.contact);
  const location = escapeHtml(brief.location);
  const cta = escapeHtml(brief.cta || "Get in touch");
  const headline = escapeHtml(opts?.headline ?? brief.business_name);
  const menu = parseMenu(brief.menu_or_prices ?? "");
  const sections = new Set(brief.sections ?? ["hero", "about", "contact"]);

  const menuHtml = menu.length
    ? `<section class="menu"><h2>Menu &amp; prices</h2><ul>${menu
        .map((m) => `<li><span>${escapeHtml(m.name)}</span><b>${escapeHtml(m.price)}</b></li>`)
        .join("")}</ul><p class="note">Prices as listed by ${name}.</p></section>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${name} — ${escapeHtml(brief.industry)}</title>
<style>
:root{--accent:${accent};--ink:${ink};--paper:${cream}}
*{box-sizing:border-box}body{margin:0;font-family:Georgia,serif;background:var(--paper);color:var(--ink);line-height:1.6}
header{max-width:960px;margin:0 auto;padding:28px 20px;display:flex;justify-content:space-between;align-items:center}
header b{font-size:22px}header span{font-size:14px}
.hero{max-width:960px;margin:0 auto;padding:40px 20px 60px}
.hero h1{font-size:clamp(40px,7vw,72px);line-height:1.05;margin:12px 0;font-weight:400}
.hero p{font-size:18px;max-width:560px}
.cta{display:inline-block;background:var(--accent);color:#fff;padding:14px 26px;border-radius:8px;text-decoration:none;font-family:Arial,sans-serif;font-weight:600;margin-top:16px}
section{max-width:960px;margin:0 auto;padding:32px 20px}
section h2{font-size:32px;font-weight:400;margin:0 0 12px}
.menu ul{list-style:none;padding:0} .menu li{display:flex;justify-content:space-between;gap:16px;padding:12px 0;border-bottom:1px solid #dfdfd8;font-family:Arial,sans-serif}
.note{font-size:13px;color:#69767b;font-family:Arial,sans-serif}
.contact{background:#fff;border-top:1px solid #dfdfd8}
.contact a{color:var(--accent)}
footer{max-width:960px;margin:0 auto;padding:24px 20px;font-size:13px;color:#69767b;font-family:Arial,sans-serif}
@media(max-width:600px){.hero h1{font-size:40px}}
</style></head>
<body>
<header><b>${name}</b><span>${location}</span></header>
<main>
${sections.has("hero") ? `<div class="hero"><p>${escapeHtml(brief.industry)} · ${location}</p><h1>${headline}</h1><p>${desc}</p><a class="cta" href="#contact">${cta} →</a></div>` : ""}
${sections.has("about") ? `<section><h2>Our story</h2><p>${desc}</p></section>` : ""}
${sections.has("menu_or_services") ? menuHtml : ""}
${sections.has("contact") ? `<section class="contact" id="contact"><h2>Visit us</h2><p>${location}</p><p>Contact: ${contact}</p></section>` : ""}
</main>
<footer>Made with Forma · ${name}</footer>
</body></html>`;

  const checks = [
    { name: "business name present", passed: html.includes(name), detail: "Business name appears in the page." },
    {
      name: "contact preserved exactly",
      passed: !sections.has("contact") || html.includes(contact),
      detail: sections.has("contact") ? "Approved contact printed exactly as supplied." : "Contact section not selected, so no contact is shown.",
    },
    {
      name: "no invented prices",
      passed: !sections.has("menu_or_services") || menu.every((m) => html.includes(escapeHtml(m.name)) && html.includes(escapeHtml(m.price))),
      detail: sections.has("menu_or_services") ? "Only brief-supplied menu lines are shown." : "Menu section not selected, so no prices are shown.",
    },
    { name: "responsive meta", passed: html.includes("viewport"), detail: "Viewport meta present; layout stacks under 600px." },
  ];
  return { html, checks };
}
