/**
 * 04b — LANGUAGE SIGNAL.
 *
 * One hue at four designed steps, not a rainbow: the ranking is the
 * information, and six unrelated colours only make it harder to read.
 *
 * WHAT IS COUNTED. Lines added by this author, in commits this author wrote,
 * across exactly the four repositories shown in SELECTED WORK — not bytes on
 * disk. Bytes count vendored files, generated output, and whatever a
 * collaborator or a scaffolding tool contributed; an unqualified language
 * chart on a GitHub profile is usually measuring somebody else's boilerplate.
 * The method and the scope are printed on the panel so the claim can be
 * checked.
 */

import { rect, panel, svgDoc, label, body, W_FULL, W_MOBILE, S , SHADOW, pixelRule} from "../lib/design.mjs"
import { styles, fill, rise, stream, enabled, STAGGER, DUR } from "../lib/motion.mjs"

export const id = "languages"
export const responsive = true

const DESKTOP = {
  w: W_FULL, h: 176, svgH: 192,
  bar: { y: 52, h: 12 }, cols: 2, rowTop: 84, rowPitch: S.md,
  rule: 144, note: 160, amounts: true,
}
const MOBILE = {
  w: W_MOBILE, h: 288, svgH: 304,
  bar: { y: 52, h: 12 }, cols: 1, rowTop: 88, rowPitch: S.md,
  rule: 240, note: 256, amounts: false,
}

const PITCH = 6 // 3U
const CELLW = 4 // 2U

function wrap(text, px) {
  const max = Math.floor(px / 7)
  const out = []
  let line = ""
  for (const w of String(text).split(/\s+/)) {
    const next = line ? `${line} ${w}` : w
    if (next.length > max && line) { out.push(line); line = w } else { line = next }
  }
  if (line) out.push(line)
  return out
}

export function render(t, ctx, cfg, { mobile = false } = {}) {
  const L = mobile ? MOBILE : DESKTOP
  const W = L.w
  const Lang = ctx.languages
  const out = []
  const css = []
  const innerW = W - S.sm * 2
  const animate = enabled(cfg, "languages")

  out.push(
    panel(t, {
      x: 0, y: S.xs, w: W, h: L.h,
      title: "Language signal",
      meta: `${Lang.repoCount} repos · ${Lang.summary}`,
    })
  )
  // The full caption is 35 glyphs — 280px — and the phone column gives 256.
  out.push(label(mobile ? "LINES I WROTE" : Lang.caption, { x: S.sm, y: 40, tracking: 1, fill: t.ink }))

  // Four designed steps plus a neutral tail, rather than one blue at falling
  // opacity — opacity that reads on #0D1117 disappears on white.
  const ramp = [t.data4, t.data3, t.data2, t.data1, t.dataEmpty, t.dataEmpty]

  // ---- share bar ---------------------------------------------------------
  // One slot is left blank between languages; without it the steps read as a
  // single ribbon rather than as ranked segments.
  const slots = Math.floor((innerW + (PITCH - CELLW)) / PITCH)
  const cells = slots - Lang.top.length
  const counts = Lang.top.map((l) => Math.max(1, Math.round((l.pct / 100) * cells)))
  const spent = counts.reduce((a, b) => a + b, 0)
  if (spent > cells) counts[0] -= spent - cells
  const tail = Math.max(0, cells - counts.reduce((a, b) => a + b, 0))

  const at = (i) => `<rect x="${S.sm + i * PITCH}" y="${L.bar.y}" width="${CELLW}" height="${L.bar.h}"/>`
  const segments = []
  let cursor = 0
  counts.forEach((count, i) => {
    const g = []
    for (let k = 0; k < count; k++, cursor++) g.push(at(cursor))
    if (g.length) segments.push(`<g fill="${ramp[i] ?? t.dataEmpty}">${g.join("")}</g>`)
    cursor++
  })
  if (tail > 0) {
    const g = []
    for (let k = 0; k < tail; k++, cursor++) g.push(at(cursor))
    segments.push(`<g fill="${t.dataEmpty}">${g.join("")}</g>`)
  }

  // The bar scales up from its left edge. Scaling the bar rather than sliding a
  // cover over it means a stalled animation leaves the chart visible.
  if (animate) {
    out.push(`<g class="bf">${segments.join("")}</g>`)
    css.push(fill("bf", { dur: DUR.slow, delay: 60 }))
  } else {
    out.push(segments.join(""))
  }

  // A highlight sweeps the bar, the way a value gets read off a readout.
  if (animate) {
    out.push(`<g class="st"><rect x="${S.sm}" y="${L.bar.y}" width="${CELLW}" height="${L.bar.h}" fill="${t.accent}"/></g>`)
    css.push(stream("st", { distance: innerW - CELLW }))
  }

  // ---- legend ------------------------------------------------------------
  const colW = innerW / L.cols
  const perCol = Math.ceil(Lang.top.length / L.cols)
  Lang.top.forEach((l, i) => {
    const x = S.sm + Math.floor(i / perCol) * colW
    const y = L.rowTop + (i % perCol) * L.rowPitch
    if (animate) css.push(rise(`r${i}`, { delay: 120 + i * STAGGER.row, dur: DUR.normal }))

    const row =
      rect(x, y - 7, 8, 8, ramp[i] ?? t.dataEmpty) +
      body(l.name, { x: x + S.sm, y, fill: t.ink }) +
      body(`${l.pct.toFixed(1)}%`, { x: x + colW - (L.amounts ? 104 : S.md), y, fill: t.ink, anchor: "end" }) +
      (L.amounts ? body(l.amount, { x: x + colW - S.md, y, fill: t.inkFaint, anchor: "end" }) : "")
    out.push(animate ? `<g class="r${i}">${row}</g>` : row)
  })

  // ---- method ------------------------------------------------------------
  out.push(pixelRule(S.sm, L.rule, innerW, t.lineSoft))
  // Wrapped at both widths rather than trusting it to fit: the note grows when a
  // repository fails to clone, and the desktop version was being cut mid-word.
  wrap(Lang.note, innerW)
    .slice(0, mobile ? 3 : 2)
    .forEach((l, i) => out.push(body(l, { x: S.sm, y: L.note + i * S.sm, fill: t.inkFaint })))

  return {
    w: W, h: L.svgH, body: out.join(""),
    css: styles(cfg, "languages", css.join("")),
    title: `Language signal — ${Lang.top.map((l) => `${l.name} ${l.pct.toFixed(1)}%`).join(", ")}`,
  }
}

export const build = (t, ctx, cfg, v) => {
  const r = render(t, ctx, cfg, v)
  return svgDoc({ w: r.w, h: r.h, theme: t, body: r.body, css: r.css, title: r.title, bleed: SHADOW })
}






