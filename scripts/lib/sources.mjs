/**
 * WHERE SELECTED WORK AND LANGUAGE SIGNAL GET THEIR NUMBERS.
 *
 * THE FLOW, AND THERE IS ONLY ONE OF IT:
 *
 *   GraphQL -> the profile's PINNED repositories        lib/gh.mjs
 *                |
 *                +-> metadata overlay from config       lib/projects.mjs
 *                |      (falling back to the repository's own description,
 *                |       primary language and topics)
 *                |
 *                +-> SELECTED WORK cards                panels/work.mjs
 *                |
 *                +-> authoredSnapshots()  ONE clone per pinned repository
 *                        |
 *                        +-> LANGUAGE SIGNAL            panels/languages.mjs
 *
 * There is no ranking stage between "pinned" and "shown". The pins ARE the
 * curation; re-scoring them would be a machine second-guessing a decision the
 * author already made by hand, and it is what used to make the page disagree
 * with the profile. Everything the old pipeline needed in order to rank —
 * recency, volume, a core tier, hysteresis, a pool to rank within — is gone
 * with it.
 *
 * WHY IT MATTERS THAT THE COLLECTION IS SINGLE-PASS. Selection used to need
 * recency, so it cloned the whole pool; the chart then needed lines per
 * language, so it cloned the chosen six again. Two collections of the same
 * repositories, seconds apart, that could disagree — and did, whenever a clone
 * failed in one pass and not the other. The chart could then describe a set of
 * repositories that no longer matched the cards above it, with nothing anywhere
 * reporting the mismatch. Here the pinned set is collected once, into snapshots
 * that both panels read.
 *
 * `collect()` returns `work` in the shape BUILD and CHECK consume. Compared
 * with the ranking version, `picked` now carries cards rather than scored rows,
 * and `staleness` is gone — there is no longer a pool for the page to fall
 * behind, because nothing is being left out.
 */

import { events, graphql, pinnedRepos, starred } from "./gh.mjs"
import { authoredSnapshots, aggregateLanguages } from "./authored.mjs"
import { deEmoji, clamp } from "./design.mjs"
import { ago } from "./format.mjs"
import { cardOverrides, languageRepos, resolveCards, signalState } from "./projects.mjs"

const HOUR = 3600e3
const DAY = 24 * HOUR
const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]

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

  const scopeRepos = languageRepos(picked)

  // ---- 3. ONE collection pass, over THE PINNED SET -------------------------
  //
  // Over the scope, which is the pinned set: there is no wider pool to measure,
  // because nothing outside the pins can affect what is displayed. That is also
  // why the collection is strictly a single pass — the language chart folds
  // these same snapshots, and no other call site wants one.
  const collected = await authoredSnapshots(scopeRepos, options.identities, { skipLanguages: options.exclude })

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
  // A repository back to the card that names it, for messages a human reads.
  const keyOf = (repo) => picked.find((c) => c.repo === repo)?.key ?? repo
  const langs = {
    top: stats.ranked.slice(0, options.limit).map((l) => ({
      name: l.name,
      pct: l.pct,
      amount: `${fmtLines(l.lines)} lines`,
    })),
    repoCount: stats.okCount,
    scopeCount: chosen.length,
    measuredKeys: chosen.filter((s) => s.outcome === "ok").map((s) => keyOf(s.repo)),
    missingKeys: chosen.filter((s) => s.outcome !== "ok").map((s) => keyOf(s.repo)),
    caption: "LINES I WROTE, ACROSS THE SELECTED WORK ABOVE",
    summary: `${fmtLines(stats.totalLines)} lines`,
    // Says "3 of 4" when a measurement failed, so a partial reading never
    // passes itself off as a complete one.
    note:
      `Lines I added in ${stats.commits} commits I authored, across ` +
      `${partial ? `${stats.okCount} of ${chosen.length}` : `all ${chosen.length}`} pinned repos. ` +
      `Generated and vendored files excluded.`,
    method: "authored-lines",
    partial,
  }

  return {
    now,
    login,
    rhythm: rhythm(evs, offsetH),
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
     * derived from it — so "the chart counted what the grid shows" is a
     * property of the data flow rather than an assertion anybody has to
     * remember to re-check. `reposRequested` is printed so a run that silently
     * asked for fewer repositories than it displayed would be visible.
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
})

/* ------------------------------------------------------------------ rhythm */

function rhythm(evs, offsetH) {
  const hours = Array(24).fill(0)
  const days = Array(7).fill(0)
  let first = Infinity
  let last = -Infinity

  for (const e of evs) {
    const ms = new Date(e.created_at).getTime()
    if (!Number.isFinite(ms)) continue
    first = Math.min(first, ms)
    last = Math.max(last, ms)
    const local = new Date(ms + offsetH * HOUR)
    hours[local.getUTCHours()]++
    days[(local.getUTCDay() + 6) % 7]++ // shift so Monday is index 0
  }

  const total = evs.length
  const peakHour = hours.indexOf(Math.max(...hours))
  const busiest = days.indexOf(Math.max(...days))
  const night = hours.slice(22).concat(hours.slice(0, 6)).reduce((a, b) => a + b, 0)
  const spanDays = Number.isFinite(first) ? Math.max(1, Math.round((last - first) / DAY)) : 0

  return {
    hours,
    days,
    total,
    spanDays,
    peakHour,
    peakWindow: `${pad(peakHour)}:00-${pad((peakHour + 1) % 24)}:00`,
    // Sentence case: readout values are content, and the label beside them is
    // already carrying the uppercase register.
    busiestDay: WEEKDAYS[busiest][0] + WEEKDAYS[busiest].slice(1).toLowerCase(),
    nightShare: total ? Math.round((night / total) * 100) : 0,
    offsetLabel: `UTC+${offsetH}`,
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
    caption: "SOURCE BYTES ACROSS THE SELECTED WORK ABOVE",
    summary: fmtBytes(sum),
    note: `Repository language bytes across ${counted.length} selected repositories. Built and vendored output excluded.`,
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
