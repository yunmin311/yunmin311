/**
 * 05 — CONTRIBUTION FIELD.
 *
 * The calendar redrawn as a dot matrix that grows into blocks: a quiet day is a
 * 2px dot, a peak day fills its cell. On a year that is genuinely sparse this
 * reads as graph paper with a bloom in it, which is honest — a grid of grey
 * squares just reads as a broken widget.
 *
 * Cells are 10px on a 4px gutter, and the five marks are 2/4/6/8/10 — every one
 * a multiple of the 2px base unit, so the field sits on the same grid as the
 * meters and the borders.
 */

import { rect, marker, panel, svgDoc, label, body, labelWidth, bodyWidth, U, S , W_FULL} from "../lib/design.mjs"

export const id = "contributions"

const W = W_FULL
const H = 208
const BOX = { x: 0, y: S.xs, w: W, h: 192 }
const CELL = 10 // 5U
const GAP = 4 // 2U
const PITCH = CELL + GAP
const GRID_Y = 48

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
const SIZES = [2, 4, 6, 8, CELL]

const at = (x, y, lv) => {
  const s = SIZES[lv]
  const off = (CELL - s) / 2
  return `<rect x="${x + off}" y="${y + off}" width="${s}" height="${s}"/>`
}
const fillFor = (t, lv) => [t.dataEmpty, t.dataLow, t.dataMid, t.dataMid, t.dataHigh][lv]
const opacityFor = (lv) => (lv === 2 ? 0.6 : 1)

export function render(t, ctx) {
  const c = ctx.contributions
  const out = []
  const gridW = c.weeks.length * PITCH - GAP
  const gridX = 56 // leaves room for the weekday ruler at the 16px margin

  out.push(panel(t, { ...BOX, title: "Contribution field", meta: `${c.totalDays} days` }))

  // ---- rulers ------------------------------------------------------------
  let lastMonth = -1
  c.weeks.forEach((week, i) => {
    const m = new Date(week[0].date + "T00:00:00Z").getUTCMonth()
    if (m === lastMonth || i > c.weeks.length - 3) return
    lastMonth = m
    out.push(label(MONTHS[m], { x: gridX + i * PITCH, y: 40, tracking: 1, fill: t.inkFaint }))
  })
  for (const [row, name] of [[0, "MON"], [2, "WED"], [4, "FRI"]]) {
    out.push(label(name, { x: gridX - S.sm - labelWidth(name, 1), y: GRID_Y + row * PITCH + 9, tracking: 1, fill: t.inkFaint }))
  }

  // ---- field -------------------------------------------------------------
  // Grouped by level so fill is written five times rather than once per day; a
  // year is ~370 cells and the attributes dominate the file.
  const buckets = SIZES.map(() => [])
  c.weeks.forEach((week, i) => {
    week.forEach((day) => {
      const lv = c.level(day.n)
      const row = (day.wd + 6) % 7 // GitHub weeks start Sunday; ours start Monday
      buckets[lv].push(at(gridX + i * PITCH, GRID_Y + row * PITCH, lv))
    })
  })
  buckets.forEach((cells, lv) => {
    if (cells.length) out.push(`<g fill="${fillFor(t, lv)}" opacity="${opacityFor(lv)}">${cells.join("")}</g>`)
  })

  // ---- legend and readout, one line --------------------------------------
  const lineY = 168
  out.push(rect(S.sm, 150, W - S.sm * 2, 1, t.lineSoft))
  out.push(label("LESS", { x: S.sm, y: lineY, tracking: 1, fill: t.inkFaint }))
  const lx = S.sm + labelWidth("LESS", 1) + S.xs
  out.push(SIZES.map((_, i) => `<g fill="${fillFor(t, i)}" opacity="${opacityFor(i)}">${at(lx + i * PITCH, lineY - 9, i)}</g>`).join(""))
  out.push(label("MORE", { x: lx + 4 * PITCH + CELL + S.xs, y: lineY, tracking: 1, fill: t.inkFaint }))

  // Packed from the right using measured widths. Fixed x positions were what
  // ran "ACTIVE DAYS" into its own value in the previous draft.
  const peak = c.peak ? new Date(c.peak.date + "T00:00:00Z") : null
  const month = peak ? MONTHS[peak.getUTCMonth()] : ""
  const facts = [
    ["TOTAL", String(c.total), false],
    ["ACTIVE DAYS", String(c.activeDays), false],
    ["PEAK", peak ? `${c.max} on ${month[0]}${month.slice(1).toLowerCase()} ${peak.getUTCDate()}` : "—", true],
  ]
  let right = W - S.sm
  for (const [name, v, hot] of [...facts].reverse()) {
    const vw = bodyWidth(v)
    const lw = labelWidth(name, 1)
    const x = right - (lw + S.sm + vw)
    out.push(label(name, { x, y: lineY, tracking: 1, fill: t.inkDim }))
    out.push(body(v, { x: right, y: lineY, fill: hot ? t.accent : t.ink, anchor: "end" }))
    right = x - S.lg
  }

  return {
    w: W, h: H, body: out.join(""),
    title: `${c.total} contributions over ${c.totalDays} days, ${c.activeDays} active`,
  }
}

export const build = (t, ctx, cfg) => {
  const r = render(t, ctx, cfg)
  return svgDoc({ w: r.w, h: r.h, theme: t, body: r.body, title: r.title })
}







