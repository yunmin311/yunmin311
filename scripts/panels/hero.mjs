/**
 * HERO — three sentences typed out, inside a viewfinder crop frame.
 *
 * This is the one place the personality budget is spent, so it is the only
 * place 22px type appears. Its container is the full 880px canvas, which keeps
 * it at 2.5% — well inside the sizing rule that pushed every panel down to 11px.
 *
 * The typewriter needs no clipping: a page-coloured cover sits over the
 * finished line and slides right in `steps(n)`, one glyph per step, with the
 * caret welded to its leading edge so it tracks the reveal for free. Erasing is
 * the same motion played backwards. Because the face is monospaced on an
 * 11-pixel em, one step is exactly 14px at 22px type — the animation lands on
 * whole pixels for its entire run.
 */

import { rect, marker, svgDoc, value, U, S } from "../lib/design.mjs"
import { adv, cap, BIG } from "../lib/type.mjs"

export const id = "hero"

const W = 880
const H = 80
const STEP = adv(BIG) // 14px
const CAP = cap(BIG) // 16px
const BASELINE = 48

// The longest line is 59 glyphs at a 14px advance — 826px — so the frame has to
// clear 853px, not the comfortable margin it would otherwise want.
const FRAME = { l: 12, r: W - 13, t: 12, b: 68, arm: 14 }

const CYCLE = 24 // seconds for the full three-line loop
const TYPE = 14.17 // % of cycle spent typing
const HOLD = 13.33 // % the finished line rests
const ERASE = 5.83 // % spent erasing

/** L-shaped viewfinder mark; `sx`/`sy` point the arms inward. */
function cropMark(t, x, y, sx, sy, accent = false) {
  const a = FRAME.arm
  return (
    rect(sx > 0 ? x : x - a + 1, y, a, 1, t.inkFaint) +
    rect(x, sy > 0 ? y : y - a + 1, 1, a, t.inkFaint) +
    (accent ? marker(t, x + S.tight * sx - (sx < 0 ? U : 0), y + S.tight * sy - (sy < 0 ? U : 0)) : "")
  )
}

export function render(t, _ctx, cfg) {
  const lines = cfg.hero.lines
  const out = []

  // A diagonal pair of crop marks, not four. The longest line is 826px wide so
  // the frame has to be nearly full-bleed, and four corners around that much
  // air read as an empty box rather than as a frame. Two opposite corners are
  // the photographer's convention anyway.
  out.push(cropMark(t, FRAME.l, FRAME.t, 1, 1, true))
  out.push(cropMark(t, FRAME.r, FRAME.b, -1, -1))

  const css = [`.cr{animation:blink 1.06s step-end infinite}@keyframes blink{0%,50%{opacity:1}50.01%,100%{opacity:0}}`]

  lines.forEach((line, i) => {
    const chars = [...line].length
    const w = chars * STEP
    const x0 = Math.round((W - w) / 2 / U) * U
    const slot = (100 / lines.length) * i
    const p = (v) => Math.round((slot + v) * 100) / 100

    out.push(
      `<g class="l${i}">` +
        value(line, { x: x0, y: BASELINE, fill: t.accent }) +
        `<g class="c${i}">` +
          rect(x0, BASELINE - CAP - 6, w + 40, CAP + 12, t.page) +
          rect(x0 + 1, BASELINE - CAP, U, CAP, t.accent, `class="cr"`) +
        `</g>` +
      `</g>`
    )

    css.push(
      `@keyframes t${i}{0%{transform:translateX(0)}` +
        `${p(0)}%{transform:translateX(0);animation-timing-function:steps(${chars})}` +
        `${p(TYPE)}%{transform:translateX(${w}px)}` +
        `${p(TYPE + HOLD)}%{transform:translateX(${w}px);animation-timing-function:steps(${chars})}` +
        `${p(TYPE + HOLD + ERASE)}%{transform:translateX(0)}100%{transform:translateX(0)}}`,
      `@keyframes s${i}{0%{opacity:${i === 0 ? 1 : 0}}` +
        (i === 0 ? "" : `${p(0)}%{opacity:1}`) +
        `${p(TYPE + HOLD + ERASE)}%{opacity:0}100%{opacity:0}}`,
      `.l${i}{animation:s${i} ${CYCLE}s step-end infinite}`,
      `.c${i}{animation:t${i} ${CYCLE}s linear infinite}`
    )
  })

  return { w: W, h: H, body: out.join(""), css: css.join(""), title: lines.join(" ") }
}

export const build = (t, ctx, cfg) => {
  const r = render(t, ctx, cfg)
  return svgDoc({ w: r.w, h: r.h, theme: t, body: r.body, css: r.css, title: r.title })
}
