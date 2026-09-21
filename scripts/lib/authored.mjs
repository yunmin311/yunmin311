/**
 * In-depth language analysis: lines this author actually wrote.
 *
 * Repository language bytes — what the GitHub API hands you for free — count
 * every file on disk regardless of who put it there or whether a person put it
 * there at all. That is how the first version of this panel reported "86.28%
 * HTML" from one repository of built output.
 *
 * This clones each repository, walks `git log --numstat` restricted to commits
 * whose author is this person, and adds up inserted lines per language. Merge
 * commits are skipped (their diffs double-count), binaries are skipped (numstat
 * reports "-"), and vendored or generated paths are dropped by pattern.
 *
 * It is deliberately additions-only. Counting additions minus deletions makes
 * a refactor that removes more than it adds read as negative work.
 *
 * ONE PASS, ONE SNAPSHOT PER REPOSITORY.
 *
 * The walk returns a SNAPSHOT for every repository it was asked about — not a
 * list of the ones that worked. Each snapshot carries the three things both
 * panels need, measured together so they can never disagree about the same
 * repository:
 *
 *   outcome     "ok" | "failed"   did collection actually succeed
 *   lastCommitAt                  when this author last committed there
 *   lines · languages             how much they wrote, and in what
 *   hours · days · activeDays     when in the day, and on which days, they wrote
 *
 * The rhythm buckets ride along because they come from the same `git log` the
 * line counts already need. A second walk for the same timestamps, or a second
 * source for the same question, is how two panels end up describing different
 * windows of the same work — which is exactly what CODING RHYTHM used to do.
 *
 * CALLERS MUST NOT READ A FAILED SNAPSHOT AS "INACTIVE". That was the bug this
 * shape exists to prevent: a repository whose clone hit a transient network
 * error simply had no entry, and the ranking rule that used to run on top of
 * these snapshots scored its absence as "age unknown" — the same floor a
 * genuinely abandoned project got — so a five-second DNS hiccup could drop a
 * project off the profile for six hours. `outcome` makes "we could not measure
 * it" a fact the caller is forced to handle rather than a silence it can
 * mistake for evidence.
 *
 * Membership no longer depends on any of this: the pins decide what is shown.
 * What survives is the distinction LANGUAGE SIGNAL needs — a pinned repository
 * that could not be reached is UNAVAILABLE, never zero lines.
 *
 * There is exactly ONE clone per repository per build. The chart folds the same
 * snapshots the pinned set was collected into, so nothing can be computed from
 * two different points in time.
 */

import { execFile } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"

const run = promisify(execFile)

/**
 * How many times a clone is attempted before a repository is declared failed.
 *
 * A transient failure is the whole reason this file returns outcomes instead of
 * a filtered list, so it would be inconsistent to give up on the first error.
 * Two attempts covers the ordinary case (a dropped connection, a momentary DNS
 * failure) without turning a genuinely dead repository into a slow build.
 */
const CLONE_ATTEMPTS = 2

const EXT = {
  rs: "Rust", ts: "TypeScript", tsx: "TypeScript", mts: "TypeScript", cts: "TypeScript",
  js: "JavaScript", jsx: "JavaScript", mjs: "JavaScript", cjs: "JavaScript",
  py: "Python", ps1: "PowerShell", psm1: "PowerShell", psd1: "PowerShell",
  css: "CSS", scss: "SCSS", less: "Less",
  html: "HTML", htm: "HTML", vue: "Vue", svelte: "Svelte",
  md: "Markdown", mdx: "Markdown",
  yml: "YAML", yaml: "YAML", toml: "TOML", json: "JSON", jsonc: "JSON",
  sh: "Shell", bash: "Shell", zsh: "Shell", bat: "Batchfile", cmd: "Batchfile", vbs: "VBScript",
  c: "C", h: "C", cpp: "C++", hpp: "C++", cs: "C#", java: "Java", go: "Go", rb: "Ruby",
  swift: "Swift", kt: "Kotlin", sql: "SQL", svg: "SVG",
}

/** Paths nobody hand-wrote, or wrote once and never read again. */
const SKIP_PATH = [
  /(^|\/)node_modules\//, /(^|\/)dist\//, /(^|\/)build\//, /(^|\/)target\//,
  /(^|\/)out\//, /(^|\/)\.next\//, /(^|\/)vendor\//, /(^|\/)coverage\//,
  /(^|\/)\.venv\//, /(^|\/)__pycache__\//, /(^|\/)third_party\//,
  /\.min\.(js|css)$/, /\.lock$/, /(^|\/)(package|pnpm|yarn)-lock\.json$/,
  /(^|\/)pnpm-lock\.yaml$/, /(^|\/)Cargo\.lock$/, /(^|\/)poetry\.lock$/,
  /\.(png|jpe?g|gif|webp|ico|pdf|zip|exe|dll|woff2?|ttf|otf|mp4|mov)$/i,
]

