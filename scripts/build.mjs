/**
 * Builds every generated SVG in assets/generated/, one file per theme.
 *
 * Two files rather than one file with a prefers-color-scheme block: the README
 * pairs them with <picture>/<source media="(prefers-color-scheme: dark)">,
 * which is the only dark-mode path GitHub documents and guarantees.
 *
 *   node scripts/build.mjs                    fetch and build everything
 *   node scripts/build.mjs --only=hero,stars  build a subset
 *   node scripts/build.mjs --cache            save the fetched data
 *   node scripts/build.mjs --offline          reuse it, no network
 */

import { readFile, writeFile, mkdir } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

import { THEMES } from "./lib/design.mjs"
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

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const OUT = resolve(ROOT, "assets/generated")
const CACHE = resolve(ROOT, "scripts/.cache.json")

const PANELS = [hero, rhythm, languages, stars, activity, contributions, fortune]
const OFFLINE_OK = new Set(["hero"]) // needs no API data

const args = process.argv.slice(2)
const flag = (name) => args.find((a) => a.startsWith(`--${name}`))?.split("=")[1] ?? args.includes(`--${name}`)
const only = typeof flag("only") === "string" ? new Set(flag("only").split(",")) : null

const cfg = JSON.parse(await readFile(resolve(ROOT, "scripts/config.json"), "utf8"))

await mkdir(OUT, { recursive: true })

let ctx
if (flag("offline")) {
  const raw = JSON.parse(await readFile(CACHE, "utf8"))
  ctx = reviveCtx(raw)
  console.log("· using cached data")
} else {
  console.log("· fetching")
  ctx = await collect(cfg)
  if (flag("cache")) {
    await writeFile(CACHE, JSON.stringify(ctx, replacer, 2))
    console.log(`· cached -> scripts/.cache.json`)
  }
}

let written = 0
for (const panel of PANELS) {
  if (only && !only.has(panel.id)) continue
  for (const theme of Object.values(THEMES)) {
    const svg = panel.build(theme, ctx, cfg)
    await writeFile(resolve(OUT, `${panel.id}-${theme.name}.svg`), svg, "utf8")
    written++
    if (theme.name === "dark") {
      console.log(`  ${panel.id.padEnd(15)} ${String(svg.length).padStart(7)} B  ${describe(panel.id, ctx)}`)
    }
  }
}

// Modules that emit a set of files rather than one, keyed by name.
for (const mod of [sections, work, contact]) {
  if (only && !only.has(mod.id)) continue
  let n = 0
  for (const theme of Object.values(THEMES)) {
    for (const f of mod.build(theme, ctx, cfg)) {
      const name = mod.id === "contact" ? `btn-${f.key}` : f.key
      await writeFile(resolve(OUT, `${name}-${theme.name}.svg`), f.svg, "utf8")
      written++
      n++
    }
  }
  console.log(`  ${mod.id.padEnd(15)}          ${n / 2} file(s) per theme`)
}

console.log(`\n${written} file(s) -> assets/generated/`)

/* ----------------------------------------------------------------- helpers */

function describe(id, c) {
  if (!c) return ""
  switch (id) {
    case "rhythm": return `${c.rhythm.total} events, peak ${c.rhythm.peakWindow}, ${c.rhythm.busiestDay}`
    case "languages": return c.languages.top.map((l) => `${l.name} ${l.pct.toFixed(0)}%`).join(" · ")
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
  return raw
}

