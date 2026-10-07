import fs from "node:fs";
import path from "node:path";
import { UserError } from "./errors.js";

export type ViewportName = "desktop" | "mobile";
export type Theme = "light" | "dark";

export interface ViewportSpec {
  name: ViewportName;
  width: number;
  height: number;
  scale: number;
  mobile: boolean;
}

export const VIEWPORTS: Record<ViewportName, ViewportSpec> = {
  desktop: { name: "desktop", width: 1440, height: 900, scale: 1, mobile: false },
  mobile: { name: "mobile", width: 390, height: 844, scale: 2, mobile: true },
};

export interface Config {
  /** Where your dev server runs, e.g. http://localhost:3000 */
  baseUrl: string;
  /** Which screen sizes to capture */
  viewports: ViewportName[];
  /** Shown as the heading on the share image (e.g. your product name) */
  title?: string;
  theme: Theme;
  /** Extra wait after the page loads, in milliseconds */
  waitMs: number;
  /** Capture the whole scrollable page instead of the first screen */
  fullPage: boolean;
  /** Folder for screenshots and output */
  outDir: string;
}

export const CONFIG_FILE = "uisnap.config.json";

const DEFAULTS: Omit<Config, "baseUrl"> = {
  viewports: ["desktop"],
  theme: "dark",
  waitMs: 500,
  fullPage: false,
  outDir: ".uisnap",
};

/** Guess the dev server address from the project's dependencies. */
export function detectBaseUrl(cwd = process.cwd()): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(cwd, "package.json"), "utf8"));
    const deps: Record<string, string> = { ...pkg.dependencies, ...pkg.devDependencies };
    const has = (name: string) => name in deps;
    if (has("next") || has("nuxt") || has("react-scripts")) return "http://localhost:3000";
    if (has("astro")) return "http://localhost:4321";
    if (has("@angular/core")) return "http://localhost:4200";
    if (has("vite") || has("@sveltejs/kit")) return "http://localhost:5173";
  } catch {
    // no package.json, fall through
  }
  return "http://localhost:3000";
}

export function loadConfig(cwd = process.cwd()): Config {
  const file = path.join(cwd, CONFIG_FILE);
  let fromFile: Partial<Config> = {};
  if (fs.existsSync(file)) {
    try {
      fromFile = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      throw new UserError(`${CONFIG_FILE} is not valid JSON. Fix it or delete it.`);
    }
  }
  const config: Config = { ...DEFAULTS, baseUrl: detectBaseUrl(cwd), ...fromFile };
  config.viewports = config.viewports.map(checkViewport);
  return config;
}

export function writeDefaultConfig(cwd = process.cwd()): { file: string; created: boolean } {
  const file = path.join(cwd, CONFIG_FILE);
  if (fs.existsSync(file)) return { file, created: false };
  const config = {
    baseUrl: detectBaseUrl(cwd),
    viewports: DEFAULTS.viewports,
    title: "",
    theme: DEFAULTS.theme,
    waitMs: DEFAULTS.waitMs,
    fullPage: DEFAULTS.fullPage,
  };
  fs.writeFileSync(file, JSON.stringify(config, null, 2) + "\n");
  return { file, created: true };
}

function checkViewport(name: string): ViewportName {
  if (name === "desktop" || name === "mobile") return name;
  throw new UserError(`Unknown viewport "${name}". Use "desktop", "mobile", or both.`);
}

export function parseViewports(value: string): ViewportName[] {
  const list = value.split(",").map((v) => v.trim()).filter(Boolean).map(checkViewport);
  if (!list.length) throw new UserError("--viewports needs at least one of: desktop, mobile");
  return [...new Set(list)];
}

/** Turn "/pricing", "pricing", ":5173/x" or a full URL into a full URL. */
export function resolveUrl(input: string | undefined, baseUrl: string): string {
  if (!input) return baseUrl;
  // Git Bash on Windows rewrites "/pricing" into "C:/Program Files/Git/pricing" before uisnap sees it.
  if (/^[A-Za-z]:[\\/]/.test(input)) {
    throw new UserError(
      `"${input}" looks like a Windows path, not a page. Git Bash rewrites paths that start with "/".\n` +
        "  Leave out the leading slash (uisnap before pricing), or run uisnap from PowerShell or cmd."
    );
  }
  if (/^(https?|file):\/\//i.test(input)) return input;
  if (/^:\d+/.test(input)) return `http://localhost${input}`;
  if (/^(localhost|127\.0\.0\.1|\d+\.\d+\.\d+\.\d+)(:\d+)?/.test(input)) return `http://${input}`;
  try {
    return new URL(input.startsWith("/") ? input : `/${input}`, baseUrl).toString();
  } catch {
    throw new UserError(`"${input}" isn't a valid page path or URL.`);
  }
}

export function parseNumber(value: string | undefined, flag: string, fallback: number): number {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new UserError(`${flag} must be a positive number.`);
  return n;
}
