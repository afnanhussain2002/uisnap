import { chromium, type Browser } from "playwright-core";
import { execFileSync } from "node:child_process";
import { UserError } from "./errors.js";

const LINUX_BROWSERS = [
  "google-chrome",
  "google-chrome-stable",
  "chromium",
  "chromium-browser",
  "microsoft-edge",
  "microsoft-edge-stable",
  "brave-browser",
];

function which(cmd: string): string | null {
  try {
    const out = execFileSync("which", [cmd], { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    return out || null;
  } catch {
    return null;
  }
}

/**
 * Launch a browser without downloading one:
 * 1. UISNAP_BROWSER env var (path to any Chromium-based browser)
 * 2. Installed Google Chrome, then Microsoft Edge
 * 3. On Linux, common browser commands on PATH
 * 4. A Chromium downloaded by Playwright, if the user installed one
 */
export async function launchBrowser(options: { headless?: boolean } = {}): Promise<Browser> {
  const headless = options.headless ?? true;
  const args = ["--hide-scrollbars", "--font-render-hinting=none"];

  const custom = process.env.UISNAP_BROWSER;
  if (custom) {
    try {
      return await chromium.launch({ executablePath: custom, headless, args });
    } catch {
      throw new UserError(`Couldn't start the browser at UISNAP_BROWSER="${custom}". Check the path.`);
    }
  }

  for (const channel of ["chrome", "msedge"]) {
    try {
      return await chromium.launch({ channel, headless, args });
    } catch {
      // not installed, try the next one
    }
  }

  if (process.platform === "linux") {
    for (const name of LINUX_BROWSERS) {
      const exe = which(name);
      if (!exe) continue;
      try {
        return await chromium.launch({ executablePath: exe, headless, args });
      } catch {
        // try the next one
      }
    }
  }

  try {
    return await chromium.launch({ headless, args });
  } catch {
    throw new UserError(
      [
        "No Chrome or Edge browser found.",
        "Fix it one of these ways:",
        "  - Install Google Chrome or Microsoft Edge",
        "  - Point to any Chromium browser: set UISNAP_BROWSER=/path/to/browser",
        "  - Download a private Chromium (~150 MB): npx playwright-core install chromium",
      ].join("\n  ")
    );
  }
}
