import { OPENAI_API_KEY, OPENAI_TEXT_MODEL, OPENAI_RESEARCH_MODEL } from "./config";

/**
 * Server-side OpenAI client. No call is ever made without a configured key.
 * Model IDs come from env, never hardcoded from a spec.
 */

export function openaiConfigured(): boolean {
  return OPENAI_API_KEY !== "" && OPENAI_TEXT_MODEL !== "";
}

interface ResponsesResult {
  text: string;
  requestId: string | null;
}

async function callResponses(input: string, model: string): Promise<ResponsesResult> {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, input, max_output_tokens: 1500 }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { output?: { content?: { text?: string }[] }[]; id?: string };
  const text = json.output?.flatMap((o) => o.content ?? []).map((c) => c.text ?? "").join("") ?? "";
  return { text, requestId: json.id ?? null };
}

/** Short headline + section copy for a website, grounded only in the brief. */
export async function generateWebsiteCopy(brief: Record<string, unknown>): Promise<{ headline: string; requestId: string | null }> {
  if (!openaiConfigured()) throw new Error("OpenAI is not configured");
  const input = [
    "You write website copy for a small business. Use ONLY the facts below.",
    "Never invent prices, testimonials, credentials, contact details or claims.",
    "Return one short headline (under 8 words), nothing else.",
    "",
    JSON.stringify(brief),
  ].join("\n");
  const r = await callResponses(input, OPENAI_TEXT_MODEL);
  return { headline: r.text.trim().split("\n")[0]?.replace(/^["']|["']$/g, "") || String(brief.business_name), requestId: r.requestId };
}

/** Web-grounded market research. Returns sources with retrieval time; the
 *  caller must reject any answer without working sources. */
export async function researchMarket(brief: Record<string, unknown>): Promise<{ text: string; requestId: string | null; usage: { input_tokens: number; output_tokens: number } | null }> {
  if (!OPENAI_API_KEY || !OPENAI_RESEARCH_MODEL) throw new Error("OpenAI research model is not configured");
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OPENAI_RESEARCH_MODEL,
      tools: [{ type: "web_search" }],
      input: `Answer this market question with cited sources, and say plainly where evidence is thin: ${JSON.stringify(brief)}. List every source URL you used. Do not invent statistics or URLs.`,
      max_output_tokens: 3000,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { output?: { content?: { text?: string }[] }[]; id?: string; usage?: { input_tokens: number; output_tokens: number } };
  const text = json.output?.flatMap((o) => o.content ?? []).map((c) => c.text ?? "").join("") ?? "";
  return { text, requestId: json.id ?? null, usage: json.usage ?? null };
}
