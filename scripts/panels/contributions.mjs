/**
 * 05 — CONTRIBUTION FIELD.
 *
 * Cells are FILLED, not sized. The first draft drew each level as a growing
 * dot — 2px for a quiet day, a full cell for a peak — which looked precise and
 * read as "there is no data here", because on a year with 20 active days out of
 * 368 almost every mark was a 2px dot. A filled ramp says the true thing
 * instead: sparse for most of the year, dense and hot for the last five weeks.
 *
 * Thresholds are the quartiles of the days that ACTUALLY have activity, not
 * fractions of the maximum. One 50-commit day would otherwise push every other
 * day into the lowest band and waste three quarters of the ramp.
 */

import { rect, panel, svgDoc, label, body, labelWidth, bodyWidth, W_FULL, W_MOBILE, S , SHADOW} from "../lib/design.mjs"
import { styles, bloom, playhead, enabled, STAGGER, DUR } from "../lib/motion.mjs"

export const id = "contributions"
export const responsive = true

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]

const DESKTOP = { w: W_FULL, cell: 12, gap: 2, weeks: 53, gridX: 56, h: 192, svgH: 208, lineY: 168 }
const MOBILE = { w: W_MOBILE, cell: 8, gap: 2, weeks: 22, gridX: 40, h: 200, svgH: 216, lineY: 176 }

const ramp = (t) => [t.dataEmpty, t.data1, t.data2, t.data3, t.data4]

export function render(t, ctx, cfg, { mobile = false } = {}) {
  const L = mobile ? MOBILE : DESKTOP
  const c = ctx.contributions
  const W = L.w
  const PITCH = L.cell + L.gap
  const GRID_Y = 48
  const out = []
  const css = []
  const colours = ramp(t)
  const animate = enabled(cfg, "contributions")

  const weeks = c.weeks.slice(-L.weeks)
  const shown = weeks.flat()

  out.push(
    panel(t, {
      x: 0, y: S.xs, w: W, h: L.h,
      title: "Contribution field",
      meta: mobile ? `last ${L.weeks} weeks` : `${c.totalDays} days`,
    })
  )

  // ---- rulers ------------------------------------------------------------
  let lastMonth = -1
  weeks.forEach((week, i) => {
    const m = new Date(week[0].date + "T00:00:00Z").getUTCMonth()
    if (m === lastMonth || i > weeks.length - 3) return
    lastMonth = m
    out.push(label(MONTHS[m], { x: L.gridX + i * PITCH, y: 40, tracking: 1, fill: t.inkFaint }))
  })
  for (const [row, name] of [[0, "MON"], [2, "WED"], [4, "FRI"]]) {
    out.push(
      label(name, {
        x: L.gridX - S.xs - labelWidth(name, 1),
        y: GRID_Y + row * PITCH + Math.round(L.cell / 2) + 4,
        tracking: 1,
        fill: t.inkFaint,
      })
    )
  }

  // ---- field -------------------------------------------------------------
  // Grouped by week, then by level inside the week: one group per week is what
  // lets the reveal sweep across the year without a class on every cell.
  // A day with activity fills its whole cell; a day without one is a small
  // centred dot. The graph-paper texture from the first draft survives where it
  // belongs — in the empty half — while every real day reads at full strength.
  const DOT = 4
  weeks.forEach((week, i) => {
    const byLevel = {}
    week.forEach((day) => {
      const row = (day.wd + 6) % 7 // GitHub weeks start Sunday; ours start Monday
      const lv = c.level(day.n)
      const size = lv === 0 ? DOT : L.cell
      const off = (L.cell - size) / 2
      ;(byLevel[lv] ||= []).push(
        `<rect x="${L.gridX + i * PITCH + off}" y="${GRID_Y + row * PITCH + off}" width="${size}" height="${size}"/>`
      )
    })
    const inner = Object.entries(byLevel)
      .map(([lv, cells]) => `<g fill="${colours[lv]}">${cells.join("")}</g>`)
      .join("")
    out.push(animate ? `<g class="w${i}">${inner}</g>` : inner)
    if (animate) css.push(bloom(`w${i}`, { delay: i * STAGGER.cell, dur: DUR.fast }))
  })

  if (animate) {
    const span = weeks.length * PITCH - L.gap
    const tall = 7 * PITCH - L.gap
    out.push(`<g class="ph"><rect x="${L.gridX}" y="${GRID_Y}" width="2" height="${tall}" fill="${t.accent}"/></g>`)
    css.push(playhead("ph", { distance: span - 2, period: 9000 }))
  }

  // ---- legend and readout ------------------------------------------------
  const lineY = L.lineY
  out.push(rect(S.sm, lineY - 20, W - S.sm * 2, 1, t.lineSoft))
  out.push(label("LESS", { x: S.sm, y: lineY, tracking: 1, fill: t.inkFaint }))
  const lx = S.sm + labelWidth("LESS", 1) + S.xs
  const sw = 10
  out.push(
    colours
      .map((fill, i) => `<rect x="${lx + i * (sw + 2)}" y="${lineY - sw + 1}" width="${sw}" height="${sw}" fill="${fill}"/>`)
      .join("")
  )
  out.push(label("MORE", { x: lx + 5 * (sw + 2) + 4, y: lineY, tracking: 1, fill: t.inkFaint }))

  const peak = c.peak ? new Date(c.peak.date + "T00:00:00Z") : null
  const month = peak ? MONTHS[peak.getUTCMonth()] : ""
  const facts = mobile
    ? [
        ["TOTAL", String(shown.reduce((a, d) => a + d.n, 0)), false],
        ["ACTIVE", String(shown.filter((d) => d.n > 0).length), true],
      ]
    : [
        ["TOTAL", String(c.total), false],
        ["ACTIVE DAYS", String(c.activeDays), false],
        ["PEAK", peak ? `${c.max} on ${month[0]}${month.slice(1).toLowerCase()} ${peak.getUTCDate()}` : "—", true],
      ]

  let right = W - S.sm
  for (const [name, v, hot] of [...facts].reverse()) {
    const x = right - (labelWidth(name, 1) + S.sm + bodyWidth(v))
    out.push(label(name, { x, y: lineY, tracking: 1, fill: t.inkDim }))
    out.push(body(v, { x: right, y: lineY, fill: hot ? t.accent : t.ink, anchor: "end" }))
    right = x - S.lg
  }

  return {
    w: W,
    h: L.svgH,
    body: out.join(""),
    css: styles(cfg, "contributions", css.join("")),
    title: `${c.total} contributions over ${c.totalDays} days, ${c.activeDays} of them active, peak ${c.max}`,
  }
}

export const build = (t, ctx, cfg, v) => {
  const r = render(t, ctx, cfg, v)
  return svgDoc({ w: r.w, h: r.h, theme: t, body: r.body, css: r.css, title: r.title, bleed: SHADOW })
}



