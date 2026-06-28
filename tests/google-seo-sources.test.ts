import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  estimateCompetition,
  estimateSearchVolume,
  parsePeopleAlsoAsk,
  mapRedditPostsToSignals,
  parseTrendsGeoMap,
  parseTrendsMultiline,
  parseTrendsRelatedQueries,
  parseWikipediaPageviews,
  stripGoogleTrendsPrefix,
} from "../src/lib/google-seo-sources.js";

describe("google-seo-sources parsers", () => {
  it("strips Google Trends XSSI prefix", () => {
    assert.equal(stripGoogleTrendsPrefix(")]}',\n{\"default\":{}}"), "{\"default\":{}}");
  });

  it("parses related top and rising queries", () => {
    const fixture = `)]}',
{
  "default": {
    "rankedList": [
      {
        "rankedKeyword": [
          { "query": "portable blender", "value": 100 },
          { "query": "mini blender", "value": 82 }
        ]
      },
      {
        "rankedKeyword": [
          { "query": "usb blender 2026", "value": 250, "formattedValue": "+250%" }
        ]
      }
    ]
  }
}`;
    const parsed = parseTrendsRelatedQueries(fixture);
    assert.equal(parsed.topKeywords.length, 2);
    assert.equal(parsed.risingKeywords.length, 1);
    assert.equal(parsed.risingKeywords[0]?.keyword, "usb blender 2026");
  });

  it("parses interest over time momentum", () => {
    const fixture = `)]}',
{
  "default": {
    "timelineData": [
      { "value": [20] },
      { "value": [25] },
      { "value": [40] },
      { "value": [55] },
      { "value": [70] },
      { "value": [80] }
    ]
  }
}`;
    const parsed = parseTrendsMultiline(fixture);
    assert.ok(parsed);
    assert.equal(parsed!.momentum, "rising");
    assert.ok(parsed!.average > 0);
  });

  it("parses regional interest", () => {
    const fixture = `)]}',
{
  "default": {
    "geoMapData": [
      { "geoName": "California", "value": [100] },
      { "geoName": "Texas", "value": [72] }
    ]
  }
}`;
    const parsed = parseTrendsGeoMap(fixture);
    assert.equal(parsed[0]?.region, "California");
    assert.equal(parsed[0]?.score, 100);
  });

  it("parses People Also Ask from HTML", () => {
    const html = `
      <div data-q="What is the best portable blender?"></div>
      <div class="related-question-pair">Is portable blender worth it?</div>
    `;
    const questions = parsePeopleAlsoAsk(html);
    assert.ok(questions.includes("What is the best portable blender?"));
    assert.ok(questions.some((q) => q.includes("worth it")));
  });

  it("maps Reddit posts to demand signals", () => {
    const parsed = mapRedditPostsToSignals([
      {
        title: "Best portable blender?",
        score: 240,
        num_comments: 45,
        subreddit: "BuyItForLife",
        url: "https://www.reddit.com/r/BuyItForLife/comments/abc/test/",
      },
    ]);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0]?.subreddit, "BuyItForLife");
  });

  it("parses Wikipedia pageviews trend", () => {
    const items = [80, 85, 90, 95, 100, 110, 130, 150, 170, 190, 210, 230, 250, 280].map(
      (views) => ({ views }),
    );
    const parsed = parseWikipediaPageviews({ items }, "Portable_blender");
    assert.ok(parsed);
    assert.equal(parsed!.article, "Portable_blender");
    assert.equal(parsed!.momentum, "rising");
  });

  it("estimates search volume and competition from signals", () => {
    const volume = estimateSearchVolume({
      interest: { average: 75, momentum: "rising", recentPeak: 90 },
      risingCount: 6,
      redditAvgScore: 220,
      wikiDailyAverage: 600,
      autocompleteCount: 9,
    });
    const competition = estimateCompetition({
      topCount: 12,
      risingCount: 7,
      paaCount: 8,
      regionalLeaders: 5,
    });
    assert.equal(volume, "high");
    assert.equal(competition, "high");
  });
});

describe("analyzeGoogleSeo integration shape", () => {
  it("returns expanded free-source fields", async () => {
    const mod = await import("../src/tools/analyze-google-seo.js");
    const result = await mod.analyzeGoogleSeo({
      keyword: "fitness band",
      country: "US",
      language: "en",
    });

    const jsonBlock = result.content.find((c) => c.type === "text" && c.text.includes('"success"'));
    const parsed = JSON.parse(jsonBlock?.text ?? "{}") as {
      success: boolean;
      data: {
        dataSources: string[];
        peopleAlsoAsk: string[];
        risingKeywords: unknown[];
        regionalInterest: unknown[];
        redditSignals: unknown[];
        interestOverTime: unknown;
        apiKeysUsed: { stack: string };
      };
    };

    assert.equal(parsed.success, true);
    assert.ok(parsed.data.dataSources.includes("google_trends"));
    assert.ok(parsed.data.dataSources.includes("google_autocomplete"));
    assert.equal(parsed.data.apiKeysUsed.stack, "free_multi_source");
    assert.ok(Array.isArray(parsed.data.peopleAlsoAsk));
    assert.ok(Array.isArray(parsed.data.risingKeywords));
    assert.ok(Array.isArray(parsed.data.regionalInterest));
    assert.ok(Array.isArray(parsed.data.redditSignals));
  });
});