const language = (path) => {
  if (SKIP_PATH.some((re) => re.test(path))) return null
  const m = /\.([a-z0-9]+)$/i.exec(path)
  return m ? EXT[m[1].toLowerCase()] ?? null : null
}

/** A git rename shows as `a/{old => new}/b.ts`; take the resulting path. */
const resolvePath = (p) => {
  if (!p.includes("=>")) return p
  return p.replace(/\{([^}]*) => ([^}]*)\}/g, "$2").replace(/\/{2,}/g, "/")
}

/** The shape a caller can rely on even when collection failed. */
const failed = (repo, reason) => ({
  repo,
  outcome: "failed",
  reason,
  lastCommitAt: null,
  firstCommitAt: null,
  commits: 0,
  lines: 0,
  languages: {},
  hours: Array(24).fill(0),
  days: Array(7).fill(0),
  activeDays: [],
})

/**
 * Collect snapshots for every requested repository.
 *
 * NEVER THROWS AND NEVER OMITS A REPOSITORY. What the caller gets back is
 * exactly one snapshot per requested repo, in the order requested, so a
 * failure is a value it has to look at rather than a hole it can fall into.
 * The only case that throws is being unable to create a work directory at all,
 * which means nothing can be measured and there is no useful partial answer.
 *
 * @param repos     ["owner/name", ...]
 * @param identities strings matched case-insensitively against author email and name
 * @param skipLanguages language names to leave out of the line counts
 * @param offsetHours the wall-clock offset the hour buckets are expressed in
 * @returns { snapshots, byRepo, commits, totalLines, ranked, okCount, failedCount }
 */
