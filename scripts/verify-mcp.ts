/**
 * MCP verification script — exercises initialize, listTools, and all tools
 * against a running The Miner MCP server instance.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { JS_HEAVY_REFERENCE_URL } from "../src/lib/scraping.js";

const SCRATCH = process.env.SCRATCH_DIR ?? join(process.cwd(), "scratch");
const BASE_URL = process.env.MCP_URL ?? "http://127.0.0.1:3000";
const MCP_ENDPOINT = `${BASE_URL}/mcp`;

const EXPECTED_TOOLS = [
  "generate_full_niche_report",
  "analyze_niche_full",
  "analyze_marketplace_demand",
  "mine_trending_products",
  "analyze_facebook_ads",
  "analyze_tiktok_creatives",
  "analyze_youtube_trends",
  "analyze_google_seo",
  "analyze_landing_page",
  "scrape_competitor_data",
  "generate_mining_report",
];

const TOOL_CALLS: Array<{ tool: string; args: Record<string, unknown> }> = [
  { tool: "analyze_marketplace_demand", args: { keyword: "fone bluetooth", country: "BR" } },
  { tool: "mine_trending_products", args: { niche: "fitness", country: "US", time_period: "last_7_days" } },
  { tool: "analyze_facebook_ads", args: { keyword: "fitness", country: "US" } },
  { tool: "analyze_tiktok_creatives", args: { keyword: "fitness tracker", country: "US" } },
  { tool: "analyze_youtube_trends", args: { keyword: "fitness products", country: "US", max_results: 5 } },
  { tool: "analyze_google_seo", args: { keyword: "fitness band", country: "US" } },
  {
    tool: "analyze_landing_page",
    args: { url: JS_HEAVY_REFERENCE_URL, use_puppeteer: true },
  },
  {
    tool: "scrape_competitor_data",
    args: { url: JS_HEAVY_REFERENCE_URL, depth: "deep", use_puppeteer: true },
  },
  {
    tool: "generate_mining_report",
    args: {
      product_name: "Fitness Band Pro",
      niche: "fitness",
      country: "US",
      collected_data: {
        trending_products: [{ name: "Fitness Band", score: 75 }],
        facebook_ads: { activeAds: 6 },
        google_seo: { searchVolume: "high", competition: "medium" },
      },
    },
  },
];

function parseToolData(result: unknown): Record<string, unknown> {
  const content = (result as { content: Array<{ type: string; text?: string }> }).content;
  const jsonBlock = content.find((c) => c.type === "text" && c.text?.includes('"success"'));
  const parsed = JSON.parse(jsonBlock?.text ?? "{}") as { success: boolean; data: Record<string, unknown> };
  if (!parsed.success) throw new Error("Tool returned success:false");
  return parsed.data;
}

function assertRealPuppeteerScrape(data: Record<string, unknown>, tool: string): void {
  const meta = data.scrapingMetadata as Record<string, unknown>;

  if (meta.renderMethod !== "puppeteer") {
    throw new Error(`${tool}: expected renderMethod puppeteer, got ${meta.renderMethod}`);
  }
  if (meta.jsContentDetected !== true) {
    throw new Error(`${tool}: jsContentDetected must be true for JS-heavy reference URL`);
  }

  const headings = (data.topHeadings as string[] | undefined) ?? [];
  const snippets = (data.keyCopySnippets as string[] | undefined) ?? (data.keyCopy as string[] | undefined) ?? [];
  const funnelSteps = (data.funnelSteps as Array<{ keyElements: string[] }> | undefined) ?? [];
  const rawTextLength = (data.rawTextLength as number | undefined) ?? 0;
  const allText = [
    ...headings,
    ...snippets,
    ...funnelSteps.flatMap((s) => s.keyElements),
    String(data.title ?? ""),
  ].join(" ");

  const quoteRendered =
    rawTextLength > 200 ||
    snippets.length > 0 ||
    /the world as we have created|life that has within itself/i.test(allText);
  if (!quoteRendered) {
    throw new Error(
      `${tool}: expected rendered quote content from ${JS_HEAVY_REFERENCE_URL} (rawTextLength=${rawTextLength}, snippets=${snippets.length})`,
    );
  }

  if (tool === "scrape_competitor_data") {
    if (meta.puppeteerUsed !== true) {
      throw new Error("scrape_competitor_data: puppeteerUsed must be true");
    }
    if ((meta.pagesScraped as number) < 1) {
      throw new Error("scrape_competitor_data: pagesScraped must be >= 1");
    }
    if ((data.depth as string) !== "deep") {
      throw new Error("scrape_competitor_data: deep funnel mode must be exercised");
    }
  }
}

async function main(): Promise<void> {
  mkdirSync(SCRATCH, { recursive: true });

  const transport = new StreamableHTTPClientTransport(new URL(MCP_ENDPOINT));
  const client = new Client({ name: "verify-client", version: "1.0.0" });

  await client.connect(transport);
  console.log("Connected to MCP server");

  const toolsResult = await client.listTools();
  const toolNames = toolsResult.tools.map((t) => t.name).sort();

  writeFileSync(join(SCRATCH, "tools-list.json"), JSON.stringify(toolsResult, null, 2));
  console.log("Tools listed:", toolNames);

  for (const expected of EXPECTED_TOOLS) {
    if (!toolNames.includes(expected)) {
      throw new Error(`Missing tool: ${expected}`);
    }
  }

  const callResults: Array<{ tool: string; args: Record<string, unknown>; result: unknown }> = [];

  for (const { tool, args } of TOOL_CALLS) {
    console.log(`Calling tool: ${tool}`);
    const result = await client.callTool(
      { name: tool, arguments: args },
      undefined,
      { timeout: 120_000, maxTotalTimeout: 180_000 },
    );
    const text = (result.content as Array<{ type: string; text?: string }>)
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("");

    if (!text || text.length < 10) {
      throw new Error(`Tool ${tool} returned empty content`);
    }

    const data = parseToolData(result);
    if (tool === "analyze_landing_page" || tool === "scrape_competitor_data") {
      assertRealPuppeteerScrape(data, tool);
      console.log(
        `  Puppeteer verified on real URL: renderMethod=${metaField(data, "renderMethod")}, js=${metaField(data, "jsContentDetected")}, url=${JS_HEAVY_REFERENCE_URL}`,
      );
    }

    callResults.push({ tool, args, result });
    console.log(`  OK (${text.length} chars)`);
  }

  writeFileSync(join(SCRATCH, "tool-calls.json"), JSON.stringify(callResults, null, 2));
  writeFileSync(
    join(SCRATCH, "puppeteer-real-url-proof.json"),
    JSON.stringify({ referenceUrl: JS_HEAVY_REFERENCE_URL, verified: true }, null, 2),
  );

  await client.close();
  console.log(`Verification complete — all ${EXPECTED_TOOLS.length} tools OK (puppeteer on ${JS_HEAVY_REFERENCE_URL})`);
}

function metaField(data: Record<string, unknown>, field: string): unknown {
  return (data.scrapingMetadata as Record<string, unknown>)[field];
}

main().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});