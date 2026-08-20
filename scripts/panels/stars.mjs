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

import { panel, svgDoc, body, bodyWidth, fit, W_HALF, W_MOBILE, S , SHADOW, listRail} from "../lib/design.mjs"
import { styles, cursor, enabled } from "../lib/motion.mjs"
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

  // Three inks, not five. The repository name carries the section's blue, the
  // description is the one grey, and everything subordinate drops to faint.
  // The earlier version stacked ink, inkDim, inkFaint and accent in a single
  // row, which is why these two panels read as muddy next to the charted ones.
  list.forEach((s, i) => {
    const y = L.top + i * L.pitch
    const [owner, name] = s.name.split("/")
    const when = s.starredAt ? ago(new Date(s.starredAt).getTime()) : ""
    const ownerW = bodyWidth(`${owner}/`)

    out.push(
      body(`${owner}/`, { x: PAD, y, fill: t.inkFaint }) +
        body(fit(name, INNER - ownerW - 40), { x: PAD + ownerW, y, fill: t.titleInk }) +
        body(when, { x: W - PAD, y, fill: t.inkFaint, anchor: "end" }) +
        (s.description ? body(fit(s.description, INNER), { x: PAD, y: y + S.sm, fill: t.inkDim }) : "")
    )
  })

  // A rail rather than an arrow. The lit segment is exactly one row tall and
  // sits exactly where the row sits, so there is no "is it pointing at the
  // right thing" to get wrong, and the unlit track gives the panel the vertical
  // structure the charted panels get from their axes.
  if (list.length) {
    const railTop = L.top - 12
    const rowH = L.pitch - S.xs
    const rail = listRail(t, {
      x: 6,
      top: railTop,
      height: (list.length - 1) * L.pitch + rowH,
      rowHeight: rowH,
    })
    out.splice(1, 0, rail.track)
    if (animate) {
      out.splice(2, 0, `<g class="cur">${rail.segment}</g>`)
      css.push(cursor("cur", { stops: list.map((_, i) => i * L.pitch), period: 6000 }))
    } else {
      out.splice(2, 0, rail.segment)
    }
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




