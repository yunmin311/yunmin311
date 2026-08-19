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
 * - Language share is measured across a hand-picked list of repositories
 *   rather than everything owned. One repository of built HTML is enough to
 *   report "86% HTML", which is true and useless.
 */

import { events, graphql, starred, languagesOf } from "./gh.mjs"
import { authoredLines } from "./authored.mjs"
import { deEmoji, clamp } from "./design.mjs"

const HOUR = 3600e3
const DAY = 24 * HOUR
const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]

export async function collect(cfg) {
  const login = cfg.login
  const offsetH = 8 // Asia/Shanghai, no DST
  const now = new Date()

  const [raw, cal, stars, langs] = await Promise.all([
    events(login, 3),
    calendar(login),
    starred(login, 3),
    languages(cfg),
  ])

  const evs = raw
    .filter((e) => e.actor?.login?.toLowerCase() === login.toLowerCase())
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

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
 * In-depth first, bytes as a fallback.
 *
 * The in-depth pass clones each repository and counts lines this author added
 * in commits this author wrote. If cloning is unavailable it degrades to
 * repository language bytes — and says so on the panel, because the two
 * measure genuinely different things and the reader is entitled to know which
 * one they are looking at.
 */
async function languages(cfg) {
  const scope = cfg.languageScope
  const { repos, limit, exclude = [] } = scope

  if (scope.method === "authored-lines") {
    const r = await authoredLines(repos, scope.identities, { skipLanguages: exclude })
    if (r) {
      const top = r.ranked.slice(0, limit).map((l) => ({
        name: l.name, pct: l.pct, amount: `${fmtLines(l.lines)} lines`,
      }))
      const partial = r.repos.length < repos.length
      return {
        top,
        repoCount: r.repos.length,
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
      }
    }
    console.warn("! in-depth analysis unavailable, falling back to repository language bytes")
  }

  return languageBytes(cfg)
}

async function languageBytes(cfg) {
  const { repos, limit, exclude = [] } = cfg.languageScope
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
    caption: "SOURCE BYTES ACROSS SELECTED WORK",
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

export function ago(ms) {
  const s = Math.max(0, Date.now() - ms) / 1000
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}M`
  if (s < 86400) return `${Math.floor(s / 3600)}H`
  if (s < 86400 * 14) return `${Math.floor(s / 86400)}D`
  if (s < 86400 * 60) return `${Math.floor(s / (86400 * 7))}W`
  return `${Math.floor(s / (86400 * 30))}MO`
}

export { WEEKDAYS }


