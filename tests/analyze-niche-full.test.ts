import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { analyzeNicheFull } from "../src/tools/analyze-niche-full.js";

describe("analyzeNicheFull", () => {
  it("returns orchestrated visual report in a single call", async () => {
    const result = await analyzeNicheFull({
      niche: "emagrecimento",
      country: "BR",
      time_period: "last_30_days",
    });

    assert.equal(result.isError, undefined);
    assert.ok(result.content.length >= 2);

    const markdown = result.content.find((c) => c.type === "text" && c.text?.includes("Inteligência Estratégica"));
    assert.ok(markdown, "should include strategic intelligence report");

    const images = result.content.filter((c) => c.type === "image");
    assert.equal(images.length, 0, "default should be light response without images");

    const jsonBlock = result.content.find((c) => c.type === "text" && c.text?.includes('"orchestration"'));
    const parsed = JSON.parse(jsonBlock?.text ?? "{}") as {
      success: boolean;
      data: { report: { opportunityScore: number }; orchestration: { mode: string } };
    };
    assert.equal(parsed.success, true);
    assert.equal(parsed.data.orchestration.mode, "single_call_parallel");
    assert.ok(parsed.data.report.opportunityScore >= 0);
  }, { timeout: 120_000 });
});