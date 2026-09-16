/**
 * Tests for the SELECTED WORK / LANGUAGE SIGNAL data model.
 *
 * WHY THIS FILE EXISTS. The card grid is driven by data this repository does not
 * own — the pinned repositories on the GitHub profile, and the descriptions and
 * topics that come with them. A regression here is not a broken build; it is a
 * page that quietly shows the wrong projects, or the right projects with copy
 * that got truncated to nothing, or a language chart measuring a different set
 * of repositories than the cards above it. None of those are visible in a green
 * build. These tests pin the rule down so a change to it has to be deliberate.
 *
 * The four claims worth stating plainly, because everything below is one of
 * them:
 *
 *   1. MEMBERSHIP IS THE PINS. Not the most recent, not the most active, not a
 *      config array. Order is the pin order. Fewer pins means fewer cards.
 *   2. CONFIG CANNOT CHANGE MEMBERSHIP. It supplies words, and nothing else.
 *   3. A FAILED READ HOLDS. It never substitutes a ranking, and it never empties
 *      the grid or zeroes the chart.
 *   4. THE TWO PANELS ANSWER TWO QUESTIONS. The cards are the pinned shortlist;
 *      the chart measures every public repository the account owns, read with
 *      pagination. Deriving one scope from the other is the regression this file
 *      exists to catch.
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

import { W_HALF, W_FULL, W_MOBILE, S, THEME, width, MICRO } from "./lib/design.mjs"
import {
  slug, cardOverrides, cardFrom, cardsFrom, countsTowardLanguages, languageScope, languageNote,
  LANGUAGES_CAPTION, resolveCards, signalState,
} from "./lib/projects.mjs"
import { CARD_COPY, fitCopy, fitTags, fitsCard, fitsTags, TAG_LINES, TAG_MAX, wrap as panelWrap } from "./lib/cards.mjs"
import { cardLink, cardLinks, escapeAttr } from "./lib/readme.mjs"
import { unknown } from "./lib/sources.mjs"
import { pageThrough } from "./lib/gh.mjs"
import { aggregateLanguages } from "./lib/authored.mjs"
// The real drawing code, and the real budget it draws to. `wrap` is imported
// from lib/cards.mjs because that is the single definition both the panel and
// the truncation use; `DESKTOP`/`MOBILE` come from the panel so the assertion
// below is about what the panel actually does, not about a copy of it.
import { card as drawCard, DESKTOP, MOBILE } from "./panels/work.mjs"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const cfgRaw = await readFile(resolve(ROOT, "scripts/config.json"), "utf8")
const cfg = JSON.parse(cfgRaw)

let pass = 0
let fail = 0
const t = (name, fn) => {
  try { fn(); console.log(`  ok   ${name}`); pass++ }
  catch (err) { console.error(`  FAIL ${name}\n       ${err.message.split("\n")[0]}`); fail++ }
}
const tAsync = async (name, fn) => {
  try { await fn(); console.log(`  ok   ${name}`); pass++ }
  catch (err) { console.error(`  FAIL ${name}\n       ${err.message.split("\n")[0]}`); fail++ }
}

/* ---------------------------------------------------------------- fixtures */

/** A pinned repository, shaped exactly like the GraphQL node. */
const repo = (name, extra = {}) => ({
  name,
  nameWithOwner: `yunmin311/${name}`,
  url: `https://github.com/yunmin311/${name}`,
  description: null,
  primaryLanguage: null,
  repositoryTopics: { nodes: [] },
  ...extra,
})
const topics = (...names) => ({ nodes: names.map((n) => ({ topic: { name: n } })) })

const A = repo("alpha", { description: "Alpha does a thing.", primaryLanguage: { name: "Rust" }, repositoryTopics: topics("cli", "rust") })
const B = repo("beta", { description: "Beta does another thing.", primaryLanguage: { name: "TypeScript" } })
const C = repo("gamma", { description: "Gamma.", primaryLanguage: { name: "Go" } })
const D = repo("delta", { description: "Delta.", primaryLanguage: { name: "C" } })
const E = repo("epsilon", { description: "Epsilon.", primaryLanguage: { name: "Zig" } })
const F = repo("zeta", { description: "Zeta.", primaryLanguage: { name: "Nim" } })
const six = [A, B, C, D, E, F]
const namesOf = (cards) => cards.map((c) => c.repo)
const keysOf = (cards) => cards.map((c) => c.key)

