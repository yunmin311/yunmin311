/**
 * 04b — LANGUAGE SIGNAL.
 *
 * One hue at four designed steps, not a rainbow: the ranking is the
 * information, and six unrelated colours only make it harder to read.
 *
 * Scope is printed on the panel. An unqualified language chart on a GitHub
 * profile is usually measuring build output — this one covers exactly the four
 * tools shown in SELECTED WORK, so a reader can check it.
 */

import { rect, panel, svgDoc, label, body, bodyWidth, S , W_FULL} from "../lib/design.mjs"

export const id = "languages"

const W = W_FULL
const H = 192
const BOX = { x: 0, y: S.xs, w: W, h: 176 }
const PAD = S.sm
const BAR = { y: 52, h: 12 } // 6U
const PITCH = 6 // 3U
const CELLW = 4 // 2U

const kb = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`)

export function render(t, ctx) {
  const L = ctx.languages
  const out = []
  const innerW = W - PAD * 2

  out.push(panel(t, { ...BOX, title: "Language signal", meta: `${L.repoCount} repos · ${kb(L.totalBytes)}` }))
  out.push(label("SOURCE BYTES ACROSS SELECTED WORK", { x: PAD, y: 40, tracking: 1, fill: t.ink }))

  // The ramp is four designed steps plus a neutral tail, rather than one blue
  // at falling opacity — opacity that reads on #0D1117 disappears on white.
  const ramp = [t.dataHigh, t.dataMid, t.dataLow, t.dataLow, t.dataEmpty, t.dataEmpty]
  const fade = [1, 1, 1, 0.6, 1, 0.7]

  // ---- share bar ---------------------------------------------------------
  // One slot is left blank between languages; without it the steps read as a
  // single ribbon rather than as ranked segments.
  const slots = Math.floor((innerW + (PITCH - CELLW)) / PITCH)
  const cells = slots - L.top.length
  const counts = L.top.map((l) => Math.max(1, Math.round((l.pct / 100) * cells)))
  const spent = counts.reduce((a, b) => a + b, 0)
  if (spent > cells) counts[0] -= spent - cells
  const tail = Math.max(0, cells - counts.reduce((a, b) => a + b, 0))

  const at = (i) => `<rect x="${PAD + i * PITCH}" y="${BAR.y}" width="${CELLW}" height="${BAR.h}"/>`
  let cursor = 0
  counts.forEach((count, i) => {
    const g = []
    for (let k = 0; k < count; k++, cursor++) g.push(at(cursor))
    if (g.length) out.push(`<g fill="${ramp[i] ?? t.dataEmpty}" opacity="${fade[i] ?? 1}">${g.join("")}</g>`)
    cursor++
  })
  if (tail > 0) {
    const g = []
    for (let k = 0; k < tail; k++, cursor++) g.push(at(cursor))
    out.push(`<g fill="${t.dataEmpty}">${g.join("")}</g>`)
  }

  // ---- legend ------------------------------------------------------------
  const colW = innerW / 2
  L.top.forEach((l, i) => {
    const x = PAD + Math.floor(i / 3) * colW
    const y = 84 + (i % 3) * S.md

    out.push(rect(x, y - 7, 8, 8, ramp[i] ?? t.dataEmpty, fade[i] < 1 ? `opacity="${fade[i]}"` : ""))
    out.push(body(l.name, { x: x + S.sm, y, fill: t.ink }))
    out.push(body(`${l.pct.toFixed(1)}%`, { x: x + colW - 104, y, fill: t.ink, anchor: "end" }))
    out.push(body(kb(l.bytes), { x: x + colW - S.md, y, fill: t.inkFaint, anchor: "end" }))
  })

  // ---- method ------------------------------------------------------------
  out.push(rect(PAD, 144, innerW, 1, t.lineSoft))
  out.push(
    body(`Measured across ${L.repoCount} selected repositories. Built and vendored output excluded.`, {
      x: PAD, y: 160, fill: t.inkFaint,
    })
  )

  return {
    w: W, h: H, body: out.join(""),
    title: `Language signal — ${L.top.map((l) => `${l.name} ${l.pct.toFixed(1)}%`).join(", ")}`,
  }
}

export const build = (t, ctx, cfg) => {
  const r = render(t, ctx, cfg)
  return svgDoc({ w: r.w, h: r.h, theme: t, body: r.body, title: r.title })
}






