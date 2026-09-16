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

import { normalise, languageRepos, select, score, staleness, signalState, recencyOf } from "./lib/projects.mjs"
import { signalsFrom, unknown } from "./lib/sources.mjs"
import { aggregateLanguages } from "./lib/authored.mjs"

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

t("every policy number is in config, not hard-coded", () => {
  // The numbers are policy, so they belong where they can be changed without
  // reading any code. A missing one silently falls back to a constant nobody
  // sees, which is how a page ends up behaving in a way its config denies.
  for (const field of ["coreLeadDays", "hysteresisDays", "stalenessToleranceDays"]) {
    assert.ok(Number.isFinite(cfg[field]), `config.${field} must be a number`)
    assert.ok(cfg[field] >= 0, `config.${field} must not be negative`)
  }
  assert.ok(Array.isArray(cfg.pinned), "config.pinned must be an array")
})

t("pinned names only real projects", () => {
  const keys = new Set(normalise(cfg).map((p) => p.key))
  for (const k of cfg.pinned ?? []) {
    assert.ok(keys.has(k), `pinned key \`${k}\` is not a project`)
  }
})

t("hysteria values are not packaged as settled", () => {
  // Guards against the values being quietly re-introduced per project, which
  // is how the earlier 10/14/21 gradient came to look like a finding.
  for (const p of cfg.projects) {
    assert.equal(p.hysteresis, undefined, `${p.key} should not carry its own hysteresis`)
    assert.equal(p.weight, undefined, `${p.key} should not carry its own weight`)
  }
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
  assert.equal(p.repo, "yunmin311/a", "repo defaults to the login/key slug")
})

/* ------------------------------------------------------------------- scope */

console.log("\nlanguageRepos — derived, not typed twice")

t("the scope is the DISPLAYED set, not the whole pool", () => {
  // THE SEMANTIC THIS GUARDS. LANGUAGE SIGNAL sits under SELECTED WORK and is
  // read as a caption on it, so it must count the cards that are actually on
  // the page. Counting the pool would attribute lines to projects the reader
  // cannot see.
  const pool = normalise({ projects: [
    { ...base.projects[0], key: "hot",    languages: "count" },
    { ...base.projects[0], key: "warm",   languages: "count" },
    { ...base.projects[0], key: "hidden", languages: "count" },
  ] })
  const s = {
    "yunmin311/hot":    { outcome: "ok", lastCommitAt: daysAgo(1),  lines: 9000 },
    "yunmin311/warm":   { outcome: "ok", lastCommitAt: daysAgo(20), lines: 5000 },
    "yunmin311/hidden": { outcome: "ok", lastCommitAt: daysAgo(90), lines: 100 },
  }
  const { picked: displayed } = select(pool, s, { ...cfg, workSlots: 2 }, NOW, null)
  const scope = languageRepos(displayed)
  assert.deepEqual(scope.sort(), ["yunmin311/hot", "yunmin311/warm"])
  assert.ok(!scope.includes("yunmin311/hidden"), `hidden leaked into ${scope}`)
})

t("a displayed project declared n/a is not counted", () => {
  const pool = normalise({ projects: [
    { ...base.projects[0], key: "code", languages: "count" },
    { ...base.projects[0], key: "css",  languages: "n/a" },
  ] })
  const { picked: displayed } = select(pool, {}, { ...cfg, workSlots: 2 }, NOW, null)
  assert.deepEqual(languageRepos(displayed), ["yunmin311/code"])
})

