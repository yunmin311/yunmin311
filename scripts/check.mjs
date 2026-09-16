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

// What the last build chose, and the activity readings behind it. Read here
// rather than recomputed: this file must be able to run on a checkout with no
// network, which is exactly the situation a reviewer is in.
const STATE = resolve(ROOT, "assets/generated/selected-work.json")
let state = null
try { state = JSON.parse(await readFile(STATE, "utf8")) } catch {}

/* ------------------------------------------------- cards point at real files */

// SELECTED WORK's cast changes between runs, so membership is checked against
// what the build recorded rather than against config. Each recorded project
// must have BOTH variants on disk: a missing desktop card is invisible, a
// missing phone card is broken on every phone.
for (const key of state?.keys ?? []) {
  for (const suffix of [".svg", "-m.svg"]) {
    const f = `assets/generated/work-${key}${suffix}`
    if (!generated.includes(f)) problems.push(`selected project \`${key}\` has no generated card (${f})`)
  }
}

/* ------------------------------------------- every card is reachable, and back */

for (const path of [...referenced].sort()) {
  try {
    await readFile(resolve(ROOT, path))
  } catch {
    problems.push(`missing asset: ${path}`)
  }
}

/* ------------------------------------- the language scope covers what is shown */

// LANGUAGE SIGNAL counts the projects the cards are showing. If a project is
// displayed, declared `count`, and produces no reading, the chart keeps drawing
// one language lighter and nothing says so — which is the quiet failure this
// catches. It compares against the SELECTION rule rather than the whole pool,
// because a `count` project that is simply not on the page is not a problem.
try {
  const cfg = JSON.parse(await readFile(resolve(ROOT, "scripts/config.json"), "utf8"))
  const projects = normalise(cfg)
  const shown = new Set(state?.keys ?? projects.map((p) => p.key))
  const displayed = projects.filter((p) => shown.has(p.key))
  const expected = displayed.filter((p) => p.languages === "count").map((p) => p.repo)
  const counted = new Set((state?.scopeRepos ?? expected).map(String))

  for (const repo of expected) {
    if (!counted.has(repo)) problems.push(`\`${repo}\` is displayed and declared 'count' but was not counted`)
  }
  const declared = projects.filter((p) => p.languages === "count")
  if (!declared.length) problems.push("no project is declared 'count' — the chart would have nothing to draw")
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
 * This one inspects the RULE. It compares the freshest project that is NOT
 * displayed against the stalest one that is: if something materially more
 * active has been left outside for longer than the tolerance, the model has
 * drifted from reality and the run fails loudly instead of the page going
 * quietly old.
 *
 * It reads the activity readings the build recorded, so it works on a checkout
 * with no network. Without that record — a docs-only change, a first clone —
 * it is skipped rather than guessed at.
 *
 * IT ONLY JUDGES MEASURED READINGS. A run that could not collect everything
 * holds the previous membership (see lib/projects.mjs) and leaves the state
 * file alone, so the readings here are always the last run whose evidence was
 * complete. An unmeasured project inside them is dropped from BOTH sides of the
 * comparison rather than counted as infinitely old — a gate that fails on a
 * five-second network error is a gate that gets ignored.
 */
if (state?.signal) {
  const cfg = JSON.parse(await readFile(resolve(ROOT, "scripts/config.json"), "utf8"))
  const pool = normalise(cfg)
  const shown = new Set(state.keys)
  const now = Date.now()
  const DAY = 86400e3

  // `outcome: "ok"` is the marker of a real measurement. A snapshot without one
  // is either a failure recorded by this build or an older state file written
  // before outcomes existed — both mean "no evidence", never "old".
  const measuredAge = (p) => {
    const snap = state.signal?.[p.repo]
    if (snap?.outcome !== "ok" || !snap.lastCommitAt) return null
    const ms = Date.parse(snap.lastCommitAt)
    return Number.isFinite(ms) ? (now - ms) / DAY : null
  }

  const outside = pool.filter((p) => !shown.has(p.key)).map(measuredAge).filter((d) => d != null)
  const inside = pool.filter((p) => shown.has(p.key)).map(measuredAge).filter((d) => d != null)
  const unmeasured = pool.filter((p) => state.signal?.[p.repo] && measuredAge(p) == null).length

  if (outside.length && inside.length) {
    const bestOutside = Math.min(...outside)
    const worstInside = Math.max(...inside)
    const lag = worstInside - bestOutside
    const tolerance = cfg.stalenessToleranceDays ?? 45
    console.log(
      `selected work: freshest unshown ${bestOutside.toFixed(0)}d · ` +
        `stalest shown ${worstInside.toFixed(0)}d · lag ${lag.toFixed(0)}d (tolerance ${tolerance}d)` +
        (unmeasured ? `   [${unmeasured} unmeasured, excluded from the comparison]` : "")
    )
    if (lag > tolerance) {
      problems.push(
        `SELECTED WORK has gone stale: a project ${bestOutside.toFixed(0)}d old is not displayed, ` +
          `while a displayed one is ${worstInside.toFixed(0)}d old (${lag.toFixed(0)}d behind, ` +
          `tolerance ${tolerance}d). Either add the missing project to config.projects, or raise ` +
          `coreLeadDays / lower hysteresisDays.`
      )
    }
  } else {
    console.log(
      `selected work: not enough measured readings to compare ` +
        `(${outside.length} unshown, ${inside.length} shown${unmeasured ? `, ${unmeasured} unmeasured` : ""}) — skipped`
    )
  }
} else if (state?.keys) {
  console.log("selected work: no activity readings recorded, staleness not checked")
}

if (problems.length) {
  console.error(`\n${problems.length} problem(s):`)
  for (const p of problems) console.error(`  ! ${p}`)
  process.exit(1)
}
console.log("\nevery referenced asset exists, and SELECTED WORK is current")
