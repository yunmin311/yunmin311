/**
 * The visual system. Full rationale and the measured sources it came from are
 * in DESIGN.md at the repository root; this file is that document expressed as
 * code, and the two are meant to stay in step.
 *
 * The three rules that decide almost everything here:
 *
 *   SIZING   Type is sized against the box it sits in, never against the
 *            canvas. A size may only be used where it stays under 6% of its
 *            container's width. Measured from github-readme-stats, where the
 *            headline number is 24/450 of its card.
 *   GRID     U = 2px. All chrome is a whole multiple. Things get bigger by
 *            occupying more cells, never by scaling the cell.
 *   THEME    Each theme gets a data ramp designed for its own background —
 *            dark ramps up into light, light ramps down into dark. Not an
 *            inversion.
 */

import { fontFace, label, value, body, text, width, labelWidth, valueWidth, bodyWidth, fit, MICRO, BIG, adv, cap } from "./type.mjs"

/**
 * Canvas widths, measured rather than assumed. GitHub's profile README column
 * is 831px, so an 880px panel was being scaled to 0.944 and the pixel face was
 * resampled onto fractional pixels — the real cause of "the type looks soft".
 * Designing under that width renders 1:1 on desktop and still scales down
 * cleanly on a phone. Two half panels plus the space between them also have to
 * fit, which 2x432 did not.
 */
export const W_FULL = 820
export const W_HALF = 404

/**
 * Phone. Measured on a 390px device the README column is 293px, so panels are
 * drawn at 288 and render essentially 1:1. Panels get a real narrow layout at this width
 * rather than being scaled: an 824px panel shrunk to 344 puts 11px type at
 * 4.6px, which is not small, it is gone.
 */
export const W_MOBILE = 284

/** Base grid unit for chrome. */
export const U = 2

/** Spacing scale. Every y position and inset in a panel resolves to one of these. */
export const S = { tight: 4, xs: 8, sm: 16, md: 24, lg: 32, xl: 48 }

/** Largest type size allowed inside a container of the given width. */
export const maxSizeFor = (containerW) => (containerW * 0.06 >= BIG ? BIG : MICRO)

/**
 * THEME, and why it is one file instead of two.
 *
 * Panels used to be generated once per theme and paired in the README with
 * <source media="(max-width: 500px) and (prefers-color-scheme: dark)">. That
 * compound query is the one thing on this page that could plausibly select a
 * phone layout on a desktop — if anything in the chain keeps only the second
 * half of it, a dark desktop gets the mobile file — and it doubled the asset
 * count for nothing.
 *
 * Verified instead: a `prefers-color-scheme` block INSIDE an SVG works when the
 * SVG is loaded through <img>. Measured by rendering a probe to a canvas and
 * reading the pixels back — #0969DA under light, #58A6FF under dark, from one
 * file. So the theme moved into the document, every colour became a custom
 * property, and <picture> is left with a single-condition width query.
 *
 * Panels did not change: `t.ink` is now the string "var(--ink)" and
 * interpolates exactly as a hex literal did.
 */
const PALETTE = {
  dark: {
    page: "#0D1117",
    panel: "#161B22",
    line: "#30363D",
    lineSoft: "#21262D",
    ink: "#C9D1D9",
    inkDim: "#8B949E",
    inkFaint: "#6E7681",
    accent: "#58A6FF",
    // Titles sit on a soft blue rather than on the grey ramp. Against neutral
    // body text that reads as a heading without spending a second type size,
    // and it lifts blue toward its intended share of the page.
    titleInk: "#79C0FF",
    // Four filled steps, not four dot sizes. Step one has to be clearly
    // brighter than "empty" or a quiet day reads as no day at all.
    // Bright enough that a meter's unfilled capacity still reads — that is the
    // whole point of a segmented meter — while data1 stays clearly above it.
    dataEmpty: "#252C36",
    data1: "#1E4C8C",
    data2: "#2E77D0",
    data3: "#54A0F5",
    data4: "#8FD0FF",
    dataLow: "#1F3A5F",
    dataMid: "#2C6BC9",
    dataHigh: "#58A6FF",
    // Darker than the page, so the offset block reads as a shadow and not as
    // another panel.
    shadow: "#000000",
  },
  light: {
    page: "#FFFFFF",
    panel: "#F6F8FA",
    line: "#D0D7DE",
    lineSoft: "#E4E8EC",
    ink: "#24292F",
    inkDim: "#57606A",
    inkFaint: "#818B98",
    accent: "#0969DA",
    titleInk: "#0969DA",
    dataEmpty: "#EBEFF3",
    data1: "#A8CDF6",
    data2: "#5B9BE8",
    data3: "#1F6FEB",
    data4: "#0A4FA8",
    dataLow: "#BFDBFE",
    dataMid: "#60A5FA",
    dataHigh: "#0969DA",
    shadow: "#BFC8D2",
  },
}

