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
 * The project name rides the top rail as a plate, exactly like every other
 * panel's title, and the type inside is the same 11px as the dashboard. An
 * earlier draft set the names at 22px with a lot of air, and the cards stopped
 * looking like they came from the same page as everything else.
 *
 * A card is one image so a README can wrap one link around the whole thing.
 */

import { rect, panel, tab, svgDoc, body, S } from "../lib/design.mjs"
import { adv, MICRO } from "../lib/type.mjs"

export const id = "work"

const W = 432
const H = 152
const BOX = { x: 0, y: S.xs, w: W, h: 136 }
const PAD = S.sm
const INNER = W - PAD * 2
const LINES = 4
const LINE_H = S.sm

/** Greedy wrap at a known advance — the face is monospaced, so this is exact. */
function wrap(text, px, size = MICRO) {
  const max = Math.floor(px / adv(size))
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
  out.push(panel(t, { ...BOX, title: p.name }))

  const lines = wrap(p.why, INNER).slice(0, LINES)
  const firstBaseline = 40
  lines.forEach((l, i) => out.push(body(l, { x: PAD, y: firstBaseline + i * LINE_H, fill: t.inkDim })))

  // Divider midway between the last line's baseline and the cap-top of the
  // tags, never closer than 8px to either.
  const lastBaseline = firstBaseline + (lines.length - 1) * LINE_H
  const tagsBaseline = 116
  const rule = Math.round((lastBaseline + (tagsBaseline - 8)) / 2)
  out.push(rect(PAD, rule, INNER, 1, t.lineSoft))
  out.push(body(p.tags.join("  ·  "), { x: PAD, y: tagsBaseline, fill: t.inkFaint }))

  out.push(tab(t, { x: W - S.sm, y: BOX.y + BOX.h - 1, text: "View repo →", align: "end", ink: t.accent }))

  return { w: W, h: H, body: out.join(""), title: `${p.name} — ${p.why}` }
}

export const build = (t, _ctx, cfg) =>
  cfg.work.map((p) => {
    const c = card(t, p)
    return { key: `work-${p.key}`, svg: svgDoc({ w: c.w, h: c.h, theme: t, body: c.body, title: c.title }) }
  })
