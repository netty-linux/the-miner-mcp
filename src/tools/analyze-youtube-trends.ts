import { z } from "zod";
import { env } from "../config/env.js";
import { fetchJson, fetchText } from "../lib/http.js";
import { buildSourceStatus, type SourceStatus } from "../lib/data-availability.js";
import { parseYouTubeSearchHtml } from "../lib/youtube-parser.js";
import { logger } from "../lib/logger.js";
import { toolSuccessResult } from "../lib/errors.js";

export const analyzeYoutubeTrendsSchema = z.object({
  keyword: z.string().describe("Keyword or product to analyze on YouTube"),
  country: z.string().optional().default("US").describe("Region code for YouTube search"),
  max_results: z.number().min(1).max(50).optional().default(15).describe("Max videos to analyze"),
});

export type AnalyzeYoutubeTrendsInput = z.infer<typeof analyzeYoutubeTrendsSchema>;

interface YouTubeVideo {
  videoId: string;
  title: string;
  channelTitle: string;
  publishedAt: string | null;
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
  engagementRate: number | null;
  tags: string[];
}

async function searchYouTubeApi(
  keyword: string,
  regionCode: string,
  maxResults: number,
): Promise<{ videos: YouTubeVideo[]; status: SourceStatus }> {
  const apiKey = env.youtubeApiKey;
  if (!apiKey) {
    return {
      videos: [],
      status: buildSourceStatus("youtube_data_api", 0, undefined, "YOUTUBE_API_KEY not configured"),
    };
  }

  try {
    const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
    searchUrl.searchParams.set("part", "snippet");
    searchUrl.searchParams.set("q", keyword);
    searchUrl.searchParams.set("type", "video");
    searchUrl.searchParams.set("order", "viewCount");
    searchUrl.searchParams.set("regionCode", regionCode);
    searchUrl.searchParams.set("maxResults", String(maxResults));
    searchUrl.searchParams.set("key", apiKey);

    const searchData = await fetchJson<{
      items?: Array<{ id: { videoId: string } }>;
    }>(searchUrl.toString());

    const videoIds = (searchData.items ?? []).map((i) => i.id.videoId).join(",");
    if (!videoIds) {
      return { videos: [], status: buildSourceStatus("youtube_data_api", 0, undefined, "No videos returned") };
    }

    const statsUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
    statsUrl.searchParams.set("part", "statistics,snippet");
    statsUrl.searchParams.set("id", videoIds);
    statsUrl.searchParams.set("key", apiKey);

    const statsData = await fetchJson<{
      items?: Array<{
        id: string;
        snippet: { title: string; channelTitle: string; publishedAt: string; tags?: string[] };
        statistics: { viewCount?: string; likeCount?: string; commentCount?: string };
      }>;
    }>(statsUrl.toString());

    const videos = (statsData.items ?? []).map((v) => {
      const views = parseInt(v.statistics.viewCount ?? "0", 10);
      const likes = parseInt(v.statistics.likeCount ?? "0", 10);
      const comments = parseInt(v.statistics.commentCount ?? "0", 10);
      const engagementRate = views > 0 ? ((likes + comments) / views) * 100 : 0;

      return {
        videoId: v.id,
        title: v.snippet.title,
        channelTitle: v.snippet.channelTitle,
        publishedAt: v.snippet.publishedAt,
        viewCount: views,
        likeCount: likes,
        commentCount: comments,
        engagementRate: Math.round(engagementRate * 100) / 100,
        tags: (v.snippet.tags ?? []).slice(0, 10),
      };
    });

    return { videos, status: buildSourceStatus("youtube_data_api", videos.length) };
  } catch (error) {
    logger.warn("YouTube API search failed", { error: String(error) });
    return { videos: [], status: buildSourceStatus("youtube_data_api", 0, String(error)) };
  }
}

