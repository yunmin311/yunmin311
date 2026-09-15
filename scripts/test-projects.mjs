/**
 * Tests for the SELECTED WORK / LANGUAGE SIGNAL data model.
 *
 * WHY THIS FILE EXISTS. The bug this replaces was invisible: card content was
 * 100% config, so a frozen rule and a healthy rule produced byte-identical
 * images, and build / check / validate all passed on a page that had not
 * meaningfully changed in weeks. A gate that only looks at the OUTPUT cannot
 * catch that. These tests pin down the RULE, so a change to it has to be
 * deliberate and a regression is caught here rather than three weeks later by
 * somebody noticing the numbers look old.
 *
 *   node scripts/test-projects.mjs
 *
 * No test framework: a dependency would have to be added to a repository whose
 * whole premise is zero runtime dependencies, and `assert` is enough.
 */

import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

import { normalise, languageRepos, select, score, staleness } from "./lib/projects.mjs"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const cfg = JSON.parse(await readFile(resolve(ROOT, "scripts/config.json"), "utf8"))

const NOW = new Date("2026-09-15T12:00:00Z")
const DAY = 86400e3
const daysAgo = (n) => new Date(NOW.getTime() - n * DAY).toISOString()

let pass = 0
let fail = 0
const t = (name, fn) => {
  try { fn(); console.log(`  ok   ${name}`); pass++ }
  catch (err) { console.error(`  FAIL ${name}\n       ${err.message.split("\n")[0]}`); fail++ }
}

/* ------------------------------------------------------------ the real pool */

console.log("\nconfig — the declared pool")

t("projects[] parses and is non-empty", () => {
  assert.ok(Array.isArray(cfg.projects) && cfg.projects.length > 0)
})

t("normalise accepts the shipped config", () => {
  const p = normalise(cfg)
  assert.equal(p.length, cfg.projects.length)
})

t("the legacy second list is gone", () => {
  // The whole point of the change: one list, not two that drift.
  assert.equal(cfg.work, undefined, "config.work should be removed")
  assert.equal(cfg.languageScope?.repos, undefined, "config.languageScope.repos should be removed")
})

t("every project has a resolvable repo slug", () => {
  for (const p of normalise(cfg)) {
    assert.match(p.repo, /^[\w.-]+\/[\w.-]+$/, `${p.key} has repo ${p.repo}`)
  }
})

t("at least one core project exists", () => {
  assert.ok(normalise(cfg).some((p) => p.tier === "core"))
})

t("workSlots fits the card grid", () => {
  // The grid is drawn as six cards; a different count would need a layout change.
  assert.equal(cfg.workSlots, 6)
})

/* --------------------------------------------------------------- validation */

console.log("\nnormalise — rejects bad input by name")

const base = {
  projects: [{
    key: "a", name: "A", why: "w", tags: ["x"], url: "https://e/x",
  }],
}

t("missing field is named", () => {
  assert.throws(() => normalise({ projects: [{ key: "a", name: "A" }] }), /why|tags|url/)
})

t("duplicate key is rejected", () => {
  const dup = { projects: [base.projects[0], { ...base.projects[0] }] }
  assert.throws(() => normalise(dup), /duplicate/i)
})

t("bad tier is rejected", () => {
  assert.throws(() => normalise({ projects: [{ ...base.projects[0], tier: "star" }] }), /tier/)
})

t("bad languages value is rejected", () => {
  assert.throws(() => normalise({ projects: [{ ...base.projects[0], languages: "maybe" }] }), /languages/)
})

t("empty projects is rejected", () => {
  assert.throws(() => normalise({ projects: [] }), /non-empty/)
})

t("defaults are applied", () => {
  const [p] = normalise(base)
  assert.equal(p.tier, "candidate")
  assert.equal(p.languages, "count")
  assert.equal(p.weight, 0)
  assert.equal(p.hysteresis, 0)
  assert.equal(p.repo, "yunmin311/a", "repo defaults to the login/key slug")
})

/* ------------------------------------------------------------------- scope */

console.log("\nlanguageRepos — derived, not typed twice")

t("only `count` projects are counted", () => {
  const p = normalise({ projects: [
    { ...base.projects[0], key: "a", languages: "count" },
    { ...base.projects[0], key: "b", languages: "exclude" },
    { ...base.projects[0], key: "c", languages: "n/a" },
  ] })
  assert.deepEqual(languageRepos(p), ["yunmin311/a"])
})

t("excluded projects are still displayable", () => {
  // DenseGPT must be able to appear as a card without supplying line counts.
  const p = normalise({ projects: [base.projects[0], { ...base.projects[0], key: "b", languages: "n/a" }] })
  assert.equal(p.length, 2)
  assert.equal(languageRepos(p).length, 1)
})

