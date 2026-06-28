import { z } from "zod";
import { fetchText } from "../lib/http.js";
import { buildSourceStatus, type SourceStatus } from "../lib/data-availability.js";
import {
  getSubredditHotPosts,
  getSubredditsForNiche,
  isRedditApiConfigured,
} from "../lib/reddit-client.js";
import { logger } from "../lib/logger.js";
import { toolSuccessResult } from "../lib/errors.js";

export const mineTrendingProductsSchema = z.object({
  niche: z.string().optional().describe("Product niche or category (e.g. fitness, beauty, pets)"),
  country: z.string().optional().describe("ISO country code (e.g. US, BR, UK)"),
  time_period: z
    .enum(["last_7_days", "last_30_days", "last_90_days", "last_12_months"])
    .default("last_30_days")
    .describe("Time window for trend analysis"),
});

export type MineTrendingProductsInput = z.infer<typeof mineTrendingProductsSchema>;

/** Product with verified metrics from a live source (not rank-based heuristics). */
interface TrendingProduct {
  name: string;
  niche: string;
  trendScore: number;
  signals: string[];
  source: string;
  estimatedMomentum: "rising" | "stable" | "declining";
  rawMetrics: Record<string, number | string>;
}

/** Autocomplete suggestions — keyword ideas only, NOT scaling products. */
interface KeywordIdea {
  keyword: string;
  rank: number;
  source: "google_autocomplete";
}

function nicheMatches(query: string, niche: string): boolean {
  const q = query.toLowerCase();
  const n = niche.toLowerCase();
  if (n === "general") return true;
  const aliases: Record<string, string[]> = {
    fitness: ["fitness", "workout", "gym", "exercise", "protein", "weight", "sport"],
    beauty: ["beauty", "skin", "makeup", "cosmetic", "hair"],
    pets: ["pet", "dog", "cat", "puppy", "kitten"],
    tech: ["tech", "gadget", "phone", "laptop", "device", "ai"],
    health: ["health", "supplement", "vitamin", "wellness"],
    home: ["home", "kitchen", "furniture", "decor"],
  };
  const terms = aliases[n] ?? [n];
  return terms.some((t) => q.includes(t));
}

function parseTrafficVolume(formatted: string): number | null {
  if (!formatted) return null;
  const match = formatted.match(/([\d,]+)\+?/);
  if (!match) return null;
  const num = parseInt(match[1]!.replace(/,/g, ""), 10);
  if (Number.isNaN(num)) return null;
  if (num >= 500_000) return 95;
  if (num >= 200_000) return 85;
  if (num >= 100_000) return 75;
  if (num >= 50_000) return 65;
  if (num >= 20_000) return 55;
  if (num >= 10_000) return 45;
  return 35;
}

async function fetchGoogleTrendsDaily(geo: string, niche: string): Promise<{
  products: TrendingProduct[];
  status: SourceStatus;
}> {
  try {
    const text = await fetchText(
      `https://trends.google.com/trends/api/dailytrends?hl=en-US&tz=360&geo=${geo || "US"}&ns=15`,
      { browserLike: true, timeoutMs: 10_000 },
    );
    const cleaned = text.replace(/^\)\]\}',?\n?/, "");
    const data = JSON.parse(cleaned) as {
      default?: {
        trendingSearchesDays?: Array<{
          trendingSearches?: Array<{
            title: { query: string };
            formattedTraffic?: string;
          }>;
        }>;
      };
    };

    const searches = data.default?.trendingSearchesDays?.[0]?.trendingSearches ?? [];
    const products: TrendingProduct[] = [];

    for (const item of searches) {
      const query = item.title.query;
      if (!nicheMatches(query, niche)) continue;

      const trafficLabel = item.formattedTraffic ?? "";
      const trafficScore = parseTrafficVolume(trafficLabel);
      if (trafficScore === null) continue;

      products.push({
        name: query,
        niche,
        trendScore: trafficScore,
        signals: ["google daily trending search", `traffic: ${trafficLabel}`],
        source: "google_trends_daily",
        estimatedMomentum: trafficScore >= 75 ? "rising" : "stable",
        rawMetrics: { trafficLabel, trafficScore },
      });
    }

    return {
      products,
      status: buildSourceStatus(
        "google_trends_daily",
        products.length,
        products.length === 0 ? "No niche-matched daily trends or traffic data unavailable" : undefined,
      ),
    };
  } catch (error) {
    logger.warn("Google Trends daily fetch failed", { error: String(error) });
    return { products: [], status: buildSourceStatus("google_trends_daily", 0, String(error)) };
  }
}

async function fetchGoogleTrendsRss(geo: string, niche: string): Promise<{
  products: TrendingProduct[];
  status: SourceStatus;
}> {
  try {
    const xml = await fetchText(
      `https://trends.google.com/trending/rss?geo=${geo || "US"}`,
      { browserLike: true, timeoutMs: 10_000 },
    );

    const itemBlocks = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
    const products: TrendingProduct[] = [];

    for (const block of itemBlocks) {
      const title = block.match(/<title>(?:<!\[CDATA\[)?(.+?)(?:\]\]>)?<\/title>/)?.[1]?.trim() ?? "";
      if (!title || title === "Daily Search Trends") continue;
      if (!nicheMatches(title, niche)) continue;

      const trafficRaw =
        block.match(/<ht:approx_traffic>(?:<!\[CDATA\[)?(.+?)(?:\]\]>)?<\/ht:approx_traffic>/)?.[1]
        ?? block.match(/<approx_traffic>(?:<!\[CDATA\[)?(.+?)(?:\]\]>)?<\/approx_traffic>/)?.[1]
        ?? "";

      const trafficScore = parseTrafficVolume(trafficRaw);
      if (trafficScore === null) continue;

      products.push({
        name: title,
        niche,
        trendScore: trafficScore,
        signals: ["google trends rss", `approx_traffic: ${trafficRaw}`],
        source: "google_trends_rss",
        estimatedMomentum: "rising",
        rawMetrics: { approxTraffic: trafficRaw, trafficScore },
      });
    }

    return { products, status: buildSourceStatus("google_trends_rss", products.length) };
  } catch (error) {
    logger.warn("Google Trends RSS fetch failed", { error: String(error) });
    return { products: [], status: buildSourceStatus("google_trends_rss", 0, String(error)) };
  }
}

