import * as cheerio from "cheerio";
import { fetchJson, fetchText } from "./http.js";
import { buildSourceStatus, type SourceStatus } from "./data-availability.js";
import { logger } from "./logger.js";
import { isRedditApiConfigured, searchRedditPosts } from "./reddit-client.js";

export interface RelatedKeyword {
  keyword: string;
  relevance: number;
  type: "top" | "rising" | "autocomplete" | "paa";
}

export interface RegionalInterest {
  region: string;
  score: number;
}

export interface InterestOverTime {
  average: number;
  momentum: "rising" | "stable" | "declining";
  recentPeak: number;
}

export interface RedditSignal {
  title: string;
  score: number;
  comments: number;
  subreddit: string;
  url: string;
}

export interface WikipediaTrend {
  article: string;
  totalViews: number;
  dailyAverage: number;
  momentum: "rising" | "stable" | "declining";
}

export interface GoogleTrendsBundle {
  topKeywords: RelatedKeyword[];
  risingKeywords: RelatedKeyword[];
  interest: InterestOverTime | null;
  regional: RegionalInterest[];
  status: SourceStatus;
}

const TRENDS_HEADERS = {
  Accept: "application/json, text/plain, */*",
  Referer: "https://trends.google.com/",
};

export function stripGoogleTrendsPrefix(text: string): string {
  return text.replace(/^\)\]\}',?\n?/, "");
}

export function parseTrendsRelatedQueries(text: string): {
  topKeywords: RelatedKeyword[];
  risingKeywords: RelatedKeyword[];
} {
  const cleaned = stripGoogleTrendsPrefix(text);
  const data = JSON.parse(cleaned) as {
    default?: {
      rankedList?: Array<{
        rankedKeyword?: Array<{ query: string; value: number; formattedValue?: string }>;
      }>;
    };
  };

  const lists = data.default?.rankedList ?? [];
  const topKeywords: RelatedKeyword[] = [];
  const risingKeywords: RelatedKeyword[] = [];

  for (const [index, list] of lists.entries()) {
    for (const item of list.rankedKeyword ?? []) {
      const isRising =
        index === 1 ||
        (item.formattedValue?.includes("%") ?? false) ||
        item.value > 100;
      const entry: RelatedKeyword = {
        keyword: item.query,
        relevance: isRising && item.value > 100 ? Math.min(item.value, 500) : item.value,
        type: isRising ? "rising" : "top",
      };
      if (entry.type === "rising") risingKeywords.push(entry);
      else topKeywords.push(entry);
    }
  }

  return { topKeywords, risingKeywords };
}

export function parseTrendsMultiline(text: string): InterestOverTime | null {
  const cleaned = stripGoogleTrendsPrefix(text);
  const data = JSON.parse(cleaned) as {
    default?: { timelineData?: Array<{ value?: number[] }> };
  };
  const values =
    data.default?.timelineData?.flatMap((point) => point.value ?? []).filter((v) => v > 0) ?? [];
  if (values.length === 0) return null;

  const average = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  const recent = values.slice(-4);
  const earlier = values.slice(-8, -4);
  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const earlierAvg =
    earlier.length > 0 ? earlier.reduce((a, b) => a + b, 0) / earlier.length : recentAvg;
  const momentum: InterestOverTime["momentum"] =
    recentAvg > earlierAvg * 1.15 ? "rising" : recentAvg < earlierAvg * 0.85 ? "declining" : "stable";

  return {
    average,
    momentum,
    recentPeak: Math.max(...values),
  };
}