const snapOk = (repo_, lastCommitAt = "2026-09-01T00:00:00Z", languages = { Rust: 10 }, commits = 1) =>
  ({ repo: repo_, outcome: "ok", reason: null, lastCommitAt, commits, lines: 10, languages })

/* =========================================================== 1. THE PINS */

console.log("\nmembership — the pins, and nothing else")

t("pinned A..F gives exactly A..F, in pin order", () => {
  const cards = cardsFrom(six)
  assert.deepEqual(namesOf(cards), six.map((r) => r.nameWithOwner))
})

t("pin order changes and the cards follow it", () => {
  const shuffled = [F, C, A, E, B, D]
  assert.deepEqual(namesOf(cardsFrom(shuffled)), shuffled.map((r) => r.nameWithOwner))
})

t("replacing one pin replaces exactly that one card", () => {
  const before = namesOf(cardsFrom(six))
  const omega = repo("omega", { description: "Omega." })
  const after = namesOf(cardsFrom(six.map((r) => (r === D ? omega : r))))
  assert.equal(after.length, before.length, "a swap must not change the count")
  assert.deepEqual(after, before.map((n) => (n === "yunmin311/delta" ? "yunmin311/omega" : n)))
})

t("fewer than six pins shows fewer cards — nothing is padded in", () => {
  const three = cardsFrom([A, B, C])
  assert.equal(three.length, 3)
  assert.deepEqual(namesOf(three), [A, B, C].map((r) => r.nameWithOwner))
})

t("no pins at all gives no cards, rather than a fallback set", () => {
  assert.deepEqual(cardsFrom([]), [])
})

t("config cannot add, remove or reorder a card", () => {
  // THE property that makes pins the single source of truth. An override for a
  // repository that is not pinned must contribute nothing at all — a metadata
  // file that could seat a card would be a second, quieter curation channel.
  const stray = new Map([["yunmin311/not-pinned", { name: "Stray", why: "Should never appear.", tags: ["X"] }]])
  const cards = cardsFrom([A, B], stray)
  assert.deepEqual(namesOf(cards), ["yunmin311/alpha", "yunmin311/beta"])
})

t("overrides are matched case-insensitively", () => {
  const o = new Map([["yunmin311/alpha", { name: "Named", why: "Named copy.", tags: ["One"] }]])
  assert.equal(cardFrom(repo("Alpha"), o).name, "Named")
})

t("two pins whose names slug the same are rejected by name", () => {
  assert.throws(() => cardsFrom([repo("My-Repo"), repo("my repo")]), /share the card key/)
})

t("a pin with no usable name is rejected", () => {
  assert.throws(() => cardFrom(repo("---")), /no usable name/)
})

/* ====================================================== 2. THE CARD MODEL */

console.log("\ncard metadata — override, or the repository's own facts")

t("an override supplies name, why and tags verbatim", () => {
  const o = new Map([["yunmin311/alpha", { name: "Alpha Card", why: "Hand-written sentence.", tags: ["One", "Two"] }]])
  const c = cardFrom(A, o)
  assert.equal(c.name, "Alpha Card")
  assert.equal(c.why, "Hand-written sentence.")
  assert.deepEqual(c.tags, ["One", "Two"])
  assert.equal(c.unedited, false)
})

t("an unknown pin builds its card from description, language and topics", () => {
  const c = cardFrom(A)
  assert.equal(c.key, "alpha")
  assert.equal(c.name, "alpha")
  assert.equal(c.why, "Alpha does a thing.")
  assert.equal(c.url, "https://github.com/yunmin311/alpha")
  assert.equal(c.repo, "yunmin311/alpha")
  assert.deepEqual(c.tags, ["Rust", "cli"])
  assert.equal(c.unedited, true)
})

