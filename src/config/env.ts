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

  // Future auth hook
  mcpAuthToken: process.env.MCP_AUTH_TOKEN,
} as const;

export function hasApiKey(key: keyof Pick<
  typeof env,
  "youtubeApiKey" | "facebookAccessToken" | "tiktokAccessToken" | "googleApiKey" | "serpApiKey"
>): boolean {
  return Boolean(env[key]);
}