async function fetchRedditSubreddit(sub: string, niche: string): Promise<TrendingProduct[]> {
  const { posts } = await getSubredditHotPosts(sub, 15);
  const products: TrendingProduct[] = [];

  for (const post of posts) {
    if (post.score < 100) continue;
    products.push({
      name: post.title.slice(0, 120),
      niche,
      trendScore: Math.min(100, Math.round(post.score / 15 + post.num_comments / 2)),
      signals: [`reddit upvotes: ${post.score}`, `comments: ${post.num_comments}`],
      source: `reddit/r/${sub}`,
      estimatedMomentum: post.score > 500 ? "rising" : "stable",
      rawMetrics: { upvotes: post.score, comments: post.num_comments },
    });
  }

  return products;
}

async function fetchRedditTrending(niche: string): Promise<{
  products: TrendingProduct[];
  status: SourceStatus;
}> {
  const subreddits = getSubredditsForNiche(niche).slice(0, 3);
  const results = await Promise.all(subreddits.map((sub) => fetchRedditSubreddit(sub, niche)));
  const products = results.flat();

  return {
    products,
    status: buildSourceStatus(
      isRedditApiConfigured() ? "reddit_api" : "reddit",
      products.length,
      products.length === 0
        ? isRedditApiConfigured()
          ? "Reddit API returned no high-engagement posts"
          : "Reddit blocked (403) — configure REDDIT_CLIENT_ID/SECRET/USERNAME/PASSWORD"
        : undefined,
      isRedditApiConfigured() ? "Reddit Data API (OAuth)" : undefined,
    ),
  };
}

async function fetchGoogleAutocomplete(niche: string): Promise<{
  keywordIdeas: KeywordIdea[];
  status: SourceStatus;
}> {
  try {
    const url = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(niche + " product")}`;
    const text = await fetchText(url, { browserLike: true, timeoutMs: 8_000 });
    const data = JSON.parse(text) as [string, string[]];
    const suggestions = (data[1] ?? []).slice(0, 10);

    const keywordIdeas = suggestions.map((keyword, i) => ({
      keyword,
      rank: i + 1,
      source: "google_autocomplete" as const,
    }));

    return {
      keywordIdeas,
      status: buildSourceStatus(
        "google_autocomplete",
        keywordIdeas.length,
        undefined,
        "Keyword ideas only — not verified scaling/sales signals",
      ),
    };
  } catch (error) {
    return {
      keywordIdeas: [],
      status: buildSourceStatus("google_autocomplete", 0, String(error)),
    };
  }
}

function scalingDataAvailability(trendingCount: number, sources: SourceStatus[]): string {
  const verifiedSources = sources.filter(
    (s) => s.recordCount > 0 && s.source !== "google_autocomplete",
  );
  if (trendingCount === 0) return "unavailable";
  if (verifiedSources.length >= 2) return "available";
  return "partial";
}

export async function mineTrendingProducts(args: MineTrendingProductsInput) {
  const niche = args.niche ?? "general";
  const country = args.country ?? "US";
  const timePeriod = args.time_period;

  logger.info("Mining trending products", { niche, country, timePeriod });

  const [daily, rss, reddit, autocomplete] = await Promise.all([
    fetchGoogleTrendsDaily(country, niche),
    fetchGoogleTrendsRss(country, niche),
    fetchRedditTrending(niche),
    fetchGoogleAutocomplete(niche),
  ]);

  const sourceStatuses = [daily.status, rss.status, reddit.status, autocomplete.status];
  const trendingProducts = [...daily.products, ...rss.products, ...reddit.products];

  const seen = new Set<string>();
  const uniqueTrending = trendingProducts.filter((p) => {
    const key = p.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  uniqueTrending.sort((a, b) => b.trendScore - a.trendScore);

  const hasScalingSignals = uniqueTrending.length > 0;
  const availability = scalingDataAvailability(uniqueTrending.length, sourceStatuses);

  const result = {
    query: { niche, country, time_period: timePeriod },
    dataAvailability: availability,
    scalingSignalsAvailable: hasScalingSignals,
    sources: sourceStatuses,
    totalTrendingProducts: uniqueTrending.length,
    trendingProducts: uniqueTrending.slice(0, 15),
    topPick: uniqueTrending[0] ?? null,
    keywordIdeas: autocomplete.keywordIdeas,
    analysisNotes: [
      "trendingProducts require verified metrics (Google traffic, Reddit upvotes). No rank-based heuristics.",
      "keywordIdeas are autocomplete suggestions for research — NOT evidence of scaling sales.",
      !hasScalingSignals
        ? "No scaling signals found — Google Trends/Reddit blocked or no niche match. Use analyze_facebook_ads + analyze_youtube_trends for more channels."
        : `Top verified signal: ${uniqueTrending[0]!.name} (score ${uniqueTrending[0]!.trendScore}, source: ${uniqueTrending[0]!.source})`,
      autocomplete.keywordIdeas.length > 0
        ? `${autocomplete.keywordIdeas.length} keyword ideas available for follow-up SEO/ad research.`
        : undefined,
    ].filter(Boolean),
    minedAt: new Date().toISOString(),
  };

  return toolSuccessResult(result);
}