t("an empty description falls back to the repository name, and invents nothing", () => {
  const c = cardFrom(repo("bare"))
  assert.equal(c.why, "bare")
})

t("tags drop a case-insensitive duplicate of the primary language", () => {
  const r = repo("dup", { primaryLanguage: { name: "TypeScript" }, repositoryTopics: topics("typescript", "other") })
  const tags = cardFrom(r).tags
  assert.deepEqual(tags, ["TypeScript", "other"])
})

t("tags are capped and de-duplicated", () => {
  const r = repo("many", { primaryLanguage: { name: "Go" }, repositoryTopics: topics("a", "b", "c", "d", "e", "f", "A") })
  const tags = cardFrom(r).tags
  assert.ok(tags.length <= TAG_MAX, `expected <= ${TAG_MAX} tags, got ${tags.length}`)
  assert.equal(new Set(tags.map((x) => x.toLowerCase())).size, tags.length)
})

t("a tag-less repository still produces a card", () => {
  const c = cardFrom(repo("plain", { description: "Plain." }))
  assert.deepEqual(c.tags, [])
})

t("the key is a stable, filename-safe slug of the repository name", () => {
  assert.equal(slug("Yunmin-Workbench"), "yunmin-workbench")
  assert.equal(slug("DenseGPT"), "densegpt")
  assert.equal(slug("a b/c"), "a-b-c")
  for (const repo_ of Object.keys(cfg.cardOverrides)) {
    assert.match(slug(repo_.split("/")[1]), /^[a-z0-9][a-z0-9-]*$/, `${repo_} does not slug to a filename-safe key`)
  }
})

/* ============================== 3. THE COPY BUDGET IS HARD BUT NOT FATAL */

console.log("\ncopy budget — truncated, never fatal")

const inner = { desktop: W_HALF - S.sm * 2, mobile: W_MOBILE - S.sm * 2 }
const fitsPanel = (text) =>
  panelWrap(text, inner.desktop).length <= CARD_COPY.desktop.lines &&
  panelWrap(text, inner.mobile).length <= CARD_COPY.mobile.lines

t("the budget is derived from the layout, not typed in twice", () => {
  assert.equal(CARD_COPY.desktop.inner, inner.desktop)
  assert.equal(CARD_COPY.mobile.inner, inner.mobile)
  assert.equal(CARD_COPY.desktop.max, Math.floor(inner.desktop / 7))
  assert.equal(CARD_COPY.mobile.max, Math.floor(inner.mobile / 7))
  // The property that matters: the panel draws to the same budget the data
  // layer truncates against. If these ever diverge, a pin with a long
  // description fails the build forever and nothing in this repository can fix
  // it.
  assert.equal(DESKTOP.lines, CARD_COPY.desktop.lines)
  assert.equal(MOBILE.lines, CARD_COPY.mobile.lines)
  assert.equal(DESKTOP.w - S.sm * 2, CARD_COPY.desktop.inner)
  assert.equal(MOBILE.w - S.sm * 2, CARD_COPY.mobile.inner)
})

const LONG = "A tool that does a very specific thing for a very specific person, " +
  "written because the alternative was doing it by hand every single week and " +
  "getting it slightly wrong in a different way each time, which is the kind of " +
  "thing that eventually becomes a spreadsheet nobody understands."

t("a long description is truncated rather than thrown", () => {
  const c = cardFrom(repo("long", { description: LONG }))
  assert.ok(c.why.length < LONG.length)
  assert.ok(c.why.endsWith("…"), "truncation should be marked")
  assert.ok(fitsPanel(c.why), `truncated copy still does not fit: ${JSON.stringify(c.why)}`)
})

t("the truncated copy passes the SAME wrap the panel measures with", () => {
  for (const text of [LONG, LONG + " " + LONG, "word ".repeat(200)]) {
    const why = fitCopy(text)
    assert.ok(fitsPanel(why), `not drawable:\n  ${JSON.stringify(why)}`)
  }
})