/**
 * What panels receive. Every entry is a custom-property reference, so a panel
 * writing `fill="${t.ink}"` emits `fill="var(--ink)"` and the document decides
 * which theme that resolves to.
 */
export const THEME = Object.fromEntries(Object.keys(PALETTE.light).map((k) => [k, `var(--${k})`]))

/**
 * Light as the default, dark as an override. Emitted once per document.
 *
 * `force` pins a document to one palette regardless of the reader's setting.
 * Nothing on a real page should use it — a panel that ignores the reader's
 * theme is the bug this whole arrangement exists to avoid. It is here so the
 * gallery can show both palettes side by side on one screen, which is
 * otherwise impossible: a reader in light mode has no way to see the dark
 * design, and dark is the one these were drawn for.
 */
export const themeCss = (force) => {
  const decl = (o) => Object.entries(o).map(([k, v]) => `--${k}:${v}`).join(";")
  if (force === "dark") return `:root{${decl(PALETTE.dark)}}`
  if (force === "light") return `:root{${decl(PALETTE.light)}}`
  return `:root{${decl(PALETTE.light)}}@media (prefers-color-scheme:dark){:root{${decl(PALETTE.dark)}}}`
}

/* ------------------------------------------------------------------ shapes */

const n = (v) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100))

// crispEdges is set once on the root <svg> and inherited, which is worth about
// a third of the file size on a panel with a few hundred cells.
export const rect = (x, y, w, h, fill, extra = "") =>
  `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}"${fill ? ` fill="${fill}"` : ""}${extra ? " " + extra : ""}/>`

export const hline = (x, y, w, fill) => rect(x, y, w, 1, fill)
export const vline = (x, y, h, fill) => rect(x, y, 1, h, fill)

/** The 2x2 accent square. Four jobs only: panel corner, chart peak, newest item, caret. */
export const marker = (t, x, y, fill) => rect(x, y, U, U, fill ?? t.accent)

/* ------------------------------------------------------------------ panels */

/** Height of the plates that ride the panel's rails. 8U, centred on the line. */
export const TAB_H = 16

/**
 * A label on a rail, drawn as its own bordered plate riveted over the frame
 * rather than as text punching a hole through it.
 *
 * The hole trick reads fine in isolation and reads as a collision the moment
 * anything comes near, which is what it did. A plate has an edge, so its
 * relationship to the border and to nearby text is stated rather than implied.
 */
export function tab(t, { x, y, text, align = "start", ink }) {
  const s = String(text).toUpperCase()
  const w = labelWidth(s, 1) + S.md
  const left = align === "end" ? x - w : x
  const top = y - TAB_H / 2

  return (
    rect(left, top, w, TAB_H, t.page) +
    pixelFrame(t, left, top, w, TAB_H, t.line, 1, 2) +
    label(s, { x: left + S.sm - 4, y: top + 12, tracking: 1, fill: ink ?? t.inkDim })
  )
}

/**
 * Panel anatomy — three zones, and nothing crosses between them:
 *
 *   top rail      the border line at `y`, carrying the title plate
 *   content zone  y + 24 .. y + h - 24, the only place a panel may draw
 *   bottom rail   the border line at `y + h`, carrying the meta plate
 *
 * `bounds()` returns that content zone so panels lay out against it instead of
 * against numbers that happen to look right.
 */
export const bounds = ({ x, y, w, h }) => ({
  left: x + S.sm,
  right: x + w - S.sm,
  top: y + S.md,
  bottom: y + h - S.md,
  width: w - S.sm * 2,
})

/**
 * Hard offset shadow, the text-mode kind: a solid block down and to the right,
 * no blur, no gradient. This is how DOS-era windowing (Turbo Vision and every
 * TUI since) gave a panel depth on a grid that had no sub-pixels to spend.
 *
 * The canvas carries SHADOW extra pixels of bleed on the right and bottom, so
 * adding it changed no coordinate inside any panel.
 */
export const SHADOW = 4

/** Border thickness. 2px, so the frame reads as blocks rather than as a hairline. */
export const BORDER = 2
/** How much of each corner is cut away to make a stepped corner. */
export const NOTCH = 4

/**
 * A frame with stepped corners: the edges stop short and a smaller block
 * bridges the gap diagonally. This is how a pixel grid draws a rounded corner
 * — it cannot curve, so it steps — and it is the single detail that makes a
 * box read as drawn on a grid rather than as a CSS border.
 */
export function pixelFrame(t, x, y, w, h, colour, b = BORDER, notch = NOTCH) {
  const out = [
    rect(x + notch, y, w - notch * 2, b, colour),
    rect(x + notch, y + h - b, w - notch * 2, b, colour),
    rect(x, y + notch, b, h - notch * 2, colour),
    rect(x + w - b, y + notch, b, h - notch * 2, colour),
  ]
  // The step itself: one block per corner, set in by half the notch.
  const s = notch / 2
  out.push(rect(x + s, y + s, s, b, colour), rect(x + s, y + s, b, s, colour))
  out.push(rect(x + w - s - s, y + s, s, b, colour), rect(x + w - s - b, y + s, b, s, colour))
  out.push(rect(x + s, y + h - s - b, s, b, colour), rect(x + s, y + h - s - s, b, s, colour))
  out.push(rect(x + w - s - s, y + h - s - b, s, b, colour), rect(x + w - s - b, y + h - s - s, b, s, colour))
  return out.join("")
}

