import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseFacebookAdLibraryHtml } from "../src/lib/facebook-ad-parser.js";

describe("parseFacebookAdLibraryHtml", () => {
  it("extracts atomically aligned ad fields (no zip-by-index misalignment)", () => {
    // Deliberately interleaved: parallel page_name/body arrays would pair wrong rows
    const html = `
      "ad_archive_id":"1111111111","page_name":"Brand Alpha","ad_creative_bodies":["Alpha creative text"],"publisher_platforms":["facebook"]
      unrelated "page_name":"Brand Beta"
      "ad_archive_id":"2222222222","page_name":"Brand Beta","ad_creative_bodies":["Beta creative text"],"publisher_platforms":["instagram"]
      "ad_archive_id":"1111111111"
    `;

    const ads = parseFacebookAdLibraryHtml(html);
    assert.equal(ads.length, 2);

    const alpha = ads.find((a) => a.id === "1111111111");
    const beta = ads.find((a) => a.id === "2222222222");

    assert.ok(alpha);
    assert.ok(beta);
    assert.equal(alpha!.pageName, "Brand Alpha");
    assert.ok(alpha!.adCreativeBody.includes("Alpha creative"));
    assert.equal(beta!.pageName, "Brand Beta");
    assert.ok(beta!.adCreativeBody.includes("Beta creative"));
    assert.notEqual(alpha!.adCreativeBody, beta!.adCreativeBody);
  });

  it("skips ads without page_name in local window", () => {
    const html = `"ad_archive_id":"9999999999","ad_creative_bodies":["orphan body"]`;
    const ads = parseFacebookAdLibraryHtml(html);
    assert.equal(ads.length, 0);
  });
});