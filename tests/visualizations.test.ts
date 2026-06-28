import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { synthesizeMiningReport } from "../src/lib/report-synthesizer.js";
import {
  buildEmbedLinks,
  buildGoogleSeoVisualMarkdown,
  buildMiningReportCharts,
  buildMiningReportVisualMarkdown,
  buildTrendingProductsVisualMarkdown,
  generateBarChartSvg,
  generateFunnelStepsSvg,
  generateScoreGaugeSvg,
  svgToBase64,
} from "../src/lib/visualizations.js";

describe("visualizations", () => {
  it("generates valid SVG charts", () => {
    const gauge = generateScoreGaugeSvg(67);
    const bars = generateBarChartSvg("Test", [
      { label: "A", value: 10 },
      { label: "B", value: 20 },
    ]);

    assert.ok(gauge.includes("<svg"));
    assert.ok(gauge.includes("67"));
    assert.ok(bars.includes("<svg"));
    assert.ok(bars.includes("Test"));
  });

  it("encodes SVG to base64", () => {
    const b64 = svgToBase64("<svg></svg>");
    assert.ok(b64.length > 0);
    assert.equal(Buffer.from(b64, "base64").toString("utf-8"), "<svg></svg>");
  });

  it("builds embed links with encoded query", () => {
    const links = buildEmbedLinks("emagrecimento", "BR");
    assert.ok(links.facebookAdLibrary.includes("country=BR"));
    assert.ok(links.facebookAdLibrary.includes("emagrecimento"));
    assert.ok(links.googleTrends.includes("geo=BR"));
    assert.ok(links.youtubeSearch.includes("search_query"));
  });

  it("builds rich visual markdown for mining report", () => {
    const input = {
      niche: "emagrecimento",
      country: "BR",
      facebookAds: { activeAds: 25 },
      youtubeTrends: { avgViews: 16_000_000 },
      googleSeo: { searchVolume: "high", competition: "medium" },
    };
    const report = synthesizeMiningReport(input);
    const md = buildMiningReportVisualMarkdown(report, input, ["facebook_ads", "youtube_trends"]);

    assert.ok(md.includes("# ⛏️ Relatório Visual"));
    assert.ok(md.includes("```mermaid"));
    assert.ok(md.includes("Facebook Ad Library"));
    assert.ok(md.includes("emagrecimento"));
  });

  it("builds visual markdown for remaining tools", () => {
    const trending = buildTrendingProductsVisualMarkdown({
      niche: "fitness",
      country: "BR",
      dataAvailability: "partial",
      totalTrendingProducts: 3,
      trendingProducts: [{ name: "Protein Powder", trendScore: 85, source: "reddit", estimatedMomentum: "rising" }],
      keywordIdeas: [{ keyword: "fitness band", rank: 1 }],
      topPick: { name: "Protein Powder", trendScore: 85, source: "reddit" },
    });
    assert.ok(trending.includes("Trending Products"));

    const seo = buildGoogleSeoVisualMarkdown({
      keyword: "emagrecimento",
      country: "BR",
      searchVolume: "high",
      competition: "medium",
      seoOpportunity: "STRONG",
      risingKeywords: [{ keyword: "dieta", value: 120 }],
      topKeywords: [],
      regionalInterest: [{ region: "BR", score: 90 }],
      peopleAlsoAsk: ["Como emagrecer rápido?"],
    });
    assert.ok(seo.includes("Google SEO"));

    const funnel = generateFunnelStepsSvg([
      { step: 1, type: "landing", title: "Sales Page" },
      { step: 2, type: "checkout", title: "Checkout" },
    ]);
    assert.ok(funnel.includes("Competitor Funnel"));
  });

  it("builds chart assets for mining report", () => {
    const input = {
      niche: "fitness",
      facebookAds: { activeAds: 10 },
      youtubeTrends: { avgViews: 500_000 },
    };
    const report = synthesizeMiningReport(input);
    const charts = buildMiningReportCharts(report, input);

    assert.ok(charts.scoreGauge.includes("<svg"));
    assert.ok(charts.scoreBreakdown.includes("<svg"));
    assert.ok(charts.channelStatus.includes("Channel Evidence"));
  });
});