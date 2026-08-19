/**
 * 04c — RECENTLY STARRED.
 *
 * Three repositories, no counts. A star is only interesting here as a signal of
 * what pulls attention; how many other people starred the same thing says
 * nothing about the person whose profile this is.
 *
 * The panel is one image, so a README cannot give each row its own link. The
 * whole panel is wrapped in a link to the stars tab instead, and the bottom
 * plate says where that goes — one honest way in, rather than three rows that
 * look clickable and are not.
 */

import { panel, svgDoc, body, bodyWidth, fit, W_HALF, W_MOBILE, S , SHADOW} from "../lib/design.mjs"
import { styles, rowlight, enabled } from "../lib/motion.mjs"
import { ago } from "../lib/data.mjs"

export const id = "stars"
export const responsive = true

const DESKTOP = { w: W_HALF, h: 200, svgH: 216, pitch: 56, top: 40 }
const MOBILE = { w: W_MOBILE, h: 200, svgH: 216, pitch: 56, top: 40 }

export function render(t, ctx, cfg, { mobile = false } = {}) {
  const L = mobile ? MOBILE : DESKTOP
  const W = L.w
  const PAD = S.sm
  const INNER = W - PAD * 2
  const list = ctx.stars.slice(0, 3)
  const out = []
  const css = []
  const animate = enabled(cfg, "stars")

  out.push(
    panel(t, { x: 0, y: S.xs, w: W, h: L.h, title: "Recently starred", meta: "all stars →" })
  )

  list.forEach((s, i) => {
    const y = L.top + i * L.pitch
    const [owner, name] = s.name.split("/")
    const when = s.starredAt ? ago(new Date(s.starredAt).getTime()) : ""
    const ownerW = bodyWidth(`${owner}/`)

    const row =
      body(`${owner}/`, { x: PAD, y, fill: t.inkFaint }) +
      body(fit(name, INNER - ownerW - 40), { x: PAD + ownerW, y, fill: t.ink }) +
      body(when, { x: W - PAD, y, fill: i === 0 ? t.accent : t.inkFaint, anchor: "end" }) +
      (s.description ? body(fit(s.description, INNER), { x: PAD, y: y + S.sm, fill: t.inkDim }) : "")
    out.push(row)
  })

  // Shared with RECENT ACTIVITY. The two list panels sit side by side, so they
  // behave the same way: a highlight sliding down and resting on each entry.
  // Two different effects on a matched pair read as two unrelated gadgets.
  if (animate && list.length) {
    out.splice(1, 0,
      `<g class="rl"><rect x="${S.xs}" y="${L.top - 14}" width="${W - S.xs * 2}" height="34" fill="${t.accent}"/></g>`
    )
    css.push(rowlight("rl", { stops: list.map((_, i) => i * L.pitch), period: 6000 }))
  }

  if (!list.length) out.push(body("no recent stars", { x: PAD, y: L.top, fill: t.inkFaint }))

  return {
    w: W, h: L.svgH, body: out.join(""),
    css: styles(cfg, "stars", css.join("")),
    title: `Recently starred — ${list.map((s) => s.name).join(", ")}`,
  }
}

export const build = (t, ctx, cfg, v) => {
  const r = render(t, ctx, cfg, v)
  return svgDoc({ w: r.w, h: r.h, theme: t, body: r.body, css: r.css, title: r.title, bleed: SHADOW })
}




