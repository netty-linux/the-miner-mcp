import type { MiningDataInput, MiningReport } from "./report-synthesizer.js";

export interface ChartBar {
  label: string;
  value: number;
  color?: string;
}

export interface ChannelStatus {
  name: string;
  label: string;
  active: boolean;
  metric?: string;
  signal?: "high" | "moderate" | "low" | "unavailable";
}

export interface EmbedLinks {
  facebookAdLibrary: string;
  googleTrends: string;
  youtubeSearch: string;
  redditSearch?: string;
}

const THEME = {
  bg: "#0f172a",
  card: "#1e293b",
  text: "#e2e8f0",
  muted: "#94a3b8",
  accent: "#f59e0b",
  accent2: "#38bdf8",
  success: "#22c55e",
  warning: "#eab308",
  danger: "#ef4444",
  grid: "#334155",
};

const CHANNEL_COLORS: Record<string, string> = {
  trendingProducts: "#a78bfa",
  facebookAds: "#3b82f6",
  tiktok: "#ec4899",
  youtube: "#ef4444",
  seo: "#22c55e",
  landingPage: "#f59e0b",
  competitor: "#38bdf8",
};

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function formatNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function scoreColor(score: number): string {
  if (score >= 70) return THEME.success;
  if (score >= 45) return THEME.warning;
  return THEME.danger;
}

function signalEmoji(signal?: ChannelStatus["signal"]): string {
  switch (signal) {
    case "high":
      return "🟢";
    case "moderate":
      return "🟡";
    case "low":
      return "🟠";
    default:
      return "⚪";
  }
}

export function svgToBase64(svg: string): string {
  return Buffer.from(svg, "utf-8").toString("base64");
}