t("the shipped scope matches the shipped cards' pool", () => {
  // If this ever fails, the two panels have started to disagree about what the
  // work is — which is the exact regression this module prevents.
  const p = normalise(cfg)
  const counted = languageRepos(p)
  const displayed = select(p, {}, cfg, NOW, null).map((x) => x.repo)
  for (const repo of counted) {
    assert.ok(
      p.some((x) => x.repo === repo),
      `${repo} is counted but not in the pool`
    )
  }
  assert.ok(counted.length >= 4, `scope collapsed to ${counted.length} repos`)
  assert.ok(displayed.length > 0)
})

/* ------------------------------------------------------------------ scoring */

console.log("\nscore — the ordering curve")

const proj = (o) => normalise({ projects: [{ ...base.projects[0], ...o }] })[0]

t("recent beats old at equal volume", () => {
  const a = score(proj({ key: "a" }), 1, 10000)
  const b = score(proj({ key: "b" }), 170, 10000)
  assert.ok(a.score > b.score, `${a.score} !> ${b.score}`)
})

t("large beats small at equal recency", () => {
  const a = score(proj({ key: "a" }), 10, 50000)
  const b = score(proj({ key: "b" }), 10, 500)
  assert.ok(a.score > b.score)
})

t("unknown age is NOT treated as fresh", () => {
  const unknown = score(proj({ key: "a" }), null, 100000)
  const fresh = score(proj({ key: "b" }), 1, 0)
  assert.ok(unknown.score < fresh.score, "unknown age must not outrank a real recent commit")
})

t("unknown age is NOT treated as zero either", () => {
  // It must still be able to beat a genuinely abandoned project, or a single
  // transient clone failure would silently reorder the whole page.
  const unknown = score(proj({ key: "a" }), null, 5000)
  const stale = score(proj({ key: "b" }), 400, 0)
  assert.ok(unknown.score > stale.score)
})

t("weight is a floor, not a bonus", () => {
  const lifted = score(proj({ key: "a", weight: 0.7 }), 300, 0)
  const plain = score(proj({ key: "b" }), 300, 0)
  assert.equal(lifted.score, 0.7)
  assert.ok(lifted.score > plain.score)
})

t("weight cannot outrank something actively built", () => {
  // The whole reason it is a floor: a pinned favourite must not freeze the page.
  const lifted = score(proj({ key: "a", weight: 0.62 }), 300, 0)
  const active = score(proj({ key: "b" }), 2, 30000)
  assert.ok(active.score > lifted.score, `${active.score} !> ${lifted.score}`)
})

t("recency decays linearly and hits the floor", () => {
  const near = score(proj({ key: "a" }), 0, 0).recency
  const mid = score(proj({ key: "b" }), 90, 0).recency
  const far = score(proj({ key: "c" }), 400, 0).recency
  assert.equal(near, 1)
  assert.ok(Math.abs(mid - 0.5) < 1e-9, `expected 0.5, got ${mid}`)
  assert.equal(far, 0.05)
})

/* ----------------------------------------------------------------- selection */

console.log("\nselect — membership and stability")

const pool = normalise({ projects: [
  { ...base.projects[0], key: "core1", tier: "core" },
  { ...base.projects[0], key: "new",   hysteresis: 0 },
  { ...base.projects[0], key: "old",   hysteresis: 0 },
  { ...base.projects[0], key: "mid",   hysteresis: 0 },
] })
const sig = {
  "yunmin311/core1": { lastCommitAt: daysAgo(300), lines: 100 },
  "yunmin311/new":   { lastCommitAt: daysAgo(1),   lines: 5000 },
  "yunmin311/old":   { lastCommitAt: daysAgo(250), lines: 100 },
  "yunmin311/mid":   { lastCommitAt: daysAgo(30),  lines: 900 },
}
const small = { ...cfg, workSlots: 2 }

t("core is always displayed", () => {
  const picked = select(pool, sig, small, NOW, null).map((p) => p.key)
  assert.ok(picked.includes("core1"), `core1 missing from ${picked}`)
})

t("candidates fill the remaining slots", () => {
  const picked = select(pool, sig, small, NOW, null)
  assert.equal(picked.length, 2)
})

t("output is capped at workSlots", () => {
  const picked = select(pool, sig, { ...cfg, workSlots: 3 }, NOW, null)
  assert.equal(picked.length, 3)
})

t("most recent ranks first among equals", () => {
  const picked = select(pool, sig, { ...cfg, workSlots: 4 }, NOW, null).map((p) => p.key)
  assert.equal(picked[0], "new", `got ${picked}`)
})

t("no activity signal at all still yields a full, deterministic page", () => {
  const a = select(normalise(cfg), {}, cfg, NOW, null)
  const b = select(normalise(cfg), {}, cfg, NOW, null)
  assert.equal(a.length, cfg.workSlots)
  assert.deepEqual(a.map((p) => p.key), b.map((p) => p.key), "must be deterministic")
})

