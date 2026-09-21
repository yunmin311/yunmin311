/**
 * WHERE SELECTED WORK AND LANGUAGE SIGNAL GET THEIR NUMBERS.
 *
 * TWO PANELS, TWO QUESTIONS, TWO SOURCES — and one collection each.
 *
 *   GraphQL -> the profile's PINNED repositories        lib/gh.mjs
 *                |
 *                +-> metadata overlay from config       lib/projects.mjs
 *                |      (falling back to the repository's own description,
 *                |       primary language and topics)
 *                |
 *                +-> SELECTED WORK cards                panels/work.mjs
 *
 *   GraphQL -> every public repository the account owns  lib/gh.mjs
 *                |      (forks, archives and the profile repo itself excluded)
 *                |
 *                +-> authoredSnapshots()  ONE clone per repository in scope
 *                        |
 *                        +-> LANGUAGE SIGNAL            panels/languages.mjs
 *
 * THEY ARE NOT THE SAME SET, AND THEY ARE NOT SUPPOSED TO BE. SELECTED WORK is
 * a curated shortlist — a claim about taste, made by hand in GitHub's pin
 * dialog. LANGUAGE SIGNAL measures the body of work that shortlist was drawn
 * from, so its scope is the whole account. Deriving the scope from the cards,
 * as an earlier version did, made every percentage a statement about whichever
 * six repositories happened to be pinned.
 *
 * What the two panels DO share is the discipline around the collection: one
 * pass, one snapshot per repository, and a failure that arrives as a value
 * ("unavailable") rather than as a silence that can be mistaken for zero.
 *
 * WHY IT MATTERS THAT THE COLLECTION IS SINGLE-PASS. Selection used to need
 * recency, so it cloned a pool; the chart then needed lines per language, so it
 * cloned the chosen six again. Two collections of the same repositories,
 * seconds apart, that could disagree — and did, whenever a clone failed in one
 * pass and not the other. Here the scope is collected once, into snapshots that
 * the chart folds, and nothing else asks for an authored analysis.
 *
 * `collect()` returns `work` in the shape BUILD and CHECK consume. `picked` is
 * cards rather than scored rows, and `staleness` is gone — there is no longer a
 * pool for the page to fall behind, because nothing is being left out.
 */

import { events, graphql, ownedPublicRepos, pinnedRepos, starred } from "./gh.mjs"
import { authoredSnapshots, aggregateLanguages } from "./authored.mjs"
import { deEmoji, clamp } from "./design.mjs"
import { ago } from "./format.mjs"
import { cardOverrides, LANGUAGES_CAPTION, languageNote, languageScope, resolveCards, signalState } from "./projects.mjs"

const HOUR = 3600e3
const DAY = 24 * HOUR
const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

