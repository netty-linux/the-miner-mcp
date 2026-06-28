import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("mine-trending-products structure", () => {
  it("keyword ideas must not include trendScore (verified via source contract)", async () => {
    const mod = await import("../src/tools/mine-trending-products.js");
    const schema = mod.mineTrendingProductsSchema;
    assert.ok(schema);

    const result = await mod.mineTrendingProducts({
      niche: "fitness",
      country: "US",
      time_period: "last_7_days",
    });

    const text = result.content[0]?.text ?? "";
    const parsed = JSON.parse(text) as {
      success: boolean;
      data: {
        trendingProducts: Array<{ trendScore: number; rawMetrics: unknown }>;
        keywordIdeas: Array<{ keyword: string; rank: number }>;
        scalingSignalsAvailable: boolean;
        analysisNotes: string[];
      };
    };

    assert.equal(parsed.success, true);

    for (const idea of parsed.data.keywordIdeas) {
      assert.ok("keyword" in idea);
      assert.ok("rank" in idea);
      assert.equal((idea as Record<string, unknown>).trendScore, undefined);
    }

    for (const product of parsed.data.trendingProducts) {
      assert.ok(product.rawMetrics, "trending products must have rawMetrics");
      assert.ok(product.trendScore > 0);
    }

    const notes = parsed.data.analysisNotes.join(" ");
    assert.ok(notes.includes("keywordIdeas") || notes.includes("autocomplete"));
    assert.ok(!notes.includes("no synthetic or heuristic scores") || parsed.data.trendingProducts.length > 0);
  });
});