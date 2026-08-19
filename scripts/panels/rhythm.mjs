/**
 * 04a — CODING RHYTHM.
 *
 * Segmented meters rather than solid bars: every column shows its full scale in
 * an empty colour and fills upward, the way a level meter on a piece of
 * hardware does. Unused capacity is information too.
 *
 * The source is the public events feed. GitHub stripped `commits` out of
 * PushEvent payloads — which is what broke the usual metrics plugins — but the
 * timestamps survived, and timestamps are all a rhythm chart ever needed. Only
 * aggregate distributions are drawn; no repository is named.
 */

import { rect, panel, readout, svgDoc, label, labelWidth, body, S , W_FULL} from "../lib/design.mjs"

export const id = "rhythm"

const W = W_FULL
const H = 192
const BOX = { x: 0, y: S.xs, w: W, h: 176 }
const PAD = S.sm

const CELL = 4 // 2U
const GAP = 2 // 1U
const CELLS = 10
const METER_BOTTOM = 108

const HOURS = { x: PAD, bar: 16, pitch: 20 }
const DAYS = { x: 548, bar: 26, pitch: 36 }
const NAMES = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]

function meter(buckets, x, w, v, max, hot) {
  const filled = max > 0 ? Math.round((v / max) * CELLS) : 0
  for (let i = 0; i < CELLS; i++) {
    const y = METER_BOTTOM - (i + 1) * (CELL + GAP) + GAP
    buckets[i < filled ? (hot ? "hot" : "on") : "off"].push(`<rect x="${x}" y="${y}" width="${w}" height="${CELL}"/>`)
  }
}

const flush = (t, b) =>
  [["off", t.dataEmpty], ["on", t.dataMid], ["hot", t.dataHigh]]
    .filter(([k]) => b[k].length)
    .map(([k, fill]) => `<g fill="${fill}">${b[k].join("")}</g>`)
    .join("")

export function render(t, ctx) {
  const r = ctx.rhythm
  const c = ctx.contributions
  const out = []
  const buckets = { off: [], on: [], hot: [] }

  out.push(panel(t, { ...BOX, title: "Coding rhythm", meta: `${r.total} events · ${r.spanDays} days` }))

  // ---- hours -------------------------------------------------------------
  out.push(label("ACTIVE HOURS", { x: HOURS.x, y: 40, tracking: 1, fill: t.ink }))
  out.push(label(r.offsetLabel, { x: HOURS.x + labelWidth("ACTIVE HOURS", 1) + S.sm, y: 40, tracking: 1, fill: t.inkFaint }))

  const hMax = Math.max(...r.hours, 1)
  r.hours.forEach((v, i) => meter(buckets, HOURS.x + i * HOURS.pitch, HOURS.bar, v, hMax, i === r.peakHour))
  out.push(rect(HOURS.x, METER_BOTTOM, 24 * HOURS.pitch - (HOURS.pitch - HOURS.bar), 1, t.line))
  for (const h of [0, 6, 12, 18, 23]) {
    out.push(label(String(h).padStart(2, "0"), { x: HOURS.x + h * HOURS.pitch, y: 120, tracking: 1, fill: t.inkFaint }))
  }

  // ---- weekdays ----------------------------------------------------------
  out.push(label("ACTIVE DAYS", { x: DAYS.x, y: 40, tracking: 1, fill: t.ink }))

  const dMax = Math.max(...r.days, 1)
  const peakDay = r.days.indexOf(dMax)
  r.days.forEach((v, i) => {
    const x = DAYS.x + i * DAYS.pitch
    meter(buckets, x, DAYS.bar, v, dMax, i === peakDay)
    out.push(label(NAMES[i], { x: x + Math.round((DAYS.bar - labelWidth(NAMES[i], 1)) / 2), y: 120, tracking: 1, fill: i === peakDay ? t.inkDim : t.inkFaint }))
  })
  out.push(rect(DAYS.x, METER_BOTTOM, 7 * DAYS.pitch - (DAYS.pitch - DAYS.bar), 1, t.line))
  out.push(flush(t, buckets))

  // ---- readout -----------------------------------------------------------
  out.push(rect(PAD, 138, W - PAD * 2, 1, t.lineSoft))
  const cw = (W - PAD * 2) / 4
  const facts = [
    ["PEAK WINDOW", r.peakWindow, true],
    ["BUSIEST DAY", r.busiestDay, false],
    ["NIGHT SHIFT", `${r.nightShare}%`, false],
    ["LONGEST RUN", `${c.longestStreak} days`, false],
  ]
  facts.forEach(([name, v, hot], i) => {
    out.push(readout(t, { x: PAD + i * cw, y: 160, w: cw - S.md, name, val: v, accent: hot }))
  })

  return { w: W, h: H, body: out.join(""), title: `Coding rhythm — peak ${r.peakWindow}, busiest ${r.busiestDay}` }
}

export const build = (t, ctx, cfg) => {
  const r = render(t, ctx, cfg)
  return svgDoc({ w: r.w, h: r.h, theme: t, body: r.body, title: r.title })
}







