import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateMiningReport } from "../src/tools/generate-mining-report.js";
import { detectTriggers } from "../src/lib/scraping.js";
import { extractPageData } from "../src/lib/scraping.js";

describe("generateMiningReport tool", () => {
  it("produces structured report from collected data", async () => {
    const result = await generateMiningReport({
      product_name: "Wireless Earbuds",
      niche: "tech",
      country: "US",
      collected_data: {
        trending_products: [{ name: "Earbuds Pro", score: 78, signals: ["rising"] }],
        facebook_ads: { activeAds: 8, totalAds: 10 },
        google_seo: { searchVolume: "high", competition: "medium", relatedKeywords: ["best earbuds 2026"] },
      },
    });

    assert.equal(result.isError, undefined);
    assert.ok(result.content.length >= 2, "rich result should include markdown + JSON");

    const markdown = result.content[0]?.text ?? "";
    assert.ok(markdown.includes("Inteligência Estratégica") || markdown.includes("Opportunity Score"));

    const jsonBlock = result.content.find((c) => c.type === "text" && c.text.includes('"success"'));
    const parsed = JSON.parse(jsonBlock?.text ?? "{}") as {
      success: boolean;
      data: {
        report: { opportunityScore: number };
        confidenceScore: number;
        recommendation: string;
      };
    };
    assert.equal(parsed.success, true);
    assert.ok(parsed.data.report.opportunityScore >= 0);
    assert.ok(parsed.data.report.opportunityScore <= 100);
    assert.ok(parsed.data.confidenceScore >= 0);
    assert.ok(["ENTRAR", "TESTAR", "AGUARDAR", "EVITAR"].includes(parsed.data.recommendation));
    assert.ok(result.structuredContent);
  });
});

describe("scraping helpers", () => {
  it("detects psychological triggers in copy", () => {
    const triggers = detectTriggers(
      "Limited time offer! Only 3 left. Money-back guarantee. Free shipping today only.",
    );
    assert.ok(triggers.length >= 2);
    assert.ok(triggers.some((t) => t.includes("urgency") || t.includes("scarcity")));
  });

  it("extracts page data from HTML", () => {
    const html = `<!DOCTYPE html><html><head><title>Buy Now - Super Product</title>
      <meta name="description" content="Best product ever"></head>
      <body><h1>Amazing Offer</h1><p>Get 50% off today only!</p>
      <button>Buy Now - $29.99</button></body></html>`;
    const data = extractPageData(html, "https://example.com");
    assert.equal(data.title, "Buy Now - Super Product");
    assert.ok(data.headings.includes("Amazing Offer"));
    assert.ok(data.prices.length > 0);
    assert.ok(data.ctaButtons.some((c) => c.includes("Buy")));
  });
});