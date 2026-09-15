/**
 * Everything the panels draw is derived here, so the drawing code stays
 * drawing code.
 *
 * A note on sources, because two of them are not the obvious ones:
 *
 * - Hour/weekday rhythm comes from the *public events* feed. GitHub stripped
 *   `commits`, `size` and `distinct_size` out of PushEvent payloads, which is
 *   what broke lowlighter/metrics' habits and activity plugins, but the event
 *   `created_at` timestamps survived — and timestamps are all a rhythm chart
 *   ever needed.
 * - Language share is measured across the declared project pool rather than
 *   everything owned. One repository of built HTML is enough to report
 *   "86% HTML", which is true and useless.
 *
 * WHAT IS DYNAMIC AND WHAT IS CURATED. Read this before assuming a panel is
 * broken because its numbers did not move:
 *
 *   dynamic (recomputed every run)   rhythm · contributions · stars · activity
 *                                    · language chart numbers · SELECTED WORK's
 *                                    member set and order
 *   curated (only changes when       every word on a card (name/why/tags/url),
 *   config.json changes)             the section headings, the hero, the
 *                                    fortune pool, the contact row
 *
 * The failure mode this distinction guards against: card content is 100%
 * curated, so a healthy rebuild reproduces the card images byte-for-byte and
 * the workflow commits nothing. That is CORRECT — but it used to be
 * indistinguishable from "the rule itself is frozen", which is what actually
 * went wrong. See check.mjs, which now detects the frozen-rule case.
 */

import { events, graphql, starred, languagesOf, repoOf } from "./gh.mjs"
import { authoredLines } from "./authored.mjs"
import { deEmoji, clamp } from "./design.mjs"
import { ago } from "./format.mjs"
import { normalise, languageRepos, select, staleness } from "./projects.mjs"

const HOUR = 3600e3
const DAY = 24 * HOUR
const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]

export async function collect(cfg) {
  const login = cfg.login
  const offsetH = 8 // Asia/Shanghai, no DST
  const now = new Date()

  // The declared pool is the single source of truth for both panels; the scope
  // below is DERIVED from it, never typed out a second time.
  const projects = normalise(cfg)
  const scopeRepos = languageRepos(projects)

  const [raw, cal, stars, langs] = await Promise.all([
    events(login, 3),
    calendar(login),
    starred(login, 3),
    languages(cfg, scopeRepos),
  ])

  const evs = raw
    .filter((e) => e.actor?.login?.toLowerCase() === login.toLowerCase())
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

  // Recency + volume per repository, straight out of the clones the language
  // chart already needs. A project whose clone failed simply has no signal and
  // is treated as "age unknown", never as "fresh" — see score() in projects.mjs.
  const signal = langs.perRepo || {}
  const picked = select(projects, signal, cfg, now, cfg.__pinnedProjects ?? null)

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
    work: { picked, signal, staleness: staleness(projects, signal, picked, now) },
  }
}

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
 * Note what is NOT here any more: the repository list. Scope comes from
 * `cfg.projects` via lib/projects.mjs. What remains is only the METHOD —
 * identities to match, languages to drop, and the byte fallback switch. Keeping
 * these together means "what is counted" and "how it is counted" are separate
 * concerns that cannot silently diverge.
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
 * In-depth first, bytes as a fallback.
 *
 * The in-depth pass clones each repository and counts lines this author added
 * in commits this author wrote. If cloning is unavailable it degrades to
 * repository language bytes — and says so on the panel, because the two
 * measure genuinely different things and the reader is entitled to know which
 * one they are looking at.
 *
 * The scope is PASSED IN rather than read from config. It used to be
 * `cfg.languageScope.repos`, a second hand-kept list that could disagree with
 * the cards about what the work is; it is now derived from `cfg.projects` by
 * lib/projects.mjs, so there is exactly one list in the repository.
 */
async function languages(cfg, repos) {
  const { limit, exclude = [], identities } = languageOptions(cfg)

  if (languageOptions(cfg).method !== "bytes") {
    const r = await authoredLines(repos, identities, { skipLanguages: exclude })
    if (r) {
      const top = r.ranked.slice(0, limit).map((l) => ({
        name: l.name, pct: l.pct, amount: `${fmtLines(l.lines)} lines`,
      }))
      const partial = r.repos.length < repos.length
      return {
        top,
        repoCount: r.repos.length,
        scopeCount: repos.length,
        caption: "LINES I WROTE, ACROSS SELECTED WORK",
        summary: `${fmtLines(r.totalLines)} lines`,
        // Says "3 of 4" when a clone failed, so a partial reading never passes
        // itself off as a complete one.
        note:
          `Lines I added in ${r.commits} commits I authored, across ` +
          `${partial ? `${r.repos.length} of ${repos.length}` : `all ${repos.length}`} selected repos. ` +
          `Generated and vendored files excluded.`,
        method: "authored-lines",
        partial,
        // Recency for SELECTED WORK's ordering rides along on this walk.
        perRepo: r.perRepo,
      }
    }
    console.warn("! in-depth analysis unavailable, falling back to repository language bytes")
  }

  return languageBytes(cfg, repos)
}

async function languageBytes(cfg, repos) {
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

  // The byte fallback carries no commit history, so SELECTED WORK gets its
  // recency from the repository's own `pushed_at`. Weaker than a real clone —
  // it counts a bot push as activity — but the alternative is ordering on
  // nothing at all. `volume` stays zero, which is why the fallback is announced
  // on the panel rather than passed off as the real reading.
  const perRepo = {}
  for (const full of counted) {
    try {
      const repo = await repoOf(full)
      perRepo[full] = { lastCommitAt: repo.pushed_at ?? null, commits: null, lines: 0 }
    } catch {
      perRepo[full] = { lastCommitAt: null, commits: null, lines: 0 }
    }
  }

  return {
    top,
    repoCount: counted.length,
    scopeCount: repos.length,
    caption: "SOURCE BYTES ACROSS SELECTED WORK",
    summary: fmtBytes(sum),
    note: `Repository language bytes across ${counted.length} selected repositories. Built and vendored output excluded.`,
    method: "bytes",
    partial: counted.length < repos.length,
    perRepo,
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


