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
 * challenger must lead an incumbent by `hysteresisDays` before it takes the
 * seat. That guard needs to know what the previous run displayed, and the only
 * durable, inspectable place to keep it is a committed file next to the images
 * it describes — a workflow cache would be invisible and would silently reset.
 *
 * It records the membership AND the activity readings that produced it, so a
 * checkout with no network can still be checked by `check.mjs`. It is written
 * ONLY when the membership actually changes, so a stable page does not produce
 * a pointless commit every six hours.
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
// can apply its stability guard. Absent on a first build, which is the
// unguarded path.
try {
  const prev = JSON.parse(await readFile(STATE, "utf8"))
  if (Array.isArray(prev?.keys)) cfg.__pickedProjects = prev.keys
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

// The membership, plus the activity readings behind it. The readings are here
// rather than in a separate file because they are what `check.mjs` needs to
// judge staleness on a checkout that has no network and cannot re-measure —
// and because a state file that records only WHAT was chosen, with no trace of
// WHY, cannot be audited six weeks later.
if (ctx?.work?.picked?.length) {
  const keys = ctx.work.picked.map((p) => p.key)
  const signal = ctx.work.signal ?? {}
  const scopeRepos = ctx.work.scopeRepos ?? []

  // Read what the last run left BEFORE deciding whether to write. Comparing on
  // content is what keeps a stable page from producing a commit every six
  // hours — `generated` is included in the comparison, so it is carried over
  // verbatim when nothing moved and only advances when something did.
  let before = null
  try { before = JSON.parse(await readFile(STATE, "utf8")) } catch {}

  const sameAs = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
  const moved =
    !before ||
    !sameAs(before.keys, keys) ||
    !sameAs(before.signal, signal) ||
    !sameAs(before.scopeRepos, scopeRepos)

  // THE HOLD IS REPORTED, NOT WRITTEN.
  //
  // A run that could not measure every candidate keeps the previous membership
  // (see lib/projects.mjs). It must NOT rewrite the state file in that case,
  // and not because the content would differ — it is precisely so that the
  // `generated` stamp keeps pointing at the last run whose evidence was
  // COMPLETE. `check.mjs` judges staleness from these readings, and a page
  // held on incomplete evidence has nothing new to say about itself. Leaving
  // the file untouched is also what makes a hold produce no commit: the
  // workflow sees a clean tree and stops, six hours later, on its own.
  if (ctx.work.held) {
    console.warn(
      `! SELECTED WORK held at the previous membership: ${ctx.work.holdReason}. ` +
        `${ctx.work.unmeasured.length ? `unmeasured: ${ctx.work.unmeasured.join(" ")}. ` : ""}` +
        `The state file was left alone so the last complete reading stays on record.`
    )
  } else if (moved) {
    const next = {
      keys,
      slots: cfg.workSlots ?? 6,
      scopeRepos,
      // The readings are kept because `check.mjs` judges staleness from them on
      // a checkout with no network. A file that recorded only WHAT was chosen,
      // with no trace of WHY, could not be audited six weeks later.
      signal,
      generated: ctx.now.toISOString(),
    }
    await writeFile(STATE, JSON.stringify(next, null, 2) + "\n", "utf8")
    console.log(`  selected-work   keys=${keys.join(",")}${before ? " (changed)" : " (first build)"}`)
  } else {
    console.log(`  selected-work   keys=${keys.join(",")} (unchanged)`)
  }

  // Per-project state, so the log distinguishes the three readings rather than
  // printing "age unknown" for a project that failed to clone AND for one that
  // genuinely has no commits by this author. Those call for different actions.
  for (const p of ctx.work.picked) {
    const d =
      p._state === "unknown" ? "UNMEASURED"
      : p._state === "stale" ? "no commits by me"
      : `${Math.round(p._days)}d ago`
    console.log(`    ${p.tier.padEnd(9)} ${p.key.padEnd(24)} ${d.padEnd(17)} score ${p._score.toFixed(3)}`)
  }
  console.log(`  language scope  ${(ctx.work.scopeRepos ?? []).join(" ")}`)
  if (ctx.languages?.partial) {
    console.warn(
      `! LANGUAGE SIGNAL could not measure ${ctx.languages.missingKeys.join(", ")} — ` +
        `the panel says ${ctx.languages.repoCount} of ${ctx.languages.scopeCount} repos.`
    )
  }

  // The gate itself lives in check.mjs and runs as its own step. Reporting it
  // here as well means the build log says why before the check fails, which is
  // the difference between "the build is red" and "the rule has drifted".
  const st = ctx.work.staleness
  if (st.stale) {
    console.warn(
      `! SELECTED WORK is lagging: freshest unshown project is ${st.bestOutsideDays}d old vs ` +
        `${st.worstInsideDays}d for the stalest shown one (${st.lagDays}d gap, tolerance ` +
        `${cfg.stalenessToleranceDays ?? 45}d).`
    )
  } else if (!st.comparable) {
    console.log(`  staleness       not checked this run (not enough measured readings${st.unmeasured ? `, ${st.unmeasured} unmeasured` : ""})`)
  }

  // ---- THE CLONE PROOF, IN THE LOG RATHER THAN IN A COMMENT ---------------
  //
  // "At most one clone per repository per build" is a property of the whole
  // run, so it is checked here, at the end, from a count that `sources.mjs`
  // keeps per repository. A repeat is served from the first snapshot and
  // reported the moment it happens; this line is the summary that fails the
  // build if it ever did.
  const cloneProof = ctx.analysis
  if (cloneProof) {
    if (cloneProof.repeats > 0) {
      console.error(`! authored analysis was requested twice for ${cloneProof.repeats} repo(s) — the single-pass rule is broken`)
      process.exitCode = 1
    }
    // `cloneCounts` is a Map, which JSON cannot carry, so an --offline cache
    // round-trip arrives as `{}`. The proof is only meaningful on a run that
    // actually collected, so a cache reports what the cache knows and says so
    // rather than printing `undefined repo(s)`.
    const requested = cloneProof.cloneCounts instanceof Map ? cloneProof.cloneCounts.size : null
    console.log(
      `  clone proof     ${requested == null ? "not measured (cache)" : `${requested} repo(s) requested`}, ` +
        `${cloneProof.repeats} repeat request(s), limit ${cloneProof.cloneLimit} clone(s)/repo  ` +
        `[${cloneProof.reposMeasured} measured, ${cloneProof.reposFailed} failed]`
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

  // Attribute values are quoted, so only these three characters can break out.
  // Declared here rather than at module scope: as a `const` further down the
  // file it was in its temporal dead zone when this ran, and the call only
  // happened to be reached for the first time on an --offline build.
  const escapeAttr = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")

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
  // A cache written before the single-pass change has no clone proof in it. The
  // log step is skipped rather than reported as a failure the run never earned.
  if (!raw.analysis) raw.analysis = null
  return raw
}