export async function authoredSnapshots(repos, identities, { skipLanguages = [], offsetHours = 0 } = {}) {
  const skip = new Set(skipLanguages)
  const who = identities.map((s) => s.toLowerCase())
  let workdir

  try {
    workdir = await mkdtemp(join(tmpdir(), "profile-langs-"))
  } catch (err) {
    // Nothing can be measured. Everything downstream must treat this as "no
    // evidence", which it does — but the build should still say why.
    throw new Error(`cannot create work directory: ${err.message}`)
  }

  // Clones run in parallel and with the credential helper switched off. These
  // are public repositories, so no helper is needed — and if one is configured
  // that shells out, git blocks on it until the timeout instead of failing.
  const snapshots = await Promise.all(
    repos.map(async (full) => {
      const dir = join(workdir, full.replace("/", "__"))
      let lastErr = "unknown error"

      for (let attempt = 1; attempt <= CLONE_ATTEMPTS; attempt++) {
        try {
          await run(
            "git",
            ["-c", "credential.helper=", "-c", "core.askPass=", "clone", "--quiet", "--no-tags",
             `https://github.com/${full}.git`, dir],
            { timeout: 180_000, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } }
          )
          lastErr = null
          break
        } catch (err) {
          lastErr = String(err.message).split("\n")[0]
          // A half-written directory would make the retry fail for the wrong
          // reason, so clear it before trying again.
          await rm(dir, { recursive: true, force: true }).catch(() => {})
          if (attempt < CLONE_ATTEMPTS) {
            console.warn(`! clone failed ${full} (attempt ${attempt}/${CLONE_ATTEMPTS}), retrying`)
          }
        }
      }

      if (lastErr) {
        console.warn(`! clone failed ${full}: ${lastErr}`)
        return failed(full, `clone failed: ${lastErr}`)
      }

      let stdout
      try {
        ;({ stdout } = await run(
          "git",
          // %ct is the committer date as a unix timestamp. It is here so the same
          // walk yields recency for SELECTED WORK as well as lines for the chart.
          ["-C", dir, "log", "--no-merges", "--numstat", "--pretty=tformat:\x01%H\x02%ae\x02%an\x02%ct"],
          { maxBuffer: 256 * 1024 * 1024, timeout: 120_000 }
        ))
      } catch (err) {
        const msg = String(err.message).split("\n")[0]
        console.warn(`! log failed ${full}: ${msg}`)
        return failed(full, `log failed: ${msg}`)
      }

      // A repository that cloned but has no commits by this author is a
      // SUCCESSFUL measurement of zero, not a failure. The distinction matters:
      // this is real evidence — the whole history was read and none of it is
      // ours — and collapsing it into "unavailable" would make a real zero
      // indistinguishable from a clone that never happened.
      const langs = {}
      let mine = false
      let repoCommits = 0
      let repoLines = 0
      let lastCommitAt = null
      let firstCommitAt = null
      // COUNTED WHILE THE LOG IS ALREADY IN HAND. These buckets are why CODING
      // RHYTHM no longer reads the public events feed: that feed retains about
      // 300 events or 90 days, whichever runs out first, and for this account it
      // amounts to four days — which is what the panel used to draw. The walk
      // below is the whole history of every repository in scope, and it is
      // already being paid for by the language chart, so the rhythm costs
      // nothing extra and shares its window with nothing else.
      //
      // The buckets are keyed by WALL CLOCK at `offsetHours`, because "which
      // hour do I work" is only meaningful in the author's own timezone. `%ct`
      // is a UTC epoch, so the offset is added before reading the fields.
      const hours = Array(24).fill(0)
      const days = Array(7).fill(0)
      const activeDays = new Set()

      for (const line of stdout.split("\n")) {
        if (line.startsWith("\x01")) {
          const [, email = "", name = "", at = ""] = line.slice(1).split("\x02")
          const hay = `${email} ${name}`.toLowerCase()
          mine = who.some((w) => hay.includes(w))
          if (mine) {
            repoCommits++
            const secs = Number(at)
            // Commits arrive newest-first, but take the max (and min) rather
            // than the first and last so a stray out-of-order line cannot
            // understate the span.
            if (Number.isFinite(secs)) {
              if (lastCommitAt === null || secs > lastCommitAt) lastCommitAt = secs
              if (firstCommitAt === null || secs < firstCommitAt) firstCommitAt = secs
              const local = new Date(secs * 1000 + offsetHours * 3600e3)
              hours[local.getUTCHours()]++
              days[(local.getUTCDay() + 6) % 7]++ // Monday is index 0
              activeDays.add(local.toISOString().slice(0, 10))
            }
          }
          continue
        }
        if (!mine || !line.trim()) continue
        const [addedRaw, , ...rest] = line.split("\t")
        const added = Number(addedRaw)
        if (!Number.isFinite(added) || added <= 0) continue // "-" means binary
        const lang = language(resolvePath(rest.join("\t")))
        if (!lang || skip.has(lang)) continue
        langs[lang] = (langs[lang] || 0) + added
        repoLines += added
      }

      return {
        repo: full,
        outcome: "ok",
        reason: null,
        commits: repoCommits,
        lines: repoLines,
        languages: langs,
        lastCommitAt: lastCommitAt === null ? null : new Date(lastCommitAt * 1000).toISOString(),
        firstCommitAt: firstCommitAt === null ? null : new Date(firstCommitAt * 1000).toISOString(),
        hours,
        days,
        // Distinct local days, not the commit list: a caller that wants a
        // streak needs the days, and returning every timestamp would make this
        // snapshot grow with the repository's history rather than with its
        // calendar.
        activeDays: [...activeDays].sort(),
      }
    })
  )

  await rm(workdir, { recursive: true, force: true }).catch(() => {})

  return summarize(snapshots)
}

/**
 * Roll snapshots up into the chart's totals.
 *
 * Takes snapshots rather than repositories, so the language numbers are always
 * a fold over measurements that were already taken — never a second collection
 * pass. `aggregateLanguages` below is the public form of this and is what
 * data.mjs calls after the selection rule has chosen its subset.
 */
function summarize(snapshots) {
  const byRepo = new Map(snapshots.map((s) => [s.repo, s]))
  const usable = snapshots.filter((s) => s.outcome === "ok")

  const totals = new Map()
  let totalLines = 0
  let commits = 0
  for (const s of usable) {
    commits += s.commits
    for (const [name, lines] of Object.entries(s.languages)) {
      totals.set(name, (totals.get(name) || 0) + lines)
      totalLines += lines
    }
  }

  const ranked = [...totals.entries()]
    .map(([name, lines]) => ({ name, lines, pct: totalLines ? (lines / totalLines) * 100 : 0 }))
    .sort((a, b) => b.lines - a.lines)

  return {
    snapshots,
    byRepo,
    commits,
    totalLines,
    ranked,
    okCount: usable.length,
    failedCount: snapshots.length - usable.length,
  }
}

/**
 * Fold a chosen subset of snapshots into one language table.
 *
 * This is the whole of "Language Signal counts the displayed work": it is a
 * pure function over snapshots the caller already has. There is no repository
 * list and no second collection anywhere in it.
 */
export function aggregateLanguages(snapshots) {
  return summarize(snapshots)
}