export function parseTrendsGeoMap(text: string): RegionalInterest[] {
  const cleaned = stripGoogleTrendsPrefix(text);
  const data = JSON.parse(cleaned) as {
    default?: { geoMapData?: Array<{ geoName?: string; value?: number[] }> };
  };
  return (data.default?.geoMapData ?? [])
    .map((row) => ({
      region: row.geoName ?? "unknown",
      score: row.value?.[0] ?? 0,
    }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}

export function parsePeopleAlsoAsk(html: string): string[] {
  const $ = cheerio.load(html);
  const questions = new Set<string>();

  $("[data-q]").each((_, el) => {
    const q = $(el).attr("data-q")?.trim();
    if (q && q.length > 5) questions.add(q);
  });

  $(".related-question-pair").each((_, el) => {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (text.length > 5 && text.length < 200) questions.add(text);
  });

  if (questions.size === 0) {
    const matches = html.matchAll(/"q":"((?:\\.|[^"\\]){5,200})"/g);
    for (const match of matches) {
      const decoded = match[1]!.replace(/\\u0026/g, "&").replace(/\\"/g, '"');
      if (!decoded.includes("http") && decoded.split(" ").length >= 3) {
        questions.add(decoded);
      }
    }
  }

  return [...questions].slice(0, 12);
}

export function mapRedditPostsToSignals(
  posts: Array<{
    title: string;
    score: number;
    num_comments: number;
    subreddit: string;
    url: string;
  }>,
): RedditSignal[] {
  return posts
    .map((post) => ({
      title: post.title,
      score: post.score,
      comments: post.num_comments,
      subreddit: post.subreddit,
      url: post.url,
    }))
    .filter((p) => p.score >= 10)
    .slice(0, 10);
}

export function parseWikipediaPageviews(
  data: { items?: Array<{ views: number }> },
  article: string,
): WikipediaTrend | null {
  const items = data.items ?? [];
  if (items.length === 0) return null;

  const views = items.map((i) => i.views);
  const totalViews = views.reduce((a, b) => a + b, 0);
  const dailyAverage = Math.round(totalViews / views.length);
  const recent = views.slice(-7);
  const earlier = views.slice(-14, -7);
  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const earlierAvg =
    earlier.length > 0 ? earlier.reduce((a, b) => a + b, 0) / earlier.length : recentAvg;
  const momentum: WikipediaTrend["momentum"] =
    recentAvg > earlierAvg * 1.2 ? "rising" : recentAvg < earlierAvg * 0.8 ? "declining" : "stable";

  return { article, totalViews, dailyAverage, momentum };
}

export function estimateSearchVolume(signals: {
  interest: InterestOverTime | null;
  risingCount: number;
  redditAvgScore: number;
  wikiDailyAverage: number;
  autocompleteCount: number;
}): string {
  let score = 0;
  if (signals.interest) {
    if (signals.interest.average >= 70) score += 3;
    else if (signals.interest.average >= 40) score += 2;
    else if (signals.interest.average >= 15) score += 1;
    if (signals.interest.momentum === "rising") score += 1;
  }
  if (signals.risingCount >= 5) score += 2;
  else if (signals.risingCount >= 2) score += 1;
  if (signals.redditAvgScore >= 200) score += 2;
  else if (signals.redditAvgScore >= 50) score += 1;
  if (signals.wikiDailyAverage >= 500) score += 2;
  else if (signals.wikiDailyAverage >= 100) score += 1;
  if (signals.autocompleteCount >= 8) score += 1;

  if (score >= 6) return "high";
  if (score >= 3) return "medium";
  if (score >= 1) return "low";
  return "unknown";
}

export function estimateCompetition(signals: {
  topCount: number;
  risingCount: number;
  paaCount: number;
  regionalLeaders: number;
}): string {
  let score = 0;
  if (signals.topCount >= 15) score += 2;
  else if (signals.topCount >= 8) score += 1;
  if (signals.risingCount >= 8) score += 2;
  else if (signals.risingCount >= 4) score += 1;
  if (signals.paaCount >= 8) score += 2;
  else if (signals.paaCount >= 4) score += 1;
  if (signals.regionalLeaders >= 5) score += 1;

  if (score >= 5) return "high";
  if (score >= 2) return "medium";
  if (score >= 1) return "low";
  return "unknown";
}

function buildTrendsExploreRequest(keyword: string, country: string) {
  return {
    comparisonItem: [{ keyword, geo: country || "US", time: "today 3-m" }],
    category: 0,
    property: "",
  };
}

async function fetchTrendsWidgetData(
  widget: { request: unknown; token: string },
): Promise<string | null> {
  try {
    const url = `https://trends.google.com/trends/api/widgetdata/multiline?hl=en-US&tz=360&req=${encodeURIComponent(
      JSON.stringify(widget.request),
    )}&token=${encodeURIComponent(widget.token)}`;
    return await fetchText(url, { headers: TRENDS_HEADERS, browserLike: true, timeoutMs: 12_000 });
  } catch (error) {
    logger.warn("Google Trends widget fetch failed", { error: String(error) });
    return null;
  }
}

async function fetchTrendsComparedGeo(widget: { request: unknown; token: string }): Promise<string | null> {
  try {
    const url = `https://trends.google.com/trends/api/widgetdata/comparedgeo?hl=en-US&tz=360&req=${encodeURIComponent(
      JSON.stringify(widget.request),
    )}&token=${encodeURIComponent(widget.token)}`;
    return await fetchText(url, { headers: TRENDS_HEADERS, browserLike: true, timeoutMs: 12_000 });
  } catch (error) {
    logger.warn("Google Trends geo widget fetch failed", { error: String(error) });
    return null;
  }
}

async function fetchTrendsRelatedWidget(widget: { request: unknown; token: string }): Promise<string | null> {
  try {
    const url = `https://trends.google.com/trends/api/widgetdata/relatedsearches?hl=en-US&tz=360&req=${encodeURIComponent(
      JSON.stringify(widget.request),
    )}&token=${encodeURIComponent(widget.token)}`;
    return await fetchText(url, { headers: TRENDS_HEADERS, browserLike: true, timeoutMs: 12_000 });
  } catch (error) {
    logger.warn("Google Trends related widget fetch failed", { error: String(error) });
    return null;
  }
}

export async function fetchGoogleTrendsBundle(
  keyword: string,
  country: string,
): Promise<GoogleTrendsBundle> {
  const topKeywords: RelatedKeyword[] = [];
  const risingKeywords: RelatedKeyword[] = [];
  let interest: InterestOverTime | null = null;
  let regional: RegionalInterest[] = [];

  try {
    const relatedUrl = `https://trends.google.com/trends/api/relatedsearches?hl=en-US&tz=360&req=${encodeURIComponent(
      JSON.stringify({
        restriction: {
          geo: { country: country || "US" },
          time: "today 3-m",
          originalTimeRangeForExploreUrl: "today 3-m",
        },
        keywordType: "QUERY",
        metric: ["TOP", "RISING"],
        trendinessSettings: { minThreshold: 0, compareTime: "today 3-m" },
        requestOptions: { property: "", backend: "IZG", category: 0 },
        language: "en",
        userConfig: { userType: "USER_TYPE_LEGIT_USER" },
        userType: "USER_TYPE_LEGIT_USER",
      }),
    )}&token=RELATED_QUERIES&tz=360`;

    const relatedText = await fetchText(relatedUrl, {
      headers: TRENDS_HEADERS,
      browserLike: true,
      timeoutMs: 12_000,
    });
    const related = parseTrendsRelatedQueries(relatedText);
    topKeywords.push(...related.topKeywords);
    risingKeywords.push(...related.risingKeywords);
  } catch (error) {
    logger.warn("Google Trends related searches failed", { error: String(error) });
  }

  try {
    const exploreUrl = `https://trends.google.com/trends/api/explore?hl=en-US&tz=360&req=${encodeURIComponent(
      JSON.stringify(buildTrendsExploreRequest(keyword, country)),
    )}`;
    const exploreText = await fetchText(exploreUrl, {
      headers: TRENDS_HEADERS,
      browserLike: true,
      timeoutMs: 12_000,
    });
    const explore = JSON.parse(stripGoogleTrendsPrefix(exploreText)) as {
      widgets?: Array<{ id?: string; request?: unknown; token?: string }>;
    };

    const timeseries = explore.widgets?.find((w) => w.id === "TIMESERIES" && w.token);
    const geoMap = explore.widgets?.find((w) => w.id === "GEO_MAP" && w.token);
    const relatedWidget = explore.widgets?.find((w) => w.id === "RELATED_QUERIES" && w.token);

    if (timeseries?.request && timeseries.token) {
      const multiline = await fetchTrendsWidgetData({
        request: timeseries.request,
        token: timeseries.token,
      });
      if (multiline) interest = parseTrendsMultiline(multiline);
    }

    if (geoMap?.request && geoMap.token) {
      const geoText = await fetchTrendsComparedGeo({
        request: geoMap.request,
        token: geoMap.token,
      });
      if (geoText) regional = parseTrendsGeoMap(geoText);
    }

    if (topKeywords.length === 0 && risingKeywords.length === 0 && relatedWidget?.request && relatedWidget.token) {
      const relatedWidgetText = await fetchTrendsRelatedWidget({
        request: relatedWidget.request,
        token: relatedWidget.token,
      });
      if (relatedWidgetText) {
        const related = parseTrendsRelatedQueries(relatedWidgetText);
        topKeywords.push(...related.topKeywords);
        risingKeywords.push(...related.risingKeywords);
      }
    }
  } catch (error) {
    logger.warn("Google Trends explore failed", { error: String(error) });
  }

  const recordCount = topKeywords.length + risingKeywords.length + (interest ? 1 : 0) + regional.length;
  return {
    topKeywords,
    risingKeywords,
    interest,
    regional,
    status: buildSourceStatus(
      "google_trends",
      recordCount,
      recordCount === 0 ? "Google Trends blocked or returned no data" : undefined,
    ),
  };
}

export async function fetchGoogleAutocomplete(keyword: string): Promise<{
  suggestions: string[];
  status: SourceStatus;
}> {
  try {
    const url = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(keyword)}`;
    const text = await fetchText(url, { browserLike: true, timeoutMs: 8_000 });
    const data = JSON.parse(text) as [string, string[]];
    const suggestions = (data[1] ?? []).slice(0, 10);
    return {
      suggestions,
      status: buildSourceStatus("google_autocomplete", suggestions.length),
    };
  } catch (error) {
    return {
      suggestions: [],
      status: buildSourceStatus("google_autocomplete", 0, String(error)),
    };
  }
}

export async function fetchPeopleAlsoAsk(
  keyword: string,
  country: string,
  language: string,
): Promise<{ questions: string[]; status: SourceStatus }> {
  try {
    const url = new URL("https://www.google.com/search");
    url.searchParams.set("q", keyword);
    url.searchParams.set("hl", language || "en");
    url.searchParams.set("gl", country?.toLowerCase() || "us");
    url.searchParams.set("pws", "0");

    const html = await fetchText(url.toString(), { browserLike: true, timeoutMs: 12_000 });
    const questions = parsePeopleAlsoAsk(html);
    return {
      questions,
      status: buildSourceStatus(
        "people_also_ask",
        questions.length,
        questions.length === 0 ? "Google SERP blocked or no PAA section found" : undefined,
      ),
    };
  } catch (error) {
    return {
      questions: [],
      status: buildSourceStatus("people_also_ask", 0, String(error)),
    };
  }
}

export async function fetchRedditKeywordSignals(keyword: string): Promise<{
  signals: RedditSignal[];
  status: SourceStatus;
  via: "oauth" | "public" | "none";
}> {
  const { posts, via } = await searchRedditPosts(keyword, 12);
  const signals = mapRedditPostsToSignals(posts);

  if (signals.length > 0) {
    return {
      signals,
      via,
      status: buildSourceStatus(
        via === "oauth" ? "reddit_api" : "reddit_search",
        signals.length,
        undefined,
        via === "oauth" ? "Reddit Data API (OAuth)" : "Reddit public JSON",
      ),
    };
  }

  return {
    signals: [],
    via: "none",
    status: buildSourceStatus(
      isRedditApiConfigured() ? "reddit_api" : "reddit_search",
      0,
      isRedditApiConfigured()
        ? "Reddit API returned no posts for keyword"
        : "Configure REDDIT_CLIENT_ID/SECRET/USERNAME/PASSWORD or Reddit blocked (403)",
    ),
  };
}

function wikipediaArticleSlug(keyword: string): string {
  const normalized = keyword.trim().replace(/\s+/g, "_");
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export async function fetchWikipediaTrend(keyword: string): Promise<{
  trend: WikipediaTrend | null;
  status: SourceStatus;
}> {
  const article = wikipediaArticleSlug(keyword);
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 30);
  const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");

  try {
    const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia.org/all-access/user/${encodeURIComponent(
      article,
    )}/daily/${fmt(start)}/${fmt(end)}`;
    const data = await fetchJson<{ items?: Array<{ views: number }> }>(url, { timeoutMs: 10_000 });
    const trend = parseWikipediaPageviews(data, article);
    return {
      trend,
      status: buildSourceStatus(
        "wikipedia_pageviews",
        trend ? 1 : 0,
        trend ? undefined : "No Wikipedia article views found for keyword slug",
      ),
    };
  } catch (error) {
    return {
      trend: null,
      status: buildSourceStatus("wikipedia_pageviews", 0, String(error)),
    };
  }
}