t("a truncated card can actually be drawn, on both layouts", () => {
  // The strongest form of the claim: not "it looks like it fits" but "the real
  // drawing code does not throw". This is what a new pin hits in production.
  for (const text of [LONG, LONG + " " + LONG, "word ".repeat(300), "x".repeat(400), "a-b-c-".repeat(60)]) {
    const c = cardFrom(repo("drawn", { description: text }), new Map())
    assert.doesNotThrow(() => drawCard(THEME, c, cfg, { mobile: false }), "desktop draw threw")
    assert.doesNotThrow(() => drawCard(THEME, c, cfg, { mobile: true }), "mobile draw threw")
  }
})

t("whitespace, tabs, newlines and emoji are normalised before measuring", () => {
  const messy = repo("messy", { description: "  line one\n\nline\ttwo   with   runs  🚀 of space  " })
  const why = cardFrom(messy).why
  assert.ok(!/[\n\t]/.test(why), "newlines or tabs survived")
  assert.ok(!/\s{2,}/.test(why), "repeated spaces survived")
  assert.ok(!/🚀/.test(why), "an emoji survived into the bitmap face")
})

t("an unbreakable token longer than a line still yields a drawable card", () => {
  const token = "https://example.com/" + "a".repeat(300)
  const why = fitCopy(token)
  assert.ok(why.length <= CARD_COPY.mobile.max, `hard trim left ${why.length} characters, budget is ${CARD_COPY.mobile.max}`)
  assert.ok(why.endsWith("…"))
  assert.doesNotThrow(() => drawCard(THEME, cardFrom(repo("tok", { description: token })), cfg, { mobile: true }))
})

t("a description with no space in it is still kept inside the card", () => {
  // The bug this pins down: a wrapper that only breaks at spaces reports a
  // 300-character token as ONE line, which fits any line budget by count and
  // draws off the side of the card. Both layouts.
  const why = fitCopy("x".repeat(300))
  for (const layout of ["desktop", "mobile"]) {
    const lines = panelWrap(why, CARD_COPY[layout].inner)
    assert.ok(lines.length <= CARD_COPY[layout].lines, `${layout}: ${lines.length} lines`)
    for (const l of lines) assert.ok(l.length <= CARD_COPY[layout].max, `${layout}: a line is ${l.length} wide`)
  }
})

t("truncation cuts at a word boundary", () => {
  // Every word in the result has to be a word that was in the source — a
  // cheaper and stricter way of saying "it did not stop in the middle of one".
  const why = fitCopy(LONG)
  const whole = new Set(LONG.split(/\s+/).map((w) => w.replace(/[.,!?;:]+$/, "")))
  for (const word of why.slice(0, -1).split(" ")) {
    assert.ok(whole.has(word.replace(/[.,!?;:]+$/, "")), `partial word in the truncation: ${JSON.stringify(word)}`)
  }
})

t("copy that already fits is left alone", () => {
  assert.equal(fitCopy("Short and complete."), "Short and complete.")
  assert.equal(fitCopy(""), "")
})

t("an over-wide tag run is reduced until it fits, keeping the first tag", () => {
  const wide = ["extraordinarily-long-language-name", "another-extremely-long-tag", "third-very-long-tag", "fourth-long-tag"]
  const tags = fitTags(wide)
  assert.ok(tags.length < wide.length, "nothing was dropped")
  assert.equal(tags[0], wide[0], "the first tag (the primary language) should survive")
  assert.ok(
    panelWrap(tags.join(" · "), inner.desktop).length <= TAG_LINES &&
      panelWrap(tags.join(" · "), inner.mobile).length <= TAG_LINES
  )
})

t("hands-written copy is validated, not truncated", () => {
  // The asymmetry that matters: a human who overran can shorten it, so failing
  // loudly produces better copy than a silent cut would.
  assert.ok(fitsCard("A short hand-written sentence."))
  assert.ok(!fitsCard(LONG))
  assert.ok(fitsTags(["A", "B"]))
})

/* ========================================================= 4. FAIL CLOSED */

