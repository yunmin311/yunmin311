/**
 * 01 — ABOUT ME, as a designed module rather than plain Markdown.
 *
 * The page had a weight problem: everything below 03 was a dense instrument
 * panel and the introduction above it was default-size grey prose, so the eye
 * landed at the bottom and the person got skipped. This gives the top of the
 * page something to stand on — a name at 22px, which the sizing rule allows at
 * this width, the prose set in the page's own face, and the exploring and
 * principles rows folded in so 01 is one object instead of three.
 *
 * The full text lives in the image's alt attribute, so nothing that was
 * readable as Markdown stops being readable to a screen reader or to anyone
 * with images off.
 */

import { rect, panel, pixelRule, svgDoc, label, value, body, labelWidth, bodyWidth, W_FULL, W_MOBILE, SHADOW, S } from "../lib/design.mjs"
import { styles, keylight, enabled } from "../lib/motion.mjs"
import { adv, MICRO } from "../lib/type.mjs"

export const id = "about"
export const responsive = true

const DESKTOP = { w: W_FULL, name: 46, prose: 78, lead: 20, chipRow: 0, h: 0 }
const MOBILE = { w: W_MOBILE, name: 42, prose: 74, lead: 18, chipRow: 0, h: 0 }

function wrap(text, px) {
  const max = Math.floor(px / adv(MICRO))
  const out = []
  let line = ""
  for (const w of String(text).split(/\s+/)) {
    const next = line ? `${line} ${w}` : w
    if (next.length > max && line) { out.push(line); line = w } else { line = next }
  }
  if (line) out.push(line)
  return out
}

/** A bordered chip with its own indicator lamp. */
function chip(t, x, y, text) {
  const w = bodyWidth(text) + 30
  const h = 20
  return {
    x, y, w, h,
    svg:
      rect(x, y, w, h, t.page) +
      rect(x + 2, y, w - 4, 1, t.line) +
      rect(x + 2, y + h - 1, w - 4, 1, t.line) +
      rect(x, y + 2, 1, h - 4, t.line) +
      rect(x + w - 1, y + 2, 1, h - 4, t.line) +
      body(text, { x: x + 20, y: y + 14, fill: t.inkDim }),
  }
}

export function render(t, ctx, cfg, { mobile = false } = {}) {
  const L = mobile ? MOBILE : DESKTOP
  const W = L.w
  const PAD = S.sm
  const INNER = W - PAD * 2
  const out = []
  const css = []
  const animate = enabled(cfg, "about")

  // ---- prose -------------------------------------------------------------
  const paras = cfg.about.paragraphs.map((p) => wrap(p, INNER))
  let y = L.prose
  const proseBlocks = []
  for (const lines of paras) {
    proseBlocks.push({ y, lines })
    y += lines.length * L.lead + 12
  }

  // ---- chips -------------------------------------------------------------
  const chipsTop = y + 4
  const chipBoxes = []
  let cx = PAD + labelWidth("EXPLORING", 1) + S.md
  let row = 0
  for (const item of cfg.exploring) {
    let c = chip(t, cx, chipsTop + row * 26, item)
    if (cx + c.w > W - PAD) {
      row++
      cx = PAD + labelWidth("EXPLORING", 1) + S.md
      c = chip(t, cx, chipsTop + row * 26, item)
    }
    chipBoxes.push(c)
    cx += c.w + S.xs
  }
  const afterChips = chipsTop + (row + 1) * 26

  const pStart = PAD + labelWidth("PRINCIPLES_", 1) + S.md
  const joined = cfg.principles.join("   ·   ")
  const pLines = bodyWidth(joined) <= W - PAD - pStart ? [joined] : wrap(joined, W - PAD - pStart)
  const pBaseline = afterChips + 18
  const boxH = pBaseline + (pLines.length - 1) * L.lead + 20

  out.push(panel(t, { x: 0, y: S.xs, w: W, h: boxH, title: "About me", meta: cfg.about.meta }))

  out.push(value(cfg.about.name, { x: PAD, y: L.name, fill: t.ink }))
  for (const b of proseBlocks) {
    b.lines.forEach((l, i) => out.push(body(l, { x: PAD, y: b.y + i * L.lead, fill: t.inkDim })))
  }

  out.push(pixelRule(PAD, chipsTop - 14, INNER, t.lineSoft))
  out.push(label("EXPLORING", { x: PAD, y: chipsTop + 14, tracking: 1, fill: t.inkFaint }))
  chipBoxes.forEach((c, i) => {
    // Indicator keys lighting one after another — 01's own motion, and the
    // only module that uses it.
    const lamp = animate
      ? `<rect class="k${i}" x="${c.x + 8}" y="${c.y + 8}" width="4" height="4" fill="${t.accent}"/>`
      : `<rect x="${c.x + 8}" y="${c.y + 8}" width="4" height="4" fill="${t.accent}" opacity="0.5"/>`
    if (animate) css.push(keylight(`k${i}`, { index: i, count: chipBoxes.length, period: 4400 }))
    out.push(c.svg + lamp)
  })

  out.push(label("PRINCIPLES_", { x: PAD, y: pBaseline, tracking: 1, fill: t.inkFaint }))
  pLines.forEach((l, i) => out.push(body(l, { x: pStart, y: pBaseline + i * L.lead, fill: t.inkDim })))

  return {
    w: W,
    h: boxH + S.xs * 2,
    body: out.join(""),
    css: styles(cfg, "about", css.join("")),
    title:
      `${cfg.about.name}. ${cfg.about.paragraphs.join(" ")} ` +
      `Currently exploring: ${cfg.exploring.join(", ")}. ${cfg.principles.join(" ")}`,
  }
}

export const build = (t, ctx, cfg, v) => {
  const r = render(t, ctx, cfg, v)
  return svgDoc({ w: r.w, h: r.h, theme: t, body: r.body, css: r.css, title: r.title, bleed: SHADOW })
}
