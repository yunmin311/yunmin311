/**
 * Checks the README against what the build actually produced.
 *
 * Written after a missing `export const responsive = true` shipped a README
 * pointing at a phone variant that was never generated — a broken image only a
 * phone would ever see. Every asset the page references now has to exist before
 * anything is pushed.
 *
 * The second thing it checks is the one this file exists for after the pinned
 * change: THAT THE PAGE AGREES WITH WHAT THE BUILD RECORDED. An asset can be
 * present, well-formed and simply the wrong one — a grid still showing last
 * week's cards while the state file says something else is a page that is wrong
 * in a way no image validation can see. The card order is included, because the
 * order is the author's, set by dragging pins around on GitHub, and a page that
 * silently reorders them is not following the profile.
 *
 *   node scripts/check.mjs
 */

import { readdir, readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

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

// What the last build recorded: the cards, in pin order, and the scope the
// language chart counted over. Read here rather than recomputed, because this
// file must be able to run on a checkout with no network — which is exactly the
// situation a reviewer is in.
const STATE = resolve(ROOT, "assets/generated/selected-work.json")
let state = null
try { state = JSON.parse(await readFile(STATE, "utf8")) } catch {}

/* ------------------------------------------------- cards point at real files */

// SELECTED WORK's membership is the pinned repositories, which change without
// anything in this repository changing, so it is checked against what the build
// recorded rather than against config. Each recorded card must have BOTH
// variants on disk: a missing desktop card is invisible, a missing phone card is
// broken on every phone.
for (const key of state?.keys ?? []) {
  for (const suffix of [".svg", "-m.svg"]) {
    const f = `assets/generated/work-${key}${suffix}`
    if (!generated.includes(f)) problems.push(`selected card \`${key}\` has no generated card (${f})`)
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

/* ---------------------------------------- the README shows the recorded cards */

// The links in the block are written by `build.mjs` from the same array that
// produced the images, so this compares two independently-writable things: the
// committed README and the committed state file. They can only disagree if
// somebody edited the block by hand, or if a build half-finished — and both of
// those are worth failing a run over, because the alternative is a green build
// on a page showing a project that is no longer pinned.
if (state?.keys?.length) {
  const START = "<!-- SELECTED_WORK_START"
  const END = "<!-- SELECTED_WORK_END -->"
  const a = readme.indexOf(START)
  const b = readme.indexOf(END)
  if (a < 0 || b < 0 || b < a) {
    problems.push("README has no SELECTED_WORK block, but the build recorded cards for it")
  } else {
    const block = readme.slice(readme.indexOf("-->", a) + 3, b)
    // Only the desktop `src` is taken: the phone variant sits in `srcset`, and a
    // looser pattern would capture `alpha-m` as a key of its own and then report
    // an ordering mismatch that is not there.
    const order = [...block.matchAll(/src="assets\/generated\/work-([a-z0-9-]+)\.svg"/g)].map((m) => m[1])
    const want = state.keys
    if (order.length !== want.length || order.some((k, i) => k !== want[i])) {
      problems.push(
        `the README's SELECTED_WORK block does not match the recorded cards, in order.\n` +
          `      README: ${order.join(", ") || "(none)"}\n` +
          `      state : ${want.join(", ")}`
      )
    }
  }
}

/* ------------------------------------- the language scope covers what is shown */

// LANGUAGE SIGNAL's scope IS the cards, so this compares the recorded scope
// against the recorded cards rather than against anything recomputed: a
// repository shown but not counted makes the chart a caption on a grid it does
// not describe, and one counted but not shown attributes lines to a project the
// reader cannot see. Both are quiet failures of exactly the panel this change
// is about.
const cards = state?.cards ?? []
if (cards.length) {
  const counted = [...new Set((state?.scopeRepos ?? []).map(String))]
  const want = cards.filter((c) => c.languages === "count").map((c) => c.repo)

  for (const repo of want) {
    if (!counted.includes(repo)) problems.push(`\`${repo}\` is shown and declared 'count' but was not counted`)
  }
  for (const repo of counted) {
    if (!want.includes(repo)) problems.push(`\`${repo}\` was counted by LANGUAGE SIGNAL but is not a shown card`)
  }
  if (!want.length) problems.push("no shown card is declared 'count' — the chart would have nothing to draw")
}

/* ---------------------------------------------------------- orphan accounting */

// The state file is an input to the build, not something the README points at.
const orphans = generated.filter((f) => !referenced.has(f) && !f.endsWith("selected-work.json"))

console.log(`referenced: ${referenced.size}   generated: ${generated.length}   orphaned: ${orphans.length}`)
if (orphans.length) console.log(orphans.map((o) => `  · ${o.split("/").pop()}`).join("\n"))

/* ------------------------------------------------------------------- verdict */

if (problems.length) {
  console.error(`\n${problems.length} problem(s):`)
  for (const p of problems) console.error(`  ! ${p}`)
  process.exit(1)
}
console.log("\nevery referenced asset exists, and the README shows the recorded cards")
