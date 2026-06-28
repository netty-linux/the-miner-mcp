import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  getBrowser,
  closeBrowser,
  resetBrowserPool,
  setBrowserLauncher,
  getLaunchCount,
  type BrowserLauncher,
} from "../src/lib/browser-pool.js";
import type { Browser } from "puppeteer";

function createMockBrowser(
  isConnected: boolean | (() => boolean) = true,
  onClose?: () => void,
): Browser {
  const readConnected = () =>
    typeof isConnected === "function" ? isConnected() : isConnected;

  return {
    isConnected: readConnected,
    close: async () => {
      onClose?.();
    },
    newPage: async () => {
      throw new Error("newPage not used in pool test");
    },
  } as unknown as Browser;
}

describe("browser-pool", () => {
  beforeEach(() => {
    resetBrowserPool();
  });

  afterEach(async () => {
    await closeBrowser();
    resetBrowserPool();
  });

  it("reuses browser instance on second getBrowser() call", async () => {
    let launchCount = 0;
    const instance = createMockBrowser(true);

    setBrowserLauncher(async () => {
      launchCount++;
      return instance;
    });

    const { browser: b1, poolReused: r1 } = await getBrowser();
    const { browser: b2, poolReused: r2 } = await getBrowser();

    assert.equal(launchCount, 1);
    assert.equal(r1, false);
    assert.equal(r2, true);
    assert.strictEqual(b1, b2);
  });

  it("serializes concurrent getBrowser calls (single launch)", async () => {
    let launchCount = 0;
    const instance = createMockBrowser(true);

    setBrowserLauncher(async () => {
      launchCount++;
      await new Promise((resolve) => setTimeout(resolve, 30));
      return instance;
    });

    const [r1, r2, r3] = await Promise.all([getBrowser(), getBrowser(), getBrowser()]);

    assert.equal(launchCount, 1, "concurrent callers must share one launch");
    assert.strictEqual(r1.browser, r2.browser);
    assert.strictEqual(r2.browser, r3.browser);
    assert.equal(r1.poolReused, false);
    assert.equal(r2.poolReused, true);
    assert.equal(r3.poolReused, true);
  });

  it("closes stale browser before relaunch (no leak)", async () => {
    let launchCount = 0;
    let closeCount = 0;
    let connected = true;

    const launcher: BrowserLauncher = async () => {
      launchCount++;
      if (launchCount === 1) {
        return createMockBrowser(() => connected, () => {
          closeCount++;
          connected = false;
        });
      }
      return createMockBrowser(true);
    };

    setBrowserLauncher(launcher);

    const { browser: b1 } = await getBrowser();
    assert.equal(getLaunchCount(), 1);

    connected = false;
    const { browser: b2, poolReused } = await getBrowser();

    assert.equal(closeCount, 1, "stale browser must be closed before relaunch");
    assert.equal(getLaunchCount(), 2);
    assert.equal(poolReused, false);
    assert.notStrictEqual(b1, b2);
  });
});