t("a challenger with no lead does not displace an incumbent", () => {
  const hyst = normalise({ projects: [
    { ...base.projects[0], key: "inc", hysteresis: 60 },
    { ...base.projects[0], key: "cha", hysteresis: 0 },
  ] })
  // cha is only barely newer; inc's guard should hold the slot.
  const s = {
    "yunmin311/inc": { lastCommitAt: daysAgo(20), lines: 1000 },
    "yunmin311/cha": { lastCommitAt: daysAgo(18), lines: 1000 },
  }
  const picked = select(hyst, s, { ...cfg, workSlots: 1 }, NOW, ["inc"]).map((p) => p.key)
  assert.deepEqual(picked, ["inc"], `expected inc to hold, got ${picked}`)
})

t("a decisively more active challenger does displace it", () => {
  const hyst = normalise({ projects: [
    { ...base.projects[0], key: "inc", hysteresis: 14 },
    { ...base.projects[0], key: "cha", hysteresis: 0 },
  ] })
  const s = {
    "yunmin311/inc": { lastCommitAt: daysAgo(120), lines: 1000 },
    "yunmin311/cha": { lastCommitAt: daysAgo(1), lines: 1000 },
  }
  const picked = select(hyst, s, { ...cfg, workSlots: 1 }, NOW, ["inc"]).map((p) => p.key)
  assert.deepEqual(picked, ["cha"], `expected cha to take over, got ${picked}`)
})

t("hysteresis never keeps a project that is no longer eligible", () => {
  // An incumbent that drops to tier-excluded… is not a thing; but an incumbent
  // whose key is removed from config must simply not be selected.
  const gone = normalise({ projects: [{ ...base.projects[0], key: "only" }] })
  const picked = select(gone, {}, { ...cfg, workSlots: 2 }, NOW, ["deleted-project"])
  assert.deepEqual(picked.map((p) => p.key), ["only"])
})

t("selection is stable across identical runs", () => {
  const a = select(normalise(cfg), sig, cfg, NOW, null).map((p) => p.key)
  const b = select(normalise(cfg), sig, cfg, NOW, null).map((p) => p.key)
  assert.deepEqual(a, b)
})

t("pinned membership is honoured when the signal is unchanged", () => {
  const first = select(normalise(cfg), sig, cfg, NOW, null).map((p) => p.key)
  const second = select(normalise(cfg), sig, cfg, NOW, first).map((p) => p.key)
  assert.deepEqual(second, first, "an unchanged signal must not reshuffle the page")
})

/* ---------------------------------------------------------------- staleness */

console.log("\nstaleness — the gate that was missing")

t("fresh selection is not flagged stale", () => {
  const p = normalise({ projects: [
    { ...base.projects[0], key: "shown" },
    { ...base.projects[0], key: "hidden" },
  ] })
  const s = {
    "yunmin311/shown": { lastCommitAt: daysAgo(2) },
    "yunmin311/hidden": { lastCommitAt: daysAgo(40) },
  }
  const shown = [p[0]]
  assert.equal(staleness(p, s, shown, NOW).stale, false)
})

t("a much more active unshown project IS flagged", () => {
  const p = normalise({ projects: [
    { ...base.projects[0], key: "shown" },
    { ...base.projects[0], key: "hidden" },
  ] })
  const s = {
    "yunmin311/shown": { lastCommitAt: daysAgo(200) },
    "yunmin311/hidden": { lastCommitAt: daysAgo(1) },
  }
  const r = staleness(p, s, [p[0]], NOW)
  assert.equal(r.stale, true, JSON.stringify(r))
  assert.ok(r.lagDays > 30)
})

t("no candidates outside the shown set is never stale", () => {
  const p = normalise({ projects: [base.projects[0]] })
  assert.equal(staleness(p, {}, p, NOW).stale, false)
})

t("missing activity does not manufacture a stale flag", () => {
  const p = normalise({ projects: [
    { ...base.projects[0], key: "a" },
    { ...base.projects[0], key: "b" },
  ] })
  assert.equal(staleness(p, {}, [p[0]], NOW).stale, false)
})

/* -------------------------------------------------------------- the shipped */

console.log("\nthe shipped configuration")

t("every selected project has non-empty card copy", () => {
  for (const p of select(normalise(cfg), {}, cfg, NOW, null)) {
    assert.ok(p.why.length > 40, `${p.key} why is too short`)
    assert.ok(p.tags.length > 0, `${p.key} has no tags`)
    assert.match(p.url, /^https:\/\/github\.com\//, `${p.key} url: ${p.url}`)
  }
})

t("the pool is larger than the slot count, so ordering can matter", () => {
  // A pool of exactly workSlots would make the whole ordering rule decorative.
  const p = normalise(cfg)
  assert.ok(p.length > cfg.workSlots, `pool ${p.length} <= slots ${cfg.workSlots}`)
})

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
