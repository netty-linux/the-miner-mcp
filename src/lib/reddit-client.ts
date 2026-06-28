import { env } from "../config/env.js";
import { fetchWithTimeout } from "./http.js";
import { logger } from "./logger.js";

export interface RedditPost {
  title: string;
  score: number;
  num_comments: number;
  subreddit: string;
  permalink: string;
  url: string;
  created_utc?: number;
}

interface RedditListing {
  data?: {
    children?: Array<{
      data: {
        title: string;
        score: number;
        num_comments: number;
        subreddit: string;
        permalink: string;
        url?: string;
        created_utc?: number;
      };
    }>;
  };
}

interface TokenCache {
  token: string;
  expiresAt: number;
}

let tokenCache: TokenCache | null = null;

export function isRedditRefreshConfigured(): boolean {
  return Boolean(
    env.redditClientId && env.redditClientSecret && env.redditRefreshToken,
  );
}

export function isRedditPasswordConfigured(): boolean {
  return Boolean(
    env.redditClientId &&
      env.redditClientSecret &&
      env.redditUsername &&
      env.redditPassword,
  );
}

export function isRedditApiConfigured(): boolean {
  return isRedditRefreshConfigured() || isRedditPasswordConfigured();
}

export function getRedditUserAgent(): string {
  return (
    env.redditUserAgent ??
    `TheMinerMCP:1.0.0 (by /u/${env.redditUsername ?? "unknown"})`
  );
}

export function parseRedditListing(data: RedditListing): RedditPost[] {
  return (data.data?.children ?? []).map((child) => ({
    title: child.data.title,
    score: child.data.score,
    num_comments: child.data.num_comments,
    subreddit: child.data.subreddit,
    permalink: child.data.permalink,
    url: child.data.url?.startsWith("http")
      ? child.data.url
      : `https://www.reddit.com${child.data.permalink}`,
    created_utc: child.data.created_utc,
  }));
}

function getRedditBasicAuth(): string {
  return Buffer.from(`${env.redditClientId}:${env.redditClientSecret}`).toString(
    "base64",
  );
}

async function requestRedditToken(
  body: URLSearchParams,
  grantType: "refresh_token" | "password",
): Promise<string | null> {
  try {
    const response = await fetchWithTimeout("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      body: body.toString(),
      headers: {
        Authorization: `Basic ${getRedditBasicAuth()}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": getRedditUserAgent(),
      },
      timeoutMs: 12_000,
    });

    const payload = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };

    if (!response.ok) {
      const detail = payload.error_description ?? payload.error ?? `HTTP ${response.status}`;
      throw new Error(detail);
    }

    if (!payload.access_token) {
      throw new Error("Missing access_token in Reddit OAuth response");
    }

    tokenCache = {
      token: payload.access_token,
      expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000,
    };

    return payload.access_token;
  } catch (error) {
    logger.warn("Reddit OAuth token request failed", {
      grantType,
      error: String(error),
    });
    tokenCache = null;
    return null;
  }
}

async function fetchRedditAccessToken(): Promise<string | null> {
  if (!isRedditApiConfigured()) return null;

  if (tokenCache && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.token;
  }

  if (isRedditRefreshConfigured()) {
    const refreshBody = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: env.redditRefreshToken!,
    });
    const refreshToken = await requestRedditToken(refreshBody, "refresh_token");
    if (refreshToken) return refreshToken;
  }

  if (isRedditPasswordConfigured()) {
    const passwordBody = new URLSearchParams({
      grant_type: "password",
      username: env.redditUsername!,
      password: env.redditPassword!,
      scope: "read",
    });
    return requestRedditToken(passwordBody, "password");
  }

  return null;
}

async function fetchRedditListing(path: string): Promise<RedditListing | null> {
  const token = await fetchRedditAccessToken();
  if (!token) return null;

  const url = `https://oauth.reddit.com${path}${path.includes("?") ? "&" : "?"}raw_json=1`;

  try {
    const response = await fetchWithTimeout(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": getRedditUserAgent(),
        Accept: "application/json",
      },
      timeoutMs: 12_000,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return (await response.json()) as RedditListing;
  } catch (error) {
    logger.warn("Reddit OAuth API request failed", { path, error: String(error) });
    return null;
  }
}

async function fetchPublicListing(path: string): Promise<RedditListing | null> {
  const bases = ["https://www.reddit.com", "https://old.reddit.com"];
  for (const base of bases) {
    try {
      const url = `${base}${path}${path.includes("?") ? "&" : "?"}raw_json=1`;
      const response = await fetchWithTimeout(url, {
        browserLike: true,
        headers: {
          Accept: "application/json",
          "User-Agent": getRedditUserAgent(),
        },
        timeoutMs: 8_000,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return (await response.json()) as RedditListing;
    } catch (error) {
      logger.warn("Reddit public fetch failed", { base, path, error: String(error) });
    }
  }
  return null;
}

async function fetchListing(path: string): Promise<{ posts: RedditPost[]; via: "oauth" | "public" | "none" }> {
  if (isRedditApiConfigured()) {
    const oauthData = await fetchRedditListing(path);
    if (oauthData) {
      const posts = parseRedditListing(oauthData);
      if (posts.length > 0) return { posts, via: "oauth" };
    }
  }

  const publicData = await fetchPublicListing(path);
  if (publicData) {
    return { posts: parseRedditListing(publicData), via: "public" };
  }

  return { posts: [], via: "none" };
}

export async function searchRedditPosts(
  query: string,
  limit = 12,
): Promise<{ posts: RedditPost[]; via: "oauth" | "public" | "none" }> {
  const path = `/search?q=${encodeURIComponent(query)}&sort=relevance&limit=${limit}`;
  return fetchListing(path);
}

export async function getSubredditHotPosts(
  subreddit: string,
  limit = 15,
): Promise<{ posts: RedditPost[]; via: "oauth" | "public" | "none" }> {
  const path = `/r/${encodeURIComponent(subreddit)}/hot?limit=${limit}`;
  return fetchListing(path);
}

export function getSubredditsForNiche(niche: string): string[] {
  const map: Record<string, string[]> = {
    fitness: ["Fitness", "bodyweightfitness", "loseit"],
    beauty: ["SkincareAddiction", "MakeupAddiction", "beauty"],
    pets: ["dogs", "cats", "Pets"],
    tech: ["gadgets", "technology", "BuyItForLife"],
    health: ["Supplements", "Nootropics", "Health"],
    home: ["HomeImprovement", "InteriorDesign", "organization"],
    kitchen: ["Cooking", "MealPrepSunday", "BuyItForLife"],
    ecommerce: ["Entrepreneur", "ecommerce", "dropship"],
  };
  const key = niche.toLowerCase();
  return map[key] ?? ["Entrepreneur", "ecommerce", "dropship"];
}