import type { MiningDataInput, MiningReport } from "./report-synthesizer.js";

export type FinalRecommendation = "ENTRAR" | "TESTAR" | "AGUARDAR" | "EVITAR";
export type ConfidenceLabel = "Baixa" | "Média" | "Alta" | "Muito Alta";
export type CreativeFatigue = "Low" | "Moderate" | "High" | "Unknown";

export interface SourceEvidence {
  name: string;
  available: boolean;
  weight: number;
  status: "ok" | "partial" | "failed" | "not_integrated";
  detail?: string;
}

export interface DimensionScores {
  trendScore: number | null;
  competitionScore: number | null;
  creativeSaturation: number | null;
  seoOpportunity: number | null;
  metaCompetition: number | null;
  tiktokGrowth: number | null;
  youtubeDemand: number | null;
  landingQuality: number | null;
  marketMaturity: number | null;
  scalability: number | null;
}

export interface SaturationAnalysis {
  activeAdvertisers: number;
  activeAds: number;
  creativeFatigue: CreativeFatigue;
  repeatedCopySignals: string[];
  averageCompetitionLevel: "low" | "medium" | "high" | "unknown";
}

export interface GapAnalysis {
  whatEveryoneDoes: string[];
  differentiationOpportunities: string[];
}

export interface StrategyPlan {
  recommendedAudience: string;
  recommendedHook: string;
  recommendedHeadline: string;
  suggestedOffer: string;
  suggestedPriceRange: string;
  idealTestBudget: string;
  idealCpaRange: string;
  recommendedCreativeFormat: string;
  landingRecommendation: string;
}

export interface RiskAssessment {
  biggestRisk: string;
  biggestAdvantage: string;
  biggestDifficulty: string;
  scaleProbability: "low" | "medium" | "high";
}

export interface ConfidenceReport {
  score: number;
  label: ConfidenceLabel;
  sourcesUsed: SourceEvidence[];
  failedSources: string[];
  notIntegratedSources: string[];
  disclaimer: string;
}

export interface StrategicIntelligenceReport {
  baseReport: MiningReport;
  opportunityScore: number;
  opportunityTier: string;
  confidence: ConfidenceReport;
  dimensions: DimensionScores;
  saturation: SaturationAnalysis;
  gaps: GapAnalysis;
  strategy: StrategyPlan;
  risk: RiskAssessment;
  recommendation: FinalRecommendation;
  recommendationReasons: string[];
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  risks: string[];
  entryPlan: string[];
  scalePlan: string[];
  executiveSummary: string;
  finalConclusion: string;
}

export interface ChannelCollectionMeta {
  trending?: { ok: boolean; detail?: string };
  facebook?: { ok: boolean; detail?: string; uniqueAdvertisers?: number };
  youtube?: { ok: boolean; detail?: string };
  seo?: { ok: boolean; detail?: string };
  tiktok?: { ok: boolean; detail?: string };
  landing?: { ok: boolean; detail?: string };
  competitor?: { ok: boolean; detail?: string };
}

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function tierFromScore(score: number): string {
  if (score >= 81) return "81-100 — Excelente oportunidade";
  if (score >= 61) return "61-80 — Boa oportunidade";
  if (score >= 31) return "31-60 — Mercado médio";
  return "0-30 — Mercado ruim";
}

function confidenceLabel(score: number): ConfidenceLabel {
  if (score >= 85) return "Muito Alta";
  if (score >= 65) return "Alta";
  if (score >= 40) return "Média";
  return "Baixa";
}

function detectRepeatedCreatives(creatives: string[] | undefined): string[] {
  if (!creatives?.length) return [];
  const normalized = creatives.map((c) => c.toLowerCase().slice(0, 80));
  const counts = new Map<string, number>();
  for (const c of normalized) counts.set(c, (counts.get(c) ?? 0) + 1);
  return [...counts.entries()].filter(([, n]) => n > 1).map(([c]) => `Copy repetida detectada: "${c.slice(0, 40)}…"`);
}

