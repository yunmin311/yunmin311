/**
 * Motion.
 *
 * Every effect here is an ENTRANCE, not a loop. An SVG in a README replays its
 * animation each time the image loads, so a one-shot reveal reads as the page
 * assembling itself, while an infinite loop reads as a widget demanding
 * attention — which is the thing the whole design is trying not to be. The two
 * exceptions are the hero's typewriter and the carets, both of which are the
 * point rather than decoration.
 *
 * Tokens follow the motion-system card on the design shelf: duration 50–600ms,
 * easing cubic-bezier(0.2,0,0,1), stagger 30–50ms, and a whole sequence kept
 * near 500ms. Where a panel has dozens of elements the stagger drops to 6–8ms
 * so the sequence still lands inside that budget.
 *
 * Everything is gated twice: by `motion.<name>` in config.json, so layout
 * decisions stay the author's, and by prefers-reduced-motion at render time.
 *
 * Note for QA: headless browsers commonly default to prefers-reduced-motion:
 * reduce, which silently removes all of this. Confirm the media state before
 * concluding an animation is broken.
 */

export const EASE = "cubic-bezier(0.2,0,0,1)"
export const DUR = { fast: 160, normal: 260, slow: 420 }
export const STAGGER = { row: 40, cell: 8 }

/** Disables every animation in the document for readers who asked for that. */
export const REDUCE = `@media (prefers-reduced-motion:reduce){*{animation:none!important}}`

const on = (cfg, name) => cfg?.motion?.[name] !== false && cfg?.motion?.enabled !== false

/**
 * Wraps a panel's animation CSS so callers never forget the guard, and returns
 * "" when the effect is switched off — the markup then carries the class with
 * no rule behind it, which is inert.
 */
export function styles(cfg, name, css) {
  if (cfg?.motion?.enabled === false) return ""
  const parts = []
  // Ambient chrome is shared by every panel: the corner lamp, the peak
  // indicator, the caret. Entrance CSS is per component on top of it.
  if (cfg?.motion?.ambient !== false) parts.push(lampFor(name), blink("cr"))
  if (on(cfg, name) && css) parts.push(css)
  return parts.length ? `${parts.join("")}${REDUCE}` : ""
}

export const enabled = on

/* --------------------------------------------------------------- recipes */

/**
 * FAIL-SAFE RULE, and it is the important one here.
 *
 * No effect may start from `opacity: 0`. An SVG shown through <img> does not
 * reliably start its animations — browsers throttle or defer them while the
 * image is off-screen, and a screenshot taken during that window catches the
 * element at its `from` state. Testing this page caught exactly that: three
 * panels rendered completely empty because their rows were still at zero
 * opacity, while the meters next to them were fine because they animate a
 * transform.
 *
 * So every recipe animates `transform` only. If the animation never runs, the
 * element sits at its natural size and position — visible. An animation that
 * can hide content is a bug wearing a nice coat.
 */

/** Slide up into place. Never fades, so a stalled animation still shows the row. */
export const rise = (cls, { delay = 0, dur = DUR.normal, dy = 6 } = {}) =>
  `@keyframes ${cls}-k{from{transform:translateY(${dy}px)}to{transform:none}}` +
  `.${cls}{animation:${cls}-k ${dur}ms ${EASE} ${delay}ms both}`

/** Grow from the bottom edge. For meter columns. */
export const grow = (cls, { delay = 0, dur = DUR.normal, origin = "bottom" } = {}) =>
  `@keyframes ${cls}-k{from{transform:scaleY(0)}to{transform:scaleY(1)}}` +
  `.${cls}{transform-origin:center ${origin};transform-box:fill-box;animation:${cls}-k ${dur}ms ${EASE} ${delay}ms both}`

/**
 * Pop in place. For heat cells, where sliding would read as noise.
 * Scales from small rather than fading from nothing, so a stalled animation
 * leaves a full-size cell instead of an empty grid.
 */
