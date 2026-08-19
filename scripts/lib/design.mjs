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

export const THEMES = {
  dark: {
    name: "dark",
    page: "#0D1117",
    panel: "#161B22",
    line: "#30363D",
    lineSoft: "#21262D",
    ink: "#C9D1D9",
    inkDim: "#8B949E",
    inkFaint: "#6E7681",
    accent: "#58A6FF",
    // Four filled steps, not four dot sizes. A sparse year drawn as growing
    // dots reads as "no data"; drawn as a filled ramp it reads as what it is —
    // concentrated recent work.
    dataEmpty: "#242B34",
    data1: "#1B3E66",
    data2: "#255C9E",
    data3: "#3B82D8",
    data4: "#58A6FF",
    dataLow: "#1F3A5F",
    dataMid: "#2C6BC9",
    dataHigh: "#58A6FF",
    // Darker than the page, so the offset block reads as a shadow and not as
    // another panel.
    shadow: "#000000",
  },
  light: {
    name: "light",
    page: "#FFFFFF",
    panel: "#F6F8FA",
    line: "#D0D7DE",
    lineSoft: "#E4E8EC",
    ink: "#24292F",
    inkDim: "#57606A",
    inkFaint: "#818B98",
    accent: "#0969DA",
    dataEmpty: "#EBEFF3",
    data1: "#C6DEFA",
    data2: "#7FB3F0",
    data3: "#3B82D8",
    data4: "#0A58B8",
    dataLow: "#BFDBFE",
    dataMid: "#60A5FA",
    dataHigh: "#0969DA",
    shadow: "#BFC8D2",
  },
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
    rect(left, top, w, 1, t.line) +
    rect(left, top + TAB_H - 1, w, 1, t.line) +
    rect(left, top, 1, TAB_H, t.line) +
    rect(left + w - 1, top, 1, TAB_H, t.line) +
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

export function panel(t, { x, y, w, h, title, meta, fill = true, shadow = true }) {
  const out = []
  if (shadow) out.push(rect(x + SHADOW, y + SHADOW, w, h, t.shadow))
  if (fill) out.push(rect(x, y, w, h, t.panel))

  out.push(hline(x, y, w, t.line))
  out.push(hline(x, y + h - 1, w, t.line))
  out.push(vline(x, y, h, t.line))
  out.push(vline(x + w - 1, y, h, t.line))

  if (title) out.push(tab(t, { x: x + S.sm, y, text: title, ink: t.ink }))
  if (meta) out.push(tab(t, { x: x + w - S.sm, y: y + h - 1, text: meta, align: "end", ink: t.inkFaint }))

  // The corner square is the panel's status lamp; motion.mjs breathes it.
  out.push(rect(x + S.tight, y + S.tight, U, U, t.accent, `class="led"`))

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

export function svgDoc({ w, h, theme, body: content, defs = "", css = "", title = "", paintBg = true, bleed = 0 }) {
  const W = w + bleed
  const H = h + bleed
  const safe = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"`,
    ` shape-rendering="crispEdges" role="img" aria-label="${safe(title)}">`,
    title ? `<title>${safe(title)}</title>` : "",
    defs ? `<defs>${defs}</defs>` : "",
    `<style>${fontFace()}${css}</style>`,
    paintBg ? rect(0, 0, W, H, theme.page) : "",
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







