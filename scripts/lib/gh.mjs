/**
 * Minimal GitHub client. Reads GH_TOKEN / METRICS_TOKEN from the environment
 * and never logs it. Every call here touches public data only; the token
 * exists because the contribution calendar and the GraphQL endpoint refuse
 * anonymous requests, not because we need private scope.
 */

const TOKEN = process.env.METRICS_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_TOKEN || ""
const API = "https://api.github.com"

if (!TOKEN) {
  console.warn("! no token in env (METRICS_TOKEN / GH_TOKEN); unauthenticated requests will be rate limited")
}

const headers = () => ({
  accept: "application/vnd.github+json",
  "user-agent": "yunmin311-profile-builder",
  ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}),
})

async function request(url, init = {}, attempt = 0) {
  const res = await fetch(url, { ...init, headers: { ...headers(), ...(init.headers || {}) } })
  if (res.status === 403 || res.status === 429) {
    const reset = Number(res.headers.get("x-ratelimit-reset") || 0) * 1000
    const wait = Math.min(Math.max(reset - Date.now(), 1000), 60_000)
    if (attempt < 2) {
      console.warn(`! rate limited, retrying in ${Math.round(wait / 1000)}s`)
      await new Promise((r) => setTimeout(r, wait))
      return request(url, init, attempt + 1)
    }
  }
  if (!res.ok) throw new Error(`${init.method || "GET"} ${url.replace(API, "")} -> ${res.status} ${await res.text()}`)
  return res.json()
}

export const rest = (path, init) => request(path.startsWith("http") ? path : API + path, init)

export async function graphql(query, variables = {}) {
  const body = await request(`${API}/graphql`, {
    method: "POST",
    body: JSON.stringify({ query, variables }),
  })
  if (body.errors?.length) throw new Error(`graphql: ${body.errors.map((e) => e.message).join("; ")}`)
  return body.data
}

/** Public events for a user, newest first, up to `pages` x 100. */
export async function events(login, pages = 3) {
  const all = []
  for (let page = 1; page <= pages; page++) {
    let batch
    try {
      batch = await rest(`/users/${login}/events/public?per_page=100&page=${page}`)
    } catch {
      break
    }
    if (!Array.isArray(batch) || !batch.length) break
    all.push(...batch)
    if (batch.length < 100) break
  }
  return all
}

/** Most recently starred repositories, newest first. */
export async function starred(login, limit = 3) {
  const list = await rest(`/users/${login}/starred?per_page=${Math.max(limit, 10)}&sort=created&direction=desc`, {
    headers: { accept: "application/vnd.github.star+json" },
  })
  return list
    .map((entry) => (entry.repo ? { starredAt: entry.starred_at, ...entry.repo } : entry))
    .slice(0, limit)
}

export const languagesOf = (fullName) => rest(`/repos/${fullName}/languages`)
export const repoOf = (fullName) => rest(`/repos/${fullName}`)