export const bloom = (cls, { delay = 0, dur = DUR.fast, from = 0.4 } = {}) =>
  `@keyframes ${cls}-k{from{transform:scale(${from})}to{transform:none}}` +
  `.${cls}{transform-origin:center;transform-box:fill-box;animation:${cls}-k ${dur}ms ${EASE} ${delay}ms both}`

/**
 * Fill from the left edge. Used on the language bar.
 *
 * This scales the bar itself rather than sliding a cover over it. A cover is
 * the prettier effect and the wrong one here: if the animation never runs the
 * cover just sits there, and the chart is gone.
 */
export const fill = (cls, { delay = 0, dur = DUR.slow } = {}) =>
  `@keyframes ${cls}-k{from{transform:scaleX(0)}to{transform:scaleX(1)}}` +
  `.${cls}{transform-origin:left center;transform-box:fill-box;animation:${cls}-k ${dur}ms ${EASE} ${delay}ms both}`

/** Draw a rule out from its left end. */
export const draw = (cls, { delay = 0, dur = DUR.slow } = {}) =>
  `@keyframes ${cls}-k{from{transform:scaleX(0)}to{transform:scaleX(1)}}` +
  `.${cls}{transform-origin:left center;transform-box:fill-box;animation:${cls}-k ${dur}ms ${EASE} ${delay}ms both}`

/** A slow two-pixel nudge. The one loop that is quiet enough to keep. */
export const nudge = (cls, { dur = 2400, dx = 3 } = {}) =>
  `@keyframes ${cls}-k{0%,70%,100%{transform:translateX(0)}82%{transform:translateX(${dx}px)}}` +
  `.${cls}{animation:${cls}-k ${dur}ms ${EASE} infinite}`

export const blink = (cls = "cr", { period = 1060 } = {}) =>
  `@keyframes ${cls}-k{0%,50%{opacity:1}50.01%,100%{opacity:0}}` +
  `.${cls}{animation:${cls}-k ${period}ms step-end infinite}`

/* ------------------------------------------------------------- ambient ---
 *
 * The effects above happen once and stop. These never stop, which is what
 * makes a pixel interface feel powered rather than printed, and they are drawn
 * from the idioms that language already has: a status lamp breathing, a caret
 * blinking, a peak indicator ticking, a value sweeping along a readout.
 *
 * All of them touch chrome only — a corner lamp, a highlight passing over a
 * bar, the single cell that is already marked as the peak. None of them
 * changes what a cell means, because an animation that alters a reading is a
 * lie that moves.
 *
 * They are also fail-safe in the same way: each rests at full opacity or at its
 * natural position, so an animation that never starts costs nothing.
 */

/** Status lamp. Slow, shallow breath — a device that is on, not a notification. */
export const lamp = (cls = "led", { period = 2600, low = 0.28 } = {}) =>
  `@keyframes ${cls}-k{0%,100%{opacity:1}50%{opacity:${low}}}` +
  `.${cls}{animation:${cls}-k ${period}ms ${EASE} infinite}`

/** Peak indicator. A hard on/off tick, the way a level meter marks its ceiling. */
export const tick = (cls = "pk", { period = 1800 } = {}) =>
  `@keyframes ${cls}-k{0%,64%{opacity:1}65%,82%{opacity:0.25}83%,100%{opacity:1}}` +
  `.${cls}{animation:${cls}-k ${period}ms step-end infinite}`

/**
 * A highlight travelling along a bar, like a value being read off it.
 *
 * This turned out to be the one ambient effect that actually reads at a
 * glance, so it is the model for the rest: something crossing the data, rather
 * than a two-pixel lamp breathing in a corner where nobody sees it.
 */
export const stream = (cls, { distance, period = 4200, axis = "X" }) =>
  `@keyframes ${cls}-k{0%{transform:translate${axis}(0);opacity:0}` +
  `6%{opacity:0.9}86%{opacity:0.9}` +
  `100%{transform:translate${axis}(${distance}px);opacity:0}}` +
  `.${cls}{animation:${cls}-k ${period}ms linear infinite}`