/**
 * A caret drawn as stacked blocks — the pointer a text-mode list puts in its
 * left margin.
 *
 * ARCHIVED, and kept on purpose. It is not used on the profile: a free-floating
 * arrow has no structural anchor, so "where exactly is it pointing" has no
 * right answer and every position looked slightly wrong. It stays here because
 * it is a good primitive for a component that does have an anchor — a single
 * highlighted item, a menu, a one-line prompt.
 */
export function pixelCaret(t, x, y, colour) {
  const rows = [2, 4, 6, 4, 2] // widths, top to bottom
  return rows.map((w, i) => rect(x, y + i * U, w, U, colour ?? t.accent)).join("")
}

/**
 * A list rail: a continuous track down the left margin with one lit segment.
 *
 * This is what replaced the caret. The segment is exactly one row tall and sits
 * exactly where the row does, so alignment is not a judgement call — it is the
 * geometry. The unlit track also gives the panel a permanent vertical line of
 * structure, which is what the two list panels were missing next to the charted
 * ones.
 */
export function listRail(t, { x, top, height, rowHeight }) {
  return {
    track: rect(x, top, U, height, t.lineSoft),
    segment: rect(x, top, U, rowHeight, t.accent),
  }
}

/** A rule made of blocks rather than a continuous line. */
export function pixelRule(x, y, w, colour, { on = 2, off = 2, thick = 2 } = {}) {
  const out = []
  for (let i = 0; i < w; i += on + off) out.push(rect(x + i, y, Math.min(on, w - i), thick, colour))
  return out.join("")
}

export function panel(t, { x, y, w, h, title, meta, fill = true, shadow = true }) {
  const out = []
  if (shadow) out.push(rect(x + SHADOW, y + SHADOW, w, h, t.shadow))
  if (fill) out.push(rect(x, y, w, h, t.panel))

  out.push(pixelFrame(t, x, y, w, h, t.line))

  if (title) out.push(tab(t, { x: x + S.sm, y, text: title, ink: t.titleInk }))
  if (meta) out.push(tab(t, { x: x + w - S.sm, y: y + h - 1, text: meta, align: "end", ink: t.inkFaint }))

  // The corner square is the panel's status lamp; motion.mjs breathes it.
  out.push(rect(x + 6, y + 6, U * 2, U * 2, t.accent, `class="led"`))

  return out.join("")
}

/**
 * A readout pair on one line: dim label left, ink value right. Keeping both at
 * 11px is what let the readouts fit their cells at all — see DESIGN.md §1.
 */
export const MARKER_GAP = 12 // marker (2px) + 10px, so text keeps one left baseline

/**
 * The value sits immediately after its label, not right-aligned in the cell.
 * Right-aligning stretched "BUSIEST DAY" and "Fri" to opposite ends of a 208px
 * box, and the pair stopped reading as one fact.
 */
export function readout(t, { x, y, name, val, accent = false }) {
  return (
    label(name, { x, y, tracking: 1, fill: t.inkDim }) +
    body(val, { x: x + labelWidth(name, 1) + S.sm, y, fill: accent ? t.accent : t.ink })
  )
}

/* --------------------------------------------------------------- documents */

export function svgDoc({ w, h, theme, body: content, defs = "", css = "", title = "", paintBg = true, bleed = 0, force }) {
  const W = w + bleed
  const H = h + bleed
  const safe = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"`,
    ` shape-rendering="crispEdges" role="img" aria-label="${safe(title)}">`,
    title ? `<title>${safe(title)}</title>` : "",
    defs ? `<defs>${defs}</defs>` : "",
    `<style>${themeCss(force)}${fontFace()}${css}</style>`,
    paintBg ? rect(0, 0, W, H, THEME.page) : "",
    content,
    `</svg>`,
  ].join("")
}

/* ----------------------------------------------------------------- helpers */

export function clamp(str, max) {
  const s = String(str ?? "").replace(/\s+/g, " ").trim()
  return s.length <= max ? s : s.slice(0, Math.max(0, max - 1)).trimEnd() + "…"
}

/** Strip emoji and pictographs — they render inconsistently inside <img> SVG. */
export const deEmoji = (str) =>
  String(str ?? "")
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{2B00}-\u{2BFF}]/gu, "")
    .replace(/\s+/g, " ")
    .trim()

export { label, value, body, text, width, labelWidth, valueWidth, bodyWidth, fit, MICRO, BIG, adv, cap, n as num }









