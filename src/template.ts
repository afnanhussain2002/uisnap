import { VIEWPORTS, type Theme, type ViewportName } from "./config.js";

export interface Pair {
  viewport: ViewportName;
  before: string; // data URI
  after: string; // data URI
}

export interface Meta {
  title: string;
  date: string;
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const FONT =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif';

// Cool, quiet palettes so the screenshots stay the focus.
const PALETTES: Record<Theme, Record<string, string>> = {
  light: {
    bg: "#E7ECF2",
    panel: "#FFFFFF",
    ink: "#18212E",
    muted: "#5C6A7D",
    line: "#CBD4E0",
    after: "#2250CC",
    shadow: "rgba(24, 33, 46, 0.18)",
  },
  dark: {
    bg: "#19212D",
    panel: "#232D3C",
    ink: "#EEF2F7",
    muted: "#94A1B4",
    line: "#35425A",
    after: "#86A8FF",
    shadow: "rgba(0, 0, 0, 0.45)",
  },
};

const vars = (theme: Theme) =>
  Object.entries(PALETTES[theme])
    .map(([k, v]) => `--${k}: ${v};`)
    .join(" ");

// The share card is a fixed 1080 x 1350 portrait image: before on top, after below.
export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;

// Fixed heights so the two screenshots get exactly the space that's left.
const PAD_X = 48;
const PAD_Y = 40;
const HEADER_H = 64;
const HEADER_GAP = 22;
const SECTION_GAP = 26;
const TAG_H = 32; // label row plus the space under it
const BAR_H = 30;
const BORDER = 1;

function shotBox(pair: Pair): { width: number; height: number } {
  const spec = VIEWPORTS[pair.viewport];
  const ratio = spec.width / spec.height;
  const fixed = 2 * PAD_Y + HEADER_H + HEADER_GAP + SECTION_GAP + 2 * (TAG_H + BAR_H + 2 * BORDER);
  const height = Math.floor((CARD_HEIGHT - fixed) / 2);
  const width = Math.min(CARD_WIDTH - 2 * PAD_X - 2 * BORDER, Math.round(height * ratio));
  return { width, height };
}

function section(pair: Pair, which: "before" | "after"): string {
  const src = which === "before" ? pair.before : pair.after;
  const label = which === "before" ? "Before" : "After";
  return `<section class="${which}">
    <div class="tag"><b></b>${label}</div>
    <div class="window">
      <div class="bar"><i></i><i></i><i></i></div>
      <img src="${src}" alt="">
    </div>
  </section>`;
}

/** The static card that gets screenshotted into the shareable PNG. */
export function renderCard(pairs: Pair[], meta: Meta, theme: Theme): string {
  // One fixed-size card only has room for one pair; prefer desktop.
  const pair = pairs.find((p) => p.viewport === "desktop") ?? pairs[0];
  const box = shotBox(pair);
  // Desktop shots fill the frame (a --full page is cropped to its top); mobile shots are letterboxed.
  const fit = pair.viewport === "mobile" ? "contain" : "cover";

  return `<!doctype html><html><head><meta charset="utf-8"><style>
  :root { ${vars(theme)} }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: transparent; }
  #card { width: ${CARD_WIDTH}px; height: ${CARD_HEIGHT}px; overflow: hidden; padding: ${PAD_Y}px ${PAD_X}px; background: var(--bg); color: var(--ink); font-family: ${FONT}; display: flex; flex-direction: column; align-items: center; }
  header { width: 100%; height: ${HEADER_H}px; margin-bottom: ${HEADER_GAP}px; overflow: hidden; }
  header h1 { margin: 0; font-size: 30px; line-height: 36px; font-weight: 700; letter-spacing: -0.02em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  header p { margin: 6px 0 0; display: flex; gap: 18px; font-size: 16px; line-height: 22px; color: var(--muted); }
  section { width: ${box.width + 2 * BORDER}px; }
  section.after { margin-top: ${SECTION_GAP}px; }
  .tag { height: ${TAG_H}px; display: flex; align-items: flex-start; gap: 8px; font-size: 17px; line-height: 22px; font-weight: 600; color: var(--muted); }
  .tag b { width: 8px; height: 8px; margin-top: 7px; border-radius: 50%; background: currentColor; }
  .after .tag { color: var(--after); }
  .window { background: var(--panel); border: ${BORDER}px solid var(--line); border-radius: 10px; overflow: hidden; box-shadow: 0 20px 40px -26px var(--shadow); }
  .after .window { border-color: color-mix(in srgb, var(--after) 55%, var(--line)); }
  .bar { height: ${BAR_H}px; display: flex; align-items: center; gap: 6px; padding: 0 12px; border-bottom: 1px solid var(--line); }
  .bar i { width: 9px; height: 9px; border-radius: 50%; background: var(--line); flex: none; }
  .window img { display: block; width: ${box.width}px; height: ${box.height}px; object-fit: ${fit}; object-position: top; }
</style></head><body>
  <div id="card">
    <header>
      <h1>${esc(meta.title)}</h1>
      <p><span>${esc(meta.date)}</span></p>
    </header>
    ${section(pair, "before")}
    ${section(pair, "after")}
  </div>
</body></html>`;
}

/** A standalone page with a drag slider, good for sending to clients. */
export function renderSlider(pairs: Pair[], meta: Meta, theme: Theme): string {
  const blocks = pairs
    .map(
      (p) => `<section class="${p.viewport}">
        ${pairs.length > 1 ? `<h2>${p.viewport === "desktop" ? "Desktop" : "Mobile"}</h2>` : ""}
        <div class="labels"><span>Before</span><span class="la">After</span></div>
        <div class="cmp" style="--pos: 50%">
          <img class="a" src="${p.after}" alt="After">
          <img class="b" src="${p.before}" alt="Before">
          <div class="line"><span></span></div>
          <input type="range" min="0" max="100" value="50" step="0.1" aria-label="Drag to compare before and after">
        </div>
      </section>`
    )
    .join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(meta.title)}: before and after</title>
<style>
  :root { ${vars(theme)} }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font-family: ${FONT}; }
  main { max-width: 1240px; margin: 0 auto; padding: 48px 24px 72px; }
  h1 { margin: 0; font-size: clamp(26px, 4vw, 38px); letter-spacing: -0.02em; }
  header p { margin: 8px 0 0; color: var(--muted); display: flex; flex-wrap: wrap; gap: 16px; }
  .hint { margin-top: 6px; font-size: 15px; }
  section { margin-top: 40px; }
  h2 { font-size: 16px; color: var(--muted); font-weight: 600; margin: 0 0 14px; }
  section.mobile .cmp { max-width: 390px; margin: 0 auto; border-radius: 28px; }
  .cmp { position: relative; overflow: hidden; border-radius: 12px; border: 1px solid var(--line); background: var(--panel); user-select: none; }
  .cmp img { display: block; width: 100%; }
  .cmp img.b { position: absolute; inset: 0 auto auto 0; clip-path: inset(0 calc(100% - var(--pos)) 0 0); }
  .line { position: absolute; top: 0; bottom: 0; left: var(--pos); width: 2px; margin-left: -1px; background: var(--after); pointer-events: none; }
  .line span { position: absolute; top: 50%; left: 50%; width: 36px; height: 36px; margin: -18px 0 0 -18px; border-radius: 50%; background: var(--after); box-shadow: 0 4px 14px var(--shadow); }
  .labels { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 15px; font-weight: 600; color: var(--muted); }
  section.mobile .labels { max-width: 390px; margin-left: auto; margin-right: auto; }
  .labels .la { color: var(--after); }
  .cmp input { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: ew-resize; }
  .cmp:focus-within .line span { outline: 3px solid var(--ink); outline-offset: 3px; }
</style></head><body><main>
  <header>
    <h1>${esc(meta.title)}</h1>
    <p><span>${esc(meta.date)}</span></p>
    <p class="hint">Drag across the image to compare.</p>
  </header>
  ${blocks}
</main>
<script>
  document.querySelectorAll(".cmp").forEach(function (box) {
    var input = box.querySelector("input");
    input.addEventListener("input", function () { box.style.setProperty("--pos", input.value + "%"); });
  });
</script>
</body></html>`;
}
