import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeMarketplaceScores,
  fetchMarketplaceDemand,
} from "../src/lib/marketplace-sources.js";

describe("computeMarketplaceScores", () => {
  it("scores high demand when marketplace totals are large", () => {
    const scores = computeMarketplaceScores(
      {
        siteId: "MLB",
        totalResults: 8000,
        listings: Array.from({ length: 10 }, (_, i) => ({
          title: `Item ${i}`,
          price: 99,
          currency: "BRL",
          soldCount: 200,
          source: "mercado_livre" as const,
        })),
        avgPrice: 99,
        avgSold: 200,
        demandSignal: "HIGH",
      },
      null,
    );

    assert.ok(scores.combinedDemandScore >= 50);
    assert.equal(scores.marketplaceSaturation, "medium");
    assert.ok(scores.supplierAvailabilityScore >= 60);
  });

  it("returns unknown saturation when both sources fail", () => {
    const scores = computeMarketplaceScores(null, null);
    assert.equal(scores.combinedDemandScore, 0);
    assert.equal(scores.supplierAvailabilityScore, 0);
    assert.equal(scores.marketplaceSaturation, "unknown");
  });
});

describe("fetchMarketplaceDemand", () => {
  it("returns valid structure with graceful degradation when APIs are blocked", async () => {
    const result = await fetchMarketplaceDemand("fone bluetooth", "BR");

    assert.equal(result.keyword, "fone bluetooth");
    assert.equal(result.country, "BR");
    assert.ok(result.combinedDemandScore >= 0 && result.combinedDemandScore <= 100);
    assert.ok(["low", "medium", "high", "unknown"].includes(result.marketplaceSaturation));
    assert.equal(result.sources.length, 2);

    if (result.mercadoLivre) {
      assert.ok(result.mercadoLivre.totalResults >= 0);
      assert.equal(result.mercadoLivre.siteId, "MLB");
    }
    if (result.shopee) {
      assert.ok(result.shopee.totalResults >= 0);
    }
  }, { timeout: 30_000 });
});