export async function collect(cfg) {
  const login = cfg.login
  const offsetH = 8 // Asia/Shanghai, no DST
  const now = new Date()

  const overrides = cardOverrides(cfg)
  const options = languageOptions(cfg)

  // ---- 1. THE PINS. The only thing that decides which cards exist. ---------
  //
  // The failure here is deliberately separated from the empty case. A profile
  // with no pins answers successfully with an empty list, and an empty page is
  // then the correct rendering of a real decision. A request that could not be
  // completed answers with nothing at all, and must never be read as "the
  // author unpinned everything" — that is how a transient network error would
  // silently empty the showcase. `pinnedRepos` throws for the second case and
  // returns `[]` for the first, so the two cannot be confused here.
  let pins = null
  let pinnedError = null
  try {
    pins = await pinnedRepos(login)
  } catch (err) {
    pinnedError = String(err.message).split("\n")[0]
  }

  // ---- 2. CARDS, or the last set we could read -----------------------------
  //
  // FAIL-CLOSED, and this is the whole point of the state file. The rule itself
  // lives in `resolveCards` so it can be tested without a network; what happens
  // here is only the reporting, because the build log is where somebody finds
  // out that this run held instead of following the pins.
  const resolved = resolveCards({
    pins,
    pinnedError,
    overrides,
    lastKnownGood: cfg.__lastKnownGood ?? null,
  })
  const picked = resolved.cards
  const held = resolved.held
  const holdReason = resolved.holdReason

  if (held) {
    console.warn(`! pinned repositories could not be read: ${holdReason}`)
    console.warn(
      `! holding SELECTED WORK at the ${picked.length} card(s) the last successful run recorded — ` +
        `no fallback ranking is used, on purpose`
    )
  }

  // ---- 3. LANGUAGE SIGNAL'S SCOPE. Every public repository this account owns.
  //
  // NOT the cards. The grid is a shortlist; the chart measures the body of work
  // behind it. Deriving the scope from the cards is what made a percentage a
  // statement about whichever six repositories happened to be pinned.
  //
  // Same fail-closed shape as the pins, for the same reason: if the list cannot
  // be read, falling back to an empty scope would print "0 lines across 0
  // repositories" — a number that looks like an answer and is not one. The
  // previous run's scope is held instead, and a first run with no list to hold
  // fails loudly rather than claiming the account wrote nothing.
  let repoList = null
  let scopeError = null
  try {
    repoList = await ownedPublicRepos(login)
  } catch (err) {
    scopeError = String(err.message).split("\n")[0]
  }

  let scopeRepos
  let heldScope = false
  if (repoList) {
    scopeRepos = languageScope(repoList, login)
  } else {
    scopeRepos = cfg.__lastKnownGood?.scopeRepos ?? null
    if (!Array.isArray(scopeRepos) || !scopeRepos.length) {
      throw new Error(
        `LANGUAGE SIGNAL cannot be drawn: the repository list could not be read (${scopeError}) ` +
          `and no previous run recorded a scope to hold on to.`
      )
    }
    heldScope = true
    console.warn(`! repository list could not be read: ${scopeError}`)
    console.warn(
      `! holding LANGUAGE SIGNAL's scope at the ${scopeRepos.length} repositories the last successful run ` +
        `recorded — an unreadable list is never rendered as "zero lines"`
    )
  }

  // ---- 4. ONE collection pass, over the whole scope ------------------------
  //
  // Over the scope, and it is strictly a single pass: the chart folds exactly
  // these snapshots, and no other call site asks for an authored analysis.
  //
  // CODING RHYTHM folds the same snapshots. It used to read the public events
  // feed instead, which retains about 300 events or 90 days — four days for
  // this account — so the panel drew a histogram over four days while the
  // "longest run" beneath it came from a full year of contributions. One panel,
  // two windows. The walk below already has every timestamp the rhythm needs,
  // over the whole history, for free.
  const collected = await authoredSnapshots(scopeRepos, options.identities, {
    skipLanguages: options.exclude,
    offsetHours: offsetH,
  })

  const [raw, cal, stars] = await Promise.all([
    events(login, 3),
    calendar(login),
    starred(login, 3),
  ])

  const evs = raw
    .filter((e) => e.actor?.login?.toLowerCase() === login.toLowerCase())
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

  // ---- LANGUAGE SIGNAL: a fold over snapshots ALREADY TAKEN -----------------
  //
  // Not a second collection, and not a function that knows how to clone. It
  // takes the snapshots whose repositories are pinned and adds them up. The
  // rows below carry outcome/completeness, so a reading taken from a partial
  // set cannot present itself as a complete one, and the panel can say which
  // projects could not be reached.
  const chosen = scopeRepos.map((repo) => collected.byRepo.get(repo) ?? unknown(repo, "not collected"))
  const stats = aggregateLanguages(chosen)
  const partial = stats.failedCount > 0
  const langs = {
    top: stats.ranked.slice(0, options.limit).map((l) => ({
      name: l.name,
      pct: l.pct,
      amount: `${fmtLines(l.lines)} lines`,
    })),
    repoCount: stats.okCount,
    scopeCount: chosen.length,
    // `owner/name`, not a card key: the scope is the whole account now, and most
    // of these repositories have no card at all. Naming them by a key that only
    // exists for six of them would be a label pretending to be a lookup.
    measuredKeys: chosen.filter((s) => s.outcome === "ok").map((s) => s.repo),
    missingKeys: chosen.filter((s) => s.outcome !== "ok").map((s) => s.repo),
    // The caption and the note say what the number is over. They used to name
    // "the selected work above", which stopped being true the moment the scope
    // became the whole account. Their wording lives in lib/projects.mjs, where
    // a test can measure it against the panel's real line budget — the panel
    // truncates this sentence silently.
    caption: LANGUAGES_CAPTION,
    summary: `${fmtLines(stats.totalLines)} lines`,
    // A repository that could not be read is reported as missing, never as
    // having contributed nothing: "13 of 15" and "all 15" are different claims
    // and the chart has to say which one it is making.
    note: languageNote({
      commits: stats.commits,
      measured: stats.okCount,
      scope: chosen.length,
      partial,
    }),
    method: "authored-lines",
    partial,
    // True when this run could not read the repository list and is counting the
    // previous run's scope. The numbers are real; they are just a run behind.
    heldScope,
  }

  return {
    now,
    login,
    rhythm: rhythmFromSnapshots(collected.snapshots, offsetH),
    contributions: contributions(cal),
    stars: stars.map((s) => ({
      name: s.full_name,
      description: clamp(deEmoji(s.description), 96),
      language: s.language,
      starredAt: s.starredAt,
    })),
    languages: langs,
    activity: activity(evs, cfg),
    /**
     * For the build log: the proof the build makes about itself.
     *
     * `scopeRepos` IS the collection list — the same array, not a second one
     * derived from it — so "one collection over the whole scope" is a property
     * of the data flow rather than an assertion anybody has to remember to
     * re-check. `reposRequested` is printed so a run that silently asked for
     * fewer repositories than it counted over would be visible.
     */
    analysis: {
      collectionPasses: 1,
      cloneAttempts: 2,
      reposRequested: scopeRepos.length,
      reposMeasured: collected.okCount,
      reposFailed: collected.failedCount,
    },
    work: {
      keys: picked.map((c) => c.key),
      picked,
      scopeRepos,
      /**
       * Repo -> snapshot, for the build log's per-card state.
       *
       * Nothing selects on it any more: the pins decide membership, and
       * LANGUAGE SIGNAL reads `outcome` through `aggregateLanguages`. What is
       * left is the distinction the log has to draw — a repository that could
       * not be reached this round is not the same fact as one that was read
       * successfully and has no commits by this author, and printing one as the
       * other is how a network incident turns into a page that looks abandoned.
       */
      signal: signalsFrom(collected.snapshots),
      held,
      holdReason,
      pinnedError,
      /** Pins with no hand-written `why` yet — the build log lists them. */
      unedited: picked.filter((c) => c.unedited).map((c) => c.key),
    },
  }
}

