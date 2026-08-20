/**
 * Parses every generated SVG and reports the ones a browser would refuse.
 *
 * A malformed SVG fails silently in a README: the image slot just stays empty,
 * and on a page of twenty images nobody can tell which one broke. This finds it
 * before a reader does.
 *
 *   node scripts/validate.mjs
 */

import { readdir, readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const DIR = resolve(ROOT, "assets/generated")
const files = (await readdir(DIR)).filter((f) => f.endsWith(".svg")).sort()

const problems = []

for (const name of files) {
  const svg = await readFile(resolve(DIR, name), "utf8")

  // Bare ampersands and stray angle brackets are the two ways generated text
  // breaks XML, and both come from unescaped content rather than from markup.
  const bareAmp = [...svg.matchAll(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g)]
  if (bareAmp.length) problems.push(`${name}: ${bareAmp.length} unescaped '&'`)

  // Tag balance, ignoring self-closing tags and the XML declaration.
  const opens = [...svg.matchAll(/<([a-zA-Z][\w:-]*)(?![^>]*\/>)[^>]*>/g)].map((m) => m[1])
  const closes = [...svg.matchAll(/<\/([a-zA-Z][\w:-]*)>/g)].map((m) => m[1])
  const tally = new Map()
  for (const t of opens) tally.set(t, (tally.get(t) || 0) + 1)
  for (const t of closes) tally.set(t, (tally.get(t) || 0) - 1)
  for (const [tag, n] of tally) if (n !== 0) problems.push(`${name}: <${tag}> unbalanced by ${n}`)

  if (!/^<svg[\s>]/.test(svg.trim())) problems.push(`${name}: does not start with <svg`)
  if (!svg.trim().endsWith("</svg>")) problems.push(`${name}: does not end with </svg>`)
  if (svg.includes("undefined")) problems.push(`${name}: contains the literal 'undefined'`)
  if (/(width|height|x|y)="NaN"/.test(svg)) problems.push(`${name}: contains NaN geometry`)

  const dims = /<svg[^>]*width="(\d+)"[^>]*height="(\d+)"/.exec(svg)
  if (!dims) problems.push(`${name}: no width/height on the root element`)
}

console.log(`checked ${files.length} generated SVGs`)
if (problems.length) {
  console.error(`\n${problems.length} problem(s):`)
  for (const p of problems) console.error(`  ! ${p}`)
  process.exit(1)
}
console.log("all parse clean")
