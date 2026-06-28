export interface MiningDataInput {
  productName?: string;
  niche?: string;
  country?: string;
  trendingProducts?: Array<{ name: string; score?: number; signals?: string[] }>;
  facebookAds?: { totalAds?: number; activeAds?: number; topCreatives?: string[]; dataAvailability?: string };
  tiktokCreatives?: { totalFound?: number; topHooks?: string[]; avgEngagement?: number; dataAvailability?: string };
  youtubeTrends?: { totalVideos?: number; avgViews?: number | null; topTitles?: string[]; dataAvailability?: string };
  googleSeo?: { searchVolume?: string; competition?: string; relatedKeywords?: string[]; dataAvailability?: string };
  landingPage?: { triggers?: string[]; ctaButtons?: string[]; prices?: string[] };
  competitorData?: { funnelSteps?: string[]; pricing?: string[] };
  customNotes?: string;
}

export interface MiningReport {
  executiveSummary: string;
  relevantMetrics: Record<string, string | number | string[] | boolean>;
  scalePotentialAnalysis: string;
  recommendations: string[];
  opportunityScore: number;
  scoreBreakdown: Record<string, number>;
  dataQuality: {
    channelsWithEvidence: number;
    channelsTotal: number;
    confidence: "low" | "medium" | "high";
    disclaimer: string;
  };
  generatedAt: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function uniqueSignals(signals: string[]): string[] {
  return [...new Set(signals)];
}

function countEvidenceChannels(input: MiningDataInput): number {
  let count = 0;
  if ((input.trendingProducts?.length ?? 0) >= 2) count++;
  if ((input.facebookAds?.activeAds ?? 0) >= 3) count++;
  if ((input.tiktokCreatives?.totalFound ?? 0) >= 2) count++;
  if ((input.youtubeTrends?.avgViews ?? 0) > 50_000) count++;
  if (input.googleSeo?.searchVolume && input.googleSeo.searchVolume !== "unknown") count++;
  if ((input.landingPage?.triggers?.length ?? 0) >= 2) count++;
  if ((input.competitorData?.funnelSteps?.length ?? 0) >= 2) count++;
  return count;
}

export function synthesizeMiningReport(input: MiningDataInput): MiningReport {
  const signals: string[] = [];
  const breakdown: Record<string, number> = {};

  if (input.trendingProducts?.length) {
    const count = input.trendingProducts.length;
    const avgScore =
      input.trendingProducts.reduce((s, p) => s + (p.score ?? 0), 0) / count;
    breakdown.trendingProducts = clamp(Math.round(avgScore * 0.15), 0, 15);
    if (count >= 3) signals.push("multiple trending products");
    if (avgScore > 70) signals.push("high social/search momentum");
  }

  if (input.facebookAds) {
    const ads = input.facebookAds.activeAds ?? input.facebookAds.totalAds ?? 0;
    if (ads > 0) {
      breakdown.facebookAds = clamp(Math.min(ads, 20), 0, 20);
      if (ads >= 10) signals.push("high ad spend");
      if (ads >= 5) signals.push("multiple advertisers");
    }
  }

  if (input.tiktokCreatives) {
    const found = input.tiktokCreatives.totalFound ?? 0;
    if (found > 0) {
      breakdown.tiktok = clamp(Math.min(found * 2, 12), 0, 12);
      if (found >= 5) signals.push("tiktok creative volume");
    }
  }

  if (input.youtubeTrends?.avgViews && input.youtubeTrends.avgViews > 0) {
    const views = input.youtubeTrends.avgViews;
    breakdown.youtube = clamp(Math.round(Math.log10(views + 1) * 2.5), 0, 12);
    if (views > 100_000) signals.push("youtube momentum");
  }

  if (input.googleSeo?.searchVolume && input.googleSeo.searchVolume !== "unknown") {
    const vol = input.googleSeo.searchVolume;
    const comp = input.googleSeo.competition ?? "";
    breakdown.seo = vol === "high" ? 10 : vol === "medium" ? 6 : 3;
    if (vol === "high") signals.push("rising search volume");
    if (comp === "low") {
      breakdown.seo += 4;
      signals.push("low competition");
    }
  }

  if (input.landingPage?.triggers?.length) {
    const triggers = input.landingPage.triggers;
    breakdown.landingPage = clamp(triggers.length * 2, 0, 8);
    if (triggers.length >= 3) signals.push("strong landing page");
  }

  if (input.competitorData?.funnelSteps?.length) {
    const steps = input.competitorData.funnelSteps.length;
    breakdown.competitor = clamp(steps * 1.5, 0, 8);
    if (steps >= 3) signals.push("competitor scaling");
  }

  const dedupedSignals = uniqueSignals(signals);
  const evidenceChannels = countEvidenceChannels(input);

  let opportunityScore = clamp(
    Object.values(breakdown).reduce((a, b) => a + b, 0),
    0,
    100,
  );

  if (evidenceChannels <= 1) {
    opportunityScore = clamp(Math.round(opportunityScore * 0.5), 0, 35);
  } else if (evidenceChannels === 2) {
    opportunityScore = clamp(Math.round(opportunityScore * 0.7), 0, 55);
  }

  const confidence: "low" | "medium" | "high" =
    evidenceChannels >= 4 ? "high" : evidenceChannels >= 2 ? "medium" : "low";

  const productLabel = input.productName ?? input.niche ?? "the analyzed offer";
  const countryLabel = input.country ?? "global markets";

  const scaleLevel =
    opportunityScore >= 70 && evidenceChannels >= 3
      ? "HIGH — multiple independent channels show scaling signals"
      : opportunityScore >= 45 && evidenceChannels >= 2
        ? "MODERATE — some cross-channel evidence; validate with paid tests"
        : opportunityScore >= 20
          ? "LOW-MODERATE — limited evidence; insufficient for scale decisions"
          : "LOW — insufficient verified data to assess scaling potential";

  const recommendations: string[] = [];

  if (evidenceChannels < 2) {
    recommendations.push(
      "Insufficient cross-channel data — run mine_trending_products, analyze_facebook_ads, and analyze_google_seo before scaling decisions.",
    );
  }
  if ((input.facebookAds?.activeAds ?? 0) >= 5) {
    recommendations.push(
      "Study top Facebook creatives — multiple active ads indicate proven angles.",
    );
  }
  if (input.tiktokCreatives?.topHooks?.length) {
    recommendations.push(
      `Test TikTok creatives using hook pattern: "${input.tiktokCreatives.topHooks[0]}".`,
    );
  }
  if (input.googleSeo?.relatedKeywords?.length) {
    recommendations.push(
      `SEO content angles: ${input.googleSeo.relatedKeywords.slice(0, 3).join(", ")}.`,
    );
  }
  if (opportunityScore >= 50 && evidenceChannels >= 3) {
    recommendations.push(
      `Consider $50–100/day test campaigns for ${productLabel} in ${countryLabel} to validate CAC.`,
    );
  }
  if (recommendations.length === 0) {
    recommendations.push("Gather more real data across channels before investment decisions.");
  }

  const disclaimer =
    evidenceChannels < 2
      ? "Score heavily discounted: fewer than 2 channels with verified evidence. Not suitable for scale decisions."
      : "Score based on available proxy signals — not verified sales volume. Validate with test campaigns.";

  const relevantMetrics: Record<string, string | number | string[] | boolean> = {
    opportunityScore,
    scaleLevel,
    signalsDetected: dedupedSignals,
    evidenceChannels,
    product: productLabel,
    market: countryLabel,
  };

  if (input.facebookAds) relevantMetrics.facebookActiveAds = input.facebookAds.activeAds ?? 0;
  if (input.tiktokCreatives) relevantMetrics.tiktokCreativesFound = input.tiktokCreatives.totalFound ?? 0;
  if (input.youtubeTrends) relevantMetrics.youtubeAvgViews = input.youtubeTrends.avgViews ?? 0;
  if (input.googleSeo) {
    relevantMetrics.seoSearchVolume = input.googleSeo.searchVolume ?? "unknown";
    relevantMetrics.seoCompetition = input.googleSeo.competition ?? "unknown";
  }

  return {
    executiveSummary: `${productLabel} scores ${opportunityScore}/100 (${confidence} confidence, ${evidenceChannels} evidence channels) in ${countryLabel}. ${scaleLevel}.`,
    relevantMetrics,
    scalePotentialAnalysis: `Evidence from ${evidenceChannels} independent channels. Signals: ${dedupedSignals.join(", ") || "none"}. ${disclaimer}`,
    recommendations,
    opportunityScore,
    scoreBreakdown: breakdown,
    dataQuality: {
      channelsWithEvidence: evidenceChannels,
      channelsTotal: 7,
      confidence,
      disclaimer,
    },
    generatedAt: new Date().toISOString(),
  };
}