/* ------------------------------------------------------------------ signals */

/**
 * A repo-keyed view of the snapshots, for the build log.
 *
 * It keeps `outcome` rather than flattening to `lastCommitAt`, because that one
 * field is what lets `signalState` tell "this repository has no commits by this
 * author" apart from "this repository was not measured". Collapsing the two is
 * how a five-second clone failure becomes a page that reads as abandoned.
 */
export function signalsFrom(snapshots) {
  return Object.fromEntries(snapshots.map((s) => [s.repo, s]))
}

/**
 * Something we asked for and did not get is UNAVAILABLE, never a reading of
 * zero.
 *
 * This is the guard rail for the bug that shaped this whole file: if a snapshot
 * ever goes missing between collection and use, the failure has to arrive as
 * "unavailable" — which LANGUAGE SIGNAL reports as a hole and names in its note
 * — and never as zero lines, which would silently shrink the chart's total and
 * re-normalise every percentage around the gap. It is a fail-closed value, not
 * a fallback measurement.
 */
export const unknown = (repo, reason) => ({
  repo,
  outcome: "failed",
  reason,
  commits: 0,
  lines: 0,
  languages: {},
  lastCommitAt: null,
  firstCommitAt: null,
  hours: Array(24).fill(0),
  days: Array(7).fill(0),
  activeDays: [],
})

/* ------------------------------------------------------------------ rhythm */

