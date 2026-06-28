import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { synthesizeMiningReport } from "../src/lib/report-synthesizer.js";

describe("synthesizeMiningReport", () => {
  it("returns all required report sections", () => {
    const report = synthesizeMiningReport({
      productName: "Fitness Band",
      country: "US",
      facebookAds: { activeAds: 12, totalAds: 15 },
      tiktokCreatives: { totalFound: 8, topHooks: ["This changed my life"] },
      youtubeTrends: { avgViews: 250000, totalVideos: 10 },
      googleSeo: { searchVolume: "high", competition: "low", relatedKeywords: ["fitness band review"] },
      landingPage: { triggers: ["urgency — limited time", "risk reversal — guarantee"], ctaButtons: ["Buy Now"] },
    });

    assert.ok(report.executiveSummary.length > 0);
    assert.ok(report.scalePotentialAnalysis.length > 0);
    assert.ok(report.recommendations.length > 0);
    assert.ok(report.opportunityScore >= 0 && report.opportunityScore <= 100);
    assert.ok(report.dataQuality);
    assert.ok(report.generatedAt);
  });

  it("scores higher with more verified evidence channels", () => {
    const sparse = synthesizeMiningReport({
      productName: "Test",
      googleSeo: { searchVolume: "medium", competition: "unknown" },
    });

    const rich = synthesizeMiningReport({
      productName: "Test",
      trendingProducts: [
        { name: "A", score: 80 },
        { name: "B", score: 75 },
        { name: "C", score: 70 },
      ],
      facebookAds: { activeAds: 20 },
      tiktokCreatives: { totalFound: 10 },
      youtubeTrends: { avgViews: 1_000_000 },
      googleSeo: { searchVolume: "high", competition: "low" },
      landingPage: { triggers: ["urgency", "scarcity", "guarantee"] },
      competitorData: { funnelSteps: ["landing", "checkout", "upsell", "thank you"] },
    });

    assert.ok(rich.opportunityScore > sparse.opportunityScore);
    assert.ok(sparse.opportunityScore <= 35, "sparse input should not produce inflated scores");
    assert.equal(sparse.dataQuality.confidence, "low");
  });

  it("does not attribute ad spend signals to trending products alone", () => {
    const report = synthesizeMiningReport({
      trendingProducts: [
        { name: "A", score: 80 },
        { name: "B", score: 75 },
        { name: "C", score: 70 },
      ],
    });
    const signals = report.relevantMetrics.signalsDetected as string[];
    assert.ok(!signals.includes("high ad spend"));
    assert.ok(!signals.includes("multiple advertisers"));
    assert.ok(signals.includes("multiple trending products"));
  });
});