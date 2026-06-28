import { fetchJson, fetchText } from "./http.js";
import { buildSourceStatus } from "./data-availability.js";
import { logger } from "./logger.js";

export interface MarketplaceListing {
  title: string;
  price: number | null;
  currency: string;
  soldCount: number | null;
  url?: string;
  source: "mercado_livre" | "shopee";
}

export interface MarketplaceDemandResult {
  keyword: string;
  country: string;
  mercadoLivre: {
    siteId: string;
    totalResults: number;
    listings: MarketplaceListing[];
    avgPrice: number | null;
    avgSold: number | null;
    demandSignal: string;
  } | null;
  shopee: {
    totalResults: number;
    listings: MarketplaceListing[];
    avgPrice: number | null;
    avgSold: number | null;
    demandSignal: string;
  } | null;
  combinedDemandScore: number;
  supplierAvailabilityScore: number;
  marketplaceSaturation: "low" | "medium" | "high" | "unknown";
  sources: ReturnType<typeof buildSourceStatus>[];
}

const ML_SITE_BY_COUNTRY: Record<string, string> = {
  BR: "MLB",
  AR: "MLA",
  MX: "MLM",
  CO: "MCO",
  CL: "MLC",
  PE: "MPE",
  UY: "MLU",
  EC: "MEC",
  VE: "MLV",
};

const SHOPEE_DOMAIN_BY_COUNTRY: Record<string, string> = {
  BR: "shopee.com.br",
  SG: "shopee.sg",
  MY: "shopee.com.my",
  PH: "shopee.ph",
  TH: "shopee.co.th",
  VN: "shopee.vn",
  ID: "shopee.co.id",
  TW: "shopee.tw",
};

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

function demandSignalFromTotals(total: number, avgSold: number | null): string {
  if (total === 0) return "UNAVAILABLE — nenhum listing encontrado";
  if (total >= 5000) return "HIGH — mercado muito ativo no marketplace";
  if (total >= 500 || (avgSold ?? 0) >= 100) return "MODERATE — demanda verificável";
  if (total >= 50) return "LOW — nicho presente mas volume limitado";
  return "MINIMAL — poucos produtos listados";
}

async function fetchMercadoLivre(keyword: string, country: string): Promise<MarketplaceDemandResult["mercadoLivre"]> {
  const siteId = ML_SITE_BY_COUNTRY[country.toUpperCase()] ?? "MLB";
  const url = `https://api.mercadolibre.com/sites/${siteId}/search?q=${encodeURIComponent(keyword)}&limit=20`;

  try {
    const data = await fetchJson<{
      paging?: { total: number };
      results?: Array<{
        title: string;
        price: number;
        currency_id: string;
        sold_quantity: number;
        permalink: string;
      }>;
    }>(url, { timeoutMs: 12_000 });

    const results = data.results ?? [];
    const listings: MarketplaceListing[] = results.map((r) => ({
      title: r.title,
      price: r.price,
      currency: r.currency_id,
      soldCount: r.sold_quantity,
      url: r.permalink,
      source: "mercado_livre",
    }));

    const prices = listings.map((l) => l.price).filter((p): p is number => p !== null);
    const sold = listings.map((l) => l.soldCount ?? 0).filter((s) => s > 0);

    return {
      siteId,
      totalResults: data.paging?.total ?? listings.length,
      listings,
      avgPrice: avg(prices),
      avgSold: avg(sold),
      demandSignal: demandSignalFromTotals(data.paging?.total ?? 0, avg(sold)),
    };
  } catch (error) {
    logger.warn("Mercado Livre search failed", { error: String(error) });
    return null;
  }
}