console.log("\nfail-closed — a read that fails holds, and never ranks")

const knownGood = { cards: cardsFrom(six) }

t("a failed pinned read holds the last known-good cards, unchanged", () => {
  const r = resolveCards({ pins: null, pinnedError: "503 rate limited", overrides: new Map(), lastKnownGood: knownGood })
  assert.equal(r.held, true)
  assert.deepEqual(keysOf(r.cards), keysOf(knownGood.cards))
  assert.match(r.holdReason, /503/)
})

t("a failed read on a first ever build fails loudly instead of drawing nothing", () => {
  assert.throws(
    () => resolveCards({ pins: null, pinnedError: "ETIMEDOUT", overrides: new Map(), lastKnownGood: null }),
    /cannot be drawn/
  )
})

t("an empty pin list is an answer, not a failure", () => {
  // The author unpinned everything. That is a decision and the page follows it —
  // it must NOT be confused with "we could not ask", which is the case above.
  const r = resolveCards({ pins: [], pinnedError: null, overrides: new Map(), lastKnownGood: knownGood })
  assert.equal(r.held, false)
  assert.deepEqual(r.cards, [])
})

t("held cards keep their wording, not just their names", () => {
  const withCopy = { cards: cardsFrom(six, new Map([["yunmin311/alpha", { name: "Alpha", why: "Kept sentence.", tags: ["One"] }]])) }
  const r = resolveCards({ pins: null, pinnedError: "boom", overrides: new Map(), lastKnownGood: withCopy })
  assert.equal(r.cards.find((c) => c.key === "alpha").why, "Kept sentence.")
})

t("a failed read consults no activity data of any kind", () => {
  // The rule takes pins and a previous card set. Nothing else is even an input,
  // so there is no ranking it could fall back to — this pins that down by
  // handing it a decoy full of the signals the old rule ranked on.
  const decoy = {
    activity: { "yunmin311/hot": { lastCommitAt: new Date().toISOString(), lines: 999999 } },
    scores: { "yunmin311/hot": 0.99 },
    recentPushes: ["yunmin311/hot", "yunmin311/hotter"],
    stars: { "yunmin311/hot": 5000 },
  }
  const r = resolveCards({ pins: null, pinnedError: "boom", overrides: new Map(), lastKnownGood: knownGood, ...decoy })
  assert.deepEqual(keysOf(r.cards), keysOf(knownGood.cards))
  assert.ok(!keysOf(r.cards).includes("hot"), "a ranked fallback leaked in")
})

/* ======================================================== 5. LANGUAGE SCOPE */

console.log("\nlanguage scope — every public repository the account owns")

/** A repository node, shaped exactly like the GraphQL connection returns it. */
const owned = (name, extra = {}) => ({
  nameWithOwner: `yunmin311/${name}`,
  isFork: false,
  isArchived: false,
  visibility: "PUBLIC",
  ...extra,
})

t("the scope is the account's public repositories, in the order given", () => {
  const list = [owned("alpha"), owned("beta"), owned("gamma")]
  assert.deepEqual(languageScope(list, "yunmin311"), [
    "yunmin311/alpha",
    "yunmin311/beta",
    "yunmin311/gamma",
  ])
})

t("forks are not counted", () => {
  assert.deepEqual(languageScope([owned("alpha"), owned("forked", { isFork: true })], "yunmin311"), ["yunmin311/alpha"])
})

t("archived repositories are not counted", () => {
  assert.deepEqual(languageScope([owned("alpha"), owned("old", { isArchived: true })], "yunmin311"), ["yunmin311/alpha"])
})

t("non-public repositories are not counted", () => {
  const list = [owned("alpha"), owned("secret", { visibility: "PRIVATE" }), owned("inner", { visibility: "INTERNAL" })]
  assert.deepEqual(languageScope(list, "yunmin311"), ["yunmin311/alpha"])
})

