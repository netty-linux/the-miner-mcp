<img width="1254" height="1254" alt="logo-mcp" src="https://github.com/user-attachments/assets/c9559fc4-978b-4461-b976-60268fbdcd41" />

<img width="409" height="450" alt="image" src="https://github.com/user-attachments/assets/937b3e12-6497-47b7-843c-b8e8564058bb" />


**The Miner MCP** (O MCP Minerador) is a production-ready Model Context Protocol server specialized in mining high-scale offers and products worldwide. It collects real metrics from multiple sources and generates intelligent reports on which products are actually selling at scale.

## Features

- **8 specialized mining tools** for product research and competitive intelligence
- **Streamable HTTP transport** — deploy remotely on Railway, Grok, or any MCP client
- **Real data sources** — Reddit, Google Trends, Facebook Ad Library, TikTok Creative Center, YouTube, SEO APIs + intelligent scraping
- **Intelligent report synthesis** — opportunity score (0–100), executive summary, recommendations
- **Graceful degradation** — works without API keys; enhanced accuracy with keys
- **Future-ready auth** — optional `MCP_AUTH_TOKEN` bearer authentication

## Tools

| Tool | Description |
|------|-------------|
| `mine_trending_products` | Find products/offers scaling globally (niche, country, time_period) |
| `analyze_facebook_ads` | Analyze Facebook Ad Library creatives and campaigns |
| `analyze_tiktok_creatives` | Analyze trending TikTok ad creatives and hooks |
| `analyze_youtube_trends` | YouTube trends — views, engagement, title patterns |
| `analyze_google_seo` | Search volume, related keywords, competition |
| `analyze_landing_page` | Extract LP structure, copy, triggers, CTAs from URL |
| `scrape_competitor_data` | Scrape competitor funnels (shallow/deep, Puppeteer optional) |
| `generate_mining_report` | Synthesize all data into actionable report with score |

## Prerequisites

- **Node.js 20+**
- **npm** or **pnpm**
- Optional API keys (see `.env.example`)

## Quick Start (Local)

```bash
# 1. Install dependencies
npm install

# 2. Copy environment template
cp .env.example .env

# 3. Development mode (hot reload)
npm run dev

# 4. Or build and run production
npm run build
npm start
```

The server starts on `http://localhost:3000` by default.

- **MCP endpoint:** `POST http://localhost:3000/mcp`
- **Health check:** `GET http://localhost:3000/health`

### Custom port

```bash
PORT=8080 npm start
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: `3000`) |
| `HOST` | No | Bind host (default: `0.0.0.0`) |
| `YOUTUBE_API_KEY` | No | YouTube Data API v3 key |
| `FACEBOOK_ACCESS_TOKEN` | No | Facebook Graph API token for Ad Library |
| `TIKTOK_ACCESS_TOKEN` | No | TikTok Business API token |
| `GOOGLE_API_KEY` | No | Google API key |
| `SERP_API_KEY` | No | SerpAPI key for enhanced SEO data |
| `MCP_AUTH_TOKEN` | No | Bearer token for MCP endpoint auth |

## Connect to Grok / Cursor

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "the-miner-mcp": {
      "url": "http://localhost:3000/mcp",
      "transport": "streamable-http"
    }
  }
}
```

For remote deployment, replace the URL with your Railway public URL.

## Tool Usage Examples

### Mine trending products

```json
{
  "niche": "fitness",
  "country": "US",
  "time_period": "last_7_days"
}
```

### Analyze Facebook ads

```json
{
  "keyword": "portable blender",
  "country": "US"
}
```

### Analyze landing page

```json
{
  "url": "https://example.com/product",
  "use_puppeteer": false
}
```

### Generate mining report

```json
{
  "product_name": "Portable Blender Pro",
  "niche": "kitchen",
  "country": "US",
  "collected_data": {
    "facebook_ads": { "activeAds": 12 },
    "tiktok_creatives": { "totalFound": 8, "avgEngagement": 6.5 },
    "google_seo": { "searchVolume": "high", "competition": "low" }
  }
}
```

## Verification

```bash
# Run unit tests
npm test

# Verify live MCP server (start server first)
npm run verify
```

## Deploy on Railway

### Option A: Deploy from GitHub

1. Push this repo to GitHub
2. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub**
3. Select your repository
4. Railway auto-detects the `Dockerfile`

### Option B: Deploy with Railway CLI

```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

### Configure environment variables

In Railway dashboard → **Variables**, add:

```
PORT=3000
YOUTUBE_API_KEY=your_key
FACEBOOK_ACCESS_TOKEN=your_token
SERP_API_KEY=your_key
MCP_AUTH_TOKEN=your_secret_token
```

### Get your public URL

Railway provides a public URL like `https://the-miner-mcp-production.up.railway.app`.

Connect your MCP client:

```json
{
  "mcpServers": {
    "the-miner-mcp": {
      "url": "https://the-miner-mcp-production.up.railway.app/mcp",
      "transport": "streamable-http",
      "headers": {
        "Authorization": "Bearer your_secret_token"
      }
    }
  }
}
```

## Project Structure

```
src/
├── index.ts              # HTTP server + Streamable HTTP transport
├── server.ts             # McpServer factory
├── config/env.ts         # Environment configuration
├── lib/                  # Shared utilities (http, scraping, report)
└── tools/                # Independent tool implementations
tests/                    # Unit tests
scripts/verify-mcp.ts     # Live MCP verification
```

## Architecture Notes

- **Stateless HTTP** — each request creates a fresh `McpServer` instance for horizontal scaling
- **Tool independence** — each tool is a focused module with Zod validation
- **Extension point** — add new tools in `src/tools/` and register in `src/tools/index.ts`
- **Auth ready** — set `MCP_AUTH_TOKEN` to enable bearer token authentication

## License

MIT
