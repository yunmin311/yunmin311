/** Throwaway static server so the QA page can be opened over http. */
import { createServer } from "node:http"
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { dirname, resolve, extname, normalize } from "node:path"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const TYPES = { ".html": "text/html", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".css": "text/css", ".js": "text/javascript", ".gif": "image/gif" }

createServer(async (req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0])
  const file = resolve(ROOT, "." + normalize(url === "/" ? "/.preview.html" : url))
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return }
  try {
    const buf = await readFile(file)
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream", "cache-control": "no-store" })
    res.end(buf)
  } catch {
    res.writeHead(404).end("not found")
  }
}).listen(4173, () => console.log("http://127.0.0.1:4173"))