t("the profile repository itself is not counted", () => {
  assert.deepEqual(languageScope([owned("yunmin311"), owned("alpha")], "yunmin311"), ["yunmin311/alpha"])
  // Compared case-insensitively: a login is not case-sensitive, and letting the
  // profile repository into its own chart is the one exclusion whose absence
  // would be immediately visible on the page.
  assert.deepEqual(languageScope([owned("YunMin311")], "yunmin311"), [])
})

t("the scope is NOT the pinned cards", () => {
  // The whole point of this change. A repository with no card at all is still
  // counted, and a repository that was never pinned is still counted.
  const cards = cardsFrom([A, B])
  assert.deepEqual(keysOf(cards), ["alpha", "beta"])
  const list = [owned("alpha"), owned("never-pinned"), owned("also-never-pinned")]
  assert.deepEqual(languageScope(list, "yunmin311"), [
    "yunmin311/alpha",
    "yunmin311/never-pinned",
    "yunmin311/also-never-pinned",
  ])
})

t("nothing in config can widen or narrow the scope", () => {
  const overrides = cardOverrides({ cardOverrides: { "yunmin311/alpha": { why: "x", tags: ["X"] } } })
  assert.equal(overrides.size, 1, "the overlay is words, not scope")
  assert.deepEqual(languageScope([owned("alpha"), owned("beta")], "yunmin311"), [
    "yunmin311/alpha",
    "yunmin311/beta",
  ])
})

await tAsync("pagination walks every page, not just the first hundred", async () => {
  const pages = [
    { nodes: [owned("a")], pageInfo: { hasNextPage: true, endCursor: "c1" } },
    { nodes: [owned("b")], pageInfo: { hasNextPage: true, endCursor: "c2" } },
    { nodes: [owned("c")], pageInfo: { hasNextPage: false, endCursor: "c3" } },
  ]
  const asked = []
  const all = await pageThrough(async (after) => {
    asked.push(after)
    return pages[asked.length - 1]
  })
  assert.equal(asked.length, 3, "stopped before the last page")
  assert.deepEqual(asked, [null, "c1", "c2"], "the cursor was not carried forward")
  assert.deepEqual(all.map((r) => r.nameWithOwner), ["yunmin311/a", "yunmin311/b", "yunmin311/c"])
})

await tAsync("a cursor that never advances fails instead of looping", async () => {
  await assert.rejects(
    () => pageThrough(async () => ({ nodes: [owned("a")], pageInfo: { hasNextPage: true, endCursor: null } })),
    /did not advance/
  )
})

await tAsync("a connection that never ends eventually gives up", async () => {
  let n = 0
  await assert.rejects(
    () => pageThrough(
      async () => ({ nodes: [owned("a")], pageInfo: { hasNextPage: true, endCursor: `c${++n}` } }),
      { maxPages: 3 }
    ),
    /refusing to loop/
  )
})

t("the panel's caption fits the column it is drawn in", () => {
  // Tracked at 1px, so a glyph costs adv + 1. The phone column gets a fixed
  // short caption instead, so only the desktop width has to hold.
  const drawn = width(LANGUAGES_CAPTION, MICRO, 1)
  assert.ok(drawn <= W_FULL - S.sm * 2, `caption is ${drawn}px, the column is ${W_FULL - S.sm * 2}px`)
})

t("the panel's note survives the lines it is allowed", () => {
  // The panel does `.slice(0, mobile ? 3 : 2)` on the note, SILENTLY — a
  // sentence that grew past the budget would ship cut in half with nothing
  // anywhere reporting it. The scope became the whole account in this change,
  // which is exactly the kind of growth that would do it.
  const inner = { desktop: W_FULL - S.sm * 2, mobile: W_MOBILE - S.sm * 2 }
  for (const shape of [
    { commits: 350, measured: 15, scope: 15, partial: false },
    { commits: 12345, measured: 156, scope: 156, partial: false },
    { commits: 99999, measured: 999, scope: 999, partial: false },
  ]) {
    const note = languageNote(shape)
    const d = panelWrap(note, inner.desktop).length
    const m = panelWrap(note, inner.mobile).length
    assert.ok(d <= 2, `${JSON.stringify(shape)} needs ${d} desktop lines (budget 2)`)
    assert.ok(m <= 3, `${JSON.stringify(shape)} needs ${m} mobile lines (budget 3)`)
  }
})

