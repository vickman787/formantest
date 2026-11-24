/** Verify the report renderer against REAL research text from OpenAI. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { renderReport } from "../src/lib/renderers/report";

const brief = {
  business_name: "Sunday Crumb",
  description: "A small Lagos bakery making sourdough, pastries, and coffee.",
  industry: "Food & bakery",
  location: "Lagos, Nigeria",
  geography: "Yaba, Lagos",
  question: "Is there demand for a second bakery branch in Yaba?",
  competitors: ["Crust & Co"],
  urls: ["https://example.com/yaba-guide"],
};

const text = readFileSync("/tmp/forma-research.txt", "utf8");
const r = renderReport(brief, text, "2026-11-24");
console.log("sections:", r.sections.map((s) => s.heading).join(" | "));
console.log("sources:", r.sources.length);
for (const c of r.checks) console.log(`  check ${c.name}: ${c.passed ? "PASS" : "FAIL"} — ${c.detail}`);
if (!r.checks.every((c) => c.passed)) throw new Error("report checks failed");
mkdirSync("/tmp/forma-report", { recursive: true });
writeFileSync("/tmp/forma-report/market-report.html", r.html);
writeFileSync("/tmp/forma-report/market-report.pdf", r.pdf);
writeFileSync("/tmp/forma-report/sources.csv", r.csv);
console.log("wrote /tmp/forma-report/market-report.{html,pdf} + sources.csv");
console.log(`pdf ${r.pdf.length} bytes, starts ${r.pdf.subarray(0, 5).toString()}`);
