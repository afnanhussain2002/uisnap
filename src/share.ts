import fs from "node:fs";
import path from "node:path";
import { launchBrowser } from "./browser.js";
import type { Theme } from "./config.js";
import { UserError } from "./errors.js";
import { ensureDirs, type Session } from "./state.js";
import { CARD_HEIGHT, CARD_WIDTH, renderCard, renderSlider, type Pair } from "./template.js";

export interface ShareOptions {
  title?: string;
  theme: Theme;
  scale: number;
}

export interface ShareResult {
  png: string;
  html: string;
  latestPng: string;
  latestHtml: string;
}

const toDataUri = (file: string) => `data:image/png;base64,${fs.readFileSync(file).toString("base64")}`;

// Only the path is shown on the image, never the host, so no localhost or links leak into shares.
const pathOf = (url: string) => new URL(url).pathname;

function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "page";

export async function buildShare(session: Session, outDir: string, options: ShareOptions): Promise<ShareResult> {
  const p = ensureDirs(outDir);

  const pairs: Pair[] = [];
  for (const viewport of session.viewports) {
    const before = session.before.find((s) => s.viewport === viewport);
    const after = session.after.find((s) => s.viewport === viewport);
    if (!before || !after || !fs.existsSync(before.file) || !fs.existsSync(after.file)) continue;
    pairs.push({ viewport, before: toDataUri(before.file), after: toDataUri(after.file) });
  }
  if (!pairs.length) {
    throw new UserError('No before/after pair yet. Run "uisnap before" and "uisnap after" first.');
  }

  const pagePath = pathOf(session.url);
  const meta = {
    title: options.title?.trim() || (pagePath === "/" ? "Home page" : pagePath),
    date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
  };

  const base = `${slug(meta.title)}-${stamp()}`;
  const png = path.join(p.shares, `${base}.png`);
  const html = path.join(p.shares, `${base}.html`);

  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: CARD_WIDTH, height: CARD_HEIGHT }, deviceScaleFactor: options.scale });
    await page.setContent(renderCard(pairs, meta, options.theme), { waitUntil: "load" });
    await page.locator("#card").screenshot({ path: png });
  } finally {
    await browser.close();
  }

  fs.writeFileSync(html, renderSlider(pairs, meta, options.theme));
  fs.copyFileSync(png, p.latestPng);
  fs.copyFileSync(html, p.latestHtml);
  return { png, html, latestPng: p.latestPng, latestHtml: p.latestHtml };
}
