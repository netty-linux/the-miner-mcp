import { config as loadDotenv } from "dotenv";

loadDotenv();

export const env = {
  port: parseInt(process.env.PORT ?? "3000", 10),
  nodeEnv: process.env.NODE_ENV ?? "development",
  host: process.env.HOST ?? "0.0.0.0",

  // API keys — optional; tools degrade gracefully when absent
  youtubeApiKey: process.env.YOUTUBE_API_KEY,
  facebookAccessToken: process.env.FACEBOOK_ACCESS_TOKEN,
  tiktokAccessToken: process.env.TIKTOK_ACCESS_TOKEN,
  googleApiKey: process.env.GOOGLE_API_KEY,
  serpApiKey: process.env.SERP_API_KEY,

  // Reddit Data API — script (password) or web app (refresh token)
  redditClientId: process.env.REDDIT_CLIENT_ID,
  redditClientSecret: process.env.REDDIT_CLIENT_SECRET,
  redditUsername: process.env.REDDIT_USERNAME,
  redditPassword: process.env.REDDIT_PASSWORD,
  redditRefreshToken: process.env.REDDIT_REFRESH_TOKEN,
  redditRedirectUri: process.env.REDDIT_REDIRECT_URI ?? "http://localhost:8080",
  redditUserAgent: process.env.REDDIT_USER_AGENT,

  // Public URL for MCP icons (Grok fetches logo from here)
  publicBaseUrl:
    process.env.PUBLIC_BASE_URL ??
    (process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : `http://localhost:${process.env.PORT ?? "3000"}`),

  // Future auth hook
  mcpAuthToken: process.env.MCP_AUTH_TOKEN,

  // Grok compatibility: omit image blocks by default (markdown + Mermaid still included)
  mcpLightResponse: process.env.MCP_LIGHT_RESPONSE !== "false",
} as const;

export function hasApiKey(key: keyof Pick<
  typeof env,
  | "youtubeApiKey"
  | "facebookAccessToken"
  | "tiktokAccessToken"
  | "googleApiKey"
  | "serpApiKey"
  | "redditClientId"
>): boolean {
  return Boolean(env[key]);
}