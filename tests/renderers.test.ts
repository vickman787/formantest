import { describe, expect, it } from "vitest";
import { renderFlyer } from "@/lib/renderers/flyer";
import { renderVideo } from "@/lib/renderers/video";

describe("flyer renderer", () => {
  it("renders a 1080x1350 PNG and both PDFs with exact prices", async () => {
    const { png, flyerPdf, priceListPdf, checks } = await renderFlyer({
      business_name: "Sunday Crumb",
      description: "Bakery",
      location: "Lagos, Nigeria",
      contact: "hello@sundaycrumb.example",
      colors: ["#D75B3E"],
      offer: "The weekend bake. Sourdough, coffee, good company.",
      currency: "₦",
      items: [
        { name: "Sourdough loaf", price: "₦2,500" },
        { name: "Croissant", price: "₦1,200" },
      ],
    });
    // PNG magic bytes
    expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(flyerPdf.toString("latin1")).toContain("%PDF-1.4");
    expect(priceListPdf.toString("latin1")).toContain("Sourdough loaf");
    expect(checks.every((c) => c.passed)).toBe(true);
  }, 30000);
});

describe("promo video renderer", () => {
  it("renders a playable 12–16s vertical MP4", async () => {
    const { mp4, captions, durationSec, checks } = await renderVideo({
      business_name: "Sunday Crumb",
      offer: "Fresh sourdough every morning in Lagos",
      cta: "Order today",
      contact: "hello@sundaycrumb.example",
      location: "Lagos, Nigeria",
    });
    expect(mp4.length).toBeGreaterThan(10_000);
    expect(durationSec).toBeGreaterThanOrEqual(12);
    expect(durationSec).toBeLessThanOrEqual(16);
    expect(captions).toContain("Sunday Crumb");
    expect(checks.every((c) => c.passed)).toBe(true);
  }, 120000);
});
