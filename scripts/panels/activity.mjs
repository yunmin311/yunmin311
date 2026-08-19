/**
 * 04d — RECENT ACTIVITY.
 *
 * Releases, repositories opened to the public, pull requests, issues. Pushes
 * are excluded deliberately: a stream of "pushed 3 commits" is noise, and it is
 * the noise most profiles mistake for evidence of work.
 */

import { panel, svgDoc, label, body, fit, W_HALF, W_MOBILE, S , SHADOW} from "../lib/design.mjs"
import { styles, rowlight, enabled } from "../lib/motion.mjs"

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

  list.forEach((a, i) => {
    const y = L.top + i * L.pitch


    const row =
      label(a.tag, { x: PAD, y, tracking: 1, fill: t.inkDim }) +
      body(a.ago, { x: W - PAD, y, fill: i === 0 ? t.accent : t.inkFaint, anchor: "end" }) +
      body(fit(a.repo, INNER - 80), { x: PAD, y: y + S.sm, fill: t.ink }) +
      (a.detail ? body(a.detail, { x: W - PAD, y: y + S.sm, fill: t.inkFaint, anchor: "end" }) : "")
    out.push(row)
  })

  // Shared with RECENTLY STARRED — see the note there.
  if (animate && list.length) {
    out.splice(1, 0,
      `<g class="rl"><rect x="${S.xs}" y="${L.top - 14}" width="${W - S.xs * 2}" height="30" fill="${t.accent}"/></g>`
    )
    css.push(rowlight("rl", { stops: list.map((_, i) => i * L.pitch), period: 6000 }))
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




