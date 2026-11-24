import { describe, expect, it } from "vitest";
import { validateBrief } from "@/lib/services";
import { renderWebsite } from "@/lib/renderers/website";
import { buildPdf } from "@/lib/renderers/pdf";
import { canonical, sha256 } from "@/lib/manifest";

const websiteBrief = {
  business_name: "Sunday Crumb",
  description: "A small Lagos bakery making sourdough, pastries, and coffee.",
  industry: "Food & bakery",
  location: "Lagos, Nigeria",
  audience: "Neighbours",
  contact: "hello@sundaycrumb.example",
  colors: ["#684425"],
  website_or_social: "",
  sections: ["hero", "about", "menu_or_services", "contact"],
  cta: "Explore our bakery",
  menu_or_prices: "Sourdough loaf — ₦2,500\nCroissant — ₦1,200",
  reference_style: "",
};

describe("brief validation", () => {
  it("accepts a complete website brief", () => {
    expect(validateBrief("business_website", websiteBrief).success).toBe(true);
  });
  it("rejects a brief with invented/missing contact and prices", () => {
    const bad = { ...websiteBrief, contact: "" };
    const r = validateBrief("business_website", bad);
    expect(r.success).toBe(false);
  });
  it("rejects more than 20 flyer items", () => {
    const items = Array.from({ length: 21 }, (_, i) => ({ name: `Item ${i}`, price: "₦100" }));
    const r = validateBrief("flyers_price_list", {
      business_name: "X", description: "A shop that sells things daily.", industry: "Retail",
      location: "Lagos", contact: "x@example.com", offer: "Sale", currency: "₦", items,
    });
    expect(r.success).toBe(false);
  });
  it("rejects a market report without a real question", () => {
    const r = validateBrief("market_report", {
      business_name: "X", description: "A shop that sells things daily.", industry: "Retail",
      location: "Lagos", contact: "x@example.com", geography: "Lagos", question: "hi",
    });
    expect(r.success).toBe(false);
  });
});

import { renderReport, extractSources, parseSections } from "../src/lib/renderers/report";

const reportBrief = {
  business_name: "Sunday Crumb",
  description: "A small Lagos bakery making sourdough, pastries, and coffee.",
  industry: "Food & bakery",
  location: "Lagos, Nigeria",
  geography: "Yaba, Lagos",
  question: "Is there demand for a second bakery branch in Yaba?",
  competitors: ["Crust & Co"],
  urls: ["https://example.com/yaba-guide"],
};

const sampleResearch = `## Demand
Yaba has a growing student population and several co-working spaces. Demand for artisan bread is rising.

## Competition
Crust & Co operates one outlet nearby. See https://example.com/crust-review for details.

## Evidence gaps
No reliable sales figures for Yaba bakeries were found. More detail at https://example.com/lagos-food-2025.
`;

describe("market report renderer", () => {
  it("extracts source URLs from research text", () => {
    expect(extractSources(sampleResearch)).toEqual(["https://example.com/crust-review", "https://example.com/lagos-food-2025"]);
  });
  it("splits research into sections", () => {
    expect(parseSections(sampleResearch).map((s) => s.heading)).toEqual(["Demand", "Competition", "Evidence gaps"]);
  });
  it("renders HTML + PDF + CSV with all checks passing", () => {
    const r = renderReport(reportBrief, sampleResearch, "2026-11-24");
    expect(r.checks.every((c) => c.passed)).toBe(true);
    expect(r.html).toContain("Is there demand for a second bakery branch in Yaba?");
    expect(r.html).toContain("https://example.com/crust-review");
    expect(r.html).toContain("https://example.com/yaba-guide");
    expect(r.pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(r.csv).toContain("https://example.com/crust-review");
    expect(r.csv).toContain("brief-supplied link");
  });
  it("fails its checks when the research has no sources", () => {
    const r = renderReport(reportBrief, "## Demand\nThings look good, trust me.", "2026-11-24");
    expect(r.checks.find((c) => c.name === "at least one cited source")?.passed).toBe(false);
  });
});

describe("website renderer", () => {
  it("preserves prices and contact exactly, and invents nothing", () => {
    const { html, checks } = renderWebsite(websiteBrief as never);
    expect(html).toContain("₦2,500");
    expect(html).toContain("hello@sundaycrumb.example");
    expect(html).toContain("Sunday Crumb");
    expect(html).not.toContain("testimonial");
    expect(html).not.toContain("review");
    expect(checks.every((c) => c.passed)).toBe(true);
  });
  it("omits the menu section when no menu is supplied", () => {
    const { html } = renderWebsite({ ...websiteBrief, menu_or_prices: "", sections: ["hero", "about", "contact"] } as never);
    expect(html).not.toContain("Menu &amp; prices");
  });
  it("passes checks when menu/contact sections are not selected", () => {
    const { checks } = renderWebsite({ ...websiteBrief, sections: ["hero", "about"] } as never);
    expect(checks.every((c) => c.passed)).toBe(true);
  });
});

describe("manifest hashing", () => {
  it("is deterministic regardless of key order", () => {
    expect(canonical({ b: 1, a: { d: 2, c: 3 } })).toBe(canonical({ a: { c: 3, d: 2 }, b: 1 }));
    expect(sha256("forma")).toHaveLength(64);
  });
});

describe("pdf writer", () => {
  it("produces a valid-looking PDF with an xref table", () => {
    const pdf = buildPdf([{ width: 595, height: 842, texts: [{ text: "Hello Forma", x: 48, y: 800, size: 20, bold: true }] }]);
    const s = pdf.toString("latin1");
    expect(s.startsWith("%PDF-1.4")).toBe(true);
    expect(s).toContain("xref");
    expect(s).toContain("%%EOF");
    expect(s).toContain("Hello Forma");
  });
});