export function mergeRelatedKeywords(
  trends: GoogleTrendsBundle,
  autocomplete: string[],
  paaQuestions: string[],
): RelatedKeyword[] {
  const merged: RelatedKeyword[] = [
    ...trends.risingKeywords,
    ...trends.topKeywords,
  ];
  const seen = new Set(merged.map((k) => k.keyword.toLowerCase()));

  for (const term of autocomplete) {
    const key = term.toLowerCase();
    if (!seen.has(key)) {
      merged.push({ keyword: term, relevance: 50, type: "autocomplete" });
      seen.add(key);
    }
  }

  for (const question of paaQuestions) {
    const key = question.toLowerCase();
    if (!seen.has(key)) {
      merged.push({ keyword: question, relevance: 65, type: "paa" });
      seen.add(key);
    }
  }

  return merged.sort((a, b) => b.relevance - a.relevance);
}

export function buildSeoOpportunity(searchVolume: string, competition: string): string {
  if (searchVolume === "unknown") {
    return "UNKNOWN — limited signals; try a more specific product keyword";
  }
  if (searchVolume === "high" && competition === "low") {
    return "EXCELLENT — high demand, low competition";
  }
  if (searchVolume === "high") {
    return "GOOD — high demand but competitive";
  }
  if (competition === "low") {
    return "MODERATE — niche with room to rank";
  }
  return "CHALLENGING — needs long-tail and content depth";
}