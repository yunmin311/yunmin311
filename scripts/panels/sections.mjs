/**
 * Section headers, and the small meta strip inside 01.
 *
 * Generated rather than written as Markdown headings so the page has one
 * typeface from top to bottom. The brief's objection to SVG headers was
 * maintenance — eight nearly identical images kept by hand — which does not
 * apply when they come out of the same loop as everything else: the text lives
 * in config.json and the styling lives here.
 *
 * Set at 11px like the panels, not larger. A header a size above everything
 * under it turned the page into a stack of announcements; the number in accent
 * plus a rule running to the margin says "new section" without raising its
 * voice.
 */

import { rect, svgDoc, label, body, labelWidth, bodyWidth, W_FULL, W_MOBILE, S , pixelRule, pixelFrame} from "../lib/design.mjs"
import { styles, draw, enabled, DUR } from "../lib/motion.mjs"

export const id = "sections"
export const responsive = true

const BASELINE = 20
const RULE_Y = 16 // mid cap-height, so the rule reads as a continuation of the text

const wrapAt = (text, px) => {
  const max = Math.max(8, Math.floor(px / 7))
  const out = []
  let line = ""
  for (const w of String(text).split(/\s+/)) {
    const next = line ? `${line} ${w}` : w
    if (next.length > max && line) { out.push(line); line = w } else { line = next }
  }
  if (line) out.push(line)
  return out
}

/* ------------------------------------------------------------------ header */

function header(t, { num, title, sub }, W, cfg) {
  const out = []
  const css = []
  const animate = enabled(cfg, "sections")
  let x = 0

  if (num) {
    out.push(label(num, { x, y: BASELINE, tracking: 1, fill: t.accent }))
    x += labelWidth(num, 1) + S.xs
    out.push(label("//", { x, y: BASELINE, tracking: 1, fill: t.inkFaint }))
    x += labelWidth("//", 1) + S.xs
  }
  const name = title.toUpperCase()
  out.push(label(name, { x, y: BASELINE, tracking: 2, fill: t.titleInk }))
  x += labelWidth(name, 2) + S.sm

  const rule = pixelRule(x, RULE_Y, Math.max(0, W - x), t.line)
  if (animate) {
    out.push(`<g class="ru">${rule}</g>`)
    css.push(draw("ru", { dur: DUR.slow }))
  } else {
    out.push(rule)
  }

  const subLines = sub ? wrapAt(sub, W) : []
  subLines.forEach((l, i) => out.push(body(l, { x: 0, y: 40 + i * S.sm, fill: t.inkDim })))

  return {
    w: W,
    h: subLines.length ? 32 + subLines.length * S.sm : 28,
    body: out.join(""),
    css: styles(cfg, "sections", css.join("")),
    title: `${num ? num + " // " : ""}${title}${sub ? " — " + sub : ""}`,
  }
}

/* ------------------------------------------------------------------ export */

export const build = (t, _ctx, cfg, { mobile = false } = {}) => {
  const W = mobile ? W_MOBILE : W_FULL
  const files = cfg.sections.map((s) => {
    const r = header(t, s, W, cfg)
    return { key: `sec-${s.key}`, svg: svgDoc({ w: r.w, h: r.h, theme: t, body: r.body, css: r.css, title: r.title, paintBg: false }) }
  })
  return files
}






