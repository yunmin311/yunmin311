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

import { rect, panel, tab, svgDoc, body, W_HALF, W_MOBILE, S } from "../lib/design.mjs"
import { styles, rise, nudge, enabled, STAGGER, DUR } from "../lib/motion.mjs"
import { adv, MICRO } from "../lib/type.mjs"

export const id = "work"
export const responsive = true

const DESKTOP = { w: W_HALF, h: 136, svgH: 152, lines: 4, top: 40, tags: 116 }
const MOBILE = { w: W_MOBILE, h: 184, svgH: 200, lines: 6, top: 40, tags: 164 }
const LINE_H = S.sm

/** Greedy wrap at a known advance — the face is monospaced, so this is exact. */
function wrap(text, px, size = MICRO) {
  const max = Math.floor(px / adv(size))
  const out = []
  let line = ""
  for (const word of String(text).split(/\s+/)) {
    const next = line ? `${line} ${word}` : word
    if (next.length > max && line) { out.push(line); line = word } else { line = next }
  }
  if (line) out.push(line)
  return out
}

export function card(t, p, cfg, { mobile = false } = {}) {
  const L = mobile ? MOBILE : DESKTOP
  const W = L.w
  const PAD = S.sm
  const INNER = W - PAD * 2
  const out = []
  const css = []
  const animate = enabled(cfg, "work")

  out.push(panel(t, { x: 0, y: S.xs, w: W, h: L.h, title: p.name }))

  const lines = wrap(p.why, INNER).slice(0, L.lines)
  lines.forEach((l, i) => {
    if (animate) css.push(rise(`l${i}`, { delay: i * STAGGER.row, dur: DUR.normal, dy: 4 }))
    const el = body(l, { x: PAD, y: L.top + i * LINE_H, fill: t.inkDim })
    out.push(animate ? `<g class="l${i}">${el}</g>` : el)
  })

  // Divider midway between the last line's baseline and the cap-top of the
  // tags, never closer than 8px to either.
  const lastBaseline = L.top + (lines.length - 1) * LINE_H
  const rule = Math.round((lastBaseline + (L.tags - 8)) / 2)
  out.push(rect(PAD, rule, INNER, 1, t.lineSoft))
  out.push(body(p.tags.join(" · "), { x: PAD, y: L.tags, fill: t.inkFaint }))

  const plate = tab(t, { x: W - S.sm, y: S.xs + L.h - 1, text: "View repo →", align: "end", ink: t.accent })
  if (animate) {
    out.push(`<g class="go">${plate}</g>`)
    css.push(nudge("go"))
  } else {
    out.push(plate)
  }

  return {
    w: W, h: L.svgH, body: out.join(""),
    css: styles(cfg, "work", css.join("")),
    title: `${p.name} — ${p.why}`,
  }
}

export const build = (t, _ctx, cfg, v) =>
  cfg.work.map((p) => {
    const c = card(t, p, cfg, v)
    return { key: `work-${p.key}`, svg: svgDoc({ w: c.w, h: c.h, theme: t, body: c.body, css: c.css, title: c.title }) }
  })

