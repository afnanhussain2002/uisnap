# uisnap

Before/after screenshots of your UI, made for AI coding agents.
Run one command before the agent edits and one after. You get a 1080×1350 comparison image (before on top, after below) ready to post or send, plus a drag-to-compare page for clients.

Works with any agent that can run terminal commands: Claude Code, Codex, Cursor, GitHub Copilot, Windsurf, Gemini CLI, Cline, and others.

## What you get

- **`.uisnap/latest.png`**: a 1080×1350 portrait image, with the page before your change on top and after it below. It shows the page name and date only, never `localhost` or any link, so it's safe to share.
- **`.uisnap/latest.html`**: a drag-to-compare page you can send to clients.
- **`.uisnap/shares/`**: every comparison you've made, timestamped.

## Why it's lightweight

- **No browser download.** It uses the Chrome or Edge already on your PC.
- **One small dependency** (`playwright-core`), no native image libraries.
- **Nothing runs in the background.** The browser opens for a few seconds per capture, then closes.

Requirements: Node.js 18.3+ and Google Chrome or Microsoft Edge.

## Install

```bash
# from the uisnap folder
npm install     # also builds it
npm link        # makes the `uisnap` command available everywhere
```

Check it can find your browser:

```bash
uisnap test-browser
```

After changing anything in `src/`, run `npm run build`. Because of `npm link`, the `uisnap` command picks up the change right away.

## Quick start

In your app's project folder, with the dev server running:

```bash
uisnap init                    # creates uisnap.config.json (auto-detects your dev server port)
uisnap before /pricing         # capture the page before changes
# ...you or your agent changes the code...
uisnap after                   # capture again and build the comparison image
```

To copy the image straight to your clipboard:

```bash
uisnap share                   # rebuilds and copies to clipboard
uisnap share --title "New pricing page" --theme light --open
```

## Set it up for your coding agent

Run this once in your project, with the name of your agent:

```bash
uisnap agent-rules claude
```

It adds the instructions to the file that agent reads:

| Agent | Command | File it writes |
| --- | --- | --- |
| Claude Code | `uisnap agent-rules claude` | `CLAUDE.md` |
| Codex and other agents that read `AGENTS.md` | `uisnap agent-rules codex` | `AGENTS.md` |
| Cursor | `uisnap agent-rules cursor` | `.cursor/rules/uisnap.mdc` |
| GitHub Copilot | `uisnap agent-rules copilot` | `.github/copilot-instructions.md` |
| Windsurf | `uisnap agent-rules windsurf` | `.windsurf/rules/uisnap.md` |
| Gemini CLI | `uisnap agent-rules gemini` | `GEMINI.md` |
| Cline | `uisnap agent-rules cline` | `.clinerules/uisnap.md` |

- **Several agents at once:** `uisnap agent-rules claude,cursor`
- **Every agent:** `uisnap agent-rules all`
- **Just read the rules:** `uisnap agent-rules` with no agent prints them, for any agent not in the list. Paste them wherever that agent reads its instructions.

It's safe to run again. In a shared file like `CLAUDE.md`, the rules sit between `<!-- uisnap:start -->` and `<!-- uisnap:end -->`, and running the command again updates only that part. The rest of your file is never touched. Rules added by older versions of uisnap are replaced in place too.

From then on, whenever the agent changes something visible, it:

1. captures the page before editing,
2. makes the change,
3. captures again and looks at the comparison image to check its own work,
4. fixes anything that looks wrong, and
5. tells you where the image is.

**Cost:** looking at the image adds roughly 1,500–2,000 tokens per UI change, plus a few short commands. Tasks that don't change the UI cost nothing extra.

## Pages behind login

```bash
uisnap login /dashboard
```

A browser window opens. Log in, press Enter in the terminal, and the session is saved to `.uisnap/auth.json`. Later captures use it automatically. The `.uisnap` folder is git-ignored automatically, so your cookies never get committed.

If a page redirects (for example to your login page because the session expired), uisnap prints a warning:

