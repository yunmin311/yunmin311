/**
 * 04d — RECENT ACTIVITY.
 *
 * Releases, repositories opened to the public, pull requests, issues. Pushes
 * are excluded deliberately: a stream of "pushed 3 commits" is noise, and it is
 * the noise most profiles mistake for evidence of work.
 */

import { rect, marker, panel, svgDoc, label, body, fit, MARKER_GAP, S } from "../lib/design.mjs"

export const id = "activity"

const W = 430
const H = 192
const BOX = { x: 0, y: S.xs, w: W, h: 176 }
const PAD = S.md
const PITCH = 32
const LIMIT = 4
const INNER = W - PAD * 2

export function render(t, ctx, cfg) {
  const list = ctx.activity.slice(0, LIMIT)
  const out = []

  out.push(panel(t, { ...BOX, title: "Recent activity", meta: `last ${cfg.activity.days} days` }))

  list.forEach((a, i) => {
    const y = 40 + i * PITCH
    out.push(marker(t, PAD, y - 5, i === 0 ? t.accent : t.inkFaint))
    out.push(label(a.tag, { x: PAD + MARKER_GAP, y, tracking: 1, fill: t.inkDim }))
    out.push(body(a.ago, { x: W - PAD, y, fill: t.inkFaint, anchor: "end" }))
    out.push(body(fit(a.repo, INNER - MARKER_GAP - 80), { x: PAD + MARKER_GAP, y: y + S.sm, fill: t.ink }))
    if (a.detail) out.push(body(a.detail, { x: W - PAD, y: y + S.sm, fill: t.inkFaint, anchor: "end" }))
    if (i < list.length - 1) out.push(rect(PAD, y + S.md, INNER, 1, t.lineSoft))
  })

  if (!list.length) out.push(body("nothing worth reporting", { x: PAD, y: 40, fill: t.inkFaint }))

  return { w: W, h: H, body: out.join(""), title: `Recent activity — ${list.map((a) => `${a.tag} ${a.repo}`).join("; ")}` }
}

export const build = (t, ctx, cfg) => {
  const r = render(t, ctx, cfg)
  return svgDoc({ w: r.w, h: r.h, theme: t, body: r.body, title: r.title })
}


