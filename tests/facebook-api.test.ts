import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { searchFacebookAdsArchive } from "../src/lib/facebook-api.js";

describe("facebook-api", () => {
  it("returns structured error for invalid token without leaking secrets", async () => {
    const result = await searchFacebookAdsArchive("fitness", "BR", "invalid-token-test");
    assert.equal(result.ads.length, 0);
    assert.ok(result.error);
    assert.doesNotMatch(result.error!, /invalid-token-test/);
  });
});