async function fetchShopee(keyword: string, country: string): Promise<MarketplaceDemandResult["shopee"]> {
  const domain = SHOPEE_DOMAIN_BY_COUNTRY[country.toUpperCase()] ?? "shopee.com.br";
  const url = `https://${domain}/api/v4/search/search_items?by=relevancy&keyword=${encodeURIComponent(keyword)}&limit=20&newest=0&order=desc&page_type=search&scenario=PAGE_GLOBAL_SEARCH&version=2`;

  try {
    const data = await fetchJson<{
      total_count?: number;
      items?: Array<{
        item_basic?: {
          name: string;
          price?: number;
          price_min?: number;
          sold?: number;
          currency?: string;
        };
      }>;
    }>(url, {
      browserLike: true,
      timeoutMs: 12_000,
      headers: {
        Referer: `https://${domain}/search?keyword=${encodeURIComponent(keyword)}`,
        "X-API-Source": "pc",
        "X-Shopee-Language": country === "BR" ? "pt-BR" : "en",
      },
    });

    const items = data.items ?? [];
    const listings: MarketplaceListing[] = [];
    for (const item of items) {
      const b = item.item_basic;
      if (!b?.name) continue;
      const rawPrice = b.price_min ?? b.price ?? null;
      const price = rawPrice !== null ? Math.round(rawPrice / 100_000) : null;
      listings.push({
        title: b.name,
        price,
        currency: b.currency ?? (country === "BR" ? "BRL" : "USD"),
        soldCount: b.sold ?? null,
        url: `https://${domain}/search?keyword=${encodeURIComponent(keyword)}`,
        source: "shopee",
      });
    }

    const prices = listings.map((l) => l.price).filter((p): p is number => p !== null && p > 0);
    const sold = listings.map((l) => l.soldCount ?? 0).filter((s) => s > 0);
    const total = data.total_count ?? listings.length;

    return {
      totalResults: total,
      listings,
      avgPrice: avg(prices),
      avgSold: avg(sold),
      demandSignal: demandSignalFromTotals(total, avg(sold)),
    };
  } catch (error) {
    logger.warn("Shopee API search failed, trying HTML fallback", { error: String(error) });
  }

  try {
    const html = await fetchText(`https://${domain}/search?keyword=${encodeURIComponent(keyword)}`, {
      browserLike: true,
      timeoutMs: 12_000,
    });
    const countMatch = html.match(/"total_count":(\d+)/);
    const total = countMatch ? parseInt(countMatch[1]!, 10) : 0;
    if (total > 0) {
      return {
        totalResults: total,
        listings: [],
        avgPrice: null,
        avgSold: null,
        demandSignal: demandSignalFromTotals(total, null),
      };
    }
  } catch (error) {
    logger.warn("Shopee HTML fallback failed", { error: String(error) });
  }

  return null;
}

export function computeMarketplaceScores(
  ml: MarketplaceDemandResult["mercadoLivre"],
  shopee: MarketplaceDemandResult["shopee"],
) {
  const totals = [ml?.totalResults ?? 0, shopee?.totalResults ?? 0].filter((t) => t > 0);
  const soldCandidates = [ml?.avgSold, shopee?.avgSold].filter(
    (s): s is number => typeof s === "number" && s > 0,
  );
  const avgSold = avg(soldCandidates);

  const maxTotal = totals.length > 0 ? Math.max(...totals) : 0;
  let combinedDemandScore = 0;
  if (maxTotal > 0) {
    combinedDemandScore = Math.min(100, Math.round(Math.log10(maxTotal + 1) * 22 + (avgSold ?? 0) / 50));
  }

  const listingVariety = (ml?.listings.length ?? 0) + (shopee?.listings.length ?? 0);
  const supplierAvailabilityScore =
    listingVariety >= 15 ? 80 : listingVariety >= 8 ? 60 : listingVariety >= 3 ? 40 : maxTotal > 0 ? 25 : 0;

  const marketplaceSaturation: MarketplaceDemandResult["marketplaceSaturation"] =
    maxTotal >= 10_000 ? "high" : maxTotal >= 1000 ? "medium" : maxTotal > 0 ? "low" : "unknown";

  return { combinedDemandScore, supplierAvailabilityScore, marketplaceSaturation };
}

export async function fetchMarketplaceDemand(keyword: string, country = "BR"): Promise<MarketplaceDemandResult> {
  const [ml, shopee] = await Promise.all([
    fetchMercadoLivre(keyword, country),
    fetchShopee(keyword, country),
  ]);

  const scores = computeMarketplaceScores(ml, shopee);
  const sources = [
    buildSourceStatus(
      "mercado_livre",
      ml?.listings.length ?? 0,
      ml ? undefined : "Mercado Livre API indisponível",
      ml ? "Mercado Livre Search API" : undefined,
    ),
    buildSourceStatus(
      "shopee",
      shopee?.listings.length ?? (shopee?.totalResults ? 1 : 0),
      shopee ? undefined : "Shopee API bloqueada ou indisponível",
      shopee?.listings.length ? "Shopee Search API" : shopee ? "Shopee total_count only" : undefined,
    ),
  ];

  return {
    keyword,
    country,
    mercadoLivre: ml,
    shopee,
    ...scores,
    sources,
  };
}