function buildSourceEvidence(input: MiningDataInput, meta: ChannelCollectionMeta): SourceEvidence[] {
  const fbAds = input.facebookAds?.activeAds ?? 0;
  const tiktok = input.tiktokCreatives?.totalFound ?? 0;
  const ytViews = input.youtubeTrends?.avgViews ?? 0;
  const seoVol = input.googleSeo?.searchVolume;
  const trending = input.trendingProducts?.length ?? 0;

  return [
    {
      name: "Meta (Facebook Ad Library)",
      weight: 22,
      available: meta.facebook?.ok === true && fbAds >= 0,
      status: meta.facebook?.ok ? (fbAds > 0 ? "ok" : "partial") : "failed",
      detail: meta.facebook?.detail ?? (fbAds > 0 ? `${fbAds} ads ativos` : "Sem ads ou API indisponível"),
    },
    {
      name: "TikTok Creative Center",
      weight: 14,
      available: meta.tiktok?.ok === true,
      status: meta.tiktok?.ok ? (tiktok > 0 ? "ok" : "partial") : "failed",
      detail: meta.tiktok?.detail,
    },
    {
      name: "Google (SEO/Trends/PAA)",
      weight: 20,
      available: meta.seo?.ok === true && Boolean(seoVol && seoVol !== "unknown"),
      status: meta.seo?.ok ? "ok" : "failed",
      detail: meta.seo?.detail,
    },
    {
      name: "YouTube",
      weight: 14,
      available: meta.youtube?.ok === true && ytViews > 0,
      status: meta.youtube?.ok ? (ytViews > 0 ? "ok" : "partial") : "failed",
      detail: meta.youtube?.detail,
    },
    {
      name: "Trending (Google Trends + Reddit)",
      weight: 12,
      available: meta.trending?.ok === true && trending > 0,
      status: meta.trending?.ok ? (trending > 0 ? "ok" : "partial") : "failed",
      detail: meta.trending?.detail,
    },
    {
      name: "Landing Page",
      weight: 8,
      available: meta.landing?.ok === true,
      status: meta.landing?.ok ? "ok" : "not_integrated",
      detail: meta.landing?.detail ?? "Forneça URL via analyze_landing_page",
    },
    {
      name: "Competidores",
      weight: 8,
      available: meta.competitor?.ok === true,
      status: meta.competitor?.ok ? "ok" : "not_integrated",
      detail: meta.competitor?.detail ?? "Forneça URL via scrape_competitor_data",
    },
    {
      name: "Shopee",
      weight: 4,
      available: false,
      status: "not_integrated",
      detail: "API não integrada nesta versão",
    },
    {
      name: "AliExpress",
      weight: 3,
      available: false,
      status: "not_integrated",
      detail: "API não integrada nesta versão",
    },
    {
      name: "Mercado Livre",
      weight: 3,
      available: false,
      status: "not_integrated",
      detail: "API não integrada nesta versão",
    },
  ];
}

function computeConfidence(sources: SourceEvidence[]): ConfidenceReport {
  const totalWeight = sources.reduce((s, x) => s + x.weight, 0);
  const earned = sources.reduce((s, x) => {
    if (!x.available) return s;
    const factor = x.status === "ok" ? 1 : x.status === "partial" ? 0.55 : 0;
    return s + x.weight * factor;
  }, 0);

  const score = clamp((earned / totalWeight) * 100);
  const failedSources = sources.filter((s) => s.status === "failed").map((s) => `${s.name}: ${s.detail ?? "falhou"}`);
  const notIntegratedSources = sources.filter((s) => s.status === "not_integrated").map((s) => s.name);

  let disclaimer = "Score baseado apenas em fontes com dados verificados — nunca inventamos métricas.";
  if (failedSources.length > 0) {
    disclaimer += ` Análise limitada: ${failedSources.join("; ")}.`;
  }

  return {
    score,
    label: confidenceLabel(score),
    sourcesUsed: sources,
    failedSources,
    notIntegratedSources,
    disclaimer,
  };
}

