/**
 * HERO — three sentences typed out.
 *
 * This is the one place the personality budget is spent, so it is the only
 * place 22px type appears. Its canvas is 831px rather than the 824 the panels
 * use, because the longest line is 59 glyphs at a 14px advance — 826px — and
 * 831 is exactly the width of GitHub's profile README column.
 *
 * On a phone that line cannot fit at any size that keeps the face crisp, so the
 * mobile variant drops to 11px and wraps each sentence over two lines. The
 * typewriter still runs: a sentence's typing time is split between its lines in
 * proportion to their length, and the second line only starts once the first
 * has finished, which is what reading looks like.
 *
 * The mechanism needs no clipping. A page-coloured cover sits over the finished
 * line and slides right in `steps(n)`, one glyph per step, with the caret
 * welded to its leading edge so it tracks the reveal for free. Erasing is the
 * same motion played backwards. Because the face is monospaced on an 11-pixel
 * em, one step is a whole number of pixels at both sizes.
 */

import { rect, svgDoc, value, body, W_MOBILE, U, S } from "../lib/design.mjs"
import { styles, blink, enabled } from "../lib/motion.mjs"
import { adv, cap, BIG, MICRO } from "../lib/type.mjs"

export const id = "hero"
export const responsive = true

const DESKTOP = { w: 831, h: 56, size: BIG, baselines: [34], perSentence: 1 }
const MOBILE = { w: W_MOBILE, h: 64, size: MICRO, baselines: [26, 44], perSentence: 2 }

const CYCLE = 24 // seconds for the full three-line loop
const TYPE = 14.17 // % of cycle spent typing a sentence
const HOLD = 13.33 // % the finished sentence rests
const ERASE = 5.83 // % spent erasing

/** Split a sentence into `n` roughly balanced lines, breaking on spaces. */
function split(text, n, maxChars) {
  if (n === 1) return [text]
  const words = text.split(" ")
  const target = Math.ceil(text.length / n)
  const out = []
  let line = ""
  for (const w of words) {
    const next = line ? `${line} ${w}` : w
    if (out.length < n - 1 && next.length > Math.min(target, maxChars) && line) {
      out.push(line)
      line = w
    } else {
      line = next
    }
  }
  out.push(line)
  return out
}

export function render(t, _ctx, cfg, { mobile = false } = {}) {
  const L = mobile ? MOBILE : DESKTOP
  const W = L.w
  const STEP = adv(L.size)
  const CAP = cap(L.size)
  const maxChars = Math.floor((W - S.sm) / STEP)
  const out = []
  const css = []
  const animate = enabled(cfg, "hero")

  const draw = L.size === BIG ? value : body

  cfg.hero.lines.forEach((sentence, si) => {
    const parts = split(sentence, L.perSentence, maxChars)
    const chars = parts.reduce((a, p) => a + p.length, 0)
    const slot = (100 / cfg.hero.lines.length) * si
    let consumed = 0

    const segs = parts.map((part, pi) => {
      const w = part.length * STEP
      const x0 = Math.round((W - w) / 2 / U) * U
      const y = L.baselines[pi] ?? L.baselines[0]
      // This line's share of the sentence's typing and erasing time.
      const share = part.length / chars
      const typeStart = slot + TYPE * consumed
      const typeSpan = TYPE * share
      // Erasing runs backwards: the LAST line clears first.
      const eraseFrom = slot + TYPE + HOLD
      const eraseStart = eraseFrom + ERASE * (1 - consumed - share)
      consumed += share
      return { part, w, x0, y, pi, typeStart, typeSpan, eraseStart, eraseSpan: ERASE * share }
    })

    const inner = segs
      .map((s) => {
        const cls = `c${si}_${s.pi}`
        if (animate) {
          const p = (v) => Math.round(v * 100) / 100
          css.push(
            `@keyframes ${cls}-k{0%{transform:translateX(0)}` +
              `${p(s.typeStart)}%{transform:translateX(0);animation-timing-function:steps(${s.part.length})}` +
              `${p(s.typeStart + s.typeSpan)}%{transform:translateX(${s.w}px)}` +
              `${p(s.eraseStart)}%{transform:translateX(${s.w}px);animation-timing-function:steps(${s.part.length})}` +
              `${p(s.eraseStart + s.eraseSpan)}%{transform:translateX(0)}100%{transform:translateX(0)}}`,
            `.${cls}{animation:${cls}-k ${CYCLE}s linear infinite}`
          )
        }
        // The cover's RESTING position is fully to the right — text revealed.
        // The keyframes override it while the animation runs, so if the
        // animation never starts the sentence is simply there instead of
        // sitting under an invisible page-coloured rectangle.
        return (
          draw(s.part, { x: s.x0, y: s.y, fill: t.accent }) +
          `<g class="${cls}" style="transform:translateX(${s.w}px)">` +
            rect(s.x0, s.y - CAP - 4, s.w + 40, CAP + 8, t.page) +
            rect(s.x0 + 1, s.y - CAP, U, CAP, t.accent, `class="cr"`) +
          `</g>`
        )
      })
      .join("")

    if (animate) {
      const p = (v) => Math.round(v * 100) / 100
      css.push(
        `@keyframes s${si}-k{0%{opacity:${si === 0 ? 1 : 0}}` +
          (si === 0 ? "" : `${p(slot)}%{opacity:1}`) +
          `${p(slot + TYPE + HOLD + ERASE)}%{opacity:0}100%{opacity:0}}`,
        `.s${si}{animation:s${si}-k ${CYCLE}s step-end infinite}`
      )
      // Sentences after the first rest at zero opacity, so if the animation
      // never runs you get sentence one on its own rather than all three
      // stacked on the same baseline. A running animation overrides an inline
      // style, so this costs the animated case nothing.
      out.push(`<g class="s${si}"${si === 0 ? "" : ` style="opacity:0"`}>${inner}</g>`)
    } else if (si === 0) {
      out.push(inner)
    }
  })

  if (animate) css.push(blink("cr"))

  // A single base line rather than a frame: it gives the type something to sit
  // on without enclosing all that air.
  out.push(rect(0, L.h - 8, W, 1, t.lineSoft))

  return {
    w: W, h: L.h, body: out.join(""),
    css: styles(cfg, "hero", css.join("")),
    title: cfg.hero.lines.join(" "),
  }
}

export const build = (t, ctx, cfg, v) => {
  const r = render(t, ctx, cfg, v)
  return svgDoc({ w: r.w, h: r.h, theme: t, body: r.body, css: r.css, title: r.title })
}
