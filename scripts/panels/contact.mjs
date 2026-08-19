/**
 * 07 — CONTACT.
 *
 * One button shape, one border, one blue pixel each. No brand colours: Gmail
 * red beside WeChat green beside Douyin's gradient is four other companies'
 * design systems fighting on someone else's page.
 *
 * Each button is its own file because a README can only wrap a link around a
 * whole image, and these point at four different places.
 */

import { rect, marker, svgDoc, label, labelWidth, U, S , pixelFrame} from "../lib/design.mjs"

export const id = "contact"

const H = 24 // 12U
const PAD_L = 20
const PAD_R = 14
const TRACK = 1

export function button(t, text) {
  const s = String(text).toUpperCase()
  const w = Math.ceil((PAD_L + labelWidth(s, TRACK) + PAD_R) / U) * U

  const face = [
    // Keycap shadow offset by one unit — the only depth cue on the page.
    rect(U, U, w, H, t.line),
    rect(0, 0, w, H, t.panel),
    rect(0, 0, w, 1, t.line),
    rect(0, H - 1, w, 1, t.line),
    rect(0, 0, 1, H, t.line),
    rect(w - 1, 0, 1, H, t.line),
    marker(t, S.xs, H / 2 - 1),
    label(s, { x: PAD_L, y: H / 2 + 4, tracking: TRACK, fill: t.ink }),
  ].join("")

  return { w: w + U, h: H + U, body: face, title: s }
}

export const responsive = false

export const build = (t, _ctx, cfg) =>
  cfg.contact
    .filter((c) => c.enabled)
    .map((c) => {
      const b = button(t, c.label)
      return { key: c.key, svg: svgDoc({ w: b.w, h: b.h, theme: t, body: b.body, title: b.title, paintBg: false }) }
    })