t("the shipped scope matches the shipped cards' pool", () => {
  // If this ever fails, the two panels have started to disagree about what the
  // work is — which is the exact regression this module prevents.
  const p = normalise(cfg)
  const { picked: displayed } = select(p, {}, cfg, NOW, null)
  const counted = languageRepos(displayed)
  for (const repo of counted) {
    assert.ok(
      displayed.some((x) => x.repo === repo),
      `${repo} is counted but not displayed`
    )
  }
  assert.equal(counted.length, displayed.filter((x) => x.languages === "count").length)
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
  { ...base.projects[0], key: "new" },
  { ...base.projects[0], key: "old" },
  { ...base.projects[0], key: "mid" },
] })
const sig = {
  "yunmin311/core1": { outcome: "ok", lastCommitAt: daysAgo(300), lines: 100 },
  "yunmin311/new":   { outcome: "ok", lastCommitAt: daysAgo(1),   lines: 5000 },
  "yunmin311/old":   { outcome: "ok", lastCommitAt: daysAgo(250), lines: 100 },
  "yunmin311/mid":   { outcome: "ok", lastCommitAt: daysAgo(30),  lines: 900 },
}
// Slots are cut to two for the fixture; hysteresis is switched off so these
// tests can isolate ordering from stability, which has its own cases below.
const small = { ...cfg, workSlots: 2, hysteresisDays: 0 }

t("core leads a CLOSE comparison", () => {
  // What the lead is actually for: two projects being worked on at the same
  // time, where the only difference is that one of them is core. core1 is 40
  // days behind but has more lines written; without the lead it would lose, and
  // with it, it wins.
  const p = normalise({ projects: [
    { ...base.projects[0], key: "core1", tier: "core" },
    { ...base.projects[0], key: "peer" },
  ] })
  const s = {
    "yunmin311/core1": { lastCommitAt: daysAgo(50), lines: 30000 },
    "yunmin311/peer":  { lastCommitAt: daysAgo(10), lines: 30000 },
  }
  const picked = select(p, s, { ...cfg, workSlots: 1, hysteresisDays: 0, coreLeadDays: 45 }, NOW, null).picked
  assert.deepEqual(picked.map((x) => x.key), ["core1"], `expected core to lead, got ${picked.map((x) => x.key)}`)
})

t("core CAN retire when something decisively more active arrives", () => {
  // THE POINT OF THE CHANGE. A core project must be able to lose its card, or
  // "important" silently becomes "permanently fixed" and nothing new can ever
  // displace it. Here core1 is 300 days cold and the challenger is one day old
  // with more lines: the lead is not enough to hold.
  const p = normalise({ projects: [
    { ...base.projects[0], key: "cold-core", tier: "core" },
    { ...base.projects[0], key: "hot-new" },
  ] })
  const s = {
    "yunmin311/cold-core": { outcome: "ok", lastCommitAt: daysAgo(400), lines: 100 },
    "yunmin311/hot-new":   { outcome: "ok", lastCommitAt: daysAgo(1),   lines: 60000 },
  }
  const picked = select(p, s, { ...cfg, workSlots: 1 }, NOW, null).picked.map((x) => x.key)
  assert.deepEqual(picked, ["hot-new"], `expected the active project to win, got ${picked}`)
})

t("pinned does NOT retire, however cold", () => {
  // The one thing that IS permanent, and it is a hand-edit in config rather
  // than a side effect of being important.
  const p = normalise({ projects: [
    { ...base.projects[0], key: "kept", tier: "candidate" },
    { ...base.projects[0], key: "hot" },
  ] })
  const s = {
    "yunmin311/kept": { outcome: "ok", lastCommitAt: daysAgo(900), lines: 10 },
    "yunmin311/hot":  { outcome: "ok", lastCommitAt: daysAgo(1),   lines: 90000 },
  }
  const picked = select(p, s, { ...cfg, workSlots: 1, pinned: ["kept"] }, NOW, null).picked.map((x) => x.key)
  assert.deepEqual(picked, ["kept"], `expected the pinned project to hold, got ${picked}`)
})

t("candidates fill the remaining slots", () => {
  const picked = select(pool, sig, small, NOW, null).picked
  assert.equal(picked.length, 2)
})

t("output is capped at workSlots", () => {
  const picked = select(pool, sig, { ...cfg, workSlots: 3 }, NOW, null).picked
  assert.equal(picked.length, 3)
})

t("cards are ordered by score, not by config order", () => {
  // The grid must not reorder itself whenever config.json is edited, and
  // recency alone is not the ranking authority — `new` is one day old AND has
  // five times the volume, so it leads on both terms rather than on one.
  const picked = select(pool, sig, { ...cfg, workSlots: 4 }, NOW, null).picked.map((p) => p.key)
  assert.equal(picked[0], "new", `got ${picked}`)
  // The order is stable across runs, which is the property that matters.
  const again = select(pool, sig, { ...cfg, workSlots: 4 }, NOW, null).picked.map((p) => p.key)
  assert.deepEqual(picked, again)
})

