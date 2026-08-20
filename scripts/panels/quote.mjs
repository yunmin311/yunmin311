/**
 * QUOTE — a framed statement.
 *
 * Not used on the profile. A component for the reusable set: one sentence with
 * enough chrome around it to stop being body text, for a manifesto line, a
 * principle, or a pull quote.
 *
 * The blue bar sits INSIDE the frame rather than replacing its left edge. A
 * coloured stripe down the outside of a card is on the anti-AI-taste list for
 * good reason — it is the single most reached-for way to make a block look
 * designed — and keeping the frame intact avoids it while still giving the
 * quote a spine.
 */

import { rect, pixelFrame, pixelRule, svgDoc, body, label, bodyWidth, W_FULL, W_MOBILE, SHADOW, S } from "../lib/design.mjs"
import { styles, enabled, blink } from "../lib/motion.mjs"
import { adv, MICRO } from "../lib/type.mjs"

export const id = "quote"
export const responsive = true

function wrap(str, px) {
  const max = Math.floor(px / adv(MICRO))
  const out = []
  let line = ""
  for (const w of String(str).split(/\s+/)) {
    const next = line ? `${line} ${w}` : w
    if (next.length > max && line) { out.push(line); line = w } else { line = next }
  }
  if (line) out.push(line)
  return out
}

export function render(t, ctx, cfg, { mobile = false } = {}) {
  const W = mobile ? W_MOBILE : W_FULL
  const spec = cfg.quote ?? { text: "", by: "" }
  const animate = enabled(cfg, "quote")
  const PAD = S.md
  const barX = S.sm
  const textX = barX + S.md
  const lines = wrap(spec.text, W - textX - PAD)

  const first = 40
  const lead = S.sm
  const lastY = first + (lines.length - 1) * lead
  const attrY = spec.by ? lastY + S.md : lastY
  const H = attrY + S.md

  const out = [
    rect(SHADOW, SHADOW, W - SHADOW, H - SHADOW, t.shadow),
    rect(0, 0, W - SHADOW, H - SHADOW, t.panel),
    pixelFrame(t, 0, 0, W - SHADOW, H - SHADOW, t.line),
    // The spine: a blocky bar, inside the frame, on the 2px grid.
    pixelRule(barX, first - 12, 2, t.accent, { on: 2, off: 2, thick: 2 }),
  ]

  // Draw the spine as a vertical run of blocks rather than a solid rule.
  out.pop()
  for (let y = first - 12; y < lastY + 4; y += 4) out.push(rect(barX, y, 2, 2, t.accent))

  lines.forEach((l, i) => out.push(body(l, { x: textX, y: first + i * lead, fill: t.ink })))

  if (spec.by) {
    out.push(label(`— ${spec.by}`, { x: textX, y: attrY, tracking: 1, fill: t.inkFaint }))
  }
  if (animate) {
    out.push(rect(textX + bodyWidth(lines[lines.length - 1]) + 4, lastY - 8, 2, 10, t.accent, `class="cr"`))
    // blink() comes free with the ambient layer, so no extra CSS here.
  }

  return {
    w: W, h: H, body: out.join(""),
    css: styles(cfg, "quote", ""),
    title: spec.by ? `${spec.text} — ${spec.by}` : spec.text,
  }
}

export const build = (t, ctx, cfg, v) => {
  const r = render(t, ctx, cfg, v)
  return svgDoc({ w: r.w, h: r.h, theme: t, body: r.body, css: r.css, title: r.title, paintBg: false })
}