t("a partial reading says how many repositories it covered", () => {
  assert.match(languageNote({ commits: 10, measured: 13, scope: 15, partial: true }), /13 of 15 public repos/)
  assert.match(languageNote({ commits: 10, measured: 15, scope: 15, partial: false }), /across 15 public repos/)
  assert.match(languageNote({ commits: 1, measured: 1, scope: 1, partial: false }), /across 1 public repo\./)
})

t("an unmeasured repository is unavailable, never inactive and never zero", () => {
  assert.equal(signalState(unknown("yunmin311/alpha", "clone failed")), "unknown")
  assert.equal(signalState(undefined), "unknown")
})

t("a successful read with no commits by me is 'stale' — real evidence of zero", () => {
  assert.equal(signalState(snapOk("yunmin311/alpha", null)), "stale")
  assert.equal(signalState(snapOk("yunmin311/beta", "2026-09-01T00:00:00Z")), "fresh")
})

t("a failed measurement contributes nothing and is reported as a hole", () => {
  const good = snapOk("yunmin311/alpha", "2026-09-01T00:00:00Z", { Rust: 100 }, 4)
  const bad = unknown("yunmin311/beta", "clone failed")
  const stats = aggregateLanguages([good, bad])
  assert.equal(stats.okCount, 1)
  assert.equal(stats.failedCount, 1)
  assert.equal(stats.totalLines, 100, "the failed repository must not contribute lines")
  assert.deepEqual(stats.ranked.map((l) => l.name), ["Rust"])
})

t("a whole scope that failed is zero-with-a-hole, not a crash", () => {
  const stats = aggregateLanguages([unknown("yunmin311/alpha", "x"), unknown("yunmin311/beta", "y")])
  assert.equal(stats.okCount, 0)
  assert.equal(stats.failedCount, 2)
  assert.equal(stats.totalLines, 0)
  assert.deepEqual(stats.ranked, [])
})

t("an empty scope is zero, not a crash", () => {
  const stats = aggregateLanguages([])
  assert.equal(stats.okCount, 0)
  assert.deepEqual(stats.ranked, [])
})

