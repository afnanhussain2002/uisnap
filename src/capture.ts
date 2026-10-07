import fs from "node:fs";
import type { Page } from "playwright-core";
import { launchBrowser } from "./browser.js";
import { VIEWPORTS, type ViewportName } from "./config.js";
import { UserError } from "./errors.js";
import type { Shot } from "./state.js";

export interface CaptureOptions {
  url: string;
  viewports: ViewportName[];
  fullPage: boolean;
  waitMs: number;
  selector?: string;
  authFile?: string;
  fileFor: (viewport: ViewportName) => string;
}

// Freeze anything that moves so before/after only differ by your real changes.
const STABILIZE_CSS = `
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    transition: none !important;
    caret-color: transparent !important;
  }
  html { scroll-behavior: auto !important; }
`;

async function openSettled(page: Page, url: string): Promise<void> {
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 20_000 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/ERR_CONNECTION_REFUSED|ERR_NAME_NOT_RESOLVED|ERR_ADDRESS_UNREACHABLE/.test(msg)) {
      throw new UserError(
        `Couldn't reach ${url}\n  Is your dev server running? Set the right address with --base or in uisnap.config.json.`
      );
    }
    // A timeout usually means the page keeps a connection open (live reload,
    // analytics). The page is loaded anyway, so carry on.
    if (!/Timeout/i.test(msg)) throw err;
  }
}

async function loadLazyContent(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const step = Math.max(window.innerHeight, 400);
    for (let y = 0, i = 0; y < document.body.scrollHeight && i < 60; y += step, i++) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
  });
}

export async function capture(options: CaptureOptions): Promise<Shot[]> {
  const browser = await launchBrowser();
  const shots: Shot[] = [];
  try {
    for (const name of options.viewports) {
      const vp = VIEWPORTS[name];
      const useAuth = options.authFile && fs.existsSync(options.authFile);
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: vp.scale,
        isMobile: vp.mobile,
        hasTouch: vp.mobile,
        reducedMotion: "reduce",
        storageState: useAuth ? options.authFile : undefined,
      });
      try {
        const page = await context.newPage();
        await openSettled(page, options.url);
        await page.addStyleTag({ content: STABILIZE_CSS });
        await page.evaluate(async () => {
          await document.fonts?.ready;
        });
        if (options.fullPage) await loadLazyContent(page);
        if (options.waitMs) await page.waitForTimeout(options.waitMs);

        const file = options.fileFor(name);
        if (options.selector) {
          const target = page.locator(options.selector).first();
          if ((await target.count()) === 0) {
            throw new UserError(`Nothing on the page matches the selector "${options.selector}".`);
          }
          await target.screenshot({ path: file, animations: "disabled", caret: "hide" });
        } else {
          await page.screenshot({
            path: file,
            fullPage: options.fullPage,
            animations: "disabled",
            caret: "hide",
          });
        }
        const landed = new URL(page.url());
        const redirected = landed.pathname !== new URL(options.url).pathname;
        shots.push({ viewport: name, file, ...(redirected ? { redirectedTo: landed.pathname } : {}) });
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  return shots;
}