function computeDimensions(input: MiningDataInput, saturation: SaturationAnalysis): DimensionScores {
  const trendAvg =
    input.trendingProducts?.length
      ? input.trendingProducts.reduce((s, p) => s + (p.score ?? 0), 0) / input.trendingProducts.length
      : null;

  const seoVol = input.googleSeo?.searchVolume;
  const seoComp = input.googleSeo?.competition;
  const seoOpp =
    seoVol && seoVol !== "unknown"
      ? clamp((seoVol === "high" ? 75 : seoVol === "medium" ? 50 : 30) + (seoComp === "low" ? 20 : seoComp === "medium" ? 5 : 0))
      : null;

  const metaAds = input.facebookAds?.activeAds ?? 0;
  const metaComp = metaAds > 0 ? clamp(100 - Math.min(metaAds * 3, 70)) : null;

  const tiktok = input.tiktokCreatives?.totalFound ?? 0;
  const tiktokGrowth = tiktok > 0 ? clamp(Math.min(tiktok * 8, 85)) : null;

  const ytViews = input.youtubeTrends?.avgViews ?? 0;
  const youtubeDemand = ytViews > 0 ? clamp(Math.log10(ytViews + 1) * 20) : null;

  const landingTriggers = input.landingPage?.triggers?.length ?? 0;
  const landingQuality = landingTriggers > 0 ? clamp(40 + landingTriggers * 10) : null;

  const competitionScore =
    metaComp !== null && seoOpp !== null
      ? clamp((metaComp + seoOpp) / 2)
      : metaComp ?? seoOpp;

  const creativeSat =
    saturation.creativeFatigue === "High"
      ? 20
      : saturation.creativeFatigue === "Moderate"
        ? 45
        : saturation.creativeFatigue === "Low"
          ? 75
          : null;

  const marketMaturity =
    metaAds >= 15 && (ytViews ?? 0) > 500_000 ? 70 : metaAds >= 5 ? 50 : metaAds > 0 ? 35 : null;

  const scalability =
    metaAds >= 5 && (ytViews ?? 0) > 100_000 ? 75 : metaAds >= 3 || (ytViews ?? 0) > 50_000 ? 55 : 30;

  return {
    trendScore: trendAvg !== null ? clamp(trendAvg) : null,
    competitionScore,
    creativeSaturation: creativeSat,
    seoOpportunity: seoOpp,
    metaCompetition: metaComp,
    tiktokGrowth,
    youtubeDemand,
    landingQuality,
    marketMaturity,
    scalability: clamp(scalability),
  };
}

function analyzeSaturation(input: MiningDataInput, uniqueAdvertisers = 0): SaturationAnalysis {
  const activeAds = input.facebookAds?.activeAds ?? 0;
  const repeated = detectRepeatedCreatives(input.facebookAds?.topCreatives);

  let creativeFatigue: CreativeFatigue = "Unknown";
  if (activeAds >= 25 || uniqueAdvertisers >= 20) creativeFatigue = "High";
  else if (activeAds >= 10 || uniqueAdvertisers >= 8) creativeFatigue = "Moderate";
  else if (activeAds > 0) creativeFatigue = "Low";

  if (repeated.length >= 2) creativeFatigue = "High";

  const averageCompetitionLevel: SaturationAnalysis["averageCompetitionLevel"] =
    activeAds >= 20
      ? "high"
      : activeAds >= 8
        ? "medium"
        : activeAds > 0
          ? "low"
          : "unknown";

  return {
    activeAdvertisers: uniqueAdvertisers,
    activeAds,
    creativeFatigue,
    repeatedCopySignals: repeated,
    averageCompetitionLevel,
  };
}

function analyzeGaps(input: MiningDataInput, saturation: SaturationAnalysis): GapAnalysis {
  const whatEveryoneDoes: string[] = [];
  const differentiationOpportunities: string[] = [];

  if ((input.facebookAds?.activeAds ?? 0) >= 5) {
    whatEveryoneDoes.push("Múltiplos anunciantes ativos no Meta — mercado validado mas competitivo");
  }
  if (input.tiktokCreatives?.topHooks?.length) {
    whatEveryoneDoes.push(`Hooks dominantes: "${input.tiktokCreatives.topHooks[0]?.slice(0, 60)}"`);
  }
  if (input.youtubeTrends?.topTitles?.length) {
    whatEveryoneDoes.push(`Formato YouTube comum: títulos estilo "${input.youtubeTrends.topTitles[0]?.slice(0, 50)}"`);
  }

  if (saturation.creativeFatigue === "High") {
    differentiationOpportunities.push("Criativo UGC autêntico com pattern interrupt — copies repetidas indicam fadiga");
  } else {
    differentiationOpportunities.push("Testar ângulo de transformação visual / antes-depois se o nicho permitir");
  }
  if ((input.landingPage?.triggers?.length ?? 0) < 3) {
    differentiationOpportunities.push("Landing com prova social + garantia forte — concorrentes com LP fraca");
  }
  if (input.googleSeo?.competition === "low") {
    differentiationOpportunities.push("SEO de cauda longa + conteúdo PAA antes dos concorrentes");
  }
  if (whatEveryoneDoes.length === 0) {
    whatEveryoneDoes.push("Poucos padrões detectados — mercado possivelmente inexplorado ou dados insuficientes");
  }
  if (differentiationOpportunities.length === 0) {
    differentiationOpportunities.push("Diferenciar por oferta (bônus, garantia estendida) e criativo UGC nativo");
  }

  return { whatEveryoneDoes, differentiationOpportunities };
}

