/**
 * 04a — CODING RHYTHM.
 *
 * Segmented meters rather than solid bars: every column shows its full scale in
 * an empty colour and fills upward, the way a level meter on a piece of
 * hardware does. Unused capacity is information too.
 *
 * SOURCE AND WINDOW. Built from the authored commit history of every public
 * repository in scope — the same `git log` walk that feeds LANGUAGE SIGNAL, so
 * the timestamps cost nothing extra and the two panels cannot describe
 * different windows of the same work.
 *
 * IT USED TO BE THE PUBLIC EVENTS FEED, and that is worth recording because the
 * panel looked broken: that endpoint retains about 300 events or 90 days,
 * whichever runs out first, and only public activity. For this account it
 * returned 98 events spanning FOUR DAYS, so the histogram was drawn from three
 * days of data while the "longest run" readout beside it came from a full year
 * of contributions. The panel was telling the truth twice, about two different
 * windows.
 *
 * WHAT THE WINDOW IS NOW: every commit this author made in a public repository,
 * for the whole history of each. The meta line says how many commits and which
 * month the window opens, because a span of several hundred days next to a
 * small number of active days reads as a gap when it is simply the shape of the
 * work.
 *
 * Its one blind spot is stated rather than hidden: work committed only to a
 * private repository leaves no trace here. The contribution calendar does see
 * it, and that is what the CONTRIBUTIONS panel is for — the calendar has no
 * hour-of-day resolution, so the two panels are not interchangeable.
 *
 * Only aggregate distributions are drawn. No repository is ever named.
 */

import { rect, panel, readout, svgDoc, label, labelWidth, W_FULL, W_MOBILE, S , SHADOW, pixelRule} from "../lib/design.mjs"
import { styles, grow, flicker, enabled, STAGGER, DUR } from "../lib/motion.mjs"

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
  w: W_MOBILE, h: 350, svgH: 366,
  hours: { x: S.sm, bar: 8, pitch: 10, label: 40, bottom: 108, ruler: 120 },
  days: { x: S.sm, bar: 28, pitch: 36, label: 148, bottom: 216, ruler: 228 },
  rule: 246, rows: [266, 286, 306, 326], cols: 1,
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
  if (!lit.length) return
  // Every column's ceiling cell gets its own group. This panel's ambient
  // effect is the flicker a level meter has at the top of its reading — no
  // other module on the page does that, and no other module borrows it.
  const crown = lit.pop()
  const rest = lit.join("")
  const inner =
    (cls && rest ? `<g class="${cls}">${rest}</g>` : rest) +
    (cls ? `<g class="x${cls}">${crown}</g>` : crown)
  buckets[hot ? "hot" : "on"].push(inner)
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
  const out = []
  const css = []
  const buckets = { off: [], on: [], hot: [] }
  const animate = enabled(cfg, "rhythm")

  out.push(
    panel(t, {
      x: 0, y: S.xs, w: W, h: L.h,
      title: "Coding rhythm",
      meta: `${r.total} commits · since ${r.sinceLabel}`,
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
    if (animate) {
      css.push(grow(`h${i}`, { delay: i * STAGGER.cell, dur: DUR.normal }))
      css.push(flicker(`xh${i}`, { delay: (i % 7) * 190, period: 2100 + (i % 5) * 260 }))
    }
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
    if (animate) {
      css.push(grow(`d${i}`, { delay: 200 + i * STAGGER.row, dur: DUR.normal }))
      css.push(flicker(`xd${i}`, { delay: (i % 4) * 260, period: 2400 + (i % 3) * 300 }))
    }
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
  out.push(pixelRule(S.sm, L.rule, W - S.sm * 2, t.lineSoft))
  const cw = (W - S.sm * 2) / L.cols
  // Every one of the four readouts now comes from the commit history the two
  // distributions are drawn from. LONGEST RUN used to be read off the
  // contribution calendar while the other three came from the events feed —
  // two windows on one panel, which is the ambiguity this change removes.
  const values = [r.peakWindow, r.busiestDay, `${r.nightShare}%`, `${r.longestRun} days`]
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
    title: `Coding rhythm over ${r.total} commits since ${r.sinceLabel} — peak ${r.peakWindow}, busiest ${r.busiestDay}`,
  }
}

export const build = (t, ctx, cfg, v) => {
  const r = render(t, ctx, cfg, v)
  return svgDoc({ w: r.w, h: r.h, theme: t, body: r.body, css: r.css, title: r.title, bleed: SHADOW })
}
