/**
 * DISPLAY — oversized pixel headline.
 *
 * Not used on the profile. This is a component for the reusable set: a large
 * word or short phrase set in the same bitmap face as everything else, at a
 * size where the face stops being type and becomes a graphic.
 *
 * Three treatments, all built from the same text:
 *
 *   solid    filled, the plain heavy version
 *   hollow   outline only — the "镂空" one; a stroke on a pixel face traces
 *            every step in the glyph, which is why it reads as pixel art
 *            rather than as an outlined font
 *   shadow   solid with a hard offset copy behind it, matching the panel
 *            shadow used everywhere else
 *
 * SIZE. The face is drawn on an 11-pixel em, so display sizes are 33, 44 and
 * 55 — three, four and five screen pixels per font pixel. Anything between
 * those lands glyph edges on fractions and the whole point is lost.
 *
 * A phrase that will not fit on one line at the smallest legal size is set one
 * word per line instead of being shrunk to a size that is not on the list. A
 * two-line lockup is a normal thing for a wordmark to be; a headline at 27px is
 * just a blurry headline.
 */

import { rect, svgDoc, text, W_FULL, W_MOBILE, SHADOW, S } from "../lib/design.mjs"
import { styles, enabled } from "../lib/motion.mjs"
import { adv } from "../lib/type.mjs"

export const id = "display"
export const responsive = true

const SIZES = [33, 44, 55]

/**
 * Largest legal size at which the phrase fits, and how it has to be broken to
 * get there. One line is preferred; stacking words is the fallback; shrinking
 * below the smallest legal size is not on the table.
 */
function layout(str, width) {
  for (const s of [...SIZES].reverse()) if (str.length * adv(s) <= width) return { lines: [str], size: s }
  const words = str.split(/\s+/).filter(Boolean)
  if (words.length > 1) {
    const longest = Math.max(...words.map((w) => w.length))
    for (const s of [...SIZES].reverse()) if (longest * adv(s) <= width) return { lines: words, size: s }
  }
  return { lines: [str], size: SIZES[0] }
}

export function render(t, ctx, cfg, { mobile = false } = {}) {
  const W = mobile ? W_MOBILE : W_FULL
  const spec = cfg.display ?? { text: "PIXEL PANELS", treatment: "hollow" }
  const str = String(spec.text).toUpperCase()
  const { lines, size } = layout(str, W - S.md * 2)

  // One font-pixel, in screen pixels. Every measurement below is a whole
  // number of these, which is the only reason the scan lands on glyph edges.
  const unit = size / 11
  const capH = Math.round(size * 0.727)
  const lead = Math.round((size * 13) / 11)

  const widths = lines.map((l) => l.length * adv(size))
  const wMax = Math.max(...widths)
  const xs = widths.map((w) => Math.round((W - w) / 2))
  const baselines = lines.map((_, i) => S.md + capH + i * lead)
  const top = baselines[0] - capH
  const blockH = baselines[baselines.length - 1] - top
  const H = baselines[baselines.length - 1] + S.md

  const animate = enabled(cfg, "display")
  const out = []
  const css = []
  const ink = spec.colour === "accent" ? t.accent : t.ink

  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  const set = (attrs) =>
    lines
      .map((l, i) => `<text x="${xs[i]}" y="${baselines[i]}" font-size="${size}" ${attrs}>${esc(l)}</text>`)
      .join("")

  if (spec.treatment === "shadow") {
    lines.forEach((l, i) => out.push(text(l, { x: xs[i] + SHADOW, y: baselines[i] + SHADOW, size, fill: t.shadow })))
    lines.forEach((l, i) => out.push(text(l, { x: xs[i], y: baselines[i], size, fill: ink })))
  } else if (spec.treatment === "solid") {
    lines.forEach((l, i) => out.push(text(l, { x: xs[i], y: baselines[i], size, fill: ink })))
  } else {
    // Hollow. `paint-order` puts the stroke under the fill so a 1px outline
    // stays 1px instead of eating half its width into the glyph.
    out.push(set(`fill="none" stroke="${ink}" stroke-width="1" paint-order="stroke"`))
  }

  /**
   * The scan.
   *
   * The first version was an accent bar sliding across the word on top of it —
   * a rectangle with no relationship to the letterforms it was crossing, which
   * is exactly what it looked like. This one is masked BY the glyphs, so the
   * light only ever exists inside a letter: the word fills in ahead of the
   * head and empties out behind it, the way a character cell display paints.
   *
   * Two details make it read as pixel rather than as CSS. It advances in whole
   * font-pixels (`steps()`, one step per unit of travel), so the leading edge
   * always lands on a glyph edge instead of halfway through one. And the head
   * is three units of solid accent followed by two dimmer trailing columns —
   * a phosphor tail, not a gradient.
   *
   * Mask geometry is declared in `userSpaceOnUse`. The default would resolve
   * the mask region against the bounding box of the element that references
   * it, which is the moving band, and the band would then carry its own mask
   * along with it and never appear to move at all. The animated group is also
   * nested INSIDE the masked one for the same reason: a transform applies to
   * an element's mask as well as to the element.
   */
  if (animate && spec.sweep !== false) {
    const tail = [
      { w: 3, o: 1 },
      { w: 2, o: 0.55 },
      { w: 2, o: 0.25 },
    ]
    const bandW = tail.reduce((a, s) => a + s.w, 0) * unit
    const travel = wMax + bandW
    const steps = Math.round(travel / unit)
    const x0 = Math.round((W - wMax) / 2) - bandW

    // Drawn right to left from the head, so the tail trails behind it.
    let cx = x0 + bandW
    const band = tail
      .map((s) => {
        cx -= s.w * unit
        return rect(cx, top, s.w * unit, blockH + unit, t.accent, `opacity="${s.o}"`)
      })
      .join("")

    out.push(
      `<mask id="dsp" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}">` +
        set(`fill="#fff"`) +
        `</mask>` +
        `<g mask="url(#dsp)"><g class="dsw">${band}</g></g>`
    )
    css.push(
      `@keyframes dsw-k{from{transform:translateX(0)}to{transform:translateX(${travel}px)}}` +
        `.dsw{animation:dsw-k ${spec.sweepPeriod ?? 4600}ms steps(${steps},end) infinite}`
    )
  }

  return {
    w: W, h: H, body: out.join(""),
    css: styles(cfg, "display", css.join("")),
    title: str,
  }
}

export const build = (t, ctx, cfg, v) => {
  const r = render(t, ctx, cfg, v)
  return svgDoc({ w: r.w, h: r.h, theme: t, body: r.body, css: r.css, title: r.title, paintBg: false })
}