function deriveRecommendation(
  opportunityScore: number,
  confidenceScore: number,
  saturation: SaturationAnalysis,
): { recommendation: FinalRecommendation; reasons: string[] } {
  const reasons: string[] = [];

  if (confidenceScore < 40) {
    reasons.push(`Confidence Score baixo (${confidenceScore}/100) — dados insuficientes para escalar`);
    return { recommendation: "AGUARDAR", reasons };
  }

  if (saturation.creativeFatigue === "High" && opportunityScore < 70) {
    reasons.push("Creative Fatigue High com score moderado — saturação de criativos");
    return { recommendation: "EVITAR", reasons };
  }

  if (opportunityScore >= 81 && confidenceScore >= 65) {
    reasons.push("Opportunity Score excelente com confidence alta");
    if (saturation.activeAds > 0 && saturation.activeAds < 20) {
      reasons.push(`Apenas ${saturation.activeAds} ads ativos — espaço para entrar`);
    }
    return { recommendation: "ENTRAR", reasons };
  }

  if (opportunityScore >= 61) {
    reasons.push("Boa oportunidade — validar com teste pago antes de escalar");
    return { recommendation: "TESTAR", reasons };
  }

  if (opportunityScore >= 31) {
    reasons.push("Mercado médio — necessita diferenciação clara");
    return { recommendation: "AGUARDAR", reasons };
  }

  reasons.push("Opportunity Score baixo — risco elevado de investimento");
  return { recommendation: "EVITAR", reasons };
}

function buildStrategy(input: MiningDataInput, gaps: GapAnalysis): StrategyPlan {
  const niche = input.productName ?? input.niche ?? "oferta";
  const hook = input.tiktokCreatives?.topHooks?.[0] ?? `Descubra como ${niche} pode mudar seu resultado em 30 dias`;
  const country = input.country ?? "BR";

  return {
    recommendedAudience: `Adultos 25-45 interessados em ${niche}, ${country}, compradores online`,
    recommendedHook: hook.slice(0, 120),
    recommendedHeadline: `${niche}: o método que poucos anunciantes estão usando`,
    suggestedOffer: "Oferta principal + garantia 30 dias + bônus digital",
    suggestedPriceRange: "R$ 97 – R$ 197 (low ticket) ou R$ 27 – R$ 47 (impulso físico)",
    idealTestBudget: "R$ 150 – R$ 300/dia por 5-7 dias para validar CPA",
    idealCpaRange: "30-45% do preço de venda (break-even em 2-3 vendas/dia)",
    recommendedCreativeFormat: gaps.differentiationOpportunities[0]?.includes("UGC") ? "UGC 15-30s com pattern interrupt" : "Demonstração / antes-depois 20-40s",
    landingRecommendation: "LP curta, prova social, CTA único, mobile-first, pixel instalado",
  };
}

function buildRisk(
  input: MiningDataInput,
  saturation: SaturationAnalysis,
  confidence: ConfidenceReport,
): RiskAssessment {
  const biggestRisk =
    confidence.score < 50
      ? "Decisão baseada em dados incompletos — fontes críticas falharam"
      : saturation.creativeFatigue === "High"
        ? "Saturação de criativos — CAC pode subir rápido"
        : "Concorrência pode escalar antes da validação do seu criativo";

  const biggestAdvantage =
    saturation.activeAds > 0 && saturation.activeAds < 15
      ? "Mercado validado com espaço — poucos anunciantes relativamente"
      : (input.youtubeTrends?.avgViews ?? 0) > 100_000
        ? "Demanda orgânica forte no YouTube"
        : input.googleSeo?.searchVolume === "high"
          ? "Volume de busca em alta"
          : "Nicho com demanda detectável em múltiplos canais";

  return {
    biggestRisk,
    biggestAdvantage,
    biggestDifficulty: saturation.creativeFatigue === "High" ? "Diferenciar criativo em mercado saturado" : "Validar CPA com budget limitado",
    scaleProbability:
      saturation.activeAds >= 15 && saturation.creativeFatigue === "High"
        ? "low"
        : confidence.score >= 65
          ? "high"
          : "medium",
  };
}

