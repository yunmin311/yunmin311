/**
 * Writes a local QA page showing every generated asset at 1:1, on both
 * backgrounds and at both widths. Not shipped — it exists so the panels get
 * looked at before they get committed.
 *
 *   node scripts/serve.mjs      then open http://127.0.0.1:4173/
 */

import { readdir, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const files = (await readdir(resolve(ROOT, "assets/generated"))).filter((f) => f.endsWith(".svg"))

const ORDER = ["hero", "sec-01", "about", "sec-03", "work", "sec-04", "rhythm", "languages", "stars", "activity", "sec-05", "contributions", "sec-07", "btn", "sec-08", "fortune"]
const rank = (f) => {
  const i = ORDER.findIndex((o) => f.startsWith(o))
  return i === -1 ? 99 : i
}

const pick = (theme, mobile) =>
  files
    .filter((f) => f.endsWith(`-${theme}.svg`))
    .filter((f) => /-m-(dark|light)\.svg$/.test(f) === mobile)
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))

const block = (theme, mobile) => {
  const list = pick(theme, mobile)
  return `
  <section class="${theme}">
    <h2>${theme.toUpperCase()} · ${mobile ? "MOBILE 344" : "DESKTOP"}</h2>
    <div class="flow">
      ${list.map((f) => `<figure><img src="assets/generated/${f}" alt="${f}"><figcaption>${f}</figcaption></figure>`).join("")}
    </div>
  </section>`
}

const html = `<!doctype html><meta charset="utf-8"><title>profile QA</title>
<style>
  body{margin:0;font:12px ui-monospace,Consolas,monospace}
  section{padding:28px 32px}
  section.dark{background:#0D1117;color:#8B949E}
  section.light{background:#fff;color:#57606A}
  h2{font:11px ui-monospace,monospace;letter-spacing:.2em;margin:0 0 20px;opacity:.55}
  .flow{display:flex;flex-wrap:wrap;gap:8px 6px;align-items:flex-start;max-width:840px}
  figure{margin:0}
  figcaption{margin-top:4px;opacity:.35;font-size:9px}
  img{display:block;max-width:100%}
</style>
${block("dark", false)}
${block("light", false)}
${block("dark", true)}
${block("light", true)}
`

await writeFile(resolve(ROOT, ".preview.html"), html, "utf8")
console.log(`· wrote .preview.html (${files.length} assets)`)

