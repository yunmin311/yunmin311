/**
 * PHOTOBAND — a vertical band of photographs at their native aspect ratios.
 *
 * The pixel language is the chrome only: hard offset shadow, stepped frame,
 * viewfinder corner ticks, and a tracked caption. The photograph itself is
 * never cropped, never pixelated, never gradient-filled, and is embedded as a
 * data: URI because an <img>-loaded SVG fetches nothing.
 *
 * Root shape-rendering is crispEdges for the chrome; every <image> overrides
 * it back to auto so the photo stays smooth.
 */

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

import { rect, pixelFrame, label, body, labelWidth, W_FULL, W_MOBILE, SHADOW, S, THEME, svgDoc } from "../lib/design.mjs"
import { fontFace } from "../lib/type.mjs"

export const id = "photoband"
export const responsive = true

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")

/** L-shaped viewfinder ticks at the four photo corners, drawn in ink. */
function ticks(t, ix, iy, iw, ih) {
  const L = 10, T = 2, c = t.ink
  const seg = (x, y) => rect(x, y, L, T, c) + rect(x, y, T, L, c)
  return (
    seg(ix, iy) +
    seg(ix + iw - L, iy) +
    seg(ix, iy + ih - L) +
    seg(ix + iw - L, iy + ih - L)
  )
}

export function render(t, ctx, cfg, { mobile = false } = {}) {
  const W = mobile ? W_MOBILE : W_FULL
  const photos = cfg.photoband?.photos ?? []
  const M = S.md
  const innerW = W - M * 2
  const INSET = mobile ? 6 : 8
  const MAXW = innerW - INSET * 2
  const MAXH = mobile ? 320 : 520

  const items = photos.map((p, i) => ({
    ...p,
    idx: String(i + 1).padStart(2, "0"),
    uri: `data:image/jpeg;base64,${readFileSync(resolve(ROOT, p.file)).toString("base64")}`,
  }))

  const out = []
  let y = S.md

  items.forEach((p) => {
    const scale = Math.min(MAXW / p.w, MAXH / p.h, 1)
    const iw = Math.round((p.w * scale) / 2) * 2
    const ih = Math.round((p.h * scale) / 2) * 2
    const cardW = iw + INSET * 2
    const cardH = ih + INSET * 2
    const x = Math.round((W - cardW) / 2)

    out.push(rect(x + SHADOW, y + SHADOW, cardW, cardH, t.shadow))
    out.push(rect(x, y, cardW, cardH, t.panel))
    out.push(pixelFrame(t, x, y, cardW, cardH, t.line))
    out.push(
      `<image x="${x + INSET}" y="${y + INSET}" width="${iw}" height="${ih}" ` +
      `preserveAspectRatio="xMidYMid meet" shape-rendering="auto" href="${p.uri}"/>`
    )
    out.push(ticks(t, x + INSET, y + INSET, iw, ih))

    const cx0 = x + INSET
    const capTop = y + cardH + S.xs
    out.push(label(p.idx, { x: cx0, y: capTop + 11, tracking: 1, fill: t.ink }))
    out.push(body(p.title, { x: cx0 + labelWidth(p.idx, 1) + S.sm, y: capTop + 11, fill: t.ink }))
    out.push(body(`${p.ratio} · ${p.exp}`, { x: cx0, y: capTop + 11 + S.sm, fill: t.inkFaint }))

    y += cardH + 64
  })

  const H = y + S.md
  return {
    w: W,
    h: H,
    body: out.join(""),
    css: fontFace(),
    title: "Through my lens — a band of frames at their native ratios",
  }
}

export const build = (t, ctx, cfg, v) => {
  const r = render(t, ctx, cfg, v)
  return svgDoc({ w: r.w, h: r.h, theme: t, body: r.body, css: r.css, title: r.title, paintBg: true, bleed: SHADOW })
}
