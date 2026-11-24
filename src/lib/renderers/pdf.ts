/**
 * Minimal hand-rolled PDF writer (no dependency). One font (Helvetica),
 * text lines and filled rectangles only — enough for honest flyer and
 * price-list PDFs. Produces a valid PDF with a correct xref table.
 */

export interface PdfText {
  text: string;
  x: number;
  y: number;
  size: number;
  bold?: boolean;
  color?: [number, number, number]; // 0..1 rgb
}
export interface PdfRect {
  x: number;
  y: number;
  w: number;
  h: number;
  color: [number, number, number];
}
export interface PdfPage {
  width: number;
  height: number;
  rects?: PdfRect[];
  texts?: PdfText[];
}

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/[^\x20-\x7E₦]/g, (c) => {
    // Keep ₦ (U+20A6) out of Helvetica's WinAnsi range by spelling it out.
    if (c === "₦") return "NGN ";
    return "";
  });
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export { hexToRgb };

export function buildPdf(pages: PdfPage[]): Buffer {
  const objects: string[] = [];
  // 1: catalog, 2: pages, then per page: page obj + content obj, then fonts.
  const pageObjIds = pages.map((_, i) => 3 + i * 2);
  const contentObjIds = pages.map((_, i) => 4 + i * 2);
  const fontObjId = 3 + pages.length * 2;
  const fontBoldObjId = fontObjId + 1;

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  pages.forEach((p, i) => {
    objects[pageObjIds[i]] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${p.width} ${p.height}] ` +
      `/Resources << /Font << /F1 ${fontObjId} 0 R /F2 ${fontBoldObjId} 0 R >> >> /Contents ${contentObjIds[i]} 0 R >>`;
    const ops: string[] = [];
    for (const r of p.rects ?? []) {
      const [a, b, c] = r.color;
      ops.push(`${a.toFixed(3)} ${b.toFixed(3)} ${c.toFixed(3)} rg ${r.x} ${r.y} ${r.w} ${r.h} re f`);
    }
    for (const t of p.texts ?? []) {
      const [a, b, c] = t.color ?? [0, 0, 0];
      ops.push(
        `BT ${a.toFixed(3)} ${b.toFixed(3)} ${c.toFixed(3)} rg /${t.bold ? "F2" : "F1"} ${t.size} Tf 1 0 0 1 ${t.x} ${t.y} Tm (${esc(t.text)}) Tj ET`,
      );
    }
    objects[contentObjIds[i]] = `<< /Length ${Buffer.byteLength(ops.join("\n"))} >>\nstream\n${ops.join("\n")}\nendstream`;
  });
  objects[fontObjId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[fontBoldObjId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";

  const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n", "latin1")];
  const offsets: number[] = [0];
  let pos = chunks[0].length;
  const total = 2 + pages.length * 2 + 1;
  for (let id = 1; id <= total; id++) {
    offsets[id] = pos;
    const body = `${id} 0 obj\n${objects[id]}\nendobj\n`;
    const b = Buffer.from(body, "latin1");
    chunks.push(b);
    pos += b.length;
  }
  const xrefPos = pos;
  let xref = `xref\n0 ${total + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= total; id++) xref += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  xref += `trailer\n<< /Size ${total + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  chunks.push(Buffer.from(xref, "latin1"));
  return Buffer.concat(chunks);
}
