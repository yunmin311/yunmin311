/**
 * Typography.
 *
 * Departure Mono (SIL OFL, Helena Zhang) is embedded as a base64 WOFF2 inside
 * every generated SVG. External font requests are blocked when an SVG is shown
 * through <img>, which is how a README displays one, so a data URI is the only
 * way to control type at all — and controlling it is the difference between a
 * pixel interface and a screenshot of one.
 *
 * Subset to printable ASCII plus a handful of marks, the file is ~2 KB, which
 * is cheaper than the geometry it replaces.
 *
 * SIZES. The face is drawn on an 11-pixel em: unitsPerEm 550, advance 350,
 * cap height 400 — all multiples of 50. So at 11px one font-pixel is exactly
 * one screen pixel, at 22px exactly two, and the advance is a whole number
 * either way (7px and 14px). Any size between those lands glyph edges on half
 * pixels and the face goes soft, which is what "the pixel font looks bad"
 * usually means. Hence two sizes, and hierarchy from case, tracking and colour
 * rather than from a third size.
 */

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const WOFF2 = resolve(ROOT, "assets/fonts/DepartureMono-subset.woff2")

const B64 = readFileSync(WOFF2).toString("base64")

export const FAMILY = "DepartureMono"
export const STACK = `'${FAMILY}',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace`

/** The two legal sizes. */
export const MICRO = 11
export const BIG = 22

/** Design constants of the face, in em fractions. */
export const ADV_RATIO = 350 / 550
export const CAP_RATIO = 400 / 550

/** Exact horizontal advance of one glyph. Whole pixels at 11 and 22. */
export const adv = (size) => (size * 7) / 11
export const cap = (size) => size * CAP_RATIO

/** Width of a string, including tracking between glyphs but not after the last. */
export const width = (str, size = MICRO, tracking = 0) => {
  const n = [...String(str)].length
  return n * adv(size) + Math.max(0, n - 1) * tracking
}

/** The @font-face rule. Must appear in every document that sets type. */
export const fontFace = () =>
  `@font-face{font-family:"${FAMILY}";src:url(data:font/woff2;base64,${B64}) format("woff2");font-weight:400;font-style:normal;font-display:block}` +
  `text{font-family:${STACK};dominant-baseline:auto}`

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

/**
 * `y` is the BASELINE. Tracked text is only ever left-anchored: renderers
 * disagree about whether trailing letter-spacing counts toward the advance,
 * and a right-aligned tracked string drifts by a pixel or two between them.
 */
export function text(str, { x = 0, y = 0, size = MICRO, fill, anchor = "start", tracking = 0, opacity, cls } = {}) {
  const s = String(str ?? "")
  if (!s) return ""
  const at = []
  if (anchor !== "start") at.push(`text-anchor="${anchor === "end" ? "end" : "middle"}"`)
  if (tracking) at.push(`letter-spacing="${tracking}"`)
  if (opacity !== undefined) at.push(`opacity="${opacity}"`)
  if (cls) at.push(`class="${cls}"`)
  return `<text x="${x}" y="${y}" font-size="${size}"${fill ? ` fill="${fill}"` : ""} ${at.join(" ")}>${esc(s)}</text>`
}

/** Small tracked uppercase — the instrument-label register. */
export const label = (str, opts = {}) =>
  text(String(str).toUpperCase(), { size: MICRO, tracking: 1.4, ...opts })

/** Large numerals and names. */
export const value = (str, opts = {}) => text(str, { size: BIG, tracking: 0, ...opts })

/** Sentence-case small text — descriptions, notes, the fortune. */
export const body = (str, opts = {}) => text(str, { size: MICRO, tracking: 0, ...opts })

export const labelWidth = (str, tracking = 1.4) => width(String(str).toUpperCase(), MICRO, tracking)
export const valueWidth = (str) => width(str, BIG, 0)
export const bodyWidth = (str) => width(str, MICRO, 0)

/** Trim to fit `px`, appending an ellipsis if it had to cut. */
export function fit(str, px, size = MICRO, tracking = 0) {
  const s = String(str ?? "").replace(/\s+/g, " ").trim()
  const per = adv(size) + tracking
  const max = Math.floor((px + tracking) / per)
  if (s.length <= max) return s
  return s.slice(0, Math.max(0, max - 1)).trimEnd() + "…"
}
