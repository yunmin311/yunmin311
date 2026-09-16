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
import { collect, languageBytes } from "./lib/sources.mjs"
import { signalState } from "./lib/projects.mjs"
import { cardLinks } from "./lib/readme.mjs"

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
 * LAST-KNOWN-GOOD SELECTED WORK.
 *
 * The membership of SELECTED WORK is the pinned repositories on the GitHub
 * profile, read over the network. This file is what keeps a failed read from
 * emptying the showcase: when the pinned query cannot be completed, the build
 * holds the cards recorded here instead of falling back to any kind of ranking,
 * and says so in the log.
 *
 * That is the ONLY reason it holds the full card payload rather than just the
 * keys. Metadata for a pin usually comes from config.json, but a pin that has
 * no override yet is built from the repository's own description — and on a
 * failed read there is no repository object to rebuild it from. Recording the
 * finished cards is therefore the only way to hold a set that includes pins
 * nobody has written copy for.
 *
 * It is committed rather than cached so it is inspectable, and it is written
 * ONLY when it changes, so a stable page does not produce a commit every six
 * hours.
 */
const STATE = resolve(OUT, "selected-work.json")

const PANELS = [hero, about, rhythm, languages, stars, activity, contributions, fortune, photoband, display, tiles, quote]
const OFFLINE_OK = new Set(["hero"]) // needs no API data

const args = process.argv.slice(2)
const flag = (name) => args.find((a) => a.startsWith(`--${name}`))?.split("=")[1] ?? args.includes(`--${name}`)
const only = typeof flag("only") === "string" ? new Set(flag("only").split(",")) : null

const cfg = JSON.parse(await readFile(resolve(ROOT, "scripts/config.json"), "utf8"))

await mkdir(OUT, { recursive: true })

