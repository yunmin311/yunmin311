/**
 * 04d — RECENT ACTIVITY.
 *
 * Releases, repositories opened to the public, pull requests, issues. Pushes
 * are excluded deliberately: a stream of "pushed 3 commits" is noise, and it is
 * the noise most profiles mistake for evidence of work.
 */

import { panel, svgDoc, label, body, fit, W_HALF, W_MOBILE, S , SHADOW, listRail} from "../lib/design.mjs"
import { styles, cursor, enabled } from "../lib/motion.mjs"

export const id = "activity"
export const responsive = true

const DESKTOP = { w: W_HALF, h: 200, svgH: 216, pitch: 40, top: 40, limit: 4 }
const MOBILE = { w: W_MOBILE, h: 200, svgH: 216, pitch: 40, top: 40, limit: 4 }

export function render(t, ctx, cfg, { mobile = false } = {}) {
  const L = mobile ? MOBILE : DESKTOP
  const W = L.w
  const PAD = S.sm
  const INNER = W - PAD * 2
  const list = ctx.activity.slice(0, L.limit)
  const out = []
  const css = []
  const animate = enabled(cfg, "activity")

  out.push(
    panel(t, { x: 0, y: S.xs, w: W, h: L.h, title: "Recent activity", meta: `last ${cfg.activity.days} days` })
  )

  // Same three inks as RECENTLY STARRED, so the pair reads as one instrument:
  // the repository name in blue, the verb dim, everything else faint.
  list.forEach((a, i) => {
    const y = L.top + i * L.pitch
    out.push(
      label(a.tag, { x: PAD, y, tracking: 1, fill: t.inkDim }) +
        body(a.ago, { x: W - PAD, y, fill: t.inkFaint, anchor: "end" }) +
        body(fit(a.repo, INNER - 80), { x: PAD, y: y + S.sm, fill: t.titleInk }) +
        (a.detail ? body(a.detail, { x: W - PAD, y: y + S.sm, fill: t.inkFaint, anchor: "end" }) : "")
    )
  })

  // See RECENTLY STARRED: a rail, not an arrow — the lit segment is the row.
  if (list.length) {
    const rowH = L.pitch - S.xs
    const rail = listRail(t, {
      x: 6,
      top: L.top - 12,
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

  if (!list.length) out.push(body("nothing worth reporting", { x: PAD, y: L.top, fill: t.inkFaint }))

  return {
    w: W, h: L.svgH, body: out.join(""),
    css: styles(cfg, "activity", css.join("")),
    title: `Recent activity — ${list.map((a) => `${a.tag} ${a.repo}`).join("; ")}`,
  }
}

export const build = (t, ctx, cfg, v) => {
  const r = render(t, ctx, cfg, v)
  return svgDoc({ w: r.w, h: r.h, theme: t, body: r.body, css: r.css, title: r.title, bleed: SHADOW })
}




