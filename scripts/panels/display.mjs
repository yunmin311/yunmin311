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
 */

import { rect, svgDoc, text, W_FULL, W_MOBILE, SHADOW, S } from "../lib/design.mjs"
import { styles, enabled, stream } from "../lib/motion.mjs"
import { adv } from "../lib/type.mjs"

export const id = "display"
export const responsive = true

const SIZES = [33, 44, 55]

/** Largest legal display size whose line still fits the width. */
function fitSize(str, width) {
  for (const s of [...SIZES].reverse()) if (str.length * adv(s) <= width) return s
  return SIZES[0]
}

export function render(t, ctx, cfg, { mobile = false } = {}) {
  const W = mobile ? W_MOBILE : W_FULL
  const spec = cfg.display ?? { text: "PIXEL", treatment: "hollow" }
  const str = String(spec.text).toUpperCase()
  const size = fitSize(str, W - S.md * 2)
  const w = str.length * adv(size)
  const x = Math.round((W - w) / 2)
  const capH = Math.round(size * 0.727)
  const baseline = S.md + capH
  const H = baseline + S.md
  const animate = enabled(cfg, "display")
  const out = []
  const css = []

  const ink = spec.colour === "accent" ? t.accent : t.ink

  if (spec.treatment === "shadow") {
    out.push(text(str, { x: x + SHADOW, y: baseline + SHADOW, size, fill: t.shadow }))
    out.push(text(str, { x, y: baseline, size, fill: ink }))
  } else if (spec.treatment === "solid") {
    out.push(text(str, { x, y: baseline, size, fill: ink }))
  } else {
    // Hollow. `paint-order` puts the stroke under the fill so a 1px outline
    // stays 1px instead of eating half its width into the glyph.
    out.push(
      `<text x="${x}" y="${baseline}" font-size="${size}" fill="none" stroke="${ink}" stroke-width="1"` +
        ` paint-order="stroke" shape-rendering="crispEdges">${str}</text>`
    )
  }

  // A highlight crossing the word, the same sweep the language bar uses.
  if (animate && spec.sweep !== false) {
    out.push(
      `<g class="dsw"><rect x="${x}" y="${baseline - capH}" width="${Math.max(4, size / 6)}" height="${capH}" fill="${t.accent}"/></g>`
    )
    css.push(stream("dsw", { distance: w - size / 6, period: 5200 }))
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
