/**
 * 04a — CODING RHYTHM.
 *
 * Segmented meters rather than solid bars: every column shows its full scale in
 * an empty colour and fills upward, the way a level meter on a piece of
 * hardware does. Unused capacity is information too.
 *
 * SOURCE AND WINDOW. Built from the public events feed. GitHub stripped
 * `commits` out of PushEvent payloads — which is what broke the usual metrics
 * plugins — but the timestamps survived, and timestamps are all a rhythm chart
 * ever needed.
 *
 * The window is therefore not ours to choose. The events API retains roughly
 * the last 300 events or 90 days, whichever runs out first, so the real span is
 * whatever came back — for an active account that is a few weeks, not a
 * quarter. An earlier config carried `rhythm.days: 90`, which nothing read and
 * which implied a guarantee the API does not make. The panel now reports the
 * window it actually observed, and says "observed" on the face of it.
 *
 * Only aggregate distributions are drawn. No repository is named, so a push to
 * a private repository contributes a timestamp and nothing else.
 */

import { rect, panel, readout, svgDoc, label, labelWidth, W_FULL, W_MOBILE, S } from "../lib/design.mjs"
import { styles, grow, enabled, STAGGER, DUR } from "../lib/motion.mjs"

export const id = "rhythm"
export const responsive = true

const CELL = 4 // 2U
const GAP = 2 // 1U
const CELLS = 10

const DESKTOP = {
  w: W_FULL, h: 176, svgH: 192,
  hours: { x: S.sm, bar: 16, pitch: 20, label: 40, bottom: 108, ruler: 120 },
  days: { x: 548, bar: 26, pitch: 36, label: 40, bottom: 108, ruler: 120 },
  rule: 138, rows: [160], cols: 4,
  facts: ["PEAK WINDOW", "BUSIEST DAY", "NIGHT SHIFT", "LONGEST RUN"],
  ticks: [0, 6, 12, 18, 23],
}

const MOBILE = {
  w: W_MOBILE, h: 296, svgH: 312,
  hours: { x: S.sm, bar: 10, pitch: 12, label: 40, bottom: 108, ruler: 120 },
  days: { x: S.sm, bar: 36, pitch: 44, label: 148, bottom: 216, ruler: 228 },
  rule: 246, rows: [268, 292], cols: 2,
  facts: ["PEAK", "BUSIEST", "NIGHT", "STREAK"],
  ticks: [0, 6, 12, 18],
}

const NAMES = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]

/** One segmented column. Lit cells go in their own group so they can animate. */
function meter(buckets, { x, bottom, w, v, max, hot, cls }) {
  const filled = max > 0 ? Math.round((v / max) * CELLS) : 0
  const off = []
  const lit = []
  for (let i = 0; i < CELLS; i++) {
    const y = bottom - (i + 1) * (CELL + GAP) + GAP
    ;(i < filled ? lit : off).push(`<rect x="${x}" y="${y}" width="${w}" height="${CELL}"/>`)
  }
  if (off.length) buckets.off.push(off.join(""))
  if (lit.length) buckets[hot ? "hot" : "on"].push(cls ? `<g class="${cls}">${lit.join("")}</g>` : lit.join(""))
}

const flush = (t, b) =>
  [["off", t.dataEmpty], ["on", t.dataMid], ["hot", t.dataHigh]]
    .filter(([k]) => b[k].length)
    .map(([k, fill]) => `<g fill="${fill}">${b[k].join("")}</g>`)
    .join("")

export function render(t, ctx, cfg, { mobile = false } = {}) {
  const L = mobile ? MOBILE : DESKTOP
  const W = L.w
  const r = ctx.rhythm
  const c = ctx.contributions
  const out = []
  const css = []
  const buckets = { off: [], on: [], hot: [] }
  const animate = enabled(cfg, "rhythm")

  out.push(
    panel(t, {
      x: 0, y: S.xs, w: W, h: L.h,
      title: "Coding rhythm",
      meta: `${r.total} events · ${r.spanDays} days observed`,
    })
  )

  // ---- hours -------------------------------------------------------------
  out.push(label("ACTIVE HOURS", { x: L.hours.x, y: L.hours.label, tracking: 1, fill: t.ink }))
  out.push(
    label(r.offsetLabel, {
      x: L.hours.x + labelWidth("ACTIVE HOURS", 1) + S.sm,
      y: L.hours.label, tracking: 1, fill: t.inkFaint,
    })
  )

  const hMax = Math.max(...r.hours, 1)
  r.hours.forEach((v, i) => {
    meter(buckets, {
      x: L.hours.x + i * L.hours.pitch, bottom: L.hours.bottom, w: L.hours.bar,
      v, max: hMax, hot: i === r.peakHour, cls: animate ? `h${i}` : null,
    })
    if (animate) css.push(grow(`h${i}`, { delay: i * STAGGER.cell, dur: DUR.normal }))
  })
  out.push(rect(L.hours.x, L.hours.bottom, 24 * L.hours.pitch - (L.hours.pitch - L.hours.bar), 1, t.line))
  for (const h of L.ticks) {
    out.push(label(String(h).padStart(2, "0"), { x: L.hours.x + h * L.hours.pitch, y: L.hours.ruler, tracking: 1, fill: t.inkFaint }))
  }

  // ---- weekdays ----------------------------------------------------------
  out.push(label("ACTIVE DAYS", { x: L.days.x, y: L.days.label, tracking: 1, fill: t.ink }))

  const dMax = Math.max(...r.days, 1)
  const peakDay = r.days.indexOf(dMax)
  r.days.forEach((v, i) => {
    const x = L.days.x + i * L.days.pitch
    meter(buckets, {
      x, bottom: L.days.bottom, w: L.days.bar,
      v, max: dMax, hot: i === peakDay, cls: animate ? `d${i}` : null,
    })
    if (animate) css.push(grow(`d${i}`, { delay: 200 + i * STAGGER.row, dur: DUR.normal }))
    out.push(
      label(NAMES[i], {
        x: x + Math.round((L.days.bar - labelWidth(NAMES[i], 1)) / 2),
        y: L.days.ruler, tracking: 1,
        fill: i === peakDay ? t.inkDim : t.inkFaint,
      })
    )
  })
  out.push(rect(L.days.x, L.days.bottom, 7 * L.days.pitch - (L.days.pitch - L.days.bar), 1, t.line))
  out.push(flush(t, buckets))

  // ---- readout -----------------------------------------------------------
  out.push(rect(S.sm, L.rule, W - S.sm * 2, 1, t.lineSoft))
  const cw = (W - S.sm * 2) / L.cols
  const values = [r.peakWindow, r.busiestDay, `${r.nightShare}%`, `${c.longestStreak} days`]
  L.facts.forEach((name, i) => {
    out.push(
      readout(t, {
        x: S.sm + (i % L.cols) * cw,
        y: L.rows[Math.floor(i / L.cols)],
        name, val: values[i], accent: i === 0,
      })
    )
  })

  return {
    w: W, h: L.svgH, body: out.join(""),
    css: styles(cfg, "rhythm", css.join("")),
    title: `Coding rhythm over an observed window of ${r.spanDays} days — peak ${r.peakWindow}, busiest ${r.busiestDay}`,
  }
}

export const build = (t, ctx, cfg, v) => {
  const r = render(t, ctx, cfg, v)
  return svgDoc({ w: r.w, h: r.h, theme: t, body: r.body, css: r.css, title: r.title })
}
