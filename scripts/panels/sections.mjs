/**
 * Section headers, and the small meta strip that sits inside 01.
 *
 * These are generated rather than written as Markdown headings so the page has
 * one typeface from top to bottom. The brief's objection to SVG headers was
 * maintenance — eight nearly identical images kept by hand — which does not
 * apply when they come out of the same loop as everything else: the text lives
 * in config.json and the styling lives here.
 *
 * 22px is used here and in the hero only. Both sit in an 880px container, so
 * they stay at 2.5% of it, well inside the sizing rule that put every panel's
 * type at 11px.
 */

import { rect, marker, svgDoc, label, value, body, labelWidth, valueWidth, bodyWidth, U, S } from "../lib/design.mjs"

export const id = "sections"

const W = 880

/* ------------------------------------------------------------------ header */

function header(t, { num, title, sub }) {
  const h = sub ? 56 : 36
  const baseline = 24
  const out = []

  out.push(marker(t, 0, baseline - 8))

  let x = S.sm
  if (num) {
    out.push(value(num, { x, y: baseline, fill: t.accent }))
    x += valueWidth(num) + 14
    out.push(value("//", { x, y: baseline, fill: t.inkFaint }))
    x += valueWidth("//") + 14
  }
  const name = title.toUpperCase()
  out.push(value(name, { x, y: baseline, fill: t.ink }))
  x += valueWidth(name) + S.md

  out.push(rect(x, baseline - 6, W - x, 1, t.line))
  if (sub) out.push(body(sub, { x: S.sm, y: 48, fill: t.inkDim }))

  return { w: W, h, body: out.join(""), title: `${num ? num + " // " : ""}${title}${sub ? " — " + sub : ""}` }
}

/* -------------------------------------------------------------- meta strip */

/** A bordered chip. Reads as a key on the same keyboard as the contact row. */
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
  const H = 72

  // Row 1 — where the attention is, not a todo list.
  out.push(marker(t, 0, 10))
  out.push(label("CURRENTLY EXPLORING", { x: S.sm, y: 16, tracking: 1, fill: t.ink }))
  let x = S.sm + labelWidth("CURRENTLY EXPLORING", 1) + S.md
  for (const item of cfg.exploring) {
    const c = chip(t, x, 2, item)
    out.push(c.svg)
    x += c.w + S.xs
  }

  out.push(rect(0, 40, W, 1, t.lineSoft))

  // Row 2 — two sentences, deliberately not a wall of values.
  out.push(marker(t, 0, 58))
  out.push(label("PRINCIPLES_", { x: S.sm, y: 64, tracking: 1, fill: t.inkFaint }))
  let px = S.sm + labelWidth("PRINCIPLES_", 1) + S.md
  cfg.principles.forEach((p, i) => {
    if (i) {
      out.push(body("·", { x: px, y: 64, fill: t.inkFaint }))
      px += bodyWidth("· ")
    }
    out.push(body(p, { x: px, y: 64, fill: t.inkDim }))
    px += bodyWidth(p) + S.sm
  })

  return { w: W, h: H, body: out.join(""), title: `Currently exploring: ${cfg.exploring.join(", ")}. ${cfg.principles.join(" ")}` }
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
