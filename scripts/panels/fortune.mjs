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

import { svgDoc, body, rect, S } from "../lib/design.mjs"
import { adv, MICRO } from "../lib/type.mjs"

export const id = "fortune"

const W = 880
const H = 24
const BASELINE = 16
const X = S.sm

export function render(t, ctx, cfg) {
  const list = cfg.fortunes
  const day = Math.floor(Date.UTC(ctx.now.getUTCFullYear(), ctx.now.getUTCMonth(), ctx.now.getUTCDate()) / 864e5)
  const line = list[day % list.length]
  const end = X + [...line].length * adv(MICRO)

  return {
    w: W, h: H,
    body: [
      body(">", { x: 0, y: BASELINE, fill: t.accent }),
      body(line, { x: X, y: BASELINE, fill: t.inkDim }),
      rect(end + 4, BASELINE - 8, 2, 10, t.accent, `class="cr"`),
    ].join(""),
    css: `.cr{animation:blink 1.06s step-end infinite}@keyframes blink{0%,50%{opacity:1}50.01%,100%{opacity:0}}`,
    title: line,
  }
}

export const build = (t, ctx, cfg) => {
  const r = render(t, ctx, cfg)
  return svgDoc({ w: r.w, h: r.h, theme: t, body: r.body, css: r.css, title: r.title })
}
