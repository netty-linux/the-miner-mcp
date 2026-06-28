import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  resetBrowserPool,
  setBrowserLauncher,
  closeBrowser,
} from "../src/lib/browser-pool.js";
import {
  fetchHtml,
  extractPageData,
  scrapePage,
  JS_HEAVY_REFERENCE_URL,
} from "../src/lib/scraping.js";
import type { Browser } from "puppeteer";

const MOCK_HTML = `<!DOCTYPE html><html><head><title>Puppeteer Page</title></head><body><h1>Loaded via browser</h1></body></html>`;

describe("fetchHtml with puppeteer", () => {
  beforeEach(() => {
    resetBrowserPool();
  });

  afterEach(async () => {
    await closeBrowser();
    resetBrowserPool();
  });

  it("uses injected browser pool and returns page content with metadata", async () => {
    let newPageCalls = 0;

    setBrowserLauncher(async () => {
      return {
        isConnected: () => true,
        close: async () => {},
        newPage: async () => {
          newPageCalls++;
          return {
            setUserAgent: async () => {},
            goto: async () => {},
            content: async () => MOCK_HTML,
            close: async () => {},
          };
        },
      } as unknown as Browser;
    });

    const result = await fetchHtml("https://example.com", true);

    assert.equal(newPageCalls, 1);
    assert.equal(result.metadata.renderMethod, "puppeteer");
    assert.equal(result.metadata.browserPoolReused, false);
    assert.ok(result.html.includes("Puppeteer Page"));
  });
});

describe("fetchHtml puppeteer integration (real JS-heavy page)", () => {
  beforeEach(() => {
    resetBrowserPool();
  });

  afterEach(async () => {
    await closeBrowser();
    resetBrowserPool();
  });

  it("renders JS quotes on quotes.toscrape.com that static fetch cannot extract", async () => {
    const staticResult = await fetchHtml(JS_HEAVY_REFERENCE_URL, false);
    const puppeteerResult = await fetchHtml(JS_HEAVY_REFERENCE_URL, true);

    const staticData = extractPageData(staticResult.html, JS_HEAVY_REFERENCE_URL);
    const puppeteerData = extractPageData(puppeteerResult.html, JS_HEAVY_REFERENCE_URL);

    const staticQuoteCount = (staticResult.html.match(/class="quote"/g) ?? []).length;
    const puppeteerQuoteCount = (puppeteerResult.html.match(/class="quote"/g) ?? []).length;

    assert.equal(staticResult.metadata.renderMethod, "http");
    assert.equal(puppeteerResult.metadata.renderMethod, "puppeteer");
    assert.ok(
      puppeteerQuoteCount > staticQuoteCount,
      `puppeteer must render more quote blocks (static=${staticQuoteCount}, puppeteer=${puppeteerQuoteCount})`,
    );
    assert.ok(
      puppeteerData.rawTextLength > staticData.rawTextLength + 100,
      "puppeteer must extract substantially more body text from JS-rendered quotes",
    );
    assert.equal(puppeteerResult.metadata.jsContentDetected, true);
    assert.equal(puppeteerResult.metadata.browserPoolReused, false);

    const second = await fetchHtml(JS_HEAVY_REFERENCE_URL, true);
    assert.equal(second.metadata.browserPoolReused, true, "second call should reuse browser pool");
  });

  it("scrapePage deep mode follows pagination on real JS site", async () => {
    const result = await scrapePage(JS_HEAVY_REFERENCE_URL, true);
    const pageLinks = result.links.filter((l) => /page\/\d+/i.test(l.href));

    assert.equal(result.metadata.renderMethod, "puppeteer");
    assert.equal(result.metadata.jsContentDetected, true);
    assert.ok(result.headings.length > 0 || result.paragraphs.length > 0, "must extract rendered quote content");
    assert.ok(pageLinks.length > 0, "must discover pagination links for deep funnel scraping");
  });
});