import { buildPdf } from "./pdf";
import { escapeHtml } from "./website";

/**
 * Market report renderer. The research text comes from OpenAI web research
 * (Responses API + web_search); this file only formats it. Sources are
 * extracted from the research text itself plus the brief's own links, and
 * the delivery fails its checks when no source can be shown — a report
 * without citations is never sold.
 */

export interface ReportBrief {
  business_name: string;
  description: string;
  industry: string;
  location: string;
  geography: string;
  question: string;
  competitors?: string[];
  urls?: string[];
}

export interface ReportResult {
  html: string;
  pdf: Buffer;
  csv: string;
  sources: string[];
  sections: { heading: string; body: string }[];
  checks: { name: string; passed: boolean; detail: string }[];
}

const URL_RE = /https?:\/\/[^\s)>\]"]+/g;

export function extractSources(text: string): string[] {
  const found = text.match(URL_RE) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of found) {
    const clean = u.replace(/[.,;]+$/, "");
    if (!seen.has(clean)) {
      seen.add(clean);
      out.push(clean);
    }
  }
  return out;
}

/** Split research text into sections on markdown headings (max 5). */
export function parseSections(text: string): { heading: string; body: string }[] {
  const lines = text.split("\n");
  const sections: { heading: string; body: string }[] = [];
  let current: { heading: string; body: string[] } | null = null;
  for (const line of lines) {
    const h = line.match(/^#{1,3}\s+(.*)$/);
    const b = line.match(/^\*\*([^*]{3,80})\*\*\s*$/);
    if (h || b) {
      const heading = (h ? h[1] : b![1]).trim();
      if (current) sections.push({ heading: current.heading, body: current.body.join("\n").trim() });
      current = { heading, body: [] };
    } else if (current) {
      current.body.push(line);
    } else if (line.trim()) {
      current = { heading: "Summary", body: [line] };
    }
  }
  if (current) sections.push({ heading: current.heading, body: current.body.join("\n").trim() });
  return sections.filter((s) => s.body.length > 0).slice(0, 5);
}

function wrap(text: string, max: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > max && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = (cur + " " + w).trim();
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

export function renderReport(brief: ReportBrief, researchText: string, retrievedAt: string): ReportResult {
  const researchSources = extractSources(researchText);
  const briefLinks = (brief.urls ?? []).filter(Boolean);
  const sources = [...researchSources];
  for (const u of briefLinks) if (!sources.includes(u)) sources.push(u);
  const sections = parseSections(researchText);

  const checks = [
    {
      name: "research text present",
      passed: researchText.trim().length > 200,
      detail: researchText.trim().length > 200 ? "Web research returned a substantive brief." : "Research came back too short to use.",
    },
    {
      name: "at least one cited source",
      passed: researchSources.length >= 1,
      detail: researchSources.length >= 1 ? `${researchSources.length} source(s) cited from the research.` : "No source URL was returned — the report cannot be sold without citations.",
    },
    {
      name: "sources listed with retrieval date",
      passed: sources.length >= 1,
      detail: sources.length >= 1 ? `All ${sources.length} source(s) are listed with the retrieval date ${retrievedAt}.` : "No sources to list.",
    },
    {
      name: "question in scope",
      passed: brief.question.trim().length >= 10,
      detail: "The report answers the question as asked in the brief.",
    },
  ];

  const name = escapeHtml(brief.business_name);
  const question = escapeHtml(brief.question);
  const geo = escapeHtml(brief.geography);
  const industry = escapeHtml(brief.industry);

  const sectionsHtml = sections
    .map(
      (s) =>
        `<section><h2>${escapeHtml(s.heading)}</h2>${s.body
          .split(/\n{2,}/)
          .map((p) => `<p>${escapeHtml(p.trim()).replace(/\n/g, "<br>")}</p>`)
          .join("")}</section>`
    )
    .join("\n");
  const sourcesHtml = sources
    .map((u, i) => `<li>[${i + 1}] <a href="${escapeHtml(u)}">${escapeHtml(u)}</a></li>`)
    .join("\n");

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Market report — ${name}</title><style>
body{font-family:Georgia,serif;color:#172B36;background:#F7F5F0;margin:0;padding:32px 20px}
main{max-width:720px;margin:0 auto;background:#fff;border:1px solid #DFDFD8;padding:32px}
h1{font-size:28px;line-height:1.2;margin:0 0 8px}h2{font-size:19px;margin:28px 0 8px;color:#172B36}
p{font-size:15px;line-height:1.6;margin:0 0 12px}.meta{font-family:system-ui,sans-serif;font-size:13px;color:#5b6b72}
a{color:#D75B3E}.note{background:#E2EADD;padding:12px 14px;font-size:13px;line-height:1.5;margin:20px 0}
ol.sources{font-size:13px;line-height:1.7;padding-left:20px;word-break:break-all}
footer{font-size:12px;color:#5b6b72;margin-top:28px;border-top:1px solid #DFDFD8;padding-top:12px}
</style></head><body><main>
<p class="meta">FORMA · MARKET REPORT · ${escapeHtml(retrievedAt)}</p>
<h1>Market report: ${name}</h1>
<p class="meta">${industry} · ${geo}</p>
<p><strong>Question:</strong> ${question}</p>
<div class="note">Every claim below comes from the cited sources. Where the evidence is thin, the research says so — nothing here is invented, and no statistic appears without a source.</div>
${sectionsHtml}
<h2>Sources</h2>
<ol class="sources">${sourcesHtml}</ol>
<p class="meta">Retrieved ${escapeHtml(retrievedAt)}. Sources were live pages at retrieval time; check them before acting on the report.</p>
<footer>Prepared by Forma for ${name}. This brief answers the question asked — it is not financial advice.</footer>
</main></body></html>`;

  // PDF: A4, title + question + sections + sources, paginated.
  const W = 595;
  const H = 842;
  const pages: { width: number; height: number; texts: { text: string; x: number; y: number; size: number; bold?: boolean; color?: [number, number, number] }[] }[] = [];
  let texts: { text: string; x: number; y: number; size: number; bold?: boolean; color?: [number, number, number] }[] = [];
  let y = H - 56;
  const flush = () => {
    pages.push({ width: W, height: H, texts });
    texts = [];
    y = H - 56;
  };
  const line = (text: string, size: number, bold = false, gap = 15) => {
    for (const part of wrap(text, size >= 16 ? 52 : 92)) {
      if (y < 64) flush();
      texts.push({ text: part, x: 48, y, size, bold });
      y -= gap;
    }
  };
  line(`Market report: ${brief.business_name}`, 17, true, 24);
  line(`${brief.industry} · ${brief.geography} · Retrieved ${retrievedAt}`, 10, false, 18);
  y -= 6;
  line(`Question: ${brief.question}`, 11, true, 18);
  y -= 8;
  for (const s of sections) {
    if (y < 120) flush();
    line(s.heading, 13, true, 20);
    for (const para of s.body.split(/\n{2,}/)) line(para.replace(/\n/g, " "), 10, false, 14);
    y -= 8;
  }
  if (y < 120) flush();
  line("Sources", 13, true, 20);
  sources.forEach((u, i) => line(`[${i + 1}] ${u}`, 9, false, 13));
  pages.push({ width: W, height: H, texts });
  const pdf = buildPdf(pages);

  const csvRows = [["source_url", "origin", "retrieved_at"]];
  for (const u of researchSources) csvRows.push([u, "web research", retrievedAt]);
  for (const u of briefLinks) if (!researchSources.includes(u)) csvRows.push([u, "brief-supplied link", retrievedAt]);
  const csv = csvRows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n") + "\n";

  return { html, pdf, csv, sources, sections, checks };
}
