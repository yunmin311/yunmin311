/**
 * 08 — FORTUNE.
 *
 * One line, no frame. It rotates on a date-derived index, so the page changes
 * slightly between visits without anything being random at build time.
 *
 * The caret is placed by arithmetic rather than measurement: the face is
 * monospaced on an 11-pixel em, so n characters at 11px is exactly 7n pixels
 * wide on every machine that renders it.
 */

import { svgDoc, body, rect, bodyWidth, W_FULL, W_MOBILE, S } from "../lib/design.mjs"
import { styles, blink, enabled } from "../lib/motion.mjs"
import { adv, MICRO } from "../lib/type.mjs"

export const id = "fortune"
export const responsive = true

const X = S.sm

export function render(t, ctx, cfg, { mobile = false } = {}) {
  const W = mobile ? W_MOBILE : W_FULL
  const list = cfg.fortunes
  const day = Math.floor(Date.UTC(ctx.now.getUTCFullYear(), ctx.now.getUTCMonth(), ctx.now.getUTCDate()) / 864e5)
  const line = list[day % list.length]
  const animate = enabled(cfg, "fortune")

  // Wrap only when it has to, so the desktop version stays a single line.
  const max = Math.floor((W - X - S.sm) / adv(MICRO))
  const lines = []
  let cur = ""
  for (const w of line.split(" ")) {
    const next = cur ? `${cur} ${w}` : w
    if (next.length > max && cur) { lines.push(cur); cur = w } else { cur = next }
  }
  if (cur) lines.push(cur)

  const out = [body(">", { x: 0, y: 16, fill: t.accent })]
  lines.forEach((l, i) => out.push(body(l, { x: X, y: 16 + i * S.sm, fill: t.inkDim })))

  const lastBaseline = 16 + (lines.length - 1) * S.sm
  const end = X + bodyWidth(lines[lines.length - 1])
  out.push(rect(end + 4, lastBaseline - 8, 2, 10, t.accent, animate ? `class="cr"` : ""))

  return {
    w: W,
    h: lastBaseline + 8,
    body: out.join(""),
    css: styles(cfg, "fortune", animate ? blink("cr") : ""),
    title: line,
  }
}

export const build = (t, ctx, cfg, v) => {
  const r = render(t, ctx, cfg, v)
  return svgDoc({ w: r.w, h: r.h, theme: t, body: r.body, css: r.css, title: r.title })
}
