import { z } from "zod";

/**
 * The four locked services (spec §3). Price is always 1 QUSDC — never $1
 * converted in the UI, never a float.
 */
export const SERVICE_IDS = ["business_website", "promo_video", "flyers_price_list", "market_report"] as const;
export type ServiceId = (typeof SERVICE_IDS)[number];

export const SERVICES: Record<ServiceId, { id: ServiceId; name: string; tagline: string; scope: string[]; output: string }> = {
  business_website: {
    id: "business_website",
    name: "Business Website",
    tagline: "A beautiful home for your business. Built for every screen.",
    scope: ["One-page website", "Mobile-ready layout", "Downloadable source files"],
    output: "Responsive one-page website preview and source ZIP",
  },
  promo_video: {
    id: "promo_video",
    name: "Promo Video",
    tagline: "Your products, in motion. Made for the feed.",
    scope: ["One 9:16 vertical export", "12–16 seconds", "Captions included"],
    output: "One 12–16 second vertical MP4 and captions TXT",
  },
  flyers_price_list: {
    id: "flyers_price_list",
    name: "Flyers & Price List",
    tagline: "Clear prices. Standout design. Ready to post or print.",
    scope: ["One promotional flyer", "Matching PDF", "Readable price-list PDF"],
    output: "One promotional PNG, matching PDF and price-list PDF",
  },
  market_report: {
    id: "market_report",
    name: "Market Report",
    tagline: "Your market, with the evidence. Find your next opportunity.",
    scope: ["Short cited brief", "Up to 5 sections", "Sources with dates"],
    output: "Cited HTML/PDF market brief and source table CSV",
  },
};

/** Shared brand kit: approved facts only. Never invented by the model. */
export const brandKitSchema = z.object({
  business_name: z.string().trim().min(2, "Business name is required").max(80),
  description: z.string().trim().min(10, "Tell us what the business does (at least 10 characters)").max(600),
  industry: z.string().trim().min(2, "Industry is required").max(60),
  location: z.string().trim().min(2, "Location is required").max(80),
  audience: z.string().trim().max(200).default(""),
  contact: z.string().trim().min(3, "An approved contact (email or WhatsApp) is required").max(120),
  colors: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).max(5).default([]),
  website_or_social: z.string().trim().max(200).default(""),
});
export type BrandKitInput = z.infer<typeof brandKitSchema>;

const priceItemSchema = z.object({
  name: z.string().trim().min(1).max(80),
  price: z.string().trim().min(1).max(30),
});

export const briefSchemas: Record<ServiceId, z.ZodTypeAny> = {
  business_website: brandKitSchema.extend({
    sections: z.array(z.enum(["hero", "about", "menu_or_services", "contact"])).min(1).max(6),
    cta: z.string().trim().min(2).max(80),
    menu_or_prices: z.string().trim().max(1000).default(""),
    reference_style: z.string().trim().max(200).default(""),
  }),
  promo_video: brandKitSchema.extend({
    offer: z.string().trim().min(5, "What is the offer?").max(300),
    cta: z.string().trim().min(2).max(80),
    tone: z.enum(["bright", "calm", "bold", "playful"]),
    approved_photos_note: z.string().trim().max(300).default(""),
  }),
  flyers_price_list: brandKitSchema.extend({
    offer: z.string().trim().min(5, "What is the offer?").max(300),
    currency: z.string().trim().min(1).max(10).default("₦"),
    items: z.array(priceItemSchema).min(1, "Add at least one item with its exact price").max(20, "Maximum 20 price items"),
    expiry: z.string().trim().max(60).default(""),
  }),
  market_report: brandKitSchema.extend({
    geography: z.string().trim().min(2).max(80),
    question: z.string().trim().min(10, "What question should the report answer?").max(400),
    competitors: z.array(z.string().trim().min(1).max(80)).max(3).default([]),
    urls: z.array(z.string().url("Each URL must be a valid link")).max(5).default([]),
  }),
};

export type BriefInput = z.infer<(typeof briefSchemas)[ServiceId]>;

/** Validate a brief for a service. Returns field errors, never invents data. */
export function validateBrief(service: ServiceId, input: unknown) {
  return briefSchemas[service].safeParse(input);
}

/** Extra per-service questions shown after the shared brand-kit fields. */
export const SERVICE_FIELDS: Record<ServiceId, { key: string; label: string; kind: "text" | "textarea" | "select" | "items"; help?: string; options?: string[] }[]> = {
  business_website: [
    { key: "cta", label: "Main button text", kind: "text", help: "e.g. Explore our bakery" },
    { key: "sections", label: "Sections to include (up to 6)", kind: "select", options: ["hero", "about", "menu_or_services", "contact"] },
    { key: "menu_or_prices", label: "Menu / services with exact prices (optional)", kind: "textarea", help: "One per line, exactly as customers should see it. We never invent prices." },
    { key: "reference_style", label: "Reference style (optional)", kind: "text", help: "e.g. warm and simple, like a neighbourhood bakery" },
  ],
  promo_video: [
    { key: "offer", label: "The offer", kind: "textarea", help: "What should viewers do, and why now?" },
    { key: "cta", label: "Call to action on screen", kind: "text", help: "e.g. Order today" },
    { key: "tone", label: "Tone", kind: "select", options: ["bright", "calm", "bold", "playful"] },
    { key: "approved_photos_note", label: "Photos to use (optional)", kind: "text", help: "Describe photos you own and approve. We never fetch images you did not approve." },
  ],
  flyers_price_list: [
    { key: "offer", label: "The offer", kind: "textarea" },
    { key: "currency", label: "Currency", kind: "text", help: "e.g. ₦, $, GH₵" },
    { key: "items", label: "Items and exact prices (up to 20)", kind: "items", help: "Prices are printed exactly as you type them. We never change or add discounts." },
    { key: "expiry", label: "Offer expiry, if real (optional)", kind: "text", help: "Only if the offer genuinely expires. Leave blank otherwise." },
  ],
  market_report: [
    { key: "geography", label: "Geography", kind: "text", help: "e.g. Lagos, Nigeria" },
    { key: "question", label: "The question to answer", kind: "textarea", help: "One clear question, e.g. Is there demand for a second bakery branch in Yaba?" },
    { key: "competitors", label: "Competitors to check (up to 3, optional)", kind: "text", help: "Separate with commas." },
    { key: "urls", label: "Useful links (up to 5, optional)", kind: "text", help: "Separate with commas. Public pages only." },
  ],
};
