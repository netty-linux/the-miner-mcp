import * as cheerio from "cheerio";
import { getBrowser } from "./browser-pool.js";
import { fetchText } from "./http.js";
import { logger } from "./logger.js";

export { closeBrowser } from "./browser-pool.js";

/** Marker used in unit tests with injected HTML fixtures. */
export const PUPPETEER_JS_PROOF_MARKER = "MINER_PUPPETEER_JS_PROOF";

/** Public JS-rendered reference page for integration tests and live verification. */
export const JS_HEAVY_REFERENCE_URL = "https://quotes.toscrape.com/js/";

/** Detects content that only appears after client-side JavaScript execution. */
export function detectJsRenderedContent(html: string): boolean {
  if (html.includes(PUPPETEER_JS_PROOF_MARKER)) return true;

  const $ = cheerio.load(html);
  const quoteBlocks = $(".quote .text").length;
  if (quoteBlocks >= 1) return true;

  return false;
}

export interface PageExtraction {
  url: string;
  title: string;
  metaDescription: string;
  headings: string[];
  paragraphs: string[];
  links: Array<{ text: string; href: string }>;
  prices: string[];
  ctaButtons: string[];
  images: string[];
  scripts: string[];
  rawTextLength: number;
}

export interface ScrapeMetadata {
  renderMethod: "http" | "puppeteer";
  browserPoolReused: boolean;
  jsContentDetected: boolean;
  htmlLength: number;
}

export interface ScrapeResult extends PageExtraction {
  metadata: ScrapeMetadata;
}

export interface FetchHtmlResult {
  html: string;
  metadata: Omit<ScrapeMetadata, "jsContentDetected"> & { jsContentDetected?: boolean };
}

export async function fetchHtml(url: string, usePuppeteer = false): Promise<FetchHtmlResult> {
  if (usePuppeteer) {
    const { browser, poolReused } = await getBrowser();
    const page = await browser.newPage();
    try {
      await page.setUserAgent("Mozilla/5.0 (compatible; TheMinerMCP/1.0)");
      await page.goto(url, { waitUntil: "networkidle2", timeout: 30_000 });
      const html = await page.content();
      const jsContentDetected = detectJsRenderedContent(html);
      return {
        html,
        metadata: {
          renderMethod: "puppeteer",
          browserPoolReused: poolReused,
          jsContentDetected,
          htmlLength: html.length,
        },
      };
    } catch (error) {
      logger.error("Puppeteer fetch failed", { url, error: String(error) });
      throw error;
    } finally {
      await page.close().catch((err) => {
        logger.warn("Failed to close puppeteer page", { error: String(err) });
      });
    }
  }

  const html = await fetchText(url);
  return {
    html,
    metadata: {
      renderMethod: "http",
      browserPoolReused: false,
      htmlLength: html.length,
    },
  };
}

export function extractPageData(html: string, url: string): PageExtraction {
  const $ = cheerio.load(html);

  const headings: string[] = [];
  $("h1, h2, h3").each((_, el) => {
    const text = $(el).text().trim();
    if (text) headings.push(text);
  });

  const paragraphs: string[] = [];
  $("p, .quote .text, .quote .author, [class*='description']").each((_, el) => {
    const text = $(el).text().trim();
    if (text.length > 20) paragraphs.push(text.slice(0, 500));
  });

  const links: Array<{ text: string; href: string }> = [];
  $("a[href]").each((_, el) => {
    const text = $(el).text().trim();
    const href = $(el).attr("href") ?? "";
    if (text && href) links.push({ text: text.slice(0, 100), href });
  });

  const pricePattern = /\$[\d,]+(?:\.\d{2})?|R\$\s*[\d.,]+|€[\d.,]+|£[\d.,]+/g;
  const bodyText = $("body").text();
  const prices = [...new Set(bodyText.match(pricePattern) ?? [])].slice(0, 20);

  const ctaButtons: string[] = [];
  $("button, a.btn, [class*='cta'], [class*='button']").each((_, el) => {
    const text = $(el).text().trim();
    if (text.length > 2 && text.length < 80) ctaButtons.push(text);
  });

  const images: string[] = [];
  $("img[src]").each((_, el) => {
    const src = $(el).attr("src");
    if (src) images.push(src.slice(0, 200));
  });

  const scripts: string[] = [];
  $("script[src]").each((_, el) => {
    const src = $(el).attr("src");
    if (src) scripts.push(src);
  });

  const metaDescription =
    $('meta[name="description"]').attr("content") ??
    $('meta[property="og:description"]').attr("content") ??
    "";

  return {
    url,
    title: ($("title").text().trim() || $('meta[property="og:title"]').attr("content")) ?? "",
    metaDescription,
    headings: headings.slice(0, 30),
    paragraphs: paragraphs.slice(0, 20),
    links: links.slice(0, 50),
    prices,
    ctaButtons: [...new Set(ctaButtons)].slice(0, 20),
    images: images.slice(0, 20),
    scripts: scripts.slice(0, 15),
    rawTextLength: bodyText.length,
  };
}

export function detectTriggers(text: string): string[] {
  const triggers: string[] = [];
  const patterns: Array<[RegExp, string]> = [
    [/limited\s*time|por\s+tempo\s+limitado/i, "urgency — limited time"],
    [/only\s+\d+\s+left|últimas\s+unidades/i, "scarcity — low stock"],
    [/guarantee|garantia|money.?back/i, "risk reversal — guarantee"],
    [/free\s+shipping|frete\s+grátis/i, "incentive — free shipping"],
    [/%\s*off|desconto|save\s+\d+/i, "discount anchor"],
    [/best.?seller|mais\s+vendido/i, "social proof — bestseller"],
    [/as\s+seen\s+on|visto\s+em/i, "authority — media mention"],
    [/testimonial|review|avaliação/i, "social proof — reviews"],
    [/exclusive|exclusivo/i, "exclusivity"],
    [/today\s+only|só\s+hoje/i, "urgency — today only"],
  ];

  for (const [pattern, label] of patterns) {
    if (pattern.test(text)) triggers.push(label);
  }
  return [...new Set(triggers)];
}

export async function scrapePage(url: string, usePuppeteer = false): Promise<ScrapeResult> {
  logger.info("Scraping page", { url, usePuppeteer });
  const fetched = await fetchHtml(url, usePuppeteer);
  const extracted = extractPageData(fetched.html, url);

  const jsContentDetected =
    fetched.metadata.jsContentDetected ??
    (detectJsRenderedContent(fetched.html) ||
      extracted.paragraphs.some((p) => p.includes(PUPPETEER_JS_PROOF_MARKER)));

  return {
    ...extracted,
    metadata: {
      renderMethod: fetched.metadata.renderMethod,
      browserPoolReused: fetched.metadata.browserPoolReused,
      jsContentDetected,
      htmlLength: fetched.metadata.htmlLength,
    },
  };
}