import { z } from "zod";
import { toolRichResult } from "../lib/errors.js";
import { fetchMarketplaceDemand } from "../lib/marketplace-sources.js";
import { logger } from "../lib/logger.js";

export const analyzeMarketplaceDemandSchema = z.object({
  keyword: z.string().describe("Product or niche keyword to search on marketplaces"),
  country: z.string().optional().default("BR").describe("ISO country code (BR, MX, SG, etc.)"),
});

export type AnalyzeMarketplaceDemandInput = z.infer<typeof analyzeMarketplaceDemandSchema>;

function buildMarketplaceMarkdown(data: Awaited<ReturnType<typeof fetchMarketplaceDemand>>): string {
  const mlRows = data.mercadoLivre?.listings
    .slice(0, 5)
    .map((l, i) => `${i + 1}. ${l.title.slice(0, 55)} — ${l.price ?? "?"} ${l.currency} (${l.soldCount ?? 0} vendidos)`)
    .join("\n");

  const shopeeRows = data.shopee?.listings
    .slice(0, 5)
    .map((l, i) => `${i + 1}. ${l.title.slice(0, 55)} — ${l.price ?? "?"} (${l.soldCount ?? 0} vendidos)`)
    .join("\n");

  return [
    `# 🛒 Marketplace Demand — ${data.keyword}`,
    "",
    `| Métrica | Valor |`,
    `|---------|-------|`,
    `| Demand Score | ${data.combinedDemandScore}/100 |`,
    `| Supplier Availability | ${data.supplierAvailabilityScore}/100 |`,
    `| Saturação marketplace | ${data.marketplaceSaturation} |`,
    "",
    data.mercadoLivre
      ? `## Mercado Livre (${data.mercadoLivre.siteId})\n\n- Total: ${data.mercadoLivre.totalResults}\n- Preço médio: ${data.mercadoLivre.avgPrice ?? "N/D"}\n- Vendas médias: ${data.mercadoLivre.avgSold ?? "N/D"}\n- ${data.mercadoLivre.demandSignal}\n\n${mlRows || "_Sem listings detalhados_"}`
      : "## Mercado Livre\n\n❌ Indisponível",
    "",
    data.shopee
      ? `## Shopee\n\n- Total: ${data.shopee.totalResults}\n- Preço médio: ${data.shopee.avgPrice ?? "N/D"}\n- Vendas médias: ${data.shopee.avgSold ?? "N/D"}\n- ${data.shopee.demandSignal}\n\n${shopeeRows || "_Apenas total_count — API bloqueou detalhes_"}`
      : "## Shopee\n\n❌ Indisponível ou bloqueado",
  ].join("\n");
}

export async function analyzeMarketplaceDemand(args: AnalyzeMarketplaceDemandInput) {
  const { keyword, country = "BR" } = args;
  logger.info("Analyzing marketplace demand", { keyword, country });

  const data = await fetchMarketplaceDemand(keyword, country);
  const visualMarkdown = buildMarketplaceMarkdown(data);

  const result = {
    query: { keyword, country },
    dataAvailability:
      data.mercadoLivre || data.shopee
        ? data.mercadoLivre && data.shopee
          ? "available"
          : "partial"
        : "unavailable",
    sources: data.sources,
    combinedDemandScore: data.combinedDemandScore,
    supplierAvailabilityScore: data.supplierAvailabilityScore,
    marketplaceSaturation: data.marketplaceSaturation,
    mercadoLivre: data.mercadoLivre
      ? {
          totalResults: data.mercadoLivre.totalResults,
          avgPrice: data.mercadoLivre.avgPrice,
          avgSold: data.mercadoLivre.avgSold,
          demandSignal: data.mercadoLivre.demandSignal,
          topListings: data.mercadoLivre.listings.slice(0, 8),
        }
      : null,
    shopee: data.shopee
      ? {
          totalResults: data.shopee.totalResults,
          avgPrice: data.shopee.avgPrice,
          avgSold: data.shopee.avgSold,
          demandSignal: data.shopee.demandSignal,
          topListings: data.shopee.listings.slice(0, 8),
        }
      : null,
    analyzedAt: new Date().toISOString(),
  };

  return toolRichResult(result, { visualMarkdown, compactJson: true });
}