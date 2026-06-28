import { fetchWithTimeout } from "./http.js";

const GRAPH_API_VERSION = "v22.0";

export interface FacebookGraphAd {
  id: string;
  pageName: string;
  adCreativeBody: string;
  adDeliveryStartTime?: string;
  platforms: string[];
  isActive: boolean;
}

export interface FacebookGraphSearchResult {
  ads: FacebookGraphAd[];
  error?: string;
  errorCode?: number;
  errorSubcode?: number;
}

function sanitizeErrorMessage(message: string): string {
  return message
    .replace(/access_token=[^&\s]+/gi, "access_token=[REDACTED]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]")
    .replace(/EA[A-Za-z0-9]+/g, "[REDACTED_TOKEN]");
}

function formatCountryParam(country: string): string {
  const code = country.trim().toUpperCase();
  return `['${code}']`;
}

function mapFacebookError(
  code?: number,
  subcode?: number,
  message?: string,
): string {
  const detail = message ? ` — ${message}` : "";

  if (subcode === 2332004 || message?.toLowerCase().includes("identity")) {
    return (
      "Meta Ad Library API: verificação de identidade pendente. " +
      "Complete em https://www.facebook.com/ads/library/api e gere um token com permissão ads_read."
    );
  }

  if (code === 190 || message?.toLowerCase().includes("expired")) {
    return "Token do Facebook expirado — gere um novo token de longa duração no Graph API Explorer.";
  }

  if (code === 10 || code === 200 || message?.toLowerCase().includes("permission")) {
    return (
      "Token sem permissão ads_read para Ad Library API. " +
      "No app Meta, adicione a permissão e regenere o token."
    );
  }

  if (code === 100 && message?.toLowerCase().includes("ad_reached_countries")) {
    return `Parâmetro de país inválido para Ad Library API${detail}`;
  }

  return `Facebook Graph API error (code ${code ?? "unknown"})${detail}`;
}

export async function searchFacebookAdsArchive(
  searchTerm: string,
  country: string,
  accessToken: string,
): Promise<FacebookGraphSearchResult> {
  const url = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/ads_archive`);
  url.searchParams.set("search_terms", searchTerm);
  url.searchParams.set("ad_reached_countries", formatCountryParam(country));
  url.searchParams.set("ad_active_status", "ACTIVE");
  url.searchParams.set("ad_type", "ALL");
  url.searchParams.set(
    "fields",
    "id,ad_creative_bodies,page_name,ad_delivery_start_time,publisher_platforms",
  );
  url.searchParams.set("limit", "25");

  try {
    const response = await fetchWithTimeout(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      timeoutMs: 15_000,
    });

    const payload = (await response.json()) as {
      data?: Array<{
        id: string;
        page_name?: string;
        ad_creative_bodies?: string[];
        ad_delivery_start_time?: string;
        publisher_platforms?: string[];
      }>;
      error?: {
        message?: string;
        code?: number;
        error_subcode?: number;
      };
    };

    if (!response.ok || payload.error) {
      const err = payload.error;
      return {
        ads: [],
        error: mapFacebookError(err?.code, err?.error_subcode, err?.message),
        errorCode: err?.code,
        errorSubcode: err?.error_subcode,
      };
    }

    const ads = (payload.data ?? []).map((ad) => ({
      id: ad.id,
      pageName: ad.page_name ?? "Unknown",
      adCreativeBody: (ad.ad_creative_bodies ?? []).join(" ").slice(0, 500),
      adDeliveryStartTime: ad.ad_delivery_start_time,
      platforms: ad.publisher_platforms ?? [],
      isActive: true,
    }));

    return { ads };
  } catch (error) {
    return {
      ads: [],
      error: sanitizeErrorMessage(String(error)),
    };
  }
}