/**
 * CODING RHYTHM, folded out of the authored commit walk.
 *
 * WHAT THIS REPLACED, AND WHY. The panel used to be built from the public
 * events feed. That endpoint retains roughly 300 events or 90 days — whichever
 * runs out first — and only public activity, so for this account it returned 98
 * events spanning four days. The histogram was therefore drawn over four days
 * while the "longest run" readout beside it came from a full year of
 * contributions: one panel, two windows, two sources, and no way for a reader
 * to tell. The label said "3 days observed" and was telling the truth.
 *
 * The walk already reads every commit's committer timestamp across every
 * repository in scope, for the whole history, because the language chart needs
 * the same log. So the rhythm costs nothing extra, covers everything the
 * language scope covers, and shares its window with nothing else on the page.
 *
 * WHAT IT CANNOT SEE, stated plainly because the panel is a claim: this is
 * PUBLIC repositories. Work committed only to a private repository leaves no
 * trace here. The contribution calendar does see it — that is what the
 * CONTRIBUTIONS panel is for — and it has no hour-of-day resolution, which is
 * why the two panels are not interchangeable.
 *
 * `total` is COMMITS, not events. The panel's meta line says so.
 */
export function rhythmFromSnapshots(snapshots, offsetH = 0) {
  const hours = Array(24).fill(0)
  const days = Array(7).fill(0)
  const activeDays = new Set()
  let total = 0
  let first = null
  let last = null

  for (const s of snapshots) {
    // A repository that could not be read contributes nothing — but it must not
    // reset anything either. Its absence is a hole in the reading, and the
    // language panel is where that hole gets reported; a rhythm chart has no
    // way to show one, so it simply under-reports and the meta line's window
    // still comes from the repositories that WERE read.
    if (!s || s.outcome !== "ok") continue
    total += s.commits ?? 0
    for (let i = 0; i < 24; i++) hours[i] += s.hours?.[i] ?? 0
    for (let i = 0; i < 7; i++) days[i] += s.days?.[i] ?? 0
    for (const d of s.activeDays ?? []) activeDays.add(d)
    if (s.firstCommitAt) {
      const t = Date.parse(s.firstCommitAt)
      if (Number.isFinite(t) && (first === null || t < first)) first = t
    }
    if (s.lastCommitAt) {
      const t = Date.parse(s.lastCommitAt)
      if (Number.isFinite(t) && (last === null || t > last)) last = t
    }
  }

  const peakHour = hours.indexOf(Math.max(...hours))
  const busiest = days.indexOf(Math.max(...days))
  const night = hours.slice(22).concat(hours.slice(0, 6)).reduce((a, b) => a + b, 0)

  // The longest run of consecutive days with a commit by this author. Over the
  // whole history rather than a year, because the year was the contribution
  // calendar's limit and this panel no longer borrows it.
  const sortedDays = [...activeDays].sort()
  let longestRun = 0
  let run = 0
  let prev = null
  for (const day of sortedDays) {
    const t = Date.parse(`${day}T00:00:00Z`)
    run = prev !== null && t - prev === DAY ? run + 1 : 1
    if (run > longestRun) longestRun = run
    prev = t
  }

  return {
    hours,
    days,
    total,
    spanDays: first !== null && last !== null ? Math.max(1, Math.round((last - first) / DAY)) : 0,
    peakHour,
    peakWindow: `${pad(peakHour)}:00-${pad((peakHour + 1) % 24)}:00`,
    // Sentence case: readout values are content, and the label beside them is
    // already carrying the uppercase register.
    busiestDay: WEEKDAYS[busiest][0] + WEEKDAYS[busiest].slice(1).toLowerCase(),
    nightShare: total ? Math.round((night / total) * 100) : 0,
    offsetLabel: `UTC+${offsetH}`,
    longestRun,
    activeDayCount: sortedDays.length,
    // The meta line says when the window starts, because "449 days observed"
    // invites the reader to assume a density that 47 active days does not have.
    sinceLabel: first === null ? "—" : `${MONTHS[new Date(first).getUTCMonth()]} ${new Date(first).getUTCFullYear()}`,
    firstAt: first === null ? null : new Date(first).toISOString(),
    lastAt: last === null ? null : new Date(last).toISOString(),
  }
}

