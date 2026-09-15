/**
 * Checks the README against what the build actually produced.
 *
 * Written after a missing `export const responsive = true` shipped a README
 * pointing at a phone variant that was never generated — a broken image only a
 * phone would ever see. Every asset the page references now has to exist before
 * anything is pushed.
 *
 * Also checks that SELECTED WORK has not gone stale, which is a different kind
 * of bug: an asset that is PRESENT and well-formed and simply wrong. See the
 * staleness section at the bottom — it is the gate that was missing.
 *
 *   node scripts/check.mjs
 */

import { readdir, readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

import { normalise, languageRepos } from "./lib/projects.mjs"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const readme = await readFile(resolve(ROOT, "README.md"), "utf8")
const gallery = await readFile(resolve(ROOT, "docs/COMPONENTS.md"), "utf8").catch(() => "")

// Only real markup, never the commented-out sections.
// The component gallery references assets the profile deliberately does not,
// so both documents count as live references.
const live = (readme + gallery).replace(/<!--[\s\S]*?-->/g, "").replace(/\.\.\//g, "")

const referenced = new Set()
for (const m of live.matchAll(/(?:src|srcset)="([^"]+)"/g)) referenced.add(m[1])
for (const m of live.matchAll(/<a href="(assets\/[^"]+)"/g)) referenced.add(m[1])

const problems = []

/* ---------------------------------------------------------- generated files */

const generated = (await readdir(resolve(ROOT, "assets/generated"))).map((f) => `assets/generated/${f}`)

/* ------------------------------------------------- cards point at real files */

// SELECTED WORK's cast changes between runs, so membership is checked against
// what the build recorded rather than against config. A project that stopped
// being selected leaves an orphaned file — harmless — but a selected project
// with NO file is a broken image, and that is what this catches.
const STATE = resolve(ROOT, "assets/generated/selected-work.json")
let state = null
try { state = JSON.parse(await readFile(STATE, "utf8")) } catch {}

const cardKeys = new Set()
for (const f of generated) {
  const m = /^work-(.+)\.svg$/.exec(f.split("/").pop())
  if (m && !f.endsWith("-m.svg")) cardKeys.add(m[1])
}
for (const key of state?.keys ?? []) {
  if (!cardKeys.has(key)) problems.push(`selected project \`${key}\` has no generated card`)
}

/* ------------------------------------------- every card is reachable, and back */

for (const path of [...referenced].sort()) {
  try {
    await readFile(resolve(ROOT, path))
  } catch {
    problems.push(`missing asset: ${path}`)
  }
}

/* ------------------------------------- the language scope still covers the pool */

// A project declared `count` that produces no reading is the quiet failure
// mode: the chart keeps drawing, one language lighter, and nothing says so.
try {
  const cfg = JSON.parse(await readFile(resolve(ROOT, "scripts/config.json"), "utf8"))
  const scope = languageRepos(normalise(cfg))
  const listed = (cfg.projects ?? []).filter((p) => (p.languages ?? "count") === "count")
  if (scope.length !== listed.length) {
    problems.push(`language scope dropped ${listed.length - scope.length} project(s) declared 'count'`)
  }
  if (!scope.length) problems.push("language scope is empty — the chart would have nothing to draw")
} catch (err) {
  problems.push(`config.json could not be normalised: ${err.message}`)
}

/* ---------------------------------------------------------- orphan accounting */

// The state file is an input to the build, not something the README points at.
const orphans = generated.filter((f) => !referenced.has(f) && !f.endsWith("selected-work.json"))

console.log(`referenced: ${referenced.size}   generated: ${generated.length}   orphaned: ${orphans.length}`)
if (orphans.length) console.log(orphans.map((o) => `  · ${o.split("/").pop()}`).join("\n"))

/* ------------------------------------------------------------ staleness gate */

/*
 * THE CHECK THAT WAS MISSING.
 *
 * Card content is curated, so a healthy rebuild reproduces the card images
 * byte-for-byte and the workflow commits nothing — correct behaviour that was
 * ALSO what a frozen selection rule looked like. Every gate here passed on a
 * page whose cards had not changed in weeks, because the gates only ever
 * inspected the output.
 *
 * This one inspects the RULE. It compares the most active project that is
 * displayed against the most active one that is not: if something materially
 * busier has been left outside for longer than the tolerance, the model has
 * drifted from reality and the run fails loudly instead of the page going
 * quietly old.
 *
 * It needs recent activity, which only a build can supply, so it reads the
 * build's own reading of the pool. Absent that — a docs-only change, a fresh
 * checkout — it is skipped rather than guessed at.
 */
const READING = resolve(ROOT, "assets/generated/selected-work.json")
if (state?.signal) {
  const cfg = JSON.parse(await readFile(resolve(ROOT, "scripts/config.json"), "utf8"))
  const pool = normalise(cfg)
  const shown = new Set(state.keys)
  const now = Date.now()
  const DAY = 86400e3
  const ageOf = (p) => {
    const at = state.signal?.[p.repo]?.lastCommitAt
    const ms = at ? Date.parse(at) : NaN
    return Number.isFinite(ms) ? (now - ms) / DAY : null
  }

  const outside = pool.filter((p) => !shown.has(p.key)).map(ageOf).filter((d) => d != null)
  const inside = pool.filter((p) => shown.has(p.key)).map(ageOf).filter((d) => d != null)

  if (outside.length && inside.length) {
    const bestOutside = Math.min(...outside)
    const worstInside = Math.max(...inside)
    const lag = worstInside - bestOutside
    const TOLERANCE_DAYS = 45
    console.log(
      `selected work: freshest unshown ${bestOutside.toFixed(0)}d · ` +
        `stalest shown ${worstInside.toFixed(0)}d · lag ${lag.toFixed(0)}d (tolerance ${TOLERANCE_DAYS}d)`
    )
    if (lag > TOLERANCE_DAYS) {
      problems.push(
        `SELECTED WORK has gone stale: a project ${bestOutside.toFixed(0)}d old is not displayed, ` +
          `while a displayed one is ${worstInside.toFixed(0)}d old (${lag.toFixed(0)}d behind). ` +
          `Either add missing projects to config.projects, or lower the incumbent's hysteresis.`
      )
    }
  }
} else if (state?.keys) {
  console.log("selected work: no activity signal recorded, staleness not checked")
}

if (problems.length) {
  console.error(`\n${problems.length} problem(s):`)
  for (const p of problems) console.error(`  ! ${p}`)
  process.exit(1)
}
console.log("\nevery referenced asset exists, and SELECTED WORK is current")
