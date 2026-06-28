import puppeteer, { type Browser } from "puppeteer";
import { logger } from "./logger.js";

export type BrowserLauncher = () => Promise<Browser>;

const DEFAULT_LAUNCH_ARGS = ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"];

let browserInstance: Browser | null = null;
let launchFn: BrowserLauncher = defaultLaunch;
let launchCount = 0;
let poolLock: Promise<void> = Promise.resolve();

async function defaultLaunch(): Promise<Browser> {
  return puppeteer.launch({
    headless: true,
    args: DEFAULT_LAUNCH_ARGS,
  });
}

async function withPoolLock<T>(fn: () => Promise<T>): Promise<T> {
  const previous = poolLock;
  let release!: () => void;
  poolLock = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await fn();
  } finally {
    release();
  }
}

/** Injectable launcher for unit tests (mock browser reuse). */
export function setBrowserLauncher(fn: BrowserLauncher): void {
  launchFn = fn;
}

/** Reset pool state — for tests and shutdown. */
export function resetBrowserPool(): void {
  browserInstance = null;
  launchFn = defaultLaunch;
  launchCount = 0;
  poolLock = Promise.resolve();
}

function isBrowserAlive(browser: Browser | null): boolean {
  return browser !== null && browser.isConnected();
}

async function disposeStaleBrowser(): Promise<void> {
  if (!browserInstance) return;
  const stale = browserInstance;
  browserInstance = null;
  try {
    await stale.close();
  } catch (error) {
    logger.warn("Error disposing stale browser", { error: String(error) });
  }
}

/**
 * Returns a shared browser instance. Relaunches when disconnected.
 * Closes stale instance before relaunch to prevent leaks.
 * Serialized via pool lock to avoid concurrent launch/dispose races.
 */
export async function getBrowser(): Promise<{ browser: Browser; poolReused: boolean }> {
  return withPoolLock(async () => {
    if (isBrowserAlive(browserInstance)) {
      return { browser: browserInstance!, poolReused: true };
    }

    await disposeStaleBrowser();
    logger.debug("Launching new Puppeteer browser instance");
    browserInstance = await launchFn();
    launchCount++;
    return { browser: browserInstance, poolReused: false };
  });
}

export function getLaunchCount(): number {
  return launchCount;
}

export async function closeBrowser(): Promise<void> {
  await withPoolLock(async () => {
    await disposeStaleBrowser();
  });
}