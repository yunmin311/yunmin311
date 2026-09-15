/**
 * Builds every generated SVG in assets/generated/, one file per theme.
 *
 * One file per LAYOUT, not per theme. Both palettes ship inside every document
 * as custom properties behind a prefers-color-scheme block, which leaves
 * <picture> with a single-condition width query and halves the asset count.
 *
 *   node scripts/build.mjs                    fetch and build everything
 *   node scripts/build.mjs --only=hero,stars  build a subset
 *   node scripts/build.mjs --cache            save the fetched data
 *   node scripts/build.mjs --offline          reuse it, no network
 */

import { readFile, writeFile, mkdir } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

import { THEME } from "./lib/design.mjs"
import { collect } from "./lib/data.mjs"

import * as hero from "./panels/hero.mjs"
import * as rhythm from "./panels/rhythm.mjs"
import * as languages from "./panels/languages.mjs"
import * as stars from "./panels/stars.mjs"
import * as activity from "./panels/activity.mjs"
import * as contributions from "./panels/contributions.mjs"
import * as fortune from "./panels/fortune.mjs"
import * as contact from "./panels/contact.mjs"
import * as sections from "./panels/sections.mjs"
import * as work from "./panels/work.mjs"
import * as about from "./panels/about.mjs"
import * as photoband from "./panels/photoband.mjs"

// Reusable components. Built and shown in docs/COMPONENTS.md, deliberately not
// placed on the profile — they exist so a fork has parts to build with.
import * as display from "./panels/display.mjs"
import * as tiles from "./panels/tiles.mjs"
import * as quote from "./panels/quote.mjs"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const OUT = resolve(ROOT, "assets/generated")
const CACHE = resolve(ROOT, "scripts/.cache.json")

/**
 * HYSTERESIS STATE.
 *
 * SELECTED WORK's ordering has a stability guard (see lib/projects.mjs): a
 * challenger must lead an incumbent for several days before it takes the slot.
 * That guard needs to know what the previous run displayed, and the only
 * durable, inspectable place to keep it is a committed file next to the images
 * it describes — a workflow cache would be invisible and would silently reset.
 *
 * It is written ONLY when the membership actually changes, so a stable page
 * does not produce a pointless commit every six hours. `check.mjs` reads it
 * back and fails the run if it and the images ever disagree.
 */
const STATE = resolve(OUT, "selected-work.json")

const PANELS = [hero, about, rhythm, languages, stars, activity, contributions, fortune, photoband, display, tiles, quote]
const OFFLINE_OK = new Set(["hero"]) // needs no API data

const args = process.argv.slice(2)
const flag = (name) => args.find((a) => a.startsWith(`--${name}`))?.split("=")[1] ?? args.includes(`--${name}`)
const only = typeof flag("only") === "string" ? new Set(flag("only").split(",")) : null

const cfg = JSON.parse(await readFile(resolve(ROOT, "scripts/config.json"), "utf8"))

await mkdir(OUT, { recursive: true })

// Feed the previous membership in before collect() runs, so the ordering rule
// can apply its guard. Absent on a first build, which is the unguarded path.
try {
  const prev = JSON.parse(await readFile(STATE, "utf8"))
  if (Array.isArray(prev?.keys)) cfg.__pinnedProjects = prev.keys
} catch { /* no state yet — first build, or the file was removed on purpose */ }

let ctx
if (flag("offline")) {
  const raw = JSON.parse(await readFile(CACHE, "utf8"))
  ctx = reviveCtx(raw)
  // Stale cache is how a heatmap built from 249 contributions got committed on
  // a day the account actually had 1015. Iterating on layout offline is fine;
  // shipping from it is not.
  const ageH = (Date.now() - raw.now.getTime()) / 36e5
  console.log(`· using cached data (${ageH.toFixed(1)}h old)`)
  if (ageH > 6) console.warn(`! CACHE IS ${ageH.toFixed(0)}h OLD — rebuild without --offline before committing`)
} else {
  console.log("· fetching")
  ctx = await collect(cfg)
  if (flag("cache")) {
    await writeFile(CACHE, JSON.stringify(ctx, replacer, 2))
    console.log(`· cached -> scripts/.cache.json`)
  }
}