await tAsync("there is exactly one collection call site and one read of each source", async () => {
  // A source-level invariant, kept because it is the thing that would silently
  // come back: a second `authoredSnapshots` call is a second clone pass, and a
  // second read of either list is a second chance for two panels to see
  // different sources. Neither would fail any behavioural test above.
  const src = await readFile(resolve(ROOT, "scripts/lib/sources.mjs"), "utf8")
  const counts = {
    "await authoredSnapshots(": src.match(/await authoredSnapshots\(/g) ?? [],
    "await pinnedRepos(": src.match(/await pinnedRepos\(/g) ?? [],
    "await ownedPublicRepos(": src.match(/await ownedPublicRepos\(/g) ?? [],
  }
  for (const [call, hits] of Object.entries(counts)) {
    assert.equal(hits.length, 1, `expected 1 \`${call}\`, found ${hits.length}`)
  }
})

/* ==================================================== 6. README FOLLOWS */

console.log("\nREADME — the block follows the pins")

t("the links come out in the order they were given", () => {
  const cards = cardsFrom([F, C, A])
  // Only the desktop `src` is matched: the phone variant lives in `srcset`, and
  // a looser pattern would capture `alpha-m` as a key of its own.
  const keys = [...cardLinks(cards).matchAll(/src="assets\/generated\/work-([a-z0-9-]+)\.svg"/g)].map((m) => m[1])
  assert.deepEqual(keys, keysOf(cards))
})

t("each card is one line — a wrapped link breaks the grid", () => {
  const block = cardLinks(cardsFrom(six))
  assert.equal(block.split("\n").length, 6)
  for (const line of block.split("\n")) {
    assert.ok(line.startsWith("<a href="), `not a card line: ${line.slice(0, 40)}`)
    assert.ok(line.endsWith("</picture></a>"), `not a closed card line: ${line.slice(-30)}`)
  }
})

t("every card links both variants at the key's path", () => {
  const line = cardLink(cardFrom(A))
  assert.ok(line.includes('src="assets/generated/work-alpha.svg"'))
  assert.ok(line.includes('srcset="assets/generated/work-alpha-m.svg"'))
})

t("copy with quotes and ampersands cannot break out of the attribute", () => {
  const c = cardFrom(repo("esc", { description: 'A "quoted" thing & <more>.' }))
  const line = cardLink(c)
  assert.ok(!line.includes('"quoted"'), "a raw double quote reached the markup")
  assert.ok(line.includes("&amp;"), "an ampersand was not escaped")
  // `>` is deliberately left alone: inside a quoted attribute it cannot end the
  // tag, and escaping it would only make the markup harder to read.
  assert.equal(escapeAttr('<a href="x">&'), "&lt;a href=&quot;x&quot;>&amp;")
})

/* ================================================== 7. THE SHIPPED CONFIG */

console.log("\nthe shipped configuration")

t("the ranking model is gone from config", () => {
  for (const dead of ["projects", "workSlots", "coreLeadDays", "hysteresisDays", "stalenessToleranceDays", "pinned"]) {
    assert.equal(cfg[dead], undefined, `config.${dead} should no longer exist`)
  }
})

t("the language scope options carry no repository list", () => {
  assert.equal(cfg.languageScope?.repos, undefined, "config.languageScope.repos should be gone")
  assert.equal(cfg.languageScopeOptions?.repos, undefined, "the scope comes from the account, not from config")
  assert.ok(Array.isArray(cfg.languageScopeOptions.identities) && cfg.languageScopeOptions.identities.length)
  assert.ok(Array.isArray(cfg.languageScopeOptions.exclude))
})

t("no card carries a language opt-out any more", () => {
  // The tri-state `languages` field on a card existed to keep an unsuitable
  // repository out of a chart whose scope WAS the cards. The scope is the
  // account now, so the field decides nothing — and a field that decides
  // nothing but looks like it decides something is worse than no field.
  for (const [repo_, o] of Object.entries(cfg.cardOverrides)) {
    assert.equal(o.languages, undefined, `${repo_} still declares \`languages\``)
  }
})

t("cardOverrides is an object keyed by owner/name", () => {
  assert.ok(cfg.cardOverrides && !Array.isArray(cfg.cardOverrides) && typeof cfg.cardOverrides === "object")
  const o = cardOverrides(cfg)
  assert.equal(o.size, Object.keys(cfg.cardOverrides).length)
})

t("every hand-written why in the shipped config fits a card", () => {
  for (const [repo_, o] of Object.entries(cfg.cardOverrides)) {
    assert.ok(fitsCard(o.why), `${repo_}.why does not fit`)
  }
})

t("every hand-written tag run in the shipped config fits two lines", () => {
  for (const [repo_, o] of Object.entries(cfg.cardOverrides)) {
    assert.ok(fitsTags(o.tags.slice(0, TAG_MAX)), `${repo_}.tags is too wide`)
  }
})

t("normalise rejects a bad override by name", () => {
  const bad = (over) => () => cardOverrides({ cardOverrides: { "yunmin311/x": over } })
  assert.throws(bad({ why: LONG }), /does not fit a card/)
  assert.throws(bad({ why: "" }), /non-empty string/)
  assert.throws(bad({ tags: [] }), /non-empty array/)
  assert.throws(bad({ tags: ["a".repeat(40), "b".repeat(40), "c".repeat(40), "d".repeat(40)] }), /too wide/)
  assert.throws(bad({ name: "" }), /non-empty string/)
  assert.throws(() => cardOverrides({ cardOverrides: { "not-a-repo": { why: "x" } } }), /owner\/name/)
  assert.throws(() => cardOverrides({ cardOverrides: [] }), /must be an object/)
})

/* ------------------------------------------------------------------ verdict */

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
