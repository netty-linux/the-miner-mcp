import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isValidVideoTitle,
  parseViewCount,
  parseYouTubeSearchHtml,
} from "../src/lib/youtube-parser.js";

describe("youtube-parser", () => {
  it("rejects UI junk titles", () => {
    assert.equal(isValidVideoTitle("Search filters"), false);
    assert.equal(isValidVideoTitle("Sort by"), false);
    assert.equal(isValidVideoTitle("Real Product Review 2026"), true);
  });

  it("parses view counts from text", () => {
    assert.equal(parseViewCount("1.2M views"), 1_200_000);
    assert.equal(parseViewCount("50K views"), 50_000);
    assert.equal(parseViewCount("3,456 views"), 3456);
  });

  it("extracts aligned videoRenderer blocks atomically", () => {
    const html = `
      var ytInitialData = {"contents":{"sectionListRenderer":{"contents":[{"itemSectionRenderer":{"contents":[
        {"videoRenderer":{"videoId":"dQw4w9WgXcQ","title":{"runs":[{"text":"Fitness Band Review"}]},
          "viewCountText":{"simpleText":"1.2M views"},
          "ownerText":{"runs":[{"text":"FitChannel"}]}}},
        {"videoRenderer":{"videoId":"abcdefghijk","title":{"runs":[{"text":"Search filters"}]},
          "viewCountText":{"simpleText":"5M views"},
          "ownerText":{"runs":[{"text":"YouTube"}]}}}
      ]}}]}}};
    `;

    const videos = parseYouTubeSearchHtml(html);
    assert.equal(videos.length, 1);
    assert.equal(videos[0]!.videoId, "dQw4w9WgXcQ");
    assert.equal(videos[0]!.title, "Fitness Band Review");
    assert.equal(videos[0]!.channelTitle, "FitChannel");
    assert.equal(videos[0]!.viewCount, 1_200_000);
  });

  it("falls back to block regex with aligned fields", () => {
    const html = `"videoRenderer":{"videoId":"abc12345678","title":{"runs":[{"text":"Portable Blender Test"}]},"viewCountText":{"simpleText":"800K views"},"ownerText":{"runs":[{"text":"KitchenLab"}]}}`;
    const videos = parseYouTubeSearchHtml(html);
    assert.equal(videos.length, 1);
    assert.equal(videos[0]!.title, "Portable Blender Test");
    assert.equal(videos[0]!.viewCount, 800_000);
  });
});