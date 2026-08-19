/**
 * 04c — RECENTLY STARRED.
 *
 * Three repositories, no counts. A star is only interesting here as a signal of
 * what pulls attention; how many other people starred the same thing says
 * nothing about the person whose profile this is.
 */

import { rect, marker, panel, svgDoc, body, bodyWidth, fit, MARKER_GAP, S } from "../lib/design.mjs"
import { ago } from "../lib/data.mjs"

export const id = "stars"

const W = 430
const H = 192
const BOX = { x: 0, y: S.xs, w: W, h: 176 }
const PAD = S.md
const PITCH = S.xl // 48
const INNER = W - PAD * 2

export function render(t, ctx) {
  const list = ctx.stars.slice(0, 3)
  const out = []

  out.push(panel(t, { ...BOX, title: "Recently starred", meta: "what caught my eye" }))

  list.forEach((s, i) => {
    const y = 40 + i * PITCH
    const [owner, name] = s.name.split("/")
    const when = s.starredAt ? ago(new Date(s.starredAt).getTime()) : ""
    const ownerW = bodyWidth(`${owner}/`)

    // Marker sits on the content baseline rather than floating between it and
    // the border, so the panel has one left edge instead of two.
    const tx = PAD + MARKER_GAP
    out.push(marker(t, PAD, y - 5, i === 0 ? t.accent : t.inkFaint))
    out.push(body(`${owner}/`, { x: tx, y, fill: t.inkFaint }))
    out.push(body(fit(name, INNER - MARKER_GAP - ownerW - 40), { x: tx + ownerW, y, fill: t.ink }))
    out.push(body(when, { x: W - PAD, y, fill: t.inkFaint, anchor: "end" }))
    if (s.description) out.push(body(fit(s.description, INNER - MARKER_GAP), { x: tx, y: y + S.sm, fill: t.inkDim }))
    if (i < list.length - 1) out.push(rect(PAD, y + S.md, INNER, 1, t.lineSoft))
  })

  if (!list.length) out.push(body("no recent stars", { x: PAD, y: 40, fill: t.inkFaint }))

  return { w: W, h: H, body: out.join(""), title: `Recently starred — ${list.map((s) => s.name).join(", ")}` }
}

export const build = (t, ctx, cfg) => {
  const r = render(t, ctx, cfg)
  return svgDoc({ w: r.w, h: r.h, theme: t, body: r.body, title: r.title })
}


