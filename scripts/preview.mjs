/**
 * Writes a local QA page that shows every generated asset at 1:1 on both
 * backgrounds. Not shipped to the profile — it exists so the panels get looked
 * at before they get committed.
 *
 *   node scripts/preview.mjs && start .preview.html
 */

import { readdir, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const files = (await readdir(resolve(ROOT, "assets/generated"))).filter((f) => f.endsWith(".svg"))

const ORDER = ["hero", "rhythm", "languages", "stars", "activity", "contributions", "fortune"]
const rank = (f) => {
  const i = ORDER.findIndex((o) => f.startsWith(o + "-"))
  return i === -1 ? 99 : i
}

const section = (theme) => {
  const mine = files.filter((f) => f.endsWith(`-${theme}.svg`)).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
  const panels = mine.filter((f) => !f.startsWith("btn-"))
  const btns = mine.filter((f) => f.startsWith("btn-"))
  return `
  <section class="${theme}">
    <h2>${theme.toUpperCase()}</h2>
    ${panels.map((f) => `<figure><img src="assets/generated/${f}" alt="${f}"><figcaption>${f}</figcaption></figure>`).join("")}
    <figure class="row">${btns.map((f) => `<img src="assets/generated/${f}" alt="${f}">`).join("")}<figcaption>contact</figcaption></figure>
  </section>`
}

const html = `<!doctype html><meta charset="utf-8"><title>profile QA</title>
<style>
  body{margin:0;font:12px ui-monospace,Consolas,monospace}
  section{padding:32px 40px}
  section.dark{background:#0D1117;color:#8B949E}
  section.light{background:#fff;color:#656D76}
  h2{font:11px ui-monospace,monospace;letter-spacing:.2em;margin:0 0 24px;opacity:.6}
  figure{margin:0 0 26px}
  figure.row{display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap}
  figcaption{margin-top:6px;opacity:.45;font-size:10px}
  img{display:block;max-width:100%}
  .pair{display:flex;gap:20px;flex-wrap:wrap}
  .pair figure{flex:0 0 auto}
</style>
${section("dark")}
${section("light")}
`

await writeFile(resolve(ROOT, ".preview.html"), html, "utf8")
console.log("· wrote .preview.html")
