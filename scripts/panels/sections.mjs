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

import { rect, svgDoc, label, body, labelWidth, bodyWidth, W_FULL, W_MOBILE, S } from "../lib/design.mjs"
import { styles, draw, rise, enabled, STAGGER, DUR } from "../lib/motion.mjs"

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
  out.push(label(name, { x, y: BASELINE, tracking: 2, fill: t.ink }))
  x += labelWidth(name, 2) + S.sm

  const rule = rect(x, RULE_Y, Math.max(0, W - x), 1, t.line)
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

/* -------------------------------------------------------------- meta strip */

/** A bordered chip — the same key shape as the contact row. */
function chip(t, x, y, text) {
  const w = bodyWidth(text) + S.md
  const h = 20
  return {
    w,
    svg:
      rect(x, y, w, h, t.panel) +
      rect(x, y, w, 1, t.line) +
      rect(x, y + h - 1, w, 1, t.line) +
      rect(x, y, 1, h, t.line) +
      rect(x + w - 1, y, 1, h, t.line) +
      body(text, { x: x + S.sm - 4, y: y + 14, fill: t.inkDim }),
  }
}

function metaStrip(t, cfg, W) {
  const out = []
  const css = []
  const animate = enabled(cfg, "sections")

  out.push(label("CURRENTLY EXPLORING", { x: 0, y: 16, tracking: 1, fill: t.ink }))

  // Chips wrap to a new row when the next one would overflow, which is what
  // lets the strip survive a 344px column without a second layout.
  let x = labelWidth("CURRENTLY EXPLORING", 1) + S.md
  let row = 0
  cfg.exploring.forEach((item, i) => {
    let c = chip(t, x, 2 + row * 26, item)
    if (x + c.w > W) {
      row++
      x = 0
      c = chip(t, x, 2 + row * 26, item)
    }
    if (animate) css.push(rise(`k${i}`, { delay: i * STAGGER.row, dur: DUR.normal, dy: 4 }))
    out.push(animate ? `<g class="k${i}">${c.svg}</g>` : c.svg)
    x += c.w + S.xs
  })

  const ruleY = 40 + row * 26
  out.push(rect(0, ruleY, W, 1, t.lineSoft))

  const pBaseline = ruleY + 24
  out.push(label("PRINCIPLES_", { x: 0, y: pBaseline, tracking: 1, fill: t.inkFaint }))
  const pStart = labelWidth("PRINCIPLES_", 1) + S.md
  const joined = cfg.principles.join("   ·   ")
  const avail = W - pStart
  const lines = bodyWidth(joined) <= avail ? [joined] : wrapAt(joined, avail)
  lines.forEach((l, i) => out.push(body(l, { x: pStart, y: pBaseline + i * S.sm, fill: t.inkDim })))

  return {
    w: W,
    h: pBaseline + (lines.length - 1) * S.sm + 12,
    body: out.join(""),
    css: styles(cfg, "sections", css.join("")),
    title: `Currently exploring: ${cfg.exploring.join(", ")}. ${cfg.principles.join(" ")}`,
  }
}

/* ------------------------------------------------------------------ export */

export const build = (t, _ctx, cfg, { mobile = false } = {}) => {
  const W = mobile ? W_MOBILE : W_FULL
  const files = cfg.sections.map((s) => {
    const r = header(t, s, W, cfg)
    return { key: `sec-${s.key}`, svg: svgDoc({ w: r.w, h: r.h, theme: t, body: r.body, css: r.css, title: r.title, paintBg: false }) }
  })
  const m = metaStrip(t, cfg, W)
  files.push({ key: "about-meta", svg: svgDoc({ w: m.w, h: m.h, theme: t, body: m.body, css: m.css, title: m.title, paintBg: false }) })
  return files
}