/**
 * Desktop and phone are separate FILES, not one file scaled. The README pairs
 * them with <source media="(max-width: 500px)">, because an 824px panel shrunk
 * into a 344px column renders 11px type at 4.6px — which is not small, it is
 * gone. A panel opts in with `export const responsive = true`.
 */
const VARIANTS = [
  { key: "", mobile: false },
  { key: "-m", mobile: true },
]

let written = 0
for (const panel of PANELS) {
  if (only && !only.has(panel.id)) continue
  for (const variant of VARIANTS) {
    if (variant.mobile && !panel.responsive) continue
    const svg = panel.build(THEME, ctx, cfg, variant)
    await writeFile(resolve(OUT, `${panel.id}${variant.key}.svg`), svg, "utf8")
    written++
    if (!variant.mobile) {
      console.log(`  ${panel.id.padEnd(15)} ${String(svg.length).padStart(7)} B  ${describe(panel.id, ctx)}`)
    }
  }
}

// Modules that emit a set of files rather than one, keyed by name.
for (const mod of [sections, work, contact]) {
  if (only && !only.has(mod.id)) continue
  let n = 0
  for (const variant of VARIANTS) {
    if (variant.mobile && !mod.responsive) continue
    for (const f of mod.build(THEME, ctx, cfg, variant)) {
      const base = mod.id === "contact" ? `btn-${f.key}` : f.key
      await writeFile(resolve(OUT, `${base}${variant.key}.svg`), f.svg, "utf8")
      written++
      n++
    }
  }
  console.log(`  ${mod.id.padEnd(15)}          ${n} file(s)`)
}

console.log(`\n${written} file(s) -> assets/generated/`)

/* ---------------------------------------------------- selected work state */

// Written only when the membership changes. A member reordering within the same
// six would otherwise churn the file every run, and the workflow commits the
// whole directory when anything in it moved.
if (ctx?.work?.picked?.length) {
  const keys = ctx.work.picked.map((p) => p.key)
  const next = { keys, slots: cfg.workSlots ?? 6, updated: ctx.now.toISOString() }
  let before = null
  try { before = JSON.parse(await readFile(STATE, "utf8")) } catch {}
  if (!before || JSON.stringify(before.keys) !== JSON.stringify(keys)) {
    await writeFile(STATE, JSON.stringify(next, null, 2) + "\n", "utf8")
    console.log(`  selected-work   keys=${keys.join(",")} (changed)`)
  } else {
    console.log(`  selected-work   keys=${keys.join(",")} (unchanged)`)
  }

  for (const p of ctx.work.picked) {
    const d = p._days == null ? "age unknown" : `${Math.round(p._days)}d ago`
    console.log(`    ${p.tier.padEnd(9)} ${p.key.padEnd(24)} ${d.padEnd(12)} score ${p._score.toFixed(3)}`)
  }
  const st = ctx.work.staleness
  if (st.stale) {
    // The marker is what lets a SCHEDULED run open a failure issue. Every other
    // failure is excluded from that on purpose — an API blip at 05:17 is not
    // worth an email and heals itself. This one does not heal: it means the
    // selection rule has drifted from reality, which is precisely the condition
    // that used to go unnoticed for weeks. A file is used rather than a phrase
    // in the log so the workflow's test cannot be tripped by an unrelated error
    // that happens to contain the same words.
    await writeFile(resolve(ROOT, "stale-selected-work"), `${new Date().toISOString()}\n`, "utf8")
    console.warn(
      `! SELECTED WORK is lagging: best unshown project is ${st.bestOutsideDays}d old vs ` +
        `${st.worstInsideDays}d for the stalest shown one (${st.lagDays}d gap).`
    )
  }

  await rewriteReadmeCards(ctx.work.picked)
}