export function generateScoreGaugeSvg(score: number, label = "Opportunity Score"): string {
  const clamped = Math.max(0, Math.min(100, score));
  const radius = 72;
  const circumference = 2 * Math.PI * radius;
  const progress = (clamped / 100) * circumference;
  const color = scoreColor(clamped);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="220" viewBox="0 0 320 220">
  <rect width="320" height="220" rx="16" fill="${THEME.bg}"/>
  <text x="160" y="34" text-anchor="middle" fill="${THEME.muted}" font-family="system-ui,sans-serif" font-size="13">${escapeXml(label)}</text>
  <circle cx="160" cy="118" r="${radius}" fill="none" stroke="${THEME.grid}" stroke-width="14"/>
  <circle cx="160" cy="118" r="${radius}" fill="none" stroke="${color}" stroke-width="14"
    stroke-dasharray="${progress.toFixed(2)} ${(circumference - progress).toFixed(2)}"
    stroke-linecap="round" transform="rotate(-90 160 118)"/>
  <text x="160" y="126" text-anchor="middle" fill="${THEME.text}" font-family="system-ui,sans-serif" font-size="42" font-weight="700">${clamped}</text>
  <text x="160" y="150" text-anchor="middle" fill="${THEME.muted}" font-family="system-ui,sans-serif" font-size="14">/ 100</text>
</svg>`;
}

export function generateBarChartSvg(title: string, bars: ChartBar[], width = 640, height = 360): string {
  if (bars.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect width="${width}" height="${height}" rx="16" fill="${THEME.bg}"/>
      <text x="${width / 2}" y="${height / 2}" text-anchor="middle" fill="${THEME.muted}" font-family="system-ui,sans-serif" font-size="14">No data</text>
    </svg>`;
  }

  const padding = { top: 48, right: 24, bottom: 72, left: 24 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const maxValue = Math.max(...bars.map((b) => b.value), 1);
  const barGap = 16;
  const barW = Math.min(72, (chartW - barGap * (bars.length - 1)) / bars.length);

  const barsSvg = bars
    .map((bar, i) => {
      const barH = (bar.value / maxValue) * chartH;
      const x = padding.left + i * (barW + barGap);
      const y = padding.top + chartH - barH;
      const color = bar.color ?? THEME.accent;
      return `
        <rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="6" fill="${color}"/>
        <text x="${x + barW / 2}" y="${y - 8}" text-anchor="middle" fill="${THEME.text}" font-family="system-ui,sans-serif" font-size="12" font-weight="600">${bar.value}</text>
        <text x="${x + barW / 2}" y="${padding.top + chartH + 22}" text-anchor="middle" fill="${THEME.muted}" font-family="system-ui,sans-serif" font-size="11">${escapeXml(truncate(bar.label, 12))}</text>
      `;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" rx="16" fill="${THEME.bg}"/>
  <text x="${padding.left}" y="30" fill="${THEME.text}" font-family="system-ui,sans-serif" font-size="16" font-weight="600">${escapeXml(title)}</text>
  <line x1="${padding.left}" y1="${padding.top + chartH}" x2="${width - padding.right}" y2="${padding.top + chartH}" stroke="${THEME.grid}" stroke-width="1"/>
  ${barsSvg}
</svg>`;
}

export function generateChannelStatusSvg(channels: ChannelStatus[]): string {
  const rowH = 44;
  const height = 56 + channels.length * rowH;
  const width = 640;

  const rows = channels
    .map((ch, i) => {
      const y = 56 + i * rowH;
      const statusColor =
        ch.signal === "high"
          ? THEME.success
          : ch.signal === "moderate"
            ? THEME.warning
            : ch.signal === "low"
              ? THEME.accent
              : THEME.grid;
      const statusText = ch.active ? (ch.metric ?? "Active") : "No data";
      return `
        <rect x="20" y="${y}" width="${width - 40}" height="${rowH - 8}" rx="10" fill="${THEME.card}"/>
        <circle cx="44" cy="${y + 18}" r="6" fill="${statusColor}"/>
        <text x="64" y="${y + 22}" fill="${THEME.text}" font-family="system-ui,sans-serif" font-size="13" font-weight="600">${escapeXml(ch.label)}</text>
        <text x="${width - 28}" y="${y + 22}" text-anchor="end" fill="${ch.active ? THEME.text : THEME.muted}" font-family="system-ui,sans-serif" font-size="12">${escapeXml(statusText)}</text>
      `;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" rx="16" fill="${THEME.bg}"/>
  <text x="24" y="34" fill="${THEME.text}" font-family="system-ui,sans-serif" font-size="16" font-weight="600">Channel Evidence</text>
  ${rows}
</svg>`;
}

export function buildScoreBreakdownBars(breakdown: Record<string, number>): ChartBar[] {
  const labels: Record<string, string> = {
    trendingProducts: "Trending",
    facebookAds: "Facebook",
    tiktok: "TikTok",
    youtube: "YouTube",
    seo: "SEO",
    landingPage: "Landing",
    competitor: "Competitor",
  };

  return Object.entries(breakdown).map(([key, value]) => ({
    label: labels[key] ?? key,
    value,
    color: CHANNEL_COLORS[key] ?? THEME.accent,
  }));
}

export function buildChannelStatuses(input: MiningDataInput): ChannelStatus[] {
  const channels: ChannelStatus[] = [];

  const trendingCount = input.trendingProducts?.length ?? 0;
  channels.push({
    name: "trending",
    label: "Trending Products",
    active: trendingCount >= 2,
    metric: trendingCount > 0 ? `${trendingCount} products` : undefined,
    signal: trendingCount >= 3 ? "high" : trendingCount >= 1 ? "low" : "unavailable",
  });

  const fbAds = input.facebookAds?.activeAds ?? input.facebookAds?.totalAds ?? 0;
  channels.push({
    name: "facebook",
    label: "Facebook Ads",
    active: fbAds >= 3,
    metric: fbAds > 0 ? `${fbAds} active ads` : undefined,
    signal: fbAds >= 10 ? "high" : fbAds >= 5 ? "moderate" : fbAds >= 1 ? "low" : "unavailable",
  });

  const tiktok = input.tiktokCreatives?.totalFound ?? 0;
  channels.push({
    name: "tiktok",
    label: "TikTok Creatives",
    active: tiktok >= 2,
    metric: tiktok > 0 ? `${tiktok} creatives` : undefined,
    signal: tiktok >= 5 ? "high" : tiktok >= 2 ? "moderate" : tiktok >= 1 ? "low" : "unavailable",
  });

  const ytViews = input.youtubeTrends?.avgViews ?? 0;
  channels.push({
    name: "youtube",
    label: "YouTube Trends",
    active: ytViews > 50_000,
    metric: ytViews > 0 ? `${formatNumber(ytViews)} avg views` : undefined,
    signal: ytViews > 500_000 ? "high" : ytViews > 100_000 ? "moderate" : ytViews > 0 ? "low" : "unavailable",
  });

  const seoVol = input.googleSeo?.searchVolume;
  channels.push({
    name: "seo",
    label: "Google SEO",
    active: Boolean(seoVol && seoVol !== "unknown"),
    metric: seoVol && seoVol !== "unknown" ? `volume: ${seoVol}` : undefined,
    signal:
      seoVol === "high"
        ? "high"
        : seoVol === "medium"
          ? "moderate"
          : seoVol === "low"
            ? "low"
            : "unavailable",
  });

  const triggers = input.landingPage?.triggers?.length ?? 0;
  channels.push({
    name: "landing",
    label: "Landing Page",
    active: triggers >= 2,
    metric: triggers > 0 ? `${triggers} triggers` : undefined,
    signal: triggers >= 3 ? "high" : triggers >= 1 ? "low" : "unavailable",
  });

  const funnel = input.competitorData?.funnelSteps?.length ?? 0;
  channels.push({
    name: "competitor",
    label: "Competitor Data",
    active: funnel >= 2,
    metric: funnel > 0 ? `${funnel} funnel steps` : undefined,
    signal: funnel >= 3 ? "high" : funnel >= 1 ? "low" : "unavailable",
  });

  return channels;
}

export function buildMermaidScoreBreakdown(breakdown: Record<string, number>): string {
  const entries = Object.entries(breakdown).filter(([, v]) => v > 0);
  if (entries.length === 0) return "";

  const labels: Record<string, string> = {
    trendingProducts: "Trending",
    facebookAds: "Facebook",
    tiktok: "TikTok",
    youtube: "YouTube",
    seo: "SEO",
    landingPage: "Landing",
    competitor: "Competitor",
  };

  const lines = entries.map(([key, value]) => `    "${labels[key] ?? key}" : ${value}`);
  return ["```mermaid", "pie showData", "    title Score Breakdown", ...lines, "```"].join("\n");
}

export function buildMermaidChannelFlow(sources: string[]): string {
  if (sources.length === 0) return "";

  const nodeLabels: Record<string, string> = {
    trending_products: "Trending",
    facebook_ads: "Facebook",
    tiktok_creatives: "TikTok",
    youtube_trends: "YouTube",
    google_seo: "SEO",
    landing_page: "Landing",
    competitor_data: "Competitor",
  };

  const nodes = sources.map((s, i) => `    S${i}["${nodeLabels[s] ?? s}"]`);
  const links = sources.slice(0, -1).map((_, i) => `    S${i} --> S${i + 1}`);
  const last = `    S${sources.length - 1} --> R["Mining Report"]`;

  return ["```mermaid", "flowchart LR", ...nodes, ...links, last, "```"].join("\n");
}

export function buildEmbedLinks(query: string, country = "BR"): EmbedLinks {
  const encoded = encodeURIComponent(query);
  const countryUpper = country.toUpperCase();

  return {
    facebookAdLibrary: `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${countryUpper}&q=${encoded}&search_type=keyword_unordered&media_type=all`,
    googleTrends: `https://trends.google.com/trends/explore?geo=${countryUpper}&q=${encoded}`,
    youtubeSearch: `https://www.youtube.com/results?search_query=${encoded}`,
    redditSearch: `https://www.reddit.com/search/?q=${encoded}`,
  };
}

export function buildMiningReportVisualMarkdown(
  report: MiningReport,
  input: MiningDataInput,
  sources: string[],
): string {
  const productLabel = input.productName ?? input.niche ?? "Offer";
  const countryLabel = input.country ?? "Global";
  const channels = buildChannelStatuses(input);
  const embeds = buildEmbedLinks(productLabel, countryLabel);
  const confidence = report.dataQuality.confidence.toUpperCase();

  const channelTable = channels
    .map(
      (ch) =>
        `| ${signalEmoji(ch.signal)} ${ch.label} | ${ch.active ? "✅ Evidência" : "❌ Sem dados"} | ${ch.metric ?? "—"} |`,
    )
    .join("\n");

  const recommendations = report.recommendations.map((r, i) => `${i + 1}. ${r}`).join("\n");

  const mermaidScore = buildMermaidScoreBreakdown(report.scoreBreakdown);
  const mermaidFlow = buildMermaidChannelFlow(sources);

  return [
    `# ⛏️ Relatório Visual — ${productLabel}`,
    "",
    `> **Mercado:** ${countryLabel} · **Confiança:** ${confidence} · **Canais com evidência:** ${report.dataQuality.channelsWithEvidence}/${report.dataQuality.channelsTotal}`,
    "",
    "## Score de Oportunidade",
    "",
    `**${report.opportunityScore}/100** — ${report.relevantMetrics.scaleLevel}`,
    "",
    report.executiveSummary,
    "",
    mermaidScore ? "## Distribuição do Score\n\n" + mermaidScore : "",
    "",
    "## Status dos Canais",
    "",
    "| Canal | Status | Métrica |",
    "|-------|--------|---------|",
    channelTable,
    "",
    mermaidFlow ? "## Fluxo de Dados Coletados\n\n" + mermaidFlow : "",
    "",
    "## Análise de Escala",
    "",
    report.scalePotentialAnalysis,
    "",
    "## Recomendações",
    "",
    recommendations,
    "",
    "## Links & Embeds (pesquisa manual)",
    "",
    `- 📘 [Facebook Ad Library — ${productLabel}](${embeds.facebookAdLibrary})`,
    `- 📈 [Google Trends — ${productLabel}](${embeds.googleTrends})`,
    `- ▶️ [YouTube Search — ${productLabel}](${embeds.youtubeSearch})`,
    embeds.redditSearch ? `- 💬 [Reddit Search — ${productLabel}](${embeds.redditSearch})` : "",
    "",
    `_${report.dataQuality.disclaimer}_`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildYoutubeVisualMarkdown(data: {
  keyword: string;
  country: string;
  totalVideos: number;
  avgViews: number | null;
  scalingSignal: string;
  topTitles: string[];
  topVideos: Array<{ videoId: string; title: string; viewCount: number | null; channelTitle: string }>;
}): string {
  const embeds = buildEmbedLinks(data.keyword, data.country);
  const topList = data.topVideos
    .slice(0, 5)
    .map((v, i) => {
      const views = v.viewCount ? formatNumber(v.viewCount) : "N/A";
      return `${i + 1}. [**${truncate(v.title, 60)}**](https://www.youtube.com/watch?v=${v.videoId}) — ${views} views · ${v.channelTitle}`;
    })
    .join("\n");

  const viewSlices = data.topVideos
    .filter((v) => v.viewCount && v.viewCount > 0)
    .slice(0, 5)
    .map((v, i) => `    "V${i + 1}" : ${v.viewCount}`)
    .join("\n");

  const mermaid =
    viewSlices.length > 0
      ? ["```mermaid", "pie showData", "    title Top Videos by Views", viewSlices, "```"].join("\n")
      : "";

  return [
    `# ▶️ YouTube Trends — ${data.keyword}`,
    "",
    `**${data.scalingSignal}**`,
    "",
    `| Métrica | Valor |`,
    `|---------|-------|`,
    `| Vídeos analisados | ${data.totalVideos} |`,
    `| Média de views | ${data.avgViews ? formatNumber(data.avgViews) : "N/A"} |`,
    "",
    "## Top Vídeos",
    "",
    topList || "_Nenhum vídeo encontrado_",
    "",
    mermaid ? "## Gráfico de Views\n\n" + mermaid : "",
    "",
    `- [YouTube Search](${embeds.youtubeSearch})`,
    `- [Google Trends](${embeds.googleTrends})`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildFacebookVisualMarkdown(data: {
  searchTerm: string;
  country: string;
  totalAds: number;
  activeAds: number;
  uniqueAdvertisers: number;
  scalingSignal: string;
  advertisers: string[];
}): string {
  const embeds = buildEmbedLinks(data.searchTerm, data.country);
  const advertiserList = data.advertisers.slice(0, 8).map((a, i) => `${i + 1}. ${a}`).join("\n");

  const mermaid =
    data.totalAds > 0
      ? [
          "```mermaid",
          "pie showData",
          "    title Ad Distribution",
          `    "Active Ads" : ${data.activeAds}`,
          `    "Inactive/Other" : ${Math.max(0, data.totalAds - data.activeAds)}`,
          "```",
        ].join("\n")
      : "";

  return [
    `# 📘 Facebook Ad Library — ${data.searchTerm}`,
    "",
    `**${data.scalingSignal}**`,
    "",
    `| Métrica | Valor |`,
    `|---------|-------|`,
    `| Total de anúncios | ${data.totalAds} |`,
    `| Anúncios ativos | ${data.activeAds} |`,
    `| Anunciantes únicos | ${data.uniqueAdvertisers} |`,
    "",
    data.advertisers.length > 0 ? "## Top Anunciantes\n\n" + advertiserList : "",
    "",
    mermaid ? "## Distribuição de Ads\n\n" + mermaid : "",
    "",
    `- [Abrir Ad Library](${embeds.facebookAdLibrary})`,
    `- [Google Trends](${embeds.googleTrends})`,
  ]
    .filter(Boolean)
    .join("\n");
}

export interface ReportVisualAssets {
  scoreGauge: string;
  scoreBreakdown: string;
  channelStatus: string;
}

export function buildMiningReportCharts(
  report: MiningReport,
  input: MiningDataInput,
): ReportVisualAssets {
  return {
    scoreGauge: generateScoreGaugeSvg(report.opportunityScore),
    scoreBreakdown: generateBarChartSvg("Score Breakdown", buildScoreBreakdownBars(report.scoreBreakdown)),
    channelStatus: generateChannelStatusSvg(buildChannelStatuses(input)),
  };
}

export function generateFunnelStepsSvg(
  steps: Array<{ step: number; type: string; title: string }>,
): string {
  if (steps.length === 0) {
    return generateBarChartSvg("Funnel", [], 520, 200);
  }

  const stepW = Math.min(140, Math.floor(520 / steps.length) - 12);
  const totalW = steps.length * (stepW + 12) + 40;
  const height = 200;

  const nodes = steps
    .map((s, i) => {
      const x = 20 + i * (stepW + 12);
      const colors: Record<string, string> = {
        landing: "#3b82f6",
        checkout: "#22c55e",
        upsell: "#f59e0b",
        pricing: "#a78bfa",
        opt_in: "#38bdf8",
        thank_you: "#94a3b8",
      };
      const color = colors[s.type] ?? THEME.accent;
      const arrow =
        i < steps.length - 1
          ? `<line x1="${x + stepW + 2}" y1="90" x2="${x + stepW + 10}" y2="90" stroke="${THEME.muted}" stroke-width="2" marker-end="url(#arrow)"/>`
          : "";
      return `
        <rect x="${x}" y="50" width="${stepW}" height="80" rx="10" fill="${THEME.card}" stroke="${color}" stroke-width="2"/>
        <text x="${x + stepW / 2}" y="72" text-anchor="middle" fill="${color}" font-family="system-ui,sans-serif" font-size="11" font-weight="600">Step ${s.step}</text>
        <text x="${x + stepW / 2}" y="92" text-anchor="middle" fill="${THEME.text}" font-family="system-ui,sans-serif" font-size="10">${escapeXml(truncate(s.type, 14))}</text>
        <text x="${x + stepW / 2}" y="112" text-anchor="middle" fill="${THEME.muted}" font-family="system-ui,sans-serif" font-size="9">${escapeXml(truncate(s.title, 18))}</text>
        ${arrow}
      `;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${height}" viewBox="0 0 ${totalW} ${height}">
  <defs><marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="${THEME.muted}"/></marker></defs>
  <rect width="${totalW}" height="${height}" rx="16" fill="${THEME.bg}"/>
  <text x="20" y="30" fill="${THEME.text}" font-family="system-ui,sans-serif" font-size="14" font-weight="600">Competitor Funnel</text>
  ${nodes}
</svg>`;
}

export function generateTriggerBarsSvg(triggers: string[], score: number): string {
  const bars = triggers.slice(0, 6).map((t, i) => ({
    label: `T${i + 1}`,
    value: 10 - i,
    color: CHANNEL_COLORS.landingPage ?? THEME.accent,
  }));

  if (bars.length === 0) {
    return generateScoreGaugeSvg(score, "Conversion Score");
  }

  return generateBarChartSvg(`Conversion Score ${score}/100 — Triggers`, bars, 520, 280);
}

function buildMermaidFunnel(steps: Array<{ step: number; type: string }>): string {
  if (steps.length === 0) return "";
  const nodes = steps.map((s) => `    S${s.step}["Step ${s.step}: ${s.type}"]`);
  const links = steps.slice(0, -1).map((s) => `    S${s.step} --> S${s.step + 1}`);
  return ["```mermaid", "flowchart LR", ...nodes, ...links, "```"].join("\n");
}

export function buildTrendingProductsVisualMarkdown(data: {
  niche: string;
  country: string;
  dataAvailability: string;
  totalTrendingProducts: number;
  trendingProducts: Array<{ name: string; trendScore: number; source: string; estimatedMomentum: string }>;
  keywordIdeas: Array<{ keyword: string; rank: number }>;
  topPick: { name: string; trendScore: number; source: string } | null;
}): string {
  const embeds = buildEmbedLinks(data.niche, data.country);
  const productList = data.trendingProducts
    .slice(0, 8)
    .map((p, i) => `| ${i + 1} | ${truncate(p.name, 50)} | ${p.trendScore} | ${p.estimatedMomentum} | ${p.source} |`)
    .join("\n");

  const keywordList = data.keywordIdeas
    .slice(0, 6)
    .map((k) => `${k.rank}. ${k.keyword}`)
    .join("\n");

  const scoreSlices = data.trendingProducts
    .slice(0, 5)
    .map((p, i) => `    "P${i + 1}" : ${p.trendScore}`)
    .join("\n");

  const mermaid =
    scoreSlices.length > 0
      ? ["```mermaid", "pie showData", "    title Trend Scores (Top 5)", scoreSlices, "```"].join("\n")
      : "";

  return [
    `# 🔥 Trending Products — ${data.niche}`,
    "",
    `> **País:** ${data.country} · **Disponibilidade:** ${data.dataAvailability} · **Produtos:** ${data.totalTrendingProducts}`,
    "",
    data.topPick
      ? `**Top Pick:** ${data.topPick.name} (score ${data.topPick.trendScore}, fonte: ${data.topPick.source})`
      : "_Nenhum sinal de escala verificado encontrado_",
    "",
    data.trendingProducts.length > 0 ? "## Produtos em Alta\n\n| # | Produto | Score | Momentum | Fonte |\n|---|---------|-------|----------|-------|\n" + productList : "",
    "",
    mermaid ? "## Distribuição de Scores\n\n" + mermaid : "",
    "",
    data.keywordIdeas.length > 0 ? "## Ideias de Keywords (autocomplete)\n\n" + keywordList : "",
    "",
    "## Links & Embeds",
    "",
    `- [Google Trends — ${data.niche}](${embeds.googleTrends})`,
    `- [Reddit Search](${embeds.redditSearch})`,
    `- [YouTube Search](${embeds.youtubeSearch})`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildTiktokVisualMarkdown(data: {
  keyword: string;
  country: string;
  totalFound: number;
  avgLikes: number | null;
  scalingSignal: string;
  topHooks: string[];
  popularFormats: string[];
}): string {
  const embeds = buildEmbedLinks(data.keyword, data.country);
  const hookList = data.topHooks.map((h, i) => `${i + 1}. "${truncate(h, 80)}"`).join("\n");
  const formatList = data.popularFormats.map((f) => `- ${f}`).join("\n");

  const formatSlices = data.popularFormats
    .slice(0, 5)
    .map((f) => `    "${f}" : 1`)
    .join("\n");

  const mermaid =
    formatSlices.length > 0
      ? ["```mermaid", "pie showData", "    title Creative Formats", formatSlices, "```"].join("\n")
      : "";

  return [
    `# 🎵 TikTok Creatives — ${data.keyword}`,
    "",
    `**${data.scalingSignal}**`,
    "",
    `| Métrica | Valor |`,
    `|---------|-------|`,
    `| Criativos encontrados | ${data.totalFound} |`,
    `| Média de likes | ${data.avgLikes ?? "N/A"} |`,
    "",
    data.topHooks.length > 0 ? "## Top Hooks\n\n" + hookList : "",
    "",
    data.popularFormats.length > 0 ? "## Formatos Populares\n\n" + formatList : "",
    "",
    mermaid ? "## Formatos (gráfico)\n\n" + mermaid : "",
    "",
    `- [TikTok Creative Center](https://ads.tiktok.com/business/creativecenter/inspiration/topads/pc/en?region=${data.country}&keyword=${encodeURIComponent(data.keyword)})`,
    `- [Google Trends](${embeds.googleTrends})`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildGoogleSeoVisualMarkdown(data: {
  keyword: string;
  country: string;
  searchVolume: string;
  competition: string;
  seoOpportunity: string;
  risingKeywords: Array<{ keyword: string; relevance?: number; value?: number }>;
  topKeywords: Array<{ keyword: string; relevance?: number; value?: number }>;
  regionalInterest: Array<{ region: string; score: number }>;
  peopleAlsoAsk: string[];
}): string {
  const embeds = buildEmbedLinks(data.keyword, data.country);

  const risingList = data.risingKeywords
    .slice(0, 6)
    .map((k, i) => {
      const pct = k.value ?? k.relevance;
      return `${i + 1}. ${k.keyword}${pct ? ` (+${pct}%)` : ""}`;
    })
    .join("\n");

  const regionalList = data.regionalInterest
    .slice(0, 5)
    .map((r) => `| ${r.region} | ${r.score} |`)
    .join("\n");

  const paaList = data.peopleAlsoAsk.slice(0, 4).map((q, i) => `${i + 1}. ${q}`).join("\n");

  const volScore = data.searchVolume === "high" ? 80 : data.searchVolume === "medium" ? 50 : 25;
  const compScore = data.competition === "low" ? 80 : data.competition === "medium" ? 50 : 25;

  const mermaid = [
    "```mermaid",
    "pie showData",
    "    title SEO Signals",
    `    "Search Volume (${data.searchVolume})" : ${volScore}`,
    `    "Competition (${data.competition})" : ${compScore}`,
    "```",
  ].join("\n");

  return [
    `# 📈 Google SEO — ${data.keyword}`,
    "",
    `> **País:** ${data.country} · **Oportunidade:** ${data.seoOpportunity}`,
    "",
    `| Sinal | Valor |`,
    `|-------|-------|`,
    `| Volume de busca | ${data.searchVolume} |`,
    `| Competição | ${data.competition} |`,
    "",
    mermaid ? "## Sinais SEO\n\n" + mermaid : "",
    "",
    data.risingKeywords.length > 0 ? "## Keywords em Alta\n\n" + risingList : "",
    "",
    data.regionalInterest.length > 0
      ? "## Interesse Regional\n\n| Região | Score |\n|--------|-------|\n" + regionalList
      : "",
    "",
    data.peopleAlsoAsk.length > 0 ? "## People Also Ask\n\n" + paaList : "",
    "",
    `- [Google Trends — ${data.keyword}](${embeds.googleTrends})`,
    `- [YouTube Search](${embeds.youtubeSearch})`,
    `- [Reddit Search](${embeds.redditSearch})`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildLandingPageVisualMarkdown(data: {
  url: string;
  title: string;
  funnelType: string;
  conversionScore: number;
  psychologicalTriggers: string[];
  ctaButtons: string[];
  offerAnalysis: {
    pricesFound: string[];
    hasDiscount: boolean;
    hasGuarantee: boolean;
    hasUrgency: boolean;
    hasScarcity: boolean;
    hasFreeShipping: boolean;
  };
  copyStructure: {
    hasSocialProof: boolean;
    hasTestimonials: boolean;
    hasFAQ: boolean;
    copyLength: string;
  };
}): string {
  const offerFlags = [
    ["Desconto", data.offerAnalysis.hasDiscount],
    ["Garantia", data.offerAnalysis.hasGuarantee],
    ["Urgência", data.offerAnalysis.hasUrgency],
    ["Escassez", data.offerAnalysis.hasScarcity],
    ["Frete grátis", data.offerAnalysis.hasFreeShipping],
    ["Social proof", data.copyStructure.hasSocialProof],
    ["Depoimentos", data.copyStructure.hasTestimonials],
    ["FAQ", data.copyStructure.hasFAQ],
  ]
    .map(([label, active]) => `| ${label} | ${active ? "✅" : "❌"} |`)
    .join("\n");

  const triggerList = data.psychologicalTriggers.map((t, i) => `${i + 1}. ${t}`).join("\n");
  const ctaList = data.ctaButtons.slice(0, 5).map((c, i) => `${i + 1}. "${truncate(c, 50)}"`).join("\n");

  const mermaid =
    data.psychologicalTriggers.length > 0
      ? [
          "```mermaid",
          "mindmap",
          "  root((Landing Page))",
          ...data.psychologicalTriggers.slice(0, 5).map((t) => `    ${t.split("—")[0]?.trim() ?? t}`),
          "```",
        ].join("\n")
      : "";

  return [
    `# 🎯 Landing Page Analysis`,
    "",
    `**[${truncate(data.title, 60)}](${data.url})**`,
    "",
    `| Métrica | Valor |`,
    `|---------|-------|`,
    `| Conversion Score | ${data.conversionScore}/100 |`,
    `| Tipo de funil | ${data.funnelType} |`,
    `| Tamanho do copy | ${data.copyStructure.copyLength} |`,
    `| Preços encontrados | ${data.offerAnalysis.pricesFound.join(", ") || "—"} |`,
    "",
    "## Elementos de Conversão",
    "",
    "| Elemento | Ativo |",
    "|----------|-------|",
    offerFlags,
    "",
    data.psychologicalTriggers.length > 0 ? "## Gatilhos Psicológicos\n\n" + triggerList : "",
    "",
    mermaid ? "## Mapa de Gatilhos\n\n" + mermaid : "",
    "",
    data.ctaButtons.length > 0 ? "## CTAs\n\n" + ctaList : "",
    "",
    `- [Abrir página](${data.url})`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildCompetitorVisualMarkdown(data: {
  competitorUrl: string;
  depth: string;
  funnelSteps: Array<{ step: number; url: string; title: string; type: string; keyElements: string[] }>;
  pricing: string[];
  psychologicalTriggers: string[];
  platform: string;
  competitiveInsights: string[];
}): string {
  const stepTable = data.funnelSteps
    .map((s) => `| ${s.step} | ${s.type} | [${truncate(s.title, 40)}](${s.url}) | ${s.keyElements.slice(0, 2).join(", ") || "—"} |`)
    .join("\n");

  const insightList = data.competitiveInsights.map((i, n) => `${n + 1}. ${i}`).join("\n");
  const triggerList = data.psychologicalTriggers.slice(0, 5).map((t, i) => `${i + 1}. ${t}`).join("\n");
  const mermaid = buildMermaidFunnel(data.funnelSteps);

  return [
    `# 🕵️ Competitor Analysis`,
    "",
    `**URL:** [${truncate(data.competitorUrl, 60)}](${data.competitorUrl})`,
    "",
    `| Métrica | Valor |`,
    `|---------|-------|`,
    `| Profundidade | ${data.depth} |`,
    `| Passos do funil | ${data.funnelSteps.length} |`,
    `| Plataforma | ${data.platform} |`,
    `| Preços | ${data.pricing.join(", ") || "—"} |`,
    "",
    "## Funil do Competidor",
    "",
    "| Step | Tipo | Página | Elementos |",
    "|------|------|--------|-----------|",
    stepTable,
    "",
    mermaid ? "## Fluxo Visual\n\n" + mermaid : "",
    "",
    data.psychologicalTriggers.length > 0 ? "## Gatilhos Detectados\n\n" + triggerList : "",
    "",
    "## Insights Competitivos",
    "",
    insightList,
    "",
    `- [Abrir competidor](${data.competitorUrl})`,
  ]
    .filter(Boolean)
    .join("\n");
}