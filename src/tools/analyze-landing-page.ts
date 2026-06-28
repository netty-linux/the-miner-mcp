import { z } from "zod";
import { scrapePage, detectTriggers } from "../lib/scraping.js";
import { logger } from "../lib/logger.js";
import { toolRichResult } from "../lib/errors.js";
import {
  buildLandingPageVisualMarkdown,
  generateScoreGaugeSvg,
  generateTriggerBarsSvg,
  svgToBase64,
} from "../lib/visualizations.js";

export const analyzeLandingPageSchema = z.object({
  url: z.string().url().describe("Landing page or checkout URL to analyze"),
  use_puppeteer: z
    .boolean()
    .optional()
    .default(false)
    .describe("Use headless browser for JS-rendered pages"),
});

export type AnalyzeLandingPageInput = z.infer<typeof analyzeLandingPageSchema>;

function analyzeCopyStructure(headings: string[], paragraphs: string[]): {
  hasHeroSection: boolean;
  hasSocialProof: boolean;
  hasFAQ: boolean;
  hasTestimonials: boolean;
  copyLength: "short" | "medium" | "long";
} {
  const allText = [...headings, ...paragraphs].join(" ").toLowerCase();
  const totalWords = allText.split(/\s+/).length;

  return {
    hasHeroSection: headings.length > 0,
    hasSocialProof: /review|testimonial|customer|client|trust|rated/i.test(allText),
    hasFAQ: /faq|frequently asked|perguntas/i.test(allText),
    hasTestimonials: /testimonial|review|said|love|amazing/i.test(allText),
    copyLength: totalWords > 1500 ? "long" : totalWords > 500 ? "medium" : "short",
  };
}

function detectFunnelType(links: Array<{ text: string; href: string }>, scripts: string[]): string {
  const allHrefs = links.map((l) => l.href).join(" ");
  if (/shopify/i.test(allHrefs) || scripts.some((s) => s.includes("shopify"))) return "shopify";
  if (/clickfunnels|cf_/i.test(allHrefs)) return "clickfunnels";
  if (/hotmart|kiwify|eduzz|monetizze/i.test(allHrefs)) return "brazilian_infoproduct";
  if (/stripe|paypal|checkout/i.test(allHrefs)) return "direct_checkout";
  if (/lead|subscribe|optin/i.test(allHrefs)) return "lead_magnet";
  return "standard_landing";
}

export async function analyzeLandingPage(args: AnalyzeLandingPageInput) {
  const { url, use_puppeteer = false } = args;
  logger.info("Analyzing landing page", { url, use_puppeteer });

  const pageData = await scrapePage(url, use_puppeteer);
  const allText = [
    pageData.title,
    pageData.metaDescription,
    ...pageData.headings,
    ...pageData.paragraphs,
  ].join(" ");

  const triggers = detectTriggers(allText);
  const copyStructure = analyzeCopyStructure(pageData.headings, pageData.paragraphs);
  const funnelType = detectFunnelType(pageData.links, pageData.scripts);

  const offerAnalysis = {
    pricesFound: pageData.prices,
    hasDiscount: /%\s*off|save|desconto|promoção/i.test(allText),
    hasFreeShipping: /free\s+shipping|frete\s+grátis/i.test(allText),
    hasGuarantee: /guarantee|garantia|money.?back|devolução/i.test(allText),
    hasUrgency: triggers.some((t) => t.includes("urgency")),
    hasScarcity: triggers.some((t) => t.includes("scarcity")),
  };

  const conversionScore = calculateConversionScore(triggers, offerAnalysis, copyStructure);

  const visualMarkdown = buildLandingPageVisualMarkdown({
    url,
    title: pageData.title,
    funnelType,
    conversionScore,
    psychologicalTriggers: triggers,
    ctaButtons: pageData.ctaButtons,
    offerAnalysis,
    copyStructure,
  });

  const result = {
    url,
    scrapingMetadata: pageData.metadata,
    title: pageData.title,
    metaDescription: pageData.metaDescription,
    funnelType,
    copyStructure,
    offerAnalysis,
    psychologicalTriggers: triggers,
    ctaButtons: pageData.ctaButtons,
    topHeadings: pageData.headings.slice(0, 10),
    keyCopySnippets: pageData.paragraphs.slice(0, 5),
    rawTextLength: pageData.rawTextLength,
    externalLinks: pageData.links.filter((l) => l.href.startsWith("http")).slice(0, 10),
    techStack: {
      scripts: pageData.scripts.slice(0, 8),
      imageCount: pageData.images.length,
    },
    conversionScore,
    visualSummary: { markdown: visualMarkdown },
    recommendations: generateLandingRecommendations(triggers, offerAnalysis, copyStructure),
    analyzedAt: new Date().toISOString(),
  };

  return toolRichResult(result, {
    visualMarkdown,
    images: [
      { data: svgToBase64(generateScoreGaugeSvg(conversionScore, "Conversion Score")), mimeType: "image/svg+xml", title: "Conversion Score" },
      { data: svgToBase64(generateTriggerBarsSvg(triggers, conversionScore)), mimeType: "image/svg+xml", title: "Psychological Triggers" },
    ],
  });
}

function calculateConversionScore(
  triggers: string[],
  offer: {
    hasDiscount: boolean;
    hasFreeShipping: boolean;
    hasGuarantee: boolean;
    hasUrgency: boolean;
    hasScarcity: boolean;
  },
  copy: { hasSocialProof: boolean; hasTestimonials: boolean; hasFAQ: boolean },
): number {
  let score = 30;
  score += triggers.length * 5;
  if (offer.hasDiscount) score += 8;
  if (offer.hasFreeShipping) score += 5;
  if (offer.hasGuarantee) score += 10;
  if (offer.hasUrgency) score += 7;
  if (offer.hasScarcity) score += 7;
  if (copy.hasSocialProof) score += 8;
  if (copy.hasTestimonials) score += 8;
  if (copy.hasFAQ) score += 5;
  return Math.min(100, score);
}

function generateLandingRecommendations(
  triggers: string[],
  offer: { hasGuarantee: boolean; hasUrgency: boolean; pricesFound: string[] },
  copy: { hasSocialProof: boolean; copyLength: string },
): string[] {
  const recs: string[] = [];
  if (!offer.hasGuarantee) recs.push("Add money-back guarantee to reduce purchase friction.");
  if (!offer.hasUrgency) recs.push("Consider adding urgency elements (countdown, limited offer).");
  if (!copy.hasSocialProof) recs.push("Add social proof section (reviews, customer count, media logos).");
  if (triggers.length >= 4) recs.push("Strong psychological triggers detected — study this page as a template.");
  if (offer.pricesFound.length > 0) recs.push(`Price anchoring detected: ${offer.pricesFound[0]} — note for competitive analysis.`);
  if (copy.copyLength === "long") recs.push("Long-form sales page — typical for high-ticket or info products.");
  if (recs.length === 0) recs.push("Well-optimized landing page — clone structure for your offer.");
  return recs;
}