/**
 * Rewrite the card links between SELECTED_WORK_START/END in README.md.
 *
 * WHY THE README IS EDITABLE AT ALL. GitHub renders a README from committed
 * markup, so introducing a project that has a card image means adding a link
 * for it — there is no globbing of assets. Leaving that block hand-maintained
 * would put the cast back under manual control and re-create the original bug
 * in a new place: the rule would pick new projects and the page would still
 * show the old ones.
 *
 * Each <a> stays on ONE line. Broken across lines, the markdown parser closes
 * the inline context and the side-by-side cards stop flowing together — the
 * note at the top of README.md says so, and it is the reason this is built with
 * string concatenation rather than a template literal that prettier would wrap.
 *
 * The alt and title mirror what the SVG itself carries, so the reader gets the
 * same sentence whether the image loaded or not.
 */
async function rewriteReadmeCards(picked) {
  const path = resolve(ROOT, "README.md")
  const src = await readFile(path, "utf8")
  const START = "<!-- SELECTED_WORK_START"
  const END = "<!-- SELECTED_WORK_END -->"
  const a = src.indexOf(START)
  const b = src.indexOf(END)
  if (a < 0 || b < 0 || b < a) {
    console.warn("! README has no SELECTED_WORK block; cards were not written")
    return
  }

  const lines = picked.map((p) => {
    const alt = `${p.name} — ${p.why.replace(/\s+/g, " ")} ${p.tags.join(", ")}.`
    return (
      `<a href="${p.url}"><picture>` +
      `<source media="(max-width: 500px)" srcset="assets/generated/work-${p.key}-m.svg">` +
      `<img alt="${escapeAttr(alt)}" title="Open ${p.key} on GitHub" ` +
      `src="assets/generated/work-${p.key}.svg"></picture></a>`
    )
  })

  // Keep the START comment's own explanatory text; replace only what follows it.
  const openEnd = src.indexOf("-->", a) + 3
  const next = src.slice(0, openEnd) + "\n" + lines.join("\n") + "\n" + src.slice(b)
  if (next === src) {
    console.log("  readme          SELECTED_WORK block unchanged")
    return
  }
  await writeFile(path, next, "utf8")
  // The README is not under assets/, so the workflow's commit step would miss
  // it. It is committed alongside on purpose: a card that is generated but not
  // linked is a card nobody sees.
  console.log(`  readme          SELECTED_WORK rewritten (${lines.length} cards)`)
}

/** Attribute values are quoted, so only these three can break out. */
const escapeAttr = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")

/* ----------------------------------------------------------------- helpers */

function describe(id, c) {
  if (!c) return ""
  switch (id) {
    case "rhythm": return `${c.rhythm.total} events, peak ${c.rhythm.peakWindow}, ${c.rhythm.busiestDay}`
    case "languages": return c.languages.top.map((l) => `${l.name} ${l.pct.toFixed(0)}%`).join(" · ")
    case "work": return (c.work?.picked ?? []).map((p) => p.key).join(" · ") || "(none)"
    case "stars": return c.stars.map((s) => s.name).join(" · ")
    case "activity": return c.activity.map((a) => `${a.tag} ${a.repo}`).join(" · ") || "(empty)"
    case "contributions": return `${c.contributions.total} contributions, ${c.contributions.activeDays} active days`
    default: return ""
  }
}

function replacer(key, value) {
  return typeof value === "function" ? undefined : value
}

/** The cache loses `contributions.level`, a closure; rebuild it from levels. */
function reviveCtx(raw) {
  const levels = raw.contributions.levels
  raw.now = new Date(raw.now)
  raw.contributions.level = (n) => (n <= 0 ? 0 : n < levels[1] ? 1 : n < levels[2] ? 2 : n < levels[3] ? 3 : 4)
  // `work.picked` carries no closures, but a cache written by an older build
  // has no `work` at all. Falling back to the unguarded selection keeps
  // --offline usable for layout work instead of crashing on a missing key.
  if (!raw.work) raw.work = { picked: [], signal: {}, staleness: { stale: false } }
  return raw
}