/* ----------------------------------------------------------- contributions */

async function calendar(login) {
  const d = await graphql(
    `query($login:String!){user(login:$login){contributionsCollection{contributionCalendar{
       totalContributions weeks{firstDay contributionDays{date contributionCount weekday}}}}}}`,
    { login }
  )
  return d.user.contributionsCollection.contributionCalendar
}

function contributions(cal) {
  const weeks = cal.weeks.map((w) => w.contributionDays.map((d) => ({ date: d.date, n: d.contributionCount, wd: d.weekday })))
  const flat = weeks.flat()
  const active = flat.filter((d) => d.n > 0)
  const max = active.length ? Math.max(...active.map((d) => d.n)) : 0
  const peak = active.reduce((best, d) => (!best || d.n > best.n ? d : best), null)

  // Thresholds are quartiles of the days that ACTUALLY have activity, not
  // fractions of the maximum. A single 50-commit day would otherwise drag every
  // other day into the lowest band and leave three quarters of the ramp unused.
  // Forced strictly increasing so no level can be unreachable.
  const sorted = active.map((d) => d.n).sort((a, b) => a - b)
  const q = (p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0)
  const levels = [1, q(0.25), q(0.5), q(0.75)].map((v, i, a) => Math.max(v, (a[i - 1] ?? 0) + 1))
  for (let i = 1; i < levels.length; i++) levels[i] = Math.max(levels[i], levels[i - 1] + 1)

  let longest = 0
  let run = 0
  for (const d of flat) {
    run = d.n > 0 ? run + 1 : 0
    longest = Math.max(longest, run)
  }
  let current = 0
  for (let i = flat.length - 1; i >= 0; i--) {
    if (flat[i].n > 0) current++
    else if (i < flat.length - 1) break // today may legitimately still be empty
  }

  return {
    weeks,
    total: cal.totalContributions,
    activeDays: active.length,
    totalDays: flat.length,
    max,
    peak,
    levels,
    longestStreak: longest,
    currentStreak: current,
    level: (n) => (n <= 0 ? 0 : n < levels[1] ? 1 : n < levels[2] ? 2 : n < levels[3] ? 3 : 4),
  }
}

/* --------------------------------------------------------------- languages */

/**
 * How the language chart counts, and one place that decides it.
 *
 * Note what is NOT here: the repository list. Scope comes from the pinned set
 * via lib/projects.mjs. What remains is only the METHOD — identities to match,
 * languages to drop, and the byte escape hatch. Keeping these together means
 * "what is counted" and "how it is counted" are separate concerns that cannot
 * silently diverge.
 *
 * `identities` is matched case-insensitively against each commit's author email
 * and name. Extend it when a new machine commits under a different address —
 * otherwise those commits vanish from the chart without any error, which is the
 * quietest way this panel can be wrong.
 */
const LANGUAGE_DEFAULTS = {
  limit: 6,
  identities: ["liqiyu311@gmail.com", "yunmin311"],
  // Generated and vendored output. The chart claims "lines I wrote"; markup and
  // lockfile churn is not writing, and one built repo can dominate the total.
  exclude: ["JSON", "SVG", "HTML", "TOML", "Batchfile", "VBScript", "Makefile", "Dockerfile"],
  method: "authored-lines",
}

function languageOptions(cfg) {
  const o = cfg.languageScopeOptions ?? {}
  return {
    limit: o.limit ?? LANGUAGE_DEFAULTS.limit,
    identities: o.identities ?? LANGUAGE_DEFAULTS.identities,
    exclude: o.exclude ?? LANGUAGE_DEFAULTS.exclude,
    method: o.method ?? LANGUAGE_DEFAULTS.method,
  }
}

/**
 * `method: "bytes"` is kept as an explicit escape hatch, and it is now the ONLY
 * thing on this path that touches the network for language data.
 *
 * It used to be reached automatically whenever the in-depth pass produced
 * nothing. That is gone on purpose: falling back to bytes halves the quality of
 * the claim ("lines I wrote" becomes "bytes on disk, unqualified") AND changes
 * scope to repositories that may not have been measured at all — a silent
 * downgrade in the middle of a network incident, on the run least able to
 * report it. A partial authored-lines reading says so on the panel instead.
 */
