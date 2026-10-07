#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { parseArgs } from "node:util";
import { AGENT_RULES, AGENTS, parseAgents, writeAgentRules } from "./agent-rules.js";
import { launchBrowser } from "./browser.js";
import { capture } from "./capture.js";
import {
  loadConfig,
  parseNumber,
  parseViewports,
  resolveUrl,
  writeDefaultConfig,
  type Config,
  type Theme,
} from "./config.js";
import { UserError } from "./errors.js";
import { buildShare, type ShareResult } from "./share.js";
import { clearSession, ensureDirs, getPaths, readSession, writeSession, type Session, type Shot } from "./state.js";
import { copyImage, openFile } from "./system.js";

const VERSION = "0.1.0";

const HELP = `
uisnap: before/after UI screenshots for AI coding agents

Usage
  uisnap before [page]   Capture the page before changes (e.g. uisnap before /pricing)
  uisnap after [page]    Capture again and build the comparison image
  uisnap share           Rebuild the image, copy it to the clipboard
  uisnap login [page]    Open a browser window to log in (for pages behind auth)
  uisnap init            Create uisnap.config.json and show agent instructions
  uisnap agent-rules [agent]
                         Add the instructions to your agent's rules file
                         (claude, codex, cursor, copilot, windsurf, gemini, cline, all).
                         With no agent, just prints them.
  uisnap reset           Delete the current before/after screenshots

Capture options (before)
  --viewports <list>     desktop (default), mobile, or desktop,mobile
  --full                 Capture the whole scrollable page
  --selector <css>       Capture one element only, e.g. --selector "#pricing"
  --wait <ms>            Extra wait after page load (default 500)
  --base <url>           Dev server address (default auto-detected)

Share options (after, share)
  --title <text>         Heading on the image (default: page path)
  --theme <light|dark>   Card colors (default dark)
  --scale <n>            Image sharpness, 1 to 3 (default 1 = 1080x1350)
  --open                 Open the image when done
  --copy                 Copy the image to the clipboard (always on for "share")
  --no-copy              Don't copy (for "share")

Output goes to .uisnap/ (latest.png, latest.html, and shares/ for history).
The image is 1080x1350: before on top, after below. It shows the page path, never the host.
`;

const OPTIONS = {
  viewports: { type: "string" },
  full: { type: "boolean" },
  selector: { type: "string" },
  wait: { type: "string" },
  base: { type: "string" },
  title: { type: "string" },
  theme: { type: "string" },
  scale: { type: "string" },
  open: { type: "boolean" },
  copy: { type: "boolean" },
  "no-copy": { type: "boolean" },
  help: { type: "boolean", short: "h" },
  version: { type: "boolean", short: "v" },
} as const;

type Flags = ReturnType<typeof parseArgs<{ options: typeof OPTIONS; allowPositionals: true }>>["values"];

const rel = (file: string) => path.relative(process.cwd(), file) || file;
const say = (msg = "") => console.log(msg ? `  ${msg}` : "");

function themeFrom(flags: Flags, config: Config): Theme {
  const t = flags.theme ?? config.theme;
  if (t !== "light" && t !== "dark") throw new UserError('--theme must be "light" or "dark".');
  return t;
}

function scaleFrom(flags: Flags): number {
  const s = parseNumber(flags.scale, "--scale", 1);
  return Math.min(3, Math.max(1, s));
}

async function finishShare(result: ShareResult, flags: Flags, copy: boolean): Promise<void> {
  say(`Image:  ${rel(result.latestPng)}`);
  say(`Slider: ${rel(result.latestHtml)}  (drag-to-compare page, good for clients)`);
  if (copy) {
    const ok = await copyImage(result.latestPng);
    say(ok ? "Copied the image to your clipboard. Paste it anywhere." : "Couldn't copy to the clipboard here. Use the file above.");
  }
  if (flags.open) openFile(result.latestPng);
}

/** Pages behind login quietly redirect, which would make a before/after of the login page. */
function warnRedirects(shots: Shot[], url: string): void {
  const requested = new URL(url).pathname;
  const hit = shots.find((s) => s.redirectedTo);
  if (!hit) return;
  say(`Warning: ${requested} redirected to ${hit.redirectedTo}, so that's what was captured.`);
  say(`If it's a login page, run "uisnap login ${requested}" once, then capture again.`);
}

async function cmdBefore(page: string | undefined, flags: Flags, config: Config) {
  const url = resolveUrl(page, config.baseUrl);
  const viewports = flags.viewports ? parseViewports(flags.viewports) : config.viewports;
  const p = ensureDirs(config.outDir);
  clearSession(config.outDir);
  fs.mkdirSync(p.shots, { recursive: true });

  const session: Session = {
    url,
    viewports,
    fullPage: flags.full ?? config.fullPage,
    selector: flags.selector,
    waitMs: parseNumber(flags.wait, "--wait", config.waitMs),
    startedAt: new Date().toISOString(),
    before: [],
    after: [],
  };

  say(`Capturing "before" of ${url} (${viewports.join(", ")})...`);
  session.before = await capture({
    ...session,
    authFile: p.auth,
    fileFor: (vp) => path.join(p.shots, `before-${vp}.png`),
  });
  writeSession(config.outDir, session);
  warnRedirects(session.before, url);
  say("Done. Make your changes, then run: uisnap after");
}