/**
 * A scan head crossing a chart. Same idea as `stream`, sized to sweep a whole
 * panel rather than one bar, and held at low opacity so it passes over the data
 * without repainting it.
 */
export const playhead = (cls, { distance, period = 6400, axis = "X", peak = 0.55 }) =>
  `@keyframes ${cls}-k{0%{transform:translate${axis}(0);opacity:0}` +
  `10%{opacity:${peak}}80%{opacity:${peak}}` +
  `100%{transform:translate${axis}(${distance}px);opacity:0}}` +
  `.${cls}{animation:${cls}-k ${period}ms linear infinite}`

/** Marching ants — the selection marquee every early graphical interface had. */
export const ants = (cls, { period = 900, dash = 4 } = {}) =>
  `@keyframes ${cls}-k{to{stroke-dashoffset:${-dash * 2}}}` +
  `.${cls}{stroke-dasharray:${dash} ${dash};animation:${cls}-k ${period}ms linear infinite}`

/**
 * Each module gets its own effect below, not one effect moved around. The
 * point of a pixel interface is that different instruments behave differently:
 * a level meter flickers, a list has a selection cursor, a log scrolls, a
 * readout sweeps, a selectable thing marches.
 */

/** Level-meter flicker for the cell at the top of a column. */
export const flicker = (cls, { delay = 0, period = 2200 } = {}) =>
  `@keyframes ${cls}-k{0%,56%{opacity:1}58%,64%{opacity:0.3}66%,100%{opacity:1}}` +
  `.${cls}{animation:${cls}-k ${period}ms step-end ${delay}ms infinite}`

/** A selection cursor stepping down a list and resting on each row. */
export const cursor = (cls, { stops, period = 5400 }) => {
  const n = stops.length
  const frames = stops
    .map((y, i) => {
      const a = Math.round((i / n) * 10000) / 100
      const b = Math.round(((i + 0.86) / n) * 10000) / 100
      return `${a}%,${b}%{transform:translateY(${y}px)}`
    })
    .join("")
  return `@keyframes ${cls}-k{${frames}100%{transform:translateY(${stops[0]}px)}}` +
    `.${cls}{animation:${cls}-k ${period}ms step-end infinite}`
}

/** A tape of marks crawling down an edge, the way a log advances. */
export const tape = (cls, { step, period = 2600 }) =>
  `@keyframes ${cls}-k{from{transform:translateY(0)}to{transform:translateY(${step}px)}}` +
  `.${cls}{animation:${cls}-k ${period}ms linear infinite}`

/**
 * A row highlight sliding down a list and resting on each entry — the shared
 * behaviour of the two list panels, which sit side by side and were reading as
 * two unrelated gadgets while they each had their own effect.
 *
 * The band is a low-opacity accent block behind the row, so it lights the whole
 * entry rather than pointing at it from the margin.
 */
export const rowlight = (cls, { stops, period = 6000 }) => {
  const n = stops.length
  const frames = stops
    .map((y, i) => {
      const a = Math.round((i / n) * 10000) / 100
      const hold = Math.round(((i + 0.72) / n) * 10000) / 100
      const gone = Math.round(((i + 0.88) / n) * 10000) / 100
      return `${a}%{transform:translateY(${y}px);opacity:0}` +
        `${Math.round((a + 2) * 100) / 100}%{opacity:0.16}` +
        `${hold}%{transform:translateY(${y}px);opacity:0.16}` +
        `${gone}%{transform:translateY(${y}px);opacity:0}`
    })
    .join("")
  return `@keyframes ${cls}-k{${frames}100%{transform:translateY(${stops[0]}px);opacity:0}}` +
    `.${cls}{animation:${cls}-k ${period}ms linear infinite}`
}

/**
 * Pseudo-3D wave for the contribution field.
 *
 * Cells are bucketed by (column + row) % PHASES, so every diagonal shares a
 * phase and the crest travels across the field instead of every cell bobbing
 * in unison. Eight buckets is enough to read as a wave and cheap enough to
 * express as eight keyframe sets rather than one per cell.
 *
 * Translation only, no scale: the cells sit in shared groups, so scaling would
 * move them relative to each other instead of growing each in place.
 */
