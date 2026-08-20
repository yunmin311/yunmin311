/**
 * Checks the README against what the build actually produced.
 *
 * Written after a missing `export const responsive = true` shipped a README
 * pointing at a phone variant that was never generated — a broken image only a
 * phone would ever see. Every asset the page references now has to exist before
 * anything is pushed.
 *
 *   node scripts/check.mjs
 */

import { readdir, readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const readme = await readFile(resolve(ROOT, "README.md"), "utf8")
const gallery = await readFile(resolve(ROOT, "docs/COMPONENTS.md"), "utf8").catch(() => "")

// Only real markup, never the commented-out sections.
// The component gallery references assets the profile deliberately does not,
// so both documents count as live references.
const live = (readme + gallery).replace(/<!--[\s\S]*?-->/g, "").replace(/\.\.\//g, "")

const referenced = new Set()
for (const m of live.matchAll(/(?:src|srcset)="([^"]+)"/g)) referenced.add(m[1])
for (const m of live.matchAll(/<a href="(assets\/[^"]+)"/g)) referenced.add(m[1])

const problems = []
for (const path of [...referenced].sort()) {
  try {
    await readFile(resolve(ROOT, path))
  } catch {
    problems.push(`missing asset: ${path}`)
  }
}

// The other direction: generated files nothing points at are dead weight.
const generated = (await readdir(resolve(ROOT, "assets/generated"))).map((f) => `assets/generated/${f}`)
const orphans = generated.filter((f) => !referenced.has(f))

console.log(`referenced: ${referenced.size}   generated: ${generated.length}   orphaned: ${orphans.length}`)
if (orphans.length) console.log(orphans.map((o) => `  · ${o.split("/").pop()}`).join("\n"))

if (problems.length) {
  console.error(`\n${problems.length} problem(s):`)
  for (const p of problems) console.error(`  ! ${p}`)
  process.exit(1)
}
console.log("\nevery referenced asset exists")
