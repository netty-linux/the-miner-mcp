import { z } from "zod";
import { scrapePage, detectTriggers } from "../lib/scraping.js";
import { logger } from "../lib/logger.js";
import { toolSuccessResult } from "../lib/errors.js";

export const scrapeCompetitorDataSchema = z.object({
  url: z.string().url().describe("Competitor product page, checkout, or funnel URL"),
  depth: z
    .enum(["shallow", "deep"])
    .optional()
    .default("shallow")
    .describe("Shallow = single page; deep = follow key funnel links"),
  use_puppeteer: z
    .boolean()
    .optional()
    .default(false)
    .describe("Use Puppeteer for JS-heavy pages"),
});

export type ScrapeCompetitorDataInput = z.infer<typeof scrapeCompetitorDataSchema>;

interface FunnelStep {
  step: number;
  url: string;
  title: string;
  type: string;
  keyElements: string[];
}

function classifyPageType(title: string, url: string, ctas: string[]): string {
  const combined = `${title} ${url} ${ctas.join(" ")}`.toLowerCase();
  if (/checkout|cart|payment|pagamento/i.test(combined)) return "checkout";
  if (/upsell|oto|order.?bump/i.test(combined)) return "upsell";
  if (/thank|obrigad|confirmation/i.test(combined)) return "thank_you";
  if (/pricing|planos|preço/i.test(combined)) return "pricing";
  if (/login|sign.?up|register/i.test(combined)) return "opt_in";
  return "landing";
}

function extractFunnelLinks(
  links: Array<{ text: string; href: string }>,
  baseUrl: string,
): string[] {
  const base = new URL(baseUrl);
  const funnelKeywords = /buy|order|checkout|cart|pricing|get|start|claim|add|shop|comprar|pedido/i;

  return links
    .filter((l) => funnelKeywords.test(l.text) || funnelKeywords.test(l.href))
    .map((l) => {
      try {
        return new URL(l.href, baseUrl).href;
      } catch {
        return "";
      }
    })
    .filter((href) => {
      if (!href) return false;
      try {
        const u = new URL(href);
        return u.hostname === base.hostname;
      } catch {
        return false;
      }
    })
    .slice(0, 5);
}

export async function scrapeCompetitorData(args: ScrapeCompetitorDataInput) {
  const { url, depth = "shallow", use_puppeteer = false } = args;
  logger.info("Scraping competitor data", { url, depth, use_puppeteer });

  const mainPage = await scrapePage(url, use_puppeteer);
  const funnelSteps: FunnelStep[] = [];

  const mainType = classifyPageType(mainPage.title, url, mainPage.ctaButtons);
  funnelSteps.push({
    step: 1,
    url,
    title: mainPage.title,
    type: mainType,
    keyElements: [
      ...mainPage.headings.slice(0, 3),
      ...mainPage.ctaButtons.slice(0, 3),
    ],
  });

  if (depth === "deep") {
    const funnelUrls = extractFunnelLinks(mainPage.links, url);
    for (let i = 0; i < Math.min(funnelUrls.length, 3); i++) {
      try {
        const subPage = await scrapePage(funnelUrls[i]!, use_puppeteer);
        funnelSteps.push({
          step: i + 2,
          url: funnelUrls[i]!,
          title: subPage.title,
          type: classifyPageType(subPage.title, funnelUrls[i]!, subPage.ctaButtons),
          keyElements: [
            ...subPage.headings.slice(0, 2),
            ...subPage.prices.slice(0, 2),
          ],
        });
      } catch (error) {
        logger.warn("Failed to scrape funnel step", { url: funnelUrls[i], error: String(error) });
      }
    }
  }

  const allText = [
    mainPage.title,
    ...mainPage.headings,
    ...mainPage.paragraphs,
  ].join(" ");

  const result = {
    competitorUrl: url,
    depth,
    scrapingMetadata: {
      renderMethod: mainPage.metadata.renderMethod,
      browserPoolReused: mainPage.metadata.browserPoolReused,
      jsContentDetected: mainPage.metadata.jsContentDetected,
      pagesScraped: funnelSteps.length,
      puppeteerUsed: use_puppeteer,
    },
    funnelSteps,
    funnelLength: funnelSteps.length,
    pricing: mainPage.prices,
    psychologicalTriggers: detectTriggers(allText),
    ctaButtons: mainPage.ctaButtons,
    topHeadings: mainPage.headings.slice(0, 8),
    keyCopy: mainPage.paragraphs.slice(0, 3),
    techIndicators: {
      scripts: mainPage.scripts.slice(0, 5),
      platform: detectPlatform(mainPage.scripts, mainPage.links),
    },
    competitiveInsights: [
      funnelSteps.length > 2 ? "Multi-step funnel detected — competitor invests in conversion optimization." : "Single-page funnel — simpler conversion path.",
      mainPage.prices.length > 0 ? `Pricing visible: ${mainPage.prices.join(", ")}` : "No explicit pricing on main page — likely lead-first or call funnel.",
      mainPage.ctaButtons.length > 3 ? "Multiple CTAs — aggressive conversion approach." : "Focused CTA strategy.",
    ],
    scrapedAt: new Date().toISOString(),
  };

  return toolSuccessResult(result);
}

function detectPlatform(
  scripts: string[],
  links: Array<{ text: string; href: string }>,
): string {
  const all = [...scripts, ...links.map((l) => l.href)].join(" ").toLowerCase();
  if (all.includes("shopify")) return "Shopify";
  if (all.includes("clickfunnels")) return "ClickFunnels";
  if (all.includes("hotmart")) return "Hotmart";
  if (all.includes("kiwify")) return "Kiwify";
  if (all.includes("woocommerce")) return "WooCommerce";
  if (all.includes("stripe")) return "Stripe Checkout";
  return "Custom/Unknown";
}