export const WAVE_PHASES = 8

export const wave = (cls, { phase, amp = 3, period = 2800, phases = WAVE_PHASES }) => {
  const delay = Math.round((phase / phases) * period)
  return `@keyframes ${cls}-k{0%,100%{transform:translateY(0)}50%{transform:translateY(-${amp}px)}}` +
    `.${cls}{animation:${cls}-k ${period}ms ease-in-out ${delay}ms infinite}`
}

/**
 * The same wave, but drawn the way a pixel display would draw it.
 *
 * Two differences from `wave`, and both are the point. The cells change SIZE
 * rather than position, growing and shrinking about their own centres; and the
 * timing is `step-end`, so each cell snaps between a handful of discrete sizes
 * instead of easing between them. A grid that has no sub-pixels cannot ease,
 * and pretending otherwise is what makes an effect look like CSS rather than
 * like a display.
 *
 * AMPLITUDE. The first version ran 0.6x to 1.35x and was genuinely unpleasant
 * to look at — on a field of several hundred cells that is not a wave, it is a
 * strobe. Two things fix it: the range came down to ±8%, which still reads as
 * a surface breathing because the steps are hard rather than smooth; and the
 * caller only applies it to cells that carry data, so the empty majority of the
 * grid stays perfectly still and gives the eye something to rest against.
 *
 * All phases share one keyframe set and differ only by delay, which keeps eight
 * travelling phases at the cost of one animation.
 */
export const pixelWave = ({
  period = 3000,
  phases = WAVE_PHASES,
  // Twelve stops rather than eight, over a shorter period: 200ms a step instead
  // of 450ms. At the slower cadence each hold was long enough to read as a
  // stutter — the eye had time to notice a cell had stopped. Denser stops keep
  // the hard-edged snap and lose the lag.
  steps = [1, 1.05, 1.08, 1.05, 1, 0.95, 0.92, 0.95, 1, 1.03, 1.01, 0.97],
} = {}) => {
  const frames = steps
    .map((s, i) => `${Math.round((i / steps.length) * 10000) / 100}%{transform:scale(${s})}`)
    .join("")
  const rules = Array.from({ length: phases }, (_, p) =>
    `.p${p}{animation:pxw-k ${period}ms step-end ${Math.round((p / phases) * period)}ms infinite}`
  ).join("")
  const selector = Array.from({ length: phases }, (_, p) => `.p${p}`).join(",")
  return `@keyframes pxw-k{${frames}100%{transform:scale(${steps[0]})}}` +
    `${selector}{transform-box:fill-box;transform-origin:center}${rules}`
}

/** A block travelling along a rule. */
export const slide = (cls, { distance, period = 7600 }) =>
  `@keyframes ${cls}-k{0%{transform:translateX(0);opacity:0}` +
  `8%{opacity:1}90%{opacity:1}100%{transform:translateX(${distance}px);opacity:0}}` +
  `.${cls}{animation:${cls}-k ${period}ms linear infinite}`

/** Indicator keys lighting one after another. */
export const keylight = (cls, { index, count, period = 4400 }) => {
  const on = Math.round((index / count) * 10000) / 100
  const off = Math.round(((index + 0.7) / count) * 10000) / 100
  return `@keyframes ${cls}-k{0%,${on}%{opacity:0.25}${on + 0.01}%,${off}%{opacity:1}${off + 0.01}%,100%{opacity:0.25}}` +
    `.${cls}{animation:${cls}-k ${period}ms step-end infinite}`
}

/**
 * The corner lamp runs at a different rate in every panel, derived from the
 * panel's own name. A rack of instruments does not blink in unison.
 */
export const lampFor = (name) => {
  let h = 0
  for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) % 997
  return lamp("led", { period: 2100 + (h % 9) * 170 })
}