t("no activity signal at all still yields a full, deterministic page", () => {
  const a = select(normalise(cfg), {}, cfg, NOW, null).picked
  const b = select(normalise(cfg), {}, cfg, NOW, null).picked
  assert.equal(a.length, cfg.workSlots)
  assert.deepEqual(a.map((p) => p.key), b.map((p) => p.key), "must be deterministic")
})

t("a challenger with no lead does not displace an incumbent", () => {
  const p = normalise({ projects: [
    { ...base.projects[0], key: "inc" },
    { ...base.projects[0], key: "cha" },
  ] })
  // cha is only barely newer; the guard should hold the seat.
  const s = {
    "yunmin311/inc": { outcome: "ok", lastCommitAt: daysAgo(20), lines: 1000 },
    "yunmin311/cha": { outcome: "ok", lastCommitAt: daysAgo(18), lines: 1000 },
  }
  const picked = select(p, s, { ...cfg, workSlots: 1, hysteresisDays: 60 }, NOW, ["inc"]).picked.map((x) => x.key)
  assert.deepEqual(picked, ["inc"], `expected inc to hold, got ${picked}`)
})

t("a decisively more active challenger does displace it", () => {
  const p = normalise({ projects: [
    { ...base.projects[0], key: "inc" },
    { ...base.projects[0], key: "cha" },
  ] })
  const s = {
    "yunmin311/inc": { outcome: "ok", lastCommitAt: daysAgo(120), lines: 1000 },
    "yunmin311/cha": { outcome: "ok", lastCommitAt: daysAgo(1),   lines: 1000 },
  }
  const picked = select(p, s, { ...cfg, workSlots: 1, hysteresisDays: 14 }, NOW, ["inc"]).picked.map((x) => x.key)
  assert.deepEqual(picked, ["cha"], `expected cha to take over, got ${picked}`)
})

t("hysteresis never keeps a project that is no longer eligible", () => {
  // An incumbent whose key has been REMOVED from config does not retain a
  // seat — that is an author's decision, not a collection failure, so it is
  // filtered out of the hold rather than protected by it.
  //
  // `only` here is unmeasured, so the run holds and its previous membership is
  // `["deleted-project"]`. That key no longer exists, so the held set is empty
  // — which is correct, and is the distinction this case pins down: `held`
  // protects the CAST, it does not invent seats.
  const gone = normalise({ projects: [{ ...base.projects[0], key: "only" }] })
  const r = select(gone, {}, { ...cfg, workSlots: 2 }, NOW, ["deleted-project"])
  assert.deepEqual(r.picked.map((p) => p.key), [], `got ${r.picked.map((p) => p.key)}`)

  // And with a real reading for `only`, the same previous state seats it — so
  // the empty result above is the missing key at work, not the hold refusing
  // to seat anything.
  const measured = select(gone, { "yunmin311/only": { outcome: "ok", lastCommitAt: daysAgo(3) } }, { ...cfg, workSlots: 2 }, NOW, ["deleted-project"])
  assert.deepEqual(measured.picked.map((p) => p.key), ["only"])
  assert.equal(measured.held, false)
})

t("selection is stable across identical runs", () => {
  const a = select(normalise(cfg), sig, cfg, NOW, null).picked.map((p) => p.key)
  const b = select(normalise(cfg), sig, cfg, NOW, null).picked.map((p) => p.key)
  assert.deepEqual(a, b)
})