async function cmdAfter(page: string | undefined, flags: Flags, config: Config) {
  const session = readSession(config.outDir);
  if (!session || !session.before.length) {
    throw new UserError('No "before" screenshot yet. Run "uisnap before <page>" first, before changing code.');
  }
  const p = ensureDirs(config.outDir);
  if (page) {
    const url = resolveUrl(page, config.baseUrl);
    if (url !== session.url) say(`Note: "before" was ${session.url}, comparing against ${url}.`);
    session.url = url;
  }

  say(`Capturing "after" of ${session.url} (${session.viewports.join(", ")})...`);
  session.after = await capture({
    ...session,
    authFile: p.auth,
    fileFor: (vp) => path.join(p.shots, `after-${vp}.png`),
  });
  writeSession(config.outDir, session);
  warnRedirects(session.after, session.url);

  say("Building the comparison image...");
  const result = await buildShare(session, config.outDir, {
    title: flags.title ?? config.title,
    theme: themeFrom(flags, config),
    scale: scaleFrom(flags),
  });
  await finishShare(result, flags, flags.copy ?? false);
}

async function cmdShare(flags: Flags, config: Config) {
  const session = readSession(config.outDir);
  if (!session) throw new UserError('Nothing to share yet. Run "uisnap before" and "uisnap after" first.');
  const result = await buildShare(session, config.outDir, {
    title: flags.title ?? config.title,
    theme: themeFrom(flags, config),
    scale: scaleFrom(flags),
  });
  await finishShare(result, flags, !flags["no-copy"]);
}

async function cmdLogin(page: string | undefined, config: Config) {
  const url = resolveUrl(page, config.baseUrl);
  const p = ensureDirs(config.outDir);
  const browser = await launchBrowser({ headless: false });
  try {
    const context = await browser.newContext({ viewport: null });
    const tab = await context.newPage();
    await tab.goto(url).catch(() => undefined);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    await rl.question("  Log in in the browser window, then press Enter here to save the session... ");
    rl.close();
    await context.storageState({ path: p.auth });
    say(`Saved login to ${rel(p.auth)}. Future captures will be logged in.`);
    say("This file holds your session cookies. It's git-ignored automatically; don't share it.");
  } finally {
    await browser.close();
  }
}

function cmdInit(config: Config) {
  const { file, created } = writeDefaultConfig();
  ensureDirs(config.outDir);
  say(created ? `Created ${rel(file)} (dev server: ${config.baseUrl})` : `${rel(file)} already exists.`);
  say("Check that baseUrl matches your dev server address.");
  say();
  say("Next: give your coding agent the instructions. Run the one for your agent:");
  for (const [name, target] of Object.entries(AGENTS)) {
    say(`  uisnap agent-rules ${name.padEnd(9)} -> ${target.file}  (${target.label})`);
  }
}

async function main() {
  const { values: flags, positionals } = parseArgs({ options: OPTIONS, allowPositionals: true, strict: true });
  const [cmd, arg] = positionals;

  if (flags.version) return console.log(VERSION);
  if (!cmd || flags.help || cmd === "help") return console.log(HELP);

  const config = loadConfig();
  if (flags.base) config.baseUrl = resolveUrl(flags.base, "http://localhost");

  console.log();
  switch (cmd) {
    case "before":
      await cmdBefore(arg, flags, config);
      break;
    case "after":
      await cmdAfter(arg, flags, config);
      break;
    case "share":
      await cmdShare(flags, config);
      break;
    case "login":
      await cmdLogin(arg, config);
      break;
    case "init":
      cmdInit(config);
      break;
    case "agent-rules":
      if (!arg) {
        process.stdout.write("\n" + AGENT_RULES);
        return;
      }
      for (const name of parseAgents(arg)) {
        const { file, outcome } = writeAgentRules(name);
        const verb = {
          created: "Created",
          added: "Added the rules to",
          updated: "Updated the rules in",
          unchanged: "Already up to date:",
        }[outcome];
        say(`${verb} ${rel(file)}  (${AGENTS[name].label})`);
      }
      break;
    case "reset":
      clearSession(config.outDir);
      say("Cleared the current before/after screenshots.");
      break;
    case "test-browser": {
      const b = await launchBrowser();
      say(`Browser OK: ${b.version()}`);
      await b.close();
      break;
    }
    default:
      throw new UserError(`Unknown command "${cmd}". Run "uisnap help".`);
  }
  console.log();
}

main().catch((err: unknown) => {
  if (err instanceof UserError) {
    console.error(`\n  ${err.message}\n`);
  } else if (err instanceof TypeError && /Unknown option|Unexpected argument/.test(err.message)) {
    console.error(`\n  ${err.message}. Run "uisnap help".\n`);
  } else {
    console.error(err);
  }
  process.exitCode = 1;
});