async function parseYouTubeSearchPage(keyword: string, maxResults: number): Promise<{
  videos: YouTubeVideo[];
  status: SourceStatus;
}> {
  try {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(keyword)}&sp=CAM%253D`;
    const html = await fetchText(url, { browserLike: true });
    const parsed = parseYouTubeSearchHtml(html).slice(0, maxResults);

    const videos: YouTubeVideo[] = parsed.map((p) => ({
      videoId: p.videoId,
      title: p.title,
      channelTitle: p.channelTitle,
      publishedAt: null,
      viewCount: p.viewCount,
      likeCount: null,
      commentCount: null,
      engagementRate: null,
      tags: [],
    }));

    return {
      videos,
      status: buildSourceStatus(
        "youtube_search_parse",
        videos.length,
        videos.length === 0 ? "Could not extract valid videos from search page" : undefined,
        videos.length > 0 ? "Atomic videoRenderer parse; engagement requires YOUTUBE_API_KEY" : undefined,
      ),
    };
  } catch (error) {
    logger.warn("YouTube search page parse failed", { error: String(error) });
    return { videos: [], status: buildSourceStatus("youtube_search_parse", 0, String(error)) };
  }
}

export async function analyzeYoutubeTrends(args: AnalyzeYoutubeTrendsInput) {
  const { keyword, country = "US", max_results = 15 } = args;
  logger.info("Analyzing YouTube trends", { keyword, country, max_results });

  let videos: YouTubeVideo[] = [];
  let dataSource = "youtube_data_api";
  let sourceStatus: SourceStatus;

  const apiResult = await searchYouTubeApi(keyword, country, max_results);
  if (apiResult.videos.length > 0) {
    videos = apiResult.videos;
    sourceStatus = apiResult.status;
  } else {
    const parseResult = await parseYouTubeSearchPage(keyword, max_results);
    videos = parseResult.videos;
    sourceStatus = parseResult.status;
    dataSource = parseResult.videos.length > 0 ? "youtube_search_parse" : "unavailable";
  }

  const videosWithViews = videos.filter((v) => v.viewCount !== null && v.viewCount > 0);
  const avgViews =
    videosWithViews.length > 0
      ? Math.round(videosWithViews.reduce((s, v) => s + (v.viewCount ?? 0), 0) / videosWithViews.length)
      : null;

  const videosWithEngagement = videos.filter((v) => v.engagementRate !== null);
  const avgEngagement =
    videosWithEngagement.length > 0
      ? videosWithEngagement.reduce((s, v) => s + (v.engagementRate ?? 0), 0) / videosWithEngagement.length
      : null;

  const topTitles = [...videos]
    .sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0))
    .slice(0, 5)
    .map((v) => v.title);

  const scalingSignal =
    videos.length === 0
      ? "UNAVAILABLE — no YouTube data retrieved"
      : avgViews !== null && avgViews > 500_000 && videosWithViews.length >= 3
        ? "HIGH — strong YouTube demand (verified view counts on multiple videos)"
        : avgViews !== null && avgViews > 100_000
          ? "MODERATE — decent video traction"
          : videos.length >= 2
            ? "PARTIAL — videos found; limited metrics without API key"
            : "LOW — limited YouTube presence";

  const result = {
    query: { keyword, country, max_results },
    dataSource,
    dataAvailability: videos.length > 0 ? (avgViews !== null ? "available" : "partial") : "unavailable",
    source: sourceStatus,
    apiKeyUsed: Boolean(env.youtubeApiKey),
    totalVideos: videos.length,
    avgViews,
    avgEngagement: avgEngagement !== null ? Math.round(avgEngagement * 100) / 100 : null,
    scalingSignal,
    topVideos: videos.slice(0, 8),
    topTitles,
    titlePatterns: extractTitlePatterns(topTitles),
    recommendations: [
      !env.youtubeApiKey
        ? "Set YOUTUBE_API_KEY for verified view counts, likes, comments, and engagement rates."
        : "Using YouTube Data API v3 for full metrics.",
      videos.length === 0
        ? "No videos found — try different keywords or verify network access."
        : topTitles.length > 0
          ? `Study top title: "${topTitles[0]}"`
          : "Expand keyword scope.",
    ],
    analyzedAt: new Date().toISOString(),
  };

  return toolSuccessResult(result);
}

function extractTitlePatterns(titles: string[]): string[] {
  const patterns: string[] = [];
  if (titles.some((t) => /\d/.test(t))) patterns.push("uses numbers");
  if (titles.some((t) => /how to|tutorial|guide/i.test(t))) patterns.push("how-to format");
  if (titles.some((t) => /review|honest/i.test(t))) patterns.push("review format");
  if (titles.some((t) => /vs|versus|compared/i.test(t))) patterns.push("comparison format");
  if (titles.some((t) => /!\?|SHOCKING|BEST/i.test(t))) patterns.push("clickbait hooks");
  return patterns;
}