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
  if (!on(cfg, name)) return ""
  return `${css}${REDUCE}`
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