export function buildStrategicIntelligence(
  baseReport: MiningReport,
  input: MiningDataInput,
  meta: ChannelCollectionMeta = {},
): StrategicIntelligenceReport {
  const uniqueAdvertisers = meta.facebook?.uniqueAdvertisers ?? 0;
  const sources = buildSourceEvidence(input, meta);
  const confidence = computeConfidence(sources);
  const saturation = analyzeSaturation(input, uniqueAdvertisers);
  const dimensions = computeDimensions(input, saturation);
  const gaps = analyzeGaps(input, saturation);
  const strategy = buildStrategy(input, gaps);
  const risk = buildRisk(input, saturation, confidence);

  const opportunityScore = baseReport.opportunityScore;
  const { recommendation, reasons } = deriveRecommendation(opportunityScore, confidence.score, saturation);

  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const opportunities: string[] = [...gaps.differentiationOpportunities];
  const risks: string[] = [risk.biggestRisk];

  if (saturation.activeAds > 0 && saturation.activeAds < 20) {
    strengths.push(`Apenas ${saturation.activeAdvertisers || "?"} anunciantes / ${saturation.activeAds} ads ativos no Meta`);
  }
  if ((input.youtubeTrends?.avgViews ?? 0) > 100_000) {
    strengths.push(`Demanda YouTube: ~${Math.round((input.youtubeTrends!.avgViews ?? 0) / 1_000_000)}M views médias`);
  }
  if (input.googleSeo?.searchVolume === "high") {
    strengths.push("Volume de busca Google em alta");
  }
  if (saturation.creativeFatigue === "Low") {
    strengths.push("Baixa saturação de criativos — espaço para novos ângulos");
  }

  if (confidence.score < 60) weaknesses.push(`Confidence limitado (${confidence.score}/100) por falhas de fonte`);
  if (saturation.creativeFatigue === "High") weaknesses.push("Creative Fatigue: High — copies/criativos repetidos");
  if (!input.landingPage) weaknesses.push("Landing page não analisada — forneça URL para score completo");
  if (!input.competitorData) weaknesses.push("Funil de competidor não analisado");

  const entryPlan = [
    `1. Testar criativo ${strategy.recommendedCreativeFormat} com hook: "${strategy.recommendedHook.slice(0, 60)}…"`,
    `2. Budget inicial: ${strategy.idealTestBudget}`,
    `3. LP mobile-first com garantia + prova social`,
    `4. Meta pixel + evento Purchase configurados antes de escalar`,
  ];

  const scalePlan = [
    recommendation === "ENTRAR" || recommendation === "TESTAR"
      ? "Após CPA validado: escalar 20%/dia até 3x budget inicial"
      : "Aguardar mais evidências antes de escalar",
    "Rotacionar 3-5 criativos UGC para evitar fadiga",
    "Expandir para lookalike 1-3% após 50 conversões",
  ];

  const productLabel = input.productName ?? input.niche ?? "oferta";
  const countryLabel = input.country ?? "global";

  const executiveSummary = [
    `${productLabel} (${countryLabel}): Opportunity Score ${opportunityScore}/100 (${tierFromScore(opportunityScore)}).`,
    `Confidence Score ${confidence.score}/100 (${confidence.label}).`,
    `Recomendação: **${recommendation}**.`,
    `Pergunta-chave: "Se investir hoje, qual a chance de vender?" → ${recommendation === "ENTRAR" || recommendation === "TESTAR" ? "Moderada a alta com teste validado" : "Baixa sem mais dados ou diferenciação"}.`,
  ].join(" ");

  const finalConclusion = `${recommendation} — ${reasons.join(". ")}. ${confidence.disclaimer}`;

  return {
    baseReport,
    opportunityScore,
    opportunityTier: tierFromScore(opportunityScore),
    confidence,
    dimensions,
    saturation,
    gaps,
    strategy,
    risk,
    recommendation,
    recommendationReasons: reasons,
    strengths,
    weaknesses,
    opportunities,
    risks,
    entryPlan,
    scalePlan,
    executiveSummary,
    finalConclusion,
  };
}