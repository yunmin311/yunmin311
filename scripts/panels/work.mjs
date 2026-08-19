/**
 * 03 — SELECTED WORK.
 *
 * Four hand-picked cards, not the four most recently pushed repositories. Each
 * leads with why the thing exists and puts the stack underneath, because the
 * stack is the least interesting true fact about any of them.
 *
 * No stars, forks, issues or language percentages: those are the numbers a
 * profile reaches for when it has nothing to say about the work.
 *
 * A card is one image so a README can wrap one link around the whole thing.
 * At 432px wide the 6% sizing rule allows 22px, which is what gives the cards a
 * focal point the dense 11px dashboard below deliberately does not have.
 */

import { rect, panel, tab, svgDoc, label, value, body, bodyWidth, S } from "../lib/design.mjs"
import { adv, MICRO } from "../lib/type.mjs"

export const id = "work"

const W = 432
const H = 208
const BOX = { x: 0, y: S.xs, w: W, h: 192 }
const PAD = S.md
const INNER = W - PAD * 2
const LINES = 4

/** Greedy wrap at a known advance — the face is monospaced, so this is exact. */
function wrap(text, px, size = MICRO) {
  const per = adv(size)
  const max = Math.floor(px / per)
  const out = []
  let line = ""
  for (const word of String(text).split(/\s+/)) {
    const next = line ? `${line} ${word}` : word
    if (next.length > max && line) {
      out.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line) out.push(line)
  return out
}

export function card(t, p) {
  const out = []
  out.push(panel(t, { ...BOX, title: p.num }))

  out.push(value(p.name, { x: PAD, y: 52, fill: t.ink }))

  const lines = wrap(p.why, INNER).slice(0, LINES)
  lines.forEach((l, i) => out.push(body(l, { x: PAD, y: 76 + i * S.sm, fill: t.inkDim })))

  out.push(rect(PAD, 148, INNER, 1, t.lineSoft))
  out.push(body(p.tags.join("  ·  "), { x: PAD, y: 168, fill: t.inkFaint }))

  // The call to action rides the bottom rail as a plate, like every other
  // label that touches a border on this page.
  out.push(tab(t, { x: W - S.sm, y: BOX.y + BOX.h - 1, text: "View repo →", align: "end", ink: t.accent }))

  return { w: W, h: H, body: out.join(""), title: `${p.name} — ${p.why}` }
}

export const build = (t, _ctx, cfg) =>
  cfg.work.map((p) => {
    const c = card(t, p)
    return { key: `work-${p.key}`, svg: svgDoc({ w: c.w, h: c.h, theme: t, body: c.body, title: c.title }) }
  })
