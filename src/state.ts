import fs from "node:fs";
import path from "node:path";
import type { ViewportName } from "./config.js";

export interface Shot {
  viewport: ViewportName;
  file: string;
  /** Set when the page sent the browser somewhere else, e.g. a login page. */
  redirectedTo?: string;
}

export interface Session {
  url: string;
  viewports: ViewportName[];
  fullPage: boolean;
  selector?: string;
  waitMs: number;
  startedAt: string;
  before: Shot[];
  after: Shot[];
}

export function getPaths(outDir: string) {
  const root = path.resolve(outDir);
  return {
    root,
    session: path.join(root, "session.json"),
    shots: path.join(root, "shots"),
    shares: path.join(root, "shares"),
    auth: path.join(root, "auth.json"),
    latestPng: path.join(root, "latest.png"),
    latestHtml: path.join(root, "latest.html"),
  };
}

export function ensureDirs(outDir: string) {
  const p = getPaths(outDir);
  for (const dir of [p.root, p.shots, p.shares]) fs.mkdirSync(dir, { recursive: true });
  // Keep the whole folder (including login cookies in auth.json) out of git,
  // without touching the user's own .gitignore.
  const ignore = path.join(p.root, ".gitignore");
  if (!fs.existsSync(ignore)) fs.writeFileSync(ignore, "*\n");
  return p;
}

export function readSession(outDir: string): Session | null {
  try {
    return JSON.parse(fs.readFileSync(getPaths(outDir).session, "utf8")) as Session;
  } catch {
    return null;
  }
}

export function writeSession(outDir: string, session: Session): void {
  fs.writeFileSync(getPaths(outDir).session, JSON.stringify(session, null, 2));
}

export function clearSession(outDir: string): void {
  const p = getPaths(outDir);
  fs.rmSync(p.session, { force: true });
  fs.rmSync(p.shots, { recursive: true, force: true });
}
