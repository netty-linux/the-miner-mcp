import type { StrategicIntelligenceReport } from "./intelligence-engine.js";
import type { MiningDataInput } from "./report-synthesizer.js";
import { buildEmbedLinks } from "./visualizations.js";

function dimLine(label: string, value: number | null): string {
  return `| ${label} | ${value !== null ? `${value}/100` : "N/D — fonte indisponível"} |`;
}

function listItems(items: string[]): string {
  return items.map((i, n) => `${n + 1}. ${i}`).join("\n");
}

export function buildStrategicIntelligenceMarkdown(
  intel: StrategicIntelligenceReport,
  input: MiningDataInput,
): string {
  const label = input.productName ?? input.niche ?? "Oferta";
  const country = input.country ?? "BR";
  const embeds = buildEmbedLinks(label, country);

  const sourceRows = intel.confidence.sourcesUsed
    .map((s) => {
      const icon = s.status === "ok" ? "✅" : s.status === "partial" ? "🟡" : s.status === "failed" ? "❌" : "⚪";
      return `| ${icon} ${s.name} | ${s.status} | ${s.detail ?? "—"} |`;
    })
    .join("\n");

  const whyBullets = [
    ...intel.recommendationReasons.map((r) => `✓ ${r}`),
    ...intel.strengths.slice(0, 4).map((s) => `✓ ${s}`),
  ].join("\n");

  return [
    `# ⛏️ THE MINER MCP — Inteligência Estratégica`,
    `## ${label} · ${country}`,
    "",
    "> **Missão:** Não encontrar produtos — encontrar oportunidades REAIS de lucro.",
    "> **Pergunta-chave:** Se investir hoje, qual a chance estatística de vender?",
    "",
    "---",
    "",
    "## Resumo Executivo",
    "",
    intel.executiveSummary,
    "",
    "## Opportunity Score",
    "",
    `### **${intel.opportunityScore}/100**`,
    `${intel.opportunityTier}`,
    "",
    "### Por quê?",
    "",
    whyBullets || "_Evidências insuficientes — veja limitações abaixo._",
    "",
    "## Confidence Score",
    "",
    `### **${intel.confidence.score}/100** — ${intel.confidence.label}`,
    "",
    intel.confidence.disclaimer,
    "",
    "### Fontes",
    "",
    "| Fonte | Status | Detalhe |",
    "|-------|--------|---------|",
    sourceRows,
    "",
    intel.confidence.failedSources.length > 0
      ? `**Fontes que falharam:** ${intel.confidence.failedSources.join("; ")}`
      : "",
    intel.confidence.notIntegratedSources.length > 0
      ? `**Não integradas (ainda):** ${intel.confidence.notIntegratedSources.join(", ")}`
      : "",
    "",
    "## Dimensões de Score",
    "",
    "| Dimensão | Score |",
    "|----------|-------|",
    dimLine("Trend Score", intel.dimensions.trendScore),
    dimLine("Competition Score", intel.dimensions.competitionScore),
    dimLine("Creative Saturation (inverso)", intel.dimensions.creativeSaturation),
    dimLine("SEO Opportunity", intel.dimensions.seoOpportunity),
    dimLine("Meta Competition (inverso)", intel.dimensions.metaCompetition),
    dimLine("TikTok Growth", intel.dimensions.tiktokGrowth),
    dimLine("YouTube Demand", intel.dimensions.youtubeDemand),
    dimLine("Landing Quality", intel.dimensions.landingQuality),
    dimLine("Market Maturity", intel.dimensions.marketMaturity),
    dimLine("Escalabilidade", intel.dimensions.scalability),
    "",
    "## Saturação",
    "",
    `| Métrica | Valor |`,
    `|---------|-------|`,
    `| Anunciantes ativos | ${intel.saturation.activeAdvertisers || "N/D"} |`,
    `| Ads ativos (Meta) | ${intel.saturation.activeAds} |`,
    `| Creative Fatigue | **${intel.saturation.creativeFatigue}** |`,
    `| Competição média | ${intel.saturation.averageCompetitionLevel} |`,
    "",
    intel.saturation.repeatedCopySignals.length > 0
      ? "### Sinais de copy repetida\n\n" + intel.saturation.repeatedCopySignals.map((s) => `- ${s}`).join("\n")
      : "",
    "",
    "## Análise Meta",
    "",
    input.facebookAds
      ? `- Ads ativos: ${input.facebookAds.activeAds ?? 0}\n- Total: ${input.facebookAds.totalAds ?? 0}`
      : "❌ Dados Meta indisponíveis — Confidence reduzido. Verifique FACEBOOK_ACCESS_TOKEN.",
    "",
    "## Análise TikTok",
    "",
    input.tiktokCreatives
      ? `- Criativos: ${input.tiktokCreatives.totalFound ?? 0}\n- Hooks: ${input.tiktokCreatives.topHooks?.slice(0, 2).join(" | ") ?? "—"}`
      : "❌ TikTok Creative Center indisponível ou bloqueado",
    "",
    "## Análise Google",
    "",
    input.googleSeo
      ? `- Volume: ${input.googleSeo.searchVolume}\n- Competição: ${input.googleSeo.competition}\n- Keywords: ${input.googleSeo.relatedKeywords?.slice(0, 3).join(", ") ?? "—"}`
      : "❌ SEO/Google Trends indisponível",
    "",
    "## Análise YouTube",
    "",
    input.youtubeTrends
      ? `- Vídeos: ${input.youtubeTrends.totalVideos ?? 0}\n- Views médias: ${input.youtubeTrends.avgViews ?? "N/D"}`
      : "❌ YouTube indisponível",
    "",
    "## Gaps (Diferenciação)",
    "",
    "### O que TODOS fazem",
    "",
    listItems(intel.gaps.whatEveryoneDoes),
    "",
    "### O que NINGUÉM faz (sua oportunidade)",
    "",
    listItems(intel.gaps.differentiationOpportunities),
    "",
    "## Estratégia Recomendada",
    "",
    `| Item | Recomendação |`,
    `|------|--------------|`,
    `| Público | ${intel.strategy.recommendedAudience} |`,
    `| Hook | ${intel.strategy.recommendedHook} |`,
    `| Headline | ${intel.strategy.recommendedHeadline} |`,
    `| Oferta | ${intel.strategy.suggestedOffer} |`,
    `| Preço sugerido | ${intel.strategy.suggestedPriceRange} |`,
    `| Budget teste | ${intel.strategy.idealTestBudget} |`,
    `| CPA ideal | ${intel.strategy.idealCpaRange} |`,
    `| Criativo | ${intel.strategy.recommendedCreativeFormat} |`,
    `| Landing | ${intel.strategy.landingRecommendation} |`,
    "",
    "## Risco",
    "",
    `| | |`,
    `|---|---|`,
    `| **Maior risco** | ${intel.risk.biggestRisk} |`,
    `| **Maior vantagem** | ${intel.risk.biggestAdvantage} |`,
    `| **Maior dificuldade** | ${intel.risk.biggestDifficulty} |`,
    `| **Prob. escala** | ${intel.risk.scaleProbability} |`,
    "",
    "## Pontos Fortes",
    "",
    intel.strengths.length > 0 ? listItems(intel.strengths) : "_Nenhum forte detectado com dados atuais_",
    "",
    "## Pontos Fracos",
    "",
    listItems(intel.weaknesses),
    "",
    "## Plano de Entrada",
    "",
    listItems(intel.entryPlan),
    "",
    "## Plano de Escala",
    "",
    listItems(intel.scalePlan),
    "",
    "## Conclusão Final",
    "",
    `### Recomendação: **${intel.recommendation}**`,
    "",
    intel.finalConclusion,
    "",
    "## Links (pesquisa manual)",
    "",
    `- [Facebook Ad Library](${embeds.facebookAdLibrary})`,
    `- [Google Trends](${embeds.googleTrends})`,
    `- [YouTube](${embeds.youtubeSearch})`,
    "",
    `_${intel.baseReport.dataQuality.disclaimer}_`,
  ]
    .filter(Boolean)
    .join("\n");
}