/**
 * WHERE SELECTED WORK AND LANGUAGE SIGNAL GET THEIR NUMBERS.
 *
 * This file exists for one reason, and it is worth stating precisely because
 * the previous arrangement looked reasonable:
 *
 *  1. THE PREVIOUS ARRANGEMENT CLONED EVERY REPOSITORY TWICE. Selection needed
 *     recency, so it cloned the whole pool; the language chart then needed
 *     lines per language, so it cloned the six that had been chosen, again. Two
 *     collections of the same repositories, seconds apart, that could disagree —
 *     and did, whenever a clone failed in one pass and not the other. The chart
 *     could then describe a set of repositories that no longer matched the
 *     cards above it, with nothing anywhere reporting the mismatch.
 *
 *  2. IT COULD NOT TELL "COULD NOT MEASURE" FROM "IS INACTIVE". A clone that
 *     hit a transient network error produced no entry, the selection rule scored
 *     that absence as "age unknown", and a project building every day could be
 *     replaced on the page by one it should have outranked. Six hours later the
 *     network came back and they swapped again. For a curated showcase that is
 *     simply wrong: an external collection failure is not evidence about the
 *     work.
 *
 * So collection happens ONCE per repository, per build, in `authored.mjs`,
 * which returns a SNAPSHOT for every repository it was asked about — including
 * the ones it could not measure. Everything downstream is then a pure function
 * of those snapshots:
 *
 *   snapshots = authoredSnapshots(pool)             one clone per repo
 *   chosen    = select(projects, signals, cfg, ...)  what is on the page
 *   languages = aggregateLanguages(chosen snapshots) the same measurements
 *
 * There is no repository list in this file, no second pass, and no way for the
 * two panels to be computed from different observations. `signalsFrom` is the
 * only bridge between the snapshot shape and the selection rule, so the rule
 * stays testable without a network.
 *
 * `collect()` returns `work` in the shape BUILD and CHECK already consume —
 * `keys` is a new field on it, added for the clone-count proof, and every
 * existing field keeps its meaning and its type.
 */

import { events, graphql, starred } from "./gh.mjs"
import { authoredSnapshots, aggregateLanguages } from "./authored.mjs"
import { deEmoji, clamp } from "./design.mjs"
import { ago } from "./format.mjs"
import { normalise, languageRepos, select, staleness, signalState } from "./projects.mjs"

const HOUR = 3600e3
const DAY = 24 * HOUR
const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]

export async function collect(cfg) {
  const login = cfg.login
  const offsetH = 8 // Asia/Shanghai, no DST
  const now = new Date()

  // The declared pool is the single source of truth for both panels.
  const projects = normalise(cfg)

  // ---- ONE collection pass, over the whole pool ----------------------------
  //
  // Over the POOL, not over the selection: which projects are shown depends on
  // recency, recency only comes from a measurement, and a project that is not
  // measured cannot be ruled out of the top six. Measuring a subset would make
  // the ordering depend on which subset was guessed.
  const pool = projects.map((p) => p.repo)
  const options = languageOptions(cfg)
  const collected = await authoredSnapshots(pool, options.identities, { skipLanguages: options.exclude })

  // The selection rule and the language chart read THE SAME snapshot objects.
  // `signal` is a plain object here only because the rule's callers — and the
  // committed state file — want a repo-keyed map; it is built from the same
  // snapshots, not re-derived.
  const signal = signalsFrom(collected.snapshots)

  // Memoised per repo, and the gate is counted PER REPOSITORY rather than per
  // invocation: a single build must clone each candidate at most once, however
  // many call sites ask for it. A repeat call is served from memory and says so
  // on stdout, so the proof is visible in the build log rather than asserted
  // only in a test.
  const cloneCounts = new Map()
  const memoSignals = new Map()
  const signalsFor = (repos) => {
    for (const repo of repos) {
      const n = memoSignals.get(repo)
      if (n) {
        cloneCounts.set(repo, (cloneCounts.get(repo) || 0) + 1)
        console.warn(`! ${repo} requested a second time for authored analysis — served from the first snapshot`)
        continue
      }
      const snap = collected.byRepo.get(repo)
      memoSignals.set(repo, snap ? { ...snap } : unknown(repo, "not requested"))
    }
    return Object.fromEntries(repos.map((r) => [r, memoSignals.get(r)]))
  }

  const picked = select(projects, signal, cfg, now, cfg.__pickedProjects ?? null)
  const scopeRepos = languageRepos(picked.picked)

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
  // takes the snapshots whose repositories the rule chose and adds them up. The
  // rows below carry outcome/completeness, so a reading taken from a partial
  // set cannot present itself as a complete one, and the panel can say which
  // projects it fell back to.
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
    measuredKeys: chosen.filter((s) => s.outcome === "ok").map((s) => keyOf(projects, s.repo)),
    missingKeys: chosen.filter((s) => s.outcome !== "ok").map((s) => keyOf(projects, s.repo)),
    caption: "LINES I WROTE, ACROSS THE SELECTED WORK ABOVE",
    summary: `${fmtLines(stats.totalLines)} lines`,
    // Says "3 of 4" when a measurement failed, so a partial reading never
    // passes itself off as a complete one.
    note:
      `Lines I added in ${stats.commits} commits I authored, across ` +
      `${partial ? `${stats.okCount} of ${chosen.length}` : `all ${chosen.length}`} selected repos. ` +
      `Generated and vendored files excluded.`,
    method: "authored-lines",
    partial,
  }

  const state = staleness(projects, signal, picked.picked, now, cfg.stalenessToleranceDays)

  return {
    now,
    login,
    projects,
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
    /** For the build log. The proof the build makes about itself. */
    analysis: {
      cloneLimit: 1,
      reposMeasured: collected.okCount,
      reposFailed: collected.failedCount,
      cloneCounts,
      repeats: [...cloneCounts.values()].reduce((a, b) => a + b, 0),
      signalsFor,
    },
    work: {
      keys: picked.picked.map((p) => p.key),
      picked: picked.picked,
      signal,
      scopeRepos,
      held: picked.held,
      holdReason: picked.reason,
      unmeasured: picked.unmeasured,
      staleness: state,
    },
  }
}

/* ------------------------------------------------------------------ signals */

/**
 * The snapshot map the selection rule reads — the ONLY bridge between the
 * collection shape and the rule.
 *
 * It keeps `outcome` rather than flattening to `lastCommitAt`, because that
 * single field is what lets `signalState` tell "this project is not active"
 * apart from "this project was not measured". A caller that wants a boolean
 * freshness test should ask `signalState`, not test this object for truth.
 */
export function signalsFrom(snapshots) {
  return Object.fromEntries(snapshots.map((s) => [s.repo, s]))
}

/**
 * Something we asked for and did not get is UNKNOWN, never a reading of zero.
 *
 * This is the guard rail for the bug at the top of the file: if a snapshot ever
 * goes missing between collection and use, the failure must arrive as
 * "unmeasured" — which the rule handles by declining to change the page — and
 * never as a scored zero, which the rule would read as a project that has gone
 * quiet. It is a fail-closed value, not a fallback measurement.
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

/** A repo slug back to its config key, for messages a human reads. */
const keyOf = (projects, repo) => projects.find((p) => p.repo === repo)?.key ?? repo

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
 * Note what is NOT here: the repository list. Scope comes from `cfg.projects`
 * via lib/projects.mjs. What remains is only the METHOD — identities to match,
 * languages to drop, and the byte fallback switch. Keeping these together means
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
