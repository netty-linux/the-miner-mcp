import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createMinerServer } from "../src/server.js";

describe("createMinerServer (stateless HTTP)", () => {
  it("returns a new McpServer instance on each call", () => {
    const first = createMinerServer();
    const second = createMinerServer();
    assert.notStrictEqual(first, second);
  });
});