export async function languageBytes(cfg, repos) {
  const { limit, exclude = [] } = languageOptions(cfg)
  const skip = new Set(exclude)
  const totals = new Map()
  let sum = 0
  const counted = []

  for (const full of repos) {
    let bytes
    try {
      bytes = await languagesOf(full)
    } catch (err) {
      console.warn(`! skipping ${full}: ${err.message.split("\n")[0]}`)
      continue
    }
    counted.push(full)
    for (const [name, n] of Object.entries(bytes)) {
      if (skip.has(name)) continue
      totals.set(name, (totals.get(name) || 0) + n)
      sum += n
    }
  }

  const ranked = [...totals.entries()]
    .map(([name, bytes]) => ({ name, bytes, pct: sum ? (bytes / sum) * 100 : 0 }))
    .sort((a, b) => b.bytes - a.bytes)

  const top = ranked.slice(0, limit).map((l) => ({ name: l.name, pct: l.pct, amount: fmtBytes(l.bytes) }))

  return {
    top,
    repoCount: counted.length,
    scopeCount: repos.length,
    measuredKeys: [],
    missingKeys: [],
    caption: "SOURCE BYTES ACROSS EVERY PUBLIC REPOSITORY",
    summary: fmtBytes(sum),
    note: `Repository language bytes across ${counted.length} of my public repositories. Built and vendored output excluded.`,
    method: "bytes",
    partial: counted.length < repos.length,
  }
}

const fmtLines = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n))
const fmtBytes = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`)

/* ---------------------------------------------------------------- activity */

const ACTIVITY_MAP = {
  ReleaseEvent: (e) => ({ type: "release", tag: "RELEASED", detail: e.payload?.release?.tag_name || "" }),
  PublicEvent: () => ({ type: "public", tag: "OPEN SOURCED", detail: "" }),
  PullRequestEvent: (e) => {
    const a = e.payload?.action
    if (!["opened", "closed"].includes(a)) return null
    const merged = e.payload?.pull_request?.merged
    return { type: "pr", tag: merged ? "MERGED PR" : a === "opened" ? "OPENED PR" : "CLOSED PR", detail: `#${e.payload?.number ?? ""}` }
  },
  PullRequestReviewEvent: () => ({ type: "review", tag: "REVIEWED", detail: "" }),
  IssuesEvent: (e) => {
    const a = e.payload?.action
    if (!["opened", "closed", "reopened"].includes(a)) return null
    return { type: "issue", tag: `${a.toUpperCase()} ISSUE`, detail: `#${e.payload?.issue?.number ?? ""}` }
  },
  CreateEvent: (e) => {
    if (e.payload?.ref_type !== "repository") return null
    return { type: "ref/create", tag: "NEW REPO", detail: "" }
  },
  ForkEvent: () => ({ type: "fork", tag: "FORKED", detail: "" }),
}

function activity(evs, cfg) {
  const allow = new Set(cfg.activity.types)
  const cutoff = Date.now() - cfg.activity.days * DAY
  const out = []
  const seen = new Set()

  for (const e of evs) {
    const map = ACTIVITY_MAP[e.type]
    if (!map) continue
    const at = new Date(e.created_at).getTime()
    if (at < cutoff) continue
    const hit = map(e)
    if (!hit || !allow.has(hit.type)) continue
    // One entry per verb per repository. Three releases of the same tool in a
    // fortnight is one fact, not three.
    const key = `${hit.tag}:${e.repo.name}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ ...hit, repo: e.repo.name.split("/").pop(), at, ago: ago(at) })
    if (out.length >= cfg.activity.limit) break
  }
  return out
}

/* ----------------------------------------------------------------- helpers */

const pad = (n) => String(n).padStart(2, "0")

export { ago } from "./format.mjs"

export { WEEKDAYS }

// Re-exported so a test can assert the three-state contract without reaching
// into the module that defines the selection rule.
export { signalState }
