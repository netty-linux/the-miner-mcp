import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildStrategicIntelligence } from "../src/lib/intelligence-engine.js";
import { buildStrategicIntelligenceMarkdown } from "../src/lib/strategic-visual.js";
import { synthesizeMiningReport } from "../src/lib/report-synthesizer.js";

describe("buildStrategicIntelligence", () => {
  it("produces confidence score and recommendation", () => {
    const input = {
      niche: "emagrecimento",
      country: "BR",
      facebookAds: { activeAds: 14, totalAds: 18, topCreatives: ["perca peso rapido", "perca peso rapido"] },
      youtubeTrends: { avgViews: 1_600_000, totalVideos: 10 },
      googleSeo: { searchVolume: "high", competition: "medium", relatedKeywords: ["dieta"] },
      tiktokCreatives: { totalFound: 6, topHooks: ["Isso mudou minha vida"] },
      trendingProducts: [{ name: "Chá detox", score: 78 }],
    };

    const base = synthesizeMiningReport(input);
    const intel = buildStrategicIntelligence(base, input, {
      facebook: { ok: true, uniqueAdvertisers: 14 },
      youtube: { ok: true },
      seo: { ok: true },
      tiktok: { ok: true },
      trending: { ok: true },
    });

    assert.ok(intel.confidence.score >= 0 && intel.confidence.score <= 100);
    assert.ok(["ENTRAR", "TESTAR", "AGUARDAR", "EVITAR"].includes(intel.recommendation));
    assert.ok(intel.saturation.creativeFatigue === "High" || intel.saturation.repeatedCopySignals.length > 0);

    const md = buildStrategicIntelligenceMarkdown(intel, input);
    assert.ok(md.includes("Opportunity Score"));
    assert.ok(md.includes("Confidence Score"));
    assert.ok(md.includes("ENTRAR") || md.includes("TESTAR") || md.includes("AGUARDAR") || md.includes("EVITAR"));
  });

  it("reduces confidence when Meta fails", () => {
    const input = { niche: "test", googleSeo: { searchVolume: "medium", competition: "low" } };
    const base = synthesizeMiningReport(input);
    const intel = buildStrategicIntelligence(base, input, {
      facebook: { ok: false, detail: "FACEBOOK_ACCESS_TOKEN expirado" },
      seo: { ok: true },
    });

    assert.ok(intel.confidence.score < 70);
    assert.ok(intel.confidence.failedSources.some((s) => s.includes("Meta")));
    assert.ok(intel.confidence.disclaimer.includes("limitada") || intel.confidence.disclaimer.includes("falhou"));
  });
});