t("pinned membership is honoured when the signal is unchanged", () => {
  const first = select(normalise(cfg), sig, cfg, NOW, null).picked.map((p) => p.key)
  const second = select(normalise(cfg), sig, cfg, NOW, first).picked.map((p) => p.key)
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
    "yunmin311/shown": { outcome: "ok", lastCommitAt: daysAgo(2) },
    "yunmin311/hidden": { outcome: "ok", lastCommitAt: daysAgo(40) },
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
    "yunmin311/shown": { outcome: "ok", lastCommitAt: daysAgo(200) },
    "yunmin311/hidden": { outcome: "ok", lastCommitAt: daysAgo(1) },
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

/* ------------------------------------------------------- the signal contract */

console.log("\nsignalState — fresh / stale / unknown are three things")

t("a successful measurement with a date is fresh", () => {
  assert.equal(signalState({ outcome: "ok", lastCommitAt: daysAgo(3) }), "fresh")
})

t("a successful measurement of ZERO commits is stale, not unknown", () => {
  // The repository cloned, its whole history was read, and none of it is mine.
  // That is real evidence and it is entitled to lose a card. Collapsing it into
  // "unknown" would make it permanently un-retirable.
  assert.equal(signalState({ outcome: "ok", lastCommitAt: null, commits: 0 }), "stale")
})

t("a failed collection is unknown, never stale", () => {
  // THE BUG. A five-second clone failure used to arrive as `lastCommitAt: null`
  // and score the same floor a genuinely abandoned project gets.
  assert.equal(signalState({ outcome: "failed", lastCommitAt: null, reason: "clone failed" }), "unknown")
})

t("a repository that was never requested is unknown", () => {
  assert.equal(signalState(undefined), "unknown")
})

t("an unknown age is not infinite", () => {
  // `Infinity` here would make every staleness comparison read as "not stale"
  // on a run whose evidence was incomplete.
  assert.equal(recencyOf("yunmin311/a", { "yunmin311/a": { outcome: "failed" } }, NOW), null)
})

/* ---------------------------------------------------------- fail-closed rule */

console.log("\nselect — a collection failure cannot change the cast")

// The previously displayed set, healthy. Every case below starts from this.
const INCUMBENTS = ["inc1", "inc2"]
const ROSTER = [
  { key: "inc1" },
  { key: "inc2" },
  { key: "challenger" },
  { key: "unrelated" },
]
const roster = normalise({
  projects: [
    ...ROSTER.map((r) => ({ ...base.projects[0], key: r.key })),
    // One extra, so `workSlots: 2` leaves the challenger genuinely outside.
    { ...base.projects[0], key: "spare" },
  ],
})
const held = (next, slots = 2) =>
  select(roster, next, { ...cfg, workSlots: slots }, NOW, INCUMBENTS)

/** A healthy reading everyone in the fixture starts from. */
const healthy = {
  "yunmin311/inc1": { outcome: "ok", lastCommitAt: daysAgo(10), lines: 5000 },
  "yunmin311/inc2": { outcome: "ok", lastCommitAt: daysAgo(12), lines: 4000 },
  "yunmin311/challenger": { outcome: "ok", lastCommitAt: daysAgo(400), lines: 100 },
  "yunmin311/unrelated": { outcome: "ok", lastCommitAt: daysAgo(300), lines: 100 },
  "yunmin311/spare": { outcome: "ok", lastCommitAt: daysAgo(350), lines: 100 },
}

t("an INCUMBENT that fails to clone keeps its seat", () => {
  // THE BLOCKER, in one case. inc1 is being built every day; a transient clone
  // failure must not read as "inc1 has gone quiet" and hand its card to
  // somebody else for six hours. The CAST is what must not move — the order
  // inside it is recomputed from whatever readings exist, and it legitimately
  // changes, because the two incumbents' ages are still known while the
  // challengers' are not.
  const r = held({ ...healthy, "yunmin311/inc1": { outcome: "failed", reason: "clone failed" } })
  assert.deepEqual([...r.picked.map((p) => p.key)].sort(), [...INCUMBENTS].sort(), JSON.stringify(r.picked.map((p) => p.key)))
  assert.equal(r.picked.find((p) => p.key === "inc1")._state, "unknown", "the held project must be marked unmeasured")
  assert.equal(r.held, true, "the run must report that it held")
})

t("a CHALLENGER that fails to clone cannot take a seat", () => {
  // Same rule, other direction: an unmeasured challenger has no score to argue
  // with, so it may not displace a measured incumbent.
  const r = held({ ...healthy, "yunmin311/challenger": { outcome: "failed", reason: "clone failed" } })
  assert.deepEqual(r.picked.map((p) => p.key), INCUMBENTS)
})

t("an UNRELATED candidate failing does not perturb a healthy ordering", () => {
  // The run cannot know where the missing project belonged in the ranking, so
  // it declines to reorder — even though nobody was going to display it.
  const r = held({ ...healthy, "yunmin311/unrelated": { outcome: "failed", reason: "clone failed" } })
  assert.deepEqual(r.picked.map((p) => p.key), INCUMBENTS)
  assert.equal(r.held, true)
  assert.ok(r.unmeasured.includes("unrelated"), `unmeasured was ${r.unmeasured}`)
})

t("all signals healthy + a decisive challenger = normal replacement", () => {
  // The fail-closed rule must not become a freeze. When the evidence IS
  // complete, two projects being built today take the cards from two that are
  // not — the guard only ever asks a challenger to lead by `hysteresisDays`.
  // Nine days is not enough, which is the guard doing its job, so this fixture
  // gives the challengers a decisive lead rather than a marginal one.
  const r = held({
    ...healthy,
    "yunmin311/inc1": { outcome: "ok", lastCommitAt: daysAgo(400), lines: 100 },
    "yunmin311/inc2": { outcome: "ok", lastCommitAt: daysAgo(420), lines: 100 },
    "yunmin311/challenger": { outcome: "ok", lastCommitAt: daysAgo(1), lines: 60000 },
    "yunmin311/spare": { outcome: "ok", lastCommitAt: daysAgo(1), lines: 50000 },
  })
  assert.deepEqual([...r.picked.map((p) => p.key)].sort(), ["challenger", "spare"], `got ${r.picked.map((p) => p.key)}`)
  assert.equal(r.held, false, "a complete run must not report a hold")
})

t("a complete run is a no-op when nothing has really changed", () => {
  // The fail-closed rule must not only permit replacement — it must also permit
  // the ordinary case, where the incumbents are still the strongest thing in
  // the pool and simply stay. A rule that held OR replaced on every run would
  // make the state file churn and the page flicker.
  const r = held(healthy)
  assert.deepEqual(r.picked.map((p) => p.key), INCUMBENTS, `got ${r.picked.map((p) => p.key)}`)
  assert.equal(r.held, false)
})

t("a first build has nothing to protect and seats on what it has", () => {
  // `prev` is null: there is no membership to hold, so an incomplete run is
  // allowed to produce one — held must not be true, or the build would refuse
  // to write the very state file the next run needs.
  const r = select(roster, { ...healthy, "yunmin311/inc1": { outcome: "failed" } }, { ...cfg, workSlots: 2 }, NOW, null)
  assert.equal(r.held, false)
  assert.equal(r.picked.length, 2)
})

t("a genuinely inactive incumbent still loses the seat", () => {
  // The mirror of fail-closed: `stale` is real evidence, so it must still be
  // able to retire even though `unknown` cannot.
  const r = held({
    ...healthy,
    "yunmin311/inc1": { outcome: "ok", lastCommitAt: null, commits: 0, lines: 0 },
    "yunmin311/inc2": { outcome: "ok", lastCommitAt: null, commits: 0, lines: 0 },
    "yunmin311/challenger": { outcome: "ok", lastCommitAt: daysAgo(1), lines: 60000 },
  })
  assert.ok(r.picked.some((p) => p.key === "challenger"), `challenger should be seated, got ${r.picked.map((p) => p.key)}`)
  assert.equal(r.held, false)
})

t("the hold is reported, not silent", () => {
  const r = held({ ...healthy, "yunmin311/inc2": { outcome: "failed", reason: "clone failed: timeout" } })
  assert.equal(r.held, true)
  assert.match(String(r.reason), /could not be measured/)
  assert.deepEqual(r.unmeasured, ["inc2"])
})
t("every result row says which of the three readings it carries", () => {
  const r = held({ ...healthy, "yunmin311/inc1": { outcome: "failed" } })
  for (const p of r.picked) {
    assert.ok(["fresh", "stale", "unknown"].includes(p._state), `${p.key} has _state=${p._state}`)
  }
  assert.equal(r.picked.find((p) => p.key === "inc1")._state, "unknown")
  assert.equal(r.picked.find((p) => p.key === "inc2")._state, "fresh")
})

/* --------------------------------------------------- one snapshot, used twice */

console.log("\nsingle-pass — the two panels read one measurement")

// Snapshots in the shape lib/authored.mjs returns: one per requested repo,
// carrying outcome, recency, lines AND per-language totals together.
const snapshot = (repo, { days = 1, lines = 1000, langs = { TypeScript: 1000 } } = {}) => ({
  repo,
  outcome: "ok",
  reason: null,
  commits: 5,
  lines,
  languages: langs,
  lastCommitAt: days == null ? null : daysAgo(days),
})
const failedSnap = (repo) => unknown(repo, "clone failed: transient")

t("signalsFrom keeps the outcome, so unknown survives the crossing", () => {
  const signal = signalsFrom([snapshot("yunmin311/a"), failedSnap("yunmin311/b")])
  assert.equal(signalState(signal["yunmin311/a"]), "fresh")
  assert.equal(signalState(signal["yunmin311/b"]), "unknown", "a failure must not arrive as a reading")
})

t("Selection and Language Signal are derived from the SAME snapshots", () => {
  // THE PROPERTY. Reproduce the pipeline's shape without a network: one set of
  // snapshots feeds the rule; the rule's choice picks a subset OF THOSE, and
  // the chart folds that subset. Nothing here can re-measure anything, which is
  // the point — if a second collection were reintroduced, this test would need
  // a second snapshot set to pass and would no longer compile against one.
  const pool = normalise({ projects: [
    { ...base.projects[0], key: "hot", languages: "count" },
    { ...base.projects[0], key: "warm", languages: "count" },
    { ...base.projects[0], key: "cold", languages: "count" },
  ] })
  const snapshots = [
    snapshot("yunmin311/hot", { days: 1, langs: { TypeScript: 9000, CSS: 1000 } }),
    snapshot("yunmin311/warm", { days: 5, langs: { Rust: 3000 } }),
    snapshot("yunmin311/cold", { days: 400, langs: { Python: 50000 } }),
  ]
  const byRepo = new Map(snapshots.map((s) => [s.repo, s]))
  const signal = signalsFrom(snapshots)

  const { picked } = select(pool, signal, { ...cfg, workSlots: 2 }, NOW, null)
  const scope = languageRepos(picked)
  const stats = aggregateLanguages(scope.map((repo) => byRepo.get(repo)))

  // The chart covers exactly the displayed set…
  assert.deepEqual(scope.sort(), ["yunmin311/hot", "yunmin311/warm"])
  assert.equal(stats.snapshots.length, scope.length)
  // …and the numbers come from those snapshots: cold's 50k Python lines are
  // NOT in the total, which is what "the scope is the displayed set" means.
  assert.equal(stats.ranked.find((l) => l.name === "Python"), undefined, "an unshown project's lines leaked in")
  assert.equal(stats.totalLines, 9000 + 1000 + 3000)
  assert.equal(stats.ranked[0].name, "TypeScript")
})

t("aggregateLanguages folds a partial set and reports it as partial", () => {
  const stats = aggregateLanguages([
    snapshot("yunmin311/a", { langs: { TypeScript: 100 } }),
    failedSnap("yunmin311/b"),
  ])
  assert.equal(stats.okCount, 1)
  assert.equal(stats.failedCount, 1, "a partial reading must be able to say it is partial")
  assert.equal(stats.totalLines, 100, "a failed repo contributes nothing, not a guess")
})

t("an empty scope is zero, not a crash", () => {
  const stats = aggregateLanguages([])
  assert.deepEqual(stats.ranked, [])
  assert.equal(stats.totalLines, 0)
})

/* -------------------------------------------------------------- the shipped */

console.log("\nthe shipped configuration")

t("every selected project has non-empty card copy", () => {
  for (const p of select(normalise(cfg), {}, cfg, NOW, null).picked) {
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
