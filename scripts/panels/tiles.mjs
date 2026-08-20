/**
 * TILES — a row of readout cells.
 *
 * Not used on the profile. A component for the reusable set: the generic shape
 * behind every "N things / M other things" strip, driven entirely by config so
 * nothing in it knows what it is counting.
 *
 * Each tile is its own framed box rather than a share of one long panel,
 * because a row of separate boxes survives wrapping onto a phone and a divided
 * panel does not.
 */

import { rect, pixelFrame, svgDoc, label, body, labelWidth, bodyWidth, W_FULL, W_MOBILE, SHADOW, S } from "../lib/design.mjs"
import { styles, enabled, keylight } from "../lib/motion.mjs"

export const id = "tiles"
export const responsive = true

const TILE_H = 56
const GAP = S.xs

export function render(t, ctx, cfg, { mobile = false } = {}) {
  const W = mobile ? W_MOBILE : W_FULL
  const items = cfg.tiles ?? []
  const animate = enabled(cfg, "tiles")
  const out = []
  const css = []

  const perRow = mobile ? 2 : Math.min(items.length, 4)
  const tileW = Math.floor((W - GAP * (perRow - 1)) / perRow)
  const rows = Math.ceil(items.length / perRow)

  items.forEach((it, i) => {
    const col = i % perRow
    const row = Math.floor(i / perRow)
    const x = col * (tileW + GAP)
    const y = row * (TILE_H + GAP)

    out.push(rect(x + SHADOW, y + SHADOW, tileW, TILE_H, t.shadow))
    out.push(rect(x, y, tileW, TILE_H, t.panel))
    out.push(pixelFrame(t, x, y, tileW, TILE_H, t.line))

    // The lamp is the tile's only bright pixel, and it takes its turn.
    const lampX = x + S.sm - 2
    out.push(
      animate
        ? `<rect class="k${i}" x="${lampX}" y="${y + 14}" width="4" height="4" fill="${t.accent}"/>`
        : rect(lampX, y + 14, 4, 4, t.accent)
    )
    if (animate) css.push(keylight(`k${i}`, { index: i, count: items.length, period: 4400 }))

    out.push(label(it.label, { x: x + S.sm + 8, y: y + 21, tracking: 1, fill: t.inkDim }))
    out.push(body(String(it.value), { x: x + S.sm, y: y + 42, fill: t.titleInk }))
    if (it.note) out.push(body(it.note, { x: x + tileW - S.sm, y: y + 42, fill: t.inkFaint, anchor: "end" }))
  })

  return {
    w: W,
    h: rows * TILE_H + (rows - 1) * GAP + SHADOW,
    body: out.join(""),
    css: styles(cfg, "tiles", css.join("")),
    title: items.map((i) => `${i.label}: ${i.value}`).join(", "),
  }
}

export const build = (t, ctx, cfg, v) => {
  const r = render(t, ctx, cfg, v)
  return svgDoc({ w: r.w, h: r.h, theme: t, body: r.body, css: r.css, title: r.title, paintBg: false })
}
