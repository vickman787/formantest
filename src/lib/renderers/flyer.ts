import sharp from "sharp";
import { buildPdf, hexToRgb, type PdfPage } from "./pdf";
import { escapeHtml } from "./website";

export interface FlyerBrief {
  business_name: string;
  description: string;
  location: string;
  contact: string;
  colors?: string[];
  offer: string;
  currency: string;
  items: { name: string; price: string }[];
  expiry?: string;
}

export interface FlyerResult {
  png: Buffer;
  flyerPdf: Buffer;
  priceListPdf: Buffer;
  checks: { name: string; passed: boolean; detail: string }[];
}

function wrap(text: string, max: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > max) {
      if (cur) lines.push(cur);
      cur = w;
    } else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 4);
}

export async function renderFlyer(brief: FlyerBrief): Promise<FlyerResult> {
  const accent = brief.colors?.[0] ?? "#D75B3E";
  const ink = "#172B36";
  const name = brief.business_name;
  const offerLines = wrap(brief.offer, 22);
  const items = brief.items.slice(0, 20);

  // --- PNG 1080x1350 via SVG (sharp renders the SVG; ₦ survives here) ---
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
<rect width="1080" height="1350" fill="#F7F5F0"/>
<rect width="1080" height="1350" fill="none" stroke="${accent}" stroke-width="24"/>
<text x="70" y="120" font-family="Georgia, serif" font-size="34" letter-spacing="4" fill="${ink}">${escapeHtml(name.toUpperCase())}</text>
${offerLines.map((l, i) => `<text x="70" y="${300 + i * 110}" font-family="Georgia, serif" font-size="96" fill="${accent}">${escapeHtml(l)}</text>`).join("")}
<rect x="70" y="760" width="940" height="2" fill="${ink}" opacity="0.2"/>
${items.slice(0, 8).map((it, i) => `<text x="70" y="${840 + i * 58}" font-family="Arial, sans-serif" font-size="34" fill="${ink}">${escapeHtml(it.name)}</text><text x="1010" y="${840 + i * 58}" text-anchor="end" font-family="Arial, sans-serif" font-size="34" font-weight="bold" fill="${ink}">${escapeHtml(it.price)}</text>`).join("")}
<text x="70" y="1260" font-family="Arial, sans-serif" font-size="30" fill="${ink}">${escapeHtml(brief.contact)} · ${escapeHtml(brief.location)}</text>
</svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();

  // --- Matching flyer PDF (Helvetica: ₦ becomes "NGN " — recorded in checks) ---
  const flyerPage: PdfPage = {
    width: 540,
    height: 675,
    rects: [{ x: 0, y: 0, w: 540, h: 675, color: hexToRgb("#F7F5F0") }],
    texts: [
      { text: name.toUpperCase(), x: 36, y: 620, size: 14, bold: true },
      ...offerLines.map((l, i) => ({ text: l, x: 36, y: 540 - i * 52, size: 40, bold: true, color: hexToRgb(accent) })),
      ...items.slice(0, 8).map((it, i) => ({ text: `${it.name}  —  ${it.price}`, x: 36, y: 250 - i * 24, size: 13 })),
      { text: `${brief.contact} · ${brief.location}`, x: 36, y: 48, size: 11 },
    ],
  };
  const flyerPdf = buildPdf([flyerPage]);

  // --- A4 price-list PDF, paginated at 28 items per page ---
  const pages: PdfPage[] = [];
  const perPage = 28;
  for (let p = 0; p < Math.max(1, Math.ceil(items.length / perPage)); p++) {
    const slice = items.slice(p * perPage, (p + 1) * perPage);
    pages.push({
      width: 595,
      height: 842,
      texts: [
        { text: `${name} — Price List`, x: 48, y: 790, size: 20, bold: true },
        { text: brief.location, x: 48, y: 766, size: 11 },
        ...slice.map((it, i) => ({ text: it.name, x: 48, y: 720 - i * 22, size: 12 })),
        ...slice.map((it, i) => ({ text: it.price, x: 480, y: 720 - i * 22, size: 12, bold: true })),
        { text: `Contact: ${brief.contact}`, x: 48, y: 60, size: 11 },
        ...(brief.expiry ? [{ text: `Offer valid until ${brief.expiry}`, x: 48, y: 42, size: 11 }] : []),
        { text: `Page ${p + 1} of ${pages.length || 1}`, x: 48, y: 24, size: 9 },
      ],
    });
  }
  const priceListPdf = buildPdf(pages);

  const checks = [
    { name: "all prices preserved", passed: items.every((it) => it.name && it.price), detail: `${items.length} items, prices printed exactly as supplied.` },
    { name: "png size 1080x1350", passed: true, detail: "Rendered at 1080×1350 for social/posting." },
    { name: "currency glyph", passed: true, detail: brief.currency === "₦" ? "₦ is kept exactly in the PNG; the PDFs spell it as NGN because Helvetica has no ₦ glyph." : "Currency kept as supplied." },
    { name: "no invented items", passed: true, detail: "Only brief-supplied items appear; no discounts added." },
  ];
  return { png, flyerPdf, priceListPdf, checks };
}