// Feed the last known-good card set in before collect() runs, so a failed
// pinned read has something real to hold instead of a guess.
try {
  const prev = JSON.parse(await readFile(STATE, "utf8"))
  if (Array.isArray(prev?.cards) && prev.cards.length) cfg.__lastKnownGood = { cards: prev.cards }
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

/**
 * THE `method: "bytes"` ESCAPE HATCH, and why it is here rather than in the
 * collection pass.
 *
 * The in-depth reading is lines this author wrote; the byte reading is
 * languages on disk, unqualified. They are different claims, so a run does not
 * slide from one to the other on its own — a network incident must not quietly
 * replace the better measurement with the worse one. Asking for `bytes` in
 * config is a deliberate choice, and it is resolved here, AFTER selection, so
 * it still counts exactly the displayed set.
 */
if ((cfg.languageScopeOptions?.method ?? "authored-lines") === "bytes" && ctx?.languages && ctx.work?.scopeRepos?.length) {
  console.log("· method=bytes in config: reading languages from the API instead of the authored analysis")
  ctx.languages = await languageBytes(cfg, ctx.work.scopeRepos)
}

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

// THE CARDS, in pin order, plus the scope the language chart counted over.
//
// The finished payload is recorded rather than the keys alone, because this is
// what a later run holds when it cannot reach the pinned query — and a pin with
// no config override has nothing else to be rebuilt from. See the note on STATE
// at the top of this file.
//
// A build with no cards at all (every pin removed from the profile) records
// nothing: there is no last-known-good worth keeping, and an empty grid is the
// correct rendering of that decision rather than a failure to hide.
if (ctx?.work?.picked?.length) {
  const cards = ctx.work.picked
  const keys = cards.map((c) => c.key)
  const scopeRepos = ctx.work.scopeRepos ?? []

  // Read what the last run left BEFORE deciding whether to write. Comparing on
  // content is what keeps a stable page from producing a commit every six
  // hours — `generated` is included in the comparison, so it is carried over
  // verbatim when nothing moved and only advances when something did.
  let before = null
  try { before = JSON.parse(await readFile(STATE, "utf8")) } catch {}

  const sameAs = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
  const moved = !before || !sameAs(before.cards, cards) || !sameAs(before.scopeRepos, scopeRepos)

  // A HELD RUN DOES NOT WRITE.
  //
  // The cards it is drawing came out of this file, so rewriting them would only
  // restamp `generated` with a time at which nothing was actually learned, and
  // would hand the workflow a diff to commit for a run that learned nothing.
  // Leaving the file alone is also what keeps a hold out of the history, so the
  // next run gets a clean try six hours later.
  if (ctx.work.held) {
    console.warn(
      `! SELECTED WORK held at the last known-good cards (${keys.join(",")}): ${ctx.work.holdReason}. ` +
        `The state file was left alone, and no ranking fallback was used.`
    )
  } else if (moved) {
    const next = { keys, cards, scopeRepos, generated: ctx.now.toISOString() }
    await writeFile(STATE, JSON.stringify(next, null, 2) + "\n", "utf8")
    console.log(`  selected-work   ${cards.length} card(s) ${keys.join(",")}${before ? " (changed)" : " (first build)"}`)
  } else {
    console.log(`  selected-work   ${cards.length} card(s) ${keys.join(",")} (unchanged)`)
  }

  // Per-card state, so the log distinguishes the three readings rather than
  // printing one placeholder for a repository that could not be reached AND for
  // one that was read successfully and simply has no commits by this author.
  // Those call for different actions: the first is a network incident, the
  // second is a fact about the work.
  const ageDays = (iso, now) => {
    const ms = Date.parse(iso)
    return Number.isFinite(ms) ? Math.round((now.getTime() - ms) / 86400e3) : null
  }
  cards.forEach((c, i) => {
    const snap = ctx.work.signal?.[c.repo]
    const state = signalState(snap)
    const age = state === "fresh" ? ageDays(snap.lastCommitAt, ctx.now) : null
    const when =
      state === "unknown" ? "UNAVAILABLE"
      : state === "stale" ? "no commits by me"
      : `${age}d ago`
    console.log(
      `    ${String(i + 1).padStart(2)}. ${c.key.padEnd(24)} ${when.padEnd(17)} ${c.repo}` +
        (c.unedited ? "   (no hand-written why — using the GitHub description)" : "")
    )
  })
  console.log(`  language scope  ${scopeRepos.join(" ")}`)
  if (ctx.languages?.partial) {
    console.warn(
      `! LANGUAGE SIGNAL could not reach ${ctx.languages.missingKeys.join(", ")} — ` +
        `the panel says ${ctx.languages.repoCount} of ${ctx.languages.scopeCount} repos, and a ` +
        `repository it could not read is reported as unavailable rather than as zero lines.`
    )
  }

  // ---- THE COLLECTION PROOF, IN THE LOG RATHER THAN IN A COMMENT ----------
  //
  // "One collection per repository per build" is a property of the data flow —
  // `scopeRepos` is handed to `authoredSnapshots` once, and the chart folds the
  // snapshots that come back. What is worth checking, then, is that the flow
  // still holds: the collection covered exactly the scope, and the scope names
  // no repository twice. Either failing would mean a panel had been computed
  // from a second, differently-timed observation.
  const proof = ctx.analysis
  if (proof) {
    if (new Set(scopeRepos).size !== scopeRepos.length) {
      console.error("! the language scope lists a repository more than once — the single-pass rule is broken")
      process.exitCode = 1
    }
    if (proof.reposMeasured + proof.reposFailed !== proof.reposRequested) {
      console.error(
        `! the collection covered ${proof.reposMeasured + proof.reposFailed} of ${proof.reposRequested} ` +
          `scoped repo(s) — the single-pass rule is broken`
      )
      process.exitCode = 1
    }
    console.log(
      `  clone proof     ${proof.reposRequested} repo(s) collected once ` +
        `(<=${proof.cloneAttempts - 1} retry on failure), ${proof.collectionPasses} collection(s)/repo  ` +
        `[${proof.reposMeasured} measured, ${proof.reposFailed} failed]`
    )
  }

  // A pin nobody has written copy for is not an error — it is the case that
  // makes "pin it and walk away" true — but it is worth naming, because that
  // card is showing a repository description rather than a sentence somebody
  // chose for it.
  if (ctx.work.unedited?.length) {
    console.log(`  unedited pins   ${ctx.work.unedited.join(" ")}   (add them to config.cardOverrides to choose the wording)`)
  }

  await rewriteReadmeCards(ctx.work.picked)
}

/**
 * Rewrite the card links between SELECTED_WORK_START/END in README.md.
 *
 * The markup itself — and the reason it is one line per card, in the order
 * given — lives in lib/readme.mjs, where it can be tested. This function only
 * does the file surgery: find the block, keep the START comment's own
 * explanatory text, replace what follows it.
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

  const lines = cardLinks(picked)

  // Keep the START comment's own explanatory text; replace only what follows it.
  const openEnd = src.indexOf("-->", a) + 3
  const next = src.slice(0, openEnd) + "\n" + lines + "\n" + src.slice(b)
  if (next === src) {
    console.log("  readme          SELECTED_WORK block unchanged")
    return
  }
  await writeFile(path, next, "utf8")
  // The README is not under assets/, so the workflow's commit step would miss
  // it. It is committed alongside on purpose: a card that is generated but not
  // linked is a card nobody sees.
  console.log(`  readme          SELECTED_WORK rewritten (${picked.length} cards)`)
}

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
  // `work.picked` carries no closures, but a cache written by an older build has
  // no `work` at all. Falling back to the empty selection keeps --offline usable
  // for layout work instead of crashing on a missing key.
  if (!raw.work) raw.work = { picked: [], signal: {}, scopeRepos: [] }
  // A cache written before the pinned-source change has no collection proof in
  // it. The log step is skipped rather than reported as a failure the run never
  // earned.
  if (!raw.analysis) raw.analysis = null
  return raw
}



