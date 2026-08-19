/**
 * 04c — RECENTLY STARRED.
 *
 * Three repositories, no counts. A star is only interesting here as a signal of
 * what pulls attention; how many other people starred the same thing says
 * nothing about the person whose profile this is.
 */

import { rect, marker, panel, svgDoc, body, bodyWidth, fit, MARKER_GAP, S , W_HALF} from "../lib/design.mjs"
import { ago } from "../lib/data.mjs"

export const id = "stars"

const W = W_HALF
const H = 216
const BOX = { x: 0, y: S.xs, w: W, h: 200 }
const PAD = S.sm
const PITCH = 56
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

    // No bullet column and no rule between entries: whitespace already
    // separates them, and both were crowding the text they sat next to. The
    // newest entry is marked by putting its timestamp in the accent instead.
    out.push(body(`${owner}/`, { x: PAD, y, fill: t.inkFaint }))
    out.push(body(fit(name, INNER - ownerW - 40), { x: PAD + ownerW, y, fill: t.ink }))
    out.push(body(when, { x: W - PAD, y, fill: i === 0 ? t.accent : t.inkFaint, anchor: "end" }))
    if (s.description) out.push(body(fit(s.description, INNER), { x: PAD, y: y + S.sm, fill: t.inkDim }))
  })

  if (!list.length) out.push(body("no recent stars", { x: PAD, y: 40, fill: t.inkFaint }))

  return { w: W, h: H, body: out.join(""), title: `Recently starred — ${list.map((s) => s.name).join(", ")}` }
}

export const build = (t, ctx, cfg) => {
  const r = render(t, ctx, cfg)
  return svgDoc({ w: r.w, h: r.h, theme: t, body: r.body, title: r.title })
}