```
Warning: /dashboard redirected to /sign-in, so that's what was captured.
If it's a login page, run "uisnap login /dashboard" once, then capture again.
```

The agent instructions tell agents to stop and ask you to log in when they see this.

## Commands

| Command | What it does |
| --- | --- |
| `uisnap before [page]` | Capture the page before changes |
| `uisnap after [page]` | Capture again and build the comparison image |
| `uisnap share` | Rebuild the image and copy it to the clipboard |
| `uisnap login [page]` | Open a browser to log in, for pages behind auth |
| `uisnap init` | Create a config file |
| `uisnap agent-rules [agent]` | Add the instructions to your agent's rules file (or print them) |
| `uisnap reset` | Delete the current before/after shots |
| `uisnap test-browser` | Check that a browser can be found |

`[page]` can be a path (`/pricing`), a full URL (`http://localhost:5173/app`), or a local file (`file:///path/to/index.html`).

## Options

| Option | Used with | Description |
| --- | --- | --- |
| `--viewports mobile` | before | Screen size: `desktop` (1440px, the default), `mobile` (390px), or `desktop,mobile` |
| `--full` | before | Capture the whole scrollable page |
| `--selector "#hero"` | before | Capture a single element |
| `--wait 1000` | before | Extra wait in ms after load (for slow pages) |
| `--base http://localhost:5173` | any | Dev server address |
| `--title "..."` | after, share | Heading on the image (default: the page path) |
| `--theme light` / `dark` | after, share | Card colors |
| `--scale 2` | after, share | Image sharpness, 1 to 3. 1 = 1080×1350 (default), 2 = 2160×2700 |
| `--open` | after, share | Open the image when done |
| `--copy` | after | Also copy to clipboard |
| `--no-copy` | share | Don't copy to clipboard |

The settings used for `before` are reused for `after` automatically, so the two shots always match.

## Config file

`uisnap.config.json` in your project root:

```json
{
  "baseUrl": "http://localhost:3000",
  "viewports": ["desktop"],
  "title": "Acme",
  "theme": "dark",
  "waitMs": 500,
  "fullPage": false
}
```

## Troubleshooting

**"No Chrome or Edge browser found"**: install Chrome or Edge, or set `UISNAP_BROWSER` to any Chromium-based browser (Brave, Chromium), or run `npx playwright-core install chromium` to download a private copy.

**"Couldn't reach http://localhost:..."**: start your dev server, and check `baseUrl` in the config matches its port.

**"looks like a Windows path, not a page"**: Git Bash on Windows rewrites arguments that start with `/`, so `/pricing` arrives as `C:/Program Files/Git/pricing`. Leave out the slash (`uisnap before pricing`) or use PowerShell or cmd.

**The image shows your login page**: the session is missing or expired. Run `uisnap login <page>` again.

**Before and after differ in places you didn't change** (dates, random content, ads): use `--selector` to capture just the part you changed, or `--wait` for content that loads late. Animations are frozen automatically.

**Menus, modals, or drawers aren't in the shot**: uisnap captures the page as it loads and can't click. Capture the page they belong to, or use `--selector` for something that's visible on load.

**Full-page shots look cut off in the image**: the 1080×1350 image shows the top of very tall pages. The slider page (`latest.html`) shows the full height.

**Desktop and mobile in one run**: the image has room for one comparison, so it shows desktop. The slider page shows both.

**Clipboard copy fails on Linux**: install `xclip` (X11) or `wl-clipboard` (Wayland). The image file is always saved either way.

## Project structure

```
src/
  cli.ts          commands and options
  capture.ts      takes stable screenshots, notices redirects
  browser.ts      finds Chrome/Edge on the system
  share.ts        builds the comparison image
  template.ts     share card (1080x1350) and slider page design
  system.ts       clipboard and "open file" per OS
  config.ts       config file, defaults, URL handling
  state.ts        before/after session storage
  agent-rules.ts  instructions for coding agents, and where each agent reads them
```
