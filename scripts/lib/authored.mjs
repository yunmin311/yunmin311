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
 */

import { execFile } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"

const run = promisify(execFile)

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

/**
 * @param repos     ["owner/name", ...]
 * @param identities strings matched case-insensitively against author email and name
 */
export async function authoredLines(repos, identities, { skipLanguages = [] } = {}) {
  const skip = new Set(skipLanguages)
  const who = identities.map((s) => s.toLowerCase())
  const totals = new Map()
  const counted = []
  let commits = 0
  let workdir

  try {
    workdir = await mkdtemp(join(tmpdir(), "profile-langs-"))
  } catch (err) {
    console.warn(`! cannot create workdir: ${err.message}`)
    return null
  }

  // Clones run in parallel and with the credential helper switched off. These
  // are public repositories, so no helper is needed — and if one is configured
  // that shells out, git blocks on it until the timeout instead of failing.
  const cloned = await Promise.all(
    repos.map(async (full) => {
      const dir = join(workdir, full.replace("/", "__"))
      try {
        await run(
          "git",
          ["-c", "credential.helper=", "-c", "core.askPass=", "clone", "--quiet", "--no-tags",
           `https://github.com/${full}.git`, dir],
          { timeout: 180_000, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } }
        )
        return { full, dir }
      } catch (err) {
        console.warn(`! clone failed ${full}: ${String(err.message).split("\n")[0]}`)
        return null
      }
    })
  )

  for (const entry of cloned) {
    if (!entry) continue
    const { full, dir } = entry

    let stdout
    try {
      ;({ stdout } = await run(
        "git",
        ["-C", dir, "log", "--no-merges", "--numstat", "--pretty=tformat:\x01%H\x02%ae\x02%an"],
        { maxBuffer: 256 * 1024 * 1024, timeout: 120_000 }
      ))
    } catch (err) {
      console.warn(`! log failed ${full}: ${String(err.message).split("\n")[0]}`)
      continue
    }

    counted.push(full)
    let mine = false
    for (const line of stdout.split("\n")) {
      if (line.startsWith("\x01")) {
        const [, email = "", name = ""] = line.slice(1).split("\x02")
        const hay = `${email} ${name}`.toLowerCase()
        mine = who.some((w) => hay.includes(w))
        if (mine) commits++
        continue
      }
      if (!mine || !line.trim()) continue
      const [addedRaw, , ...rest] = line.split("\t")
      const added = Number(addedRaw)
      if (!Number.isFinite(added) || added <= 0) continue // "-" means binary
      const lang = language(resolvePath(rest.join("\t")))
      if (!lang || skip.has(lang)) continue
      totals.set(lang, (totals.get(lang) || 0) + added)
    }
  }

  await rm(workdir, { recursive: true, force: true }).catch(() => {})

  if (!totals.size) return null

  const sum = [...totals.values()].reduce((a, b) => a + b, 0)
  const ranked = [...totals.entries()]
    .map(([name, lines]) => ({ name, lines, pct: (lines / sum) * 100 }))
    .sort((a, b) => b.lines - a.lines)

  return { ranked, totalLines: sum, commits, repos: counted }
}


