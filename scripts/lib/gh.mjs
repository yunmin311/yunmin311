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

/**
 * THE PINNED REPOSITORIES ON THE PROFILE — the source SELECTED WORK reads.
 *
 * Why this and not a ranking of any kind: "which projects are worth showing" is
 * a judgement, and the author already makes it once, by hand, in GitHub's own
 * `Customize your pins` dialog. Re-deriving that from commits, recency or stars
 * meant the page could disagree with the author about their own portfolio, and
 * meant that changing the page required editing a config file. Reading the pins
 * makes the profile the single place that decision is made.
 *
 * ORDER IS THE SERVER'S, DELIBERATELY. `pinnedItems` returns pins in the order
 * they were arranged on the profile. That order is re-sorted nowhere — the
 * cards are drawn in exactly the sequence returned, so dragging a pin moves the
 * card.
 *
 * NOT SCRAPING. The public profile page renders pins as plain HTML, and reading
 * that would break on any markup change and would be invisible until it did.
 * The GraphQL field is the documented interface for the same data.
 *
 * THE LIMIT IS NOT POLICY. GitHub caps a profile at six pins, so `first: 6` is
 * the maximum meaningful page size rather than a tunable number — asking for
 * fewer would silently hide pins the author can see on their own profile. A
 * profile with four pins returns four nodes and the page shows four cards;
 * nothing pads the list.
 *
 * THROWS ON FAILURE, and that is the point. The caller must be able to tell
 * "this profile has no pins" (an empty array — an authoritative answer) from
 * "we could not ask" (an exception). Collapsing the two is what would let a
 * transient network error empty the showcase.
 */
export const PIN_LIMIT = 6

export async function pinnedRepos(login, limit = PIN_LIMIT) {
  const data = await graphql(
    `query($login:String!,$n:Int!){
       user(login:$login){
         pinnedItems(first:$n, types:[REPOSITORY]){
           nodes{
             ... on Repository{
               name
               nameWithOwner
               url
               description
               primaryLanguage{ name }
               repositoryTopics(first:6){ nodes{ topic{ name } } }
             }
           }
         }
       }
     }`,
    { login, n: limit }
  )
  const user = data?.user
  if (!user) throw new Error(`graphql: user \`${login}\` does not exist`)
  const nodes = user.pinnedItems?.nodes
  if (!Array.isArray(nodes)) throw new Error("graphql: pinnedItems returned no nodes array")
  // `... on Repository` leaves a null for any node that is not a repository,
  // which cannot happen for `types: [REPOSITORY]` but would crash the card
  // builder rather than degrade. Dropping them here keeps that guarantee local.
  return nodes.filter(Boolean)
}
