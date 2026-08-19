/**
 * Section headers, and the small meta strip that sits inside 01.
 *
 * Generated rather than written as Markdown headings so the page has one
 * typeface from top to bottom. The brief's objection to SVG headers was
 * maintenance — eight nearly identical images kept by hand — which does not
 * apply when they come out of the same loop as everything else: the text lives
 * in config.json and the styling lives here.
 *
 * These are set at 11px like the panels, not at 22px. A header a size larger
 * than everything under it turned the page into a stack of announcements; the
 * number in accent plus a rule running to the margin says "new section" without
 * raising its voice.
 */

import { rect, marker, svgDoc, label, body, labelWidth, bodyWidth, U, S , W_FULL} from "../lib/design.mjs"

export const id = "sections"

const W = W_FULL
const BASELINE = 20
const RULE_Y = 16 // mid cap-height, so the rule reads as a continuation of the text

/* ------------------------------------------------------------------ header */

function header(t, { num, title, sub }) {
  const out = []
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

  out.push(rect(x, RULE_Y, W - x, 1, t.line))
  if (sub) out.push(body(sub, { x: 0, y: 40, fill: t.inkDim }))

  return {
    w: W,
    h: sub ? 48 : 28,
    body: out.join(""),
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

function metaStrip(t, cfg) {
  const out = []

  // Row 1 — where the attention is, not a todo list.
  out.push(label("CURRENTLY EXPLORING", { x: 0, y: 16, tracking: 1, fill: t.ink }))
  let x = labelWidth("CURRENTLY EXPLORING", 1) + S.md
  for (const item of cfg.exploring) {
    const c = chip(t, x, 2, item)
    out.push(c.svg)
    x += c.w + S.xs
  }

  // Rule sits midway between the baseline above and the cap-top below, with at
  // least 8px either side. Every divider on this page is placed that way.
  out.push(rect(0, 40, W, 1, t.lineSoft))

  // Row 2 — two sentences, deliberately not a wall of values.
  out.push(label("PRINCIPLES_", { x: 0, y: 64, tracking: 1, fill: t.inkFaint }))
  let px = labelWidth("PRINCIPLES_", 1) + S.md
  cfg.principles.forEach((p, i) => {
    if (i) {
      out.push(body("·", { x: px, y: 64, fill: t.inkFaint }))
      px += bodyWidth("·  ")
    }
    out.push(body(p, { x: px, y: 64, fill: t.inkDim }))
    px += bodyWidth(p) + S.sm
  })

  return {
    w: W, h: 72, body: out.join(""),
    title: `Currently exploring: ${cfg.exploring.join(", ")}. ${cfg.principles.join(" ")}`,
  }
}

/* ------------------------------------------------------------------ export */

export const build = (t, _ctx, cfg) => {
  const files = cfg.sections.map((s) => {
    const r = header(t, s)
    return { key: `sec-${s.key}`, svg: svgDoc({ w: r.w, h: r.h, theme: t, body: r.body, title: r.title, paintBg: false }) }
  })
  const m = metaStrip(t, cfg)
  files.push({ key: "about-meta", svg: svgDoc({ w: m.w, h: m.h, theme: t, body: m.body, title: m.title, paintBg: false }) })
  return files
}



