import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getRedditUserAgent,
  getSubredditsForNiche,
  isRedditApiConfigured,
  isRedditPasswordConfigured,
  isRedditRefreshConfigured,
  parseRedditListing,
} from "../src/lib/reddit-client.js";

describe("reddit-client", () => {
  it("parses listing children into posts", () => {
    const posts = parseRedditListing({
      data: {
        children: [
          {
            data: {
              title: "Portable blender review",
              score: 512,
              num_comments: 88,
              subreddit: "BuyItForLife",
              permalink: "/r/BuyItForLife/comments/xyz/post/",
              url: "https://example.com",
            },
          },
        ],
      },
    });

    assert.equal(posts.length, 1);
    assert.equal(posts[0]?.score, 512);
    assert.equal(posts[0]?.url, "https://example.com");
  });

  it("maps niches to relevant subreddits", () => {
    const subs = getSubredditsForNiche("fitness");
    assert.ok(subs.includes("Fitness"));
  });

  it("reports unconfigured Reddit API without env vars", () => {
    assert.equal(isRedditApiConfigured(), false);
    assert.equal(isRedditRefreshConfigured(), false);
    assert.equal(isRedditPasswordConfigured(), false);
    assert.match(getRedditUserAgent(), /TheMinerMCP/);
  });
});