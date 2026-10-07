import fs from "node:fs";
import path from "node:path";
import { UserError } from "./errors.js";

export const AGENT_RULES = `## UI changes: capture before/after screenshots with uisnap

When a task changes anything visible in the web app (layout, styles, components, copy):

1. Make sure the dev server is running.
2. BEFORE editing, capture the current state of the affected page:
   uisnap before <page-path>        (example: uisnap before /pricing)
3. If uisnap prints a redirect warning (usually to a login page), stop and ask the user
   to run "uisnap login <page-path>" once, then run "uisnap before" again.
4. Make the code changes.
5. AFTER editing, capture again and build the comparison image:
   uisnap after
6. Look at .uisnap/latest.png (before on top, after below). If anything looks broken or
   doesn't match the request, fix it and run "uisnap after" again.
   Do not run "uisnap before" again for the same task.
7. When done, tell the user the path of the comparison image.

Notes:
- Run uisnap from the project root (where uisnap.config.json is).
- In Git Bash on Windows, leave out the leading slash: uisnap before pricing
- Things that only appear after a click (menus, modals, drawers) can't be captured.
  Say so instead of guessing.

Options: --full (whole page)  --selector "<css>" (one element)  --viewports mobile
`;

// The rules as older versions of uisnap printed them, so "agent-rules <agent>" can replace them in place.
const LEGACY_RULES = `## UI changes: capture before/after screenshots with uisnap

When a task changes anything visible in the web app (layout, styles, components, copy):

1. Make sure the dev server is running.
2. BEFORE editing, capture the current state of the affected page:
   uisnap before <page-path>        (example: uisnap before /pricing)
3. Make the code changes.
4. AFTER editing, capture again and build the comparison image:
   uisnap after
5. Look at .uisnap/latest.png. If anything looks broken or doesn't match the request,
   fix it and run "uisnap after" again. Do not run "uisnap before" again for the same task.
6. When done, tell the user the path of the comparison image.

Options: --viewports desktop,mobile  --full (whole page)  --selector "<css>" (one element)
`;

const START = "<!-- uisnap:start -->";
const END = "<!-- uisnap:end -->";

interface AgentTarget {
  file: string;
  label: string;
  /** "block" adds a marked section to a shared file; "own" writes a file just for uisnap. */
  mode: "block" | "own";
  frontmatter?: string;
}

export const AGENTS: Record<string, AgentTarget> = {
  claude: { file: "CLAUDE.md", label: "Claude Code", mode: "block" },
  codex: { file: "AGENTS.md", label: "Codex and other agents that read AGENTS.md", mode: "block" },
  cursor: {
    file: ".cursor/rules/uisnap.mdc",
    label: "Cursor",
    mode: "own",
    frontmatter: "---\ndescription: Before/after screenshots for UI changes\nalwaysApply: true\n---\n\n",
  },
  copilot: { file: ".github/copilot-instructions.md", label: "GitHub Copilot", mode: "block" },
  windsurf: {
    file: ".windsurf/rules/uisnap.md",
    label: "Windsurf",
    mode: "own",
    frontmatter: "---\ntrigger: always_on\n---\n\n",
  },
  gemini: { file: "GEMINI.md", label: "Gemini CLI", mode: "block" },
  cline: { file: ".clinerules/uisnap.md", label: "Cline", mode: "own" },
};

const ALIASES: Record<string, string> = { agents: "codex" };

/** "claude,cursor" or "all" -> agent names, one per target file. */
export function parseAgents(value: string): string[] {
  const names =
    value.trim().toLowerCase() === "all"
      ? Object.keys(AGENTS)
      : value.split(",").map((v) => v.trim().toLowerCase()).filter(Boolean).map((v) => ALIASES[v] ?? v);
  for (const name of names) {
    if (!AGENTS[name]) {
      throw new UserError(`Unknown agent "${name}". Use one of: ${Object.keys(AGENTS).join(", ")}, or all.`);
    }
  }
  return [...new Set(names)];
}

export type WriteOutcome = "created" | "added" | "updated" | "unchanged";

/** Write the rules into the file a given agent reads. Safe to run again: it updates in place. */
export function writeAgentRules(name: string, cwd = process.cwd()): { file: string; outcome: WriteOutcome } {
  const target = AGENTS[name];
  const file = path.join(cwd, target.file);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const old = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;

  if (target.mode === "own") {
    const content = (target.frontmatter ?? "") + AGENT_RULES;
    if (old === content) return { file, outcome: "unchanged" };
    fs.writeFileSync(file, content);
    return { file, outcome: old === null ? "created" : "updated" };
  }

  const block = `${START}\n${AGENT_RULES}${END}\n`;
  if (old === null) {
    fs.writeFileSync(file, block);
    return { file, outcome: "created" };
  }

  // Work in LF, then write back with the file's own line endings.
  const crlf = old.includes("\r\n");
  const text = old.replace(/\r\n/g, "\n");
  const start = text.indexOf(START);
  const end = text.indexOf(END);
  let next: string;
  let outcome: WriteOutcome;

  if (start !== -1 && end > start) {
    next = text.slice(0, start) + block.trimEnd() + text.slice(end + END.length);
    outcome = "updated";
  } else if (text.includes(LEGACY_RULES)) {
    next = text.replace(LEGACY_RULES, block);
    outcome = "updated";
  } else if (text.includes("capture before/after screenshots with uisnap")) {
    throw new UserError(
      `${target.file} already has uisnap rules that were edited by hand. Remove that section, then run this again.`
    );
  } else {
    next = text.replace(/\n*$/, "\n\n") + block;
    outcome = "added";
  }

  if (next === text) return { file, outcome: "unchanged" };
  fs.writeFileSync(file, crlf ? next.replace(/\n/g, "\r\n") : next);
  return { file, outcome };
}
