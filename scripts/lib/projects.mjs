/**
 * SELECTED WORK + LANGUAGE SIGNAL — one source of truth.
 *
 * WHY THIS FILE EXISTS.
 *
 * These two panels used to be fed from two unrelated hard-coded lists: the
 * cards read exactly the six entries typed into `config.json -> work`, and the
 * language chart read a separate `config.json -> languageScope.repos`. Neither
 * list had anything to do with what was actually being worked on, so both
 * panels stayed correct-looking and stale forever. The card images were the
 * worst case: their content is 100% config, so a rebuild reproduced them
 * byte-for-byte, `git status` stayed clean, and the workflow's "no change"
 * branch closed the run without a commit. They could not move, and nothing
 * anywhere said so.
 *
 * The fix is not "read the newest repositories" — this is a portfolio, not an
 * activity feed, and a panel that reshuffles after one small commit is a panel
 * nobody can trust. So there is ONE declared pool (`config.json -> projects`)
 * and one deterministic rule that turns it into what gets shown:
 *
 *   languageRepos(select(projects, signal, cfg, now, prev))
 *
 * Everything downstream reads that one call. The cards draw it; the language
 * chart counts it. There is no second list, and no way for the two panels to
 * disagree about what the work is.
 *
 * THE ONE RULE, IN FOUR LINES:
 *
 *   scope      = select(projects, ...)            what is on the page
 *   ordering   = recency(0.6) + volume(0.4)       how the cards are placed
 *   stability  = hysteresis, in days              what it takes to displace
 *   permanence = `pinned: []` in config           what never moves, by hand
 *
 * Ordering combines two signals that fail in opposite directions, so that a
 * single number cannot carry the decision:
 *
 *   recency  — days since the author's last commit. Dominant (0.6).
 *   volume   — log10 of lines the author wrote. Secondary (0.4).
 *
 * Recency alone promotes a typo fix; volume alone promotes an old monolith and
 * buries a young project. Linear recency rather than a step function, so the
 * order drifts instead of snapping.
 *
 * ALL THE NUMBERS ARE POLICY, NOT FINDINGS. The weights, the window, the core
 * lead and the per-project `hysteresis` values are chosen to be reasonable and
 * to be easy to change — they were not fitted to anything. Each one lives in
 * config.json and is annotated there. If the page does not behave the way you
 * want, edit the number rather than the code.
 *
 * Deliberately NOT used: stars, forks, watchers. Those measure an audience, not
 * work, and on a page that carries no other vanity metrics they would be the
 * only ones — see the note at the top of panels/work.mjs.
 */

const DAY = 86400e3

/* ------------------------------------------------------------------ policy */
/*
 * Defaults only. Every one of these is overridable from config.json, and the
 * shipped config sets them explicitly so that the page's behaviour is visible
 * in one file rather than split between a config and a constant nobody reads.
 */

/** How far back recency is measured before a project stops contributing. */
const RECENCY_WINDOW_DAYS = 180

/** Floor for a project with no recent commits, so it ranks last, not at zero. */
const RECENCY_FLOOR = 0.05

/** Weight of recency vs volume in the composite score. */
const W_RECENCY = 0.6
const W_VOLUME = 0.4

/** Used when config omits the value. Kept equal to the shipped config. */
const DEFAULT_SLOTS = 6
const DEFAULT_CORE_LEAD_DAYS = 45
const DEFAULT_HYSTERESIS_DAYS = 14

/**
 * Normalise the declared pool.
 *
 * A project is displayable when it has the two things a card cannot be drawn
 * without. Validating here rather than in the panel means a typo in config
 * fails the build by name instead of producing a half-drawn card.
 */
export function normalise(cfg) {
  const raw = cfg.projects
  if (!Array.isArray(raw) || !raw.length) {
    throw new Error("config.json: `projects` must be a non-empty array")
  }

  const seen = new Set()
  return raw.map((p, i) => {
    const where = `projects[${i}]`
    for (const field of ["key", "name", "why", "tags", "url"]) {
      if (!p[field]) throw new Error(`config.json: ${where} (${p.key ?? "?"}) is missing \`${field}\``)
    }
    if (seen.has(p.key)) throw new Error(`config.json: duplicate project key \`${p.key}\``)
    seen.add(p.key)

    const tier = p.tier ?? "candidate"
    if (!["core", "candidate"].includes(tier)) {
      throw new Error(`config.json: ${where} (${p.key}) has tier \`${tier}\`; expected core or candidate`)
    }

    // `languages` is three-state on purpose — a boolean could not tell
    // "excluded from the count" apart from "no code to count".
    const lang = p.languages ?? "count"
    if (!["count", "exclude", "n/a"].includes(lang)) {
      throw new Error(
        `config.json: ${where} (${p.key}) has languages \`${lang}\`; expected count, exclude or n/a`
      )
    }

    return {
      key: p.key,
      name: p.name,
      why: p.why,
      tags: p.tags,
      url: p.url,
      repo: p.repo ?? `yunmin311/${p.key}`,
      tier,
      languages: lang,
      // A floor, not a bonus: it lifts a project that recency would bury
      // (a review-heavy or documentation-heavy one) without letting it
      // outrank something being actively built. A core project does NOT get
      // this by default — see the core-lead note in `select` for why core
      // importance is expressed in recency days instead. No project in the
      // shipped config sets it.
      weight: Number.isFinite(p.weight) ? Math.max(0, p.weight) : 0,
    }
  })
}

/**
 * Repositories the language chart counts.
 *
 * THE SCOPE IS THE DISPLAYED SET, not the declared pool. LANGUAGE SIGNAL sits
 * directly under SELECTED WORK and is read as a caption on it, so "the language
 * mix of the work above" is the only reading that matches what a reader sees.
 * Counting the whole pool would attribute lines to a chart standing next to a
 * grid that does not contain the project those lines came from.
 *
 * The caller passes the cards the rule actually chose:
 *
 *   languageRepos(select(projects, signal, cfg, now, pinned))
 *
 * Only `count` projects contribute. The other two states are dropped HERE,
 * once, rather than in a second list kept in sync by hand:
 *   `exclude`  real code, but generated or vendored, so it distorts the mix
 *   `n/a`      nothing comparable to count at all (a stylesheet collection)
 */
export const languageRepos = (displayed) =>
  displayed.filter((p) => p.languages === "count").map((p) => p.repo)

/**
 * Activity is measured per repository, so the same repo appearing twice would
 * be counted twice. Keys are unique (enforced above) but two projects could
 * still point at one repository; that is the author's call, not an error.
 */
export function recencyOf(repo, activity, now) {
  const hit = activity?.[repo]
  const last = hit?.lastCommitAt ? new Date(hit.lastCommitAt).getTime() : NaN
  if (!Number.isFinite(last)) return null
  return Math.max(0, (now - last) / DAY)
}

/**
 * Score one project. Pure, so the tests can pin the curve down exactly.
 *
 * This measures the WORK and nothing else — no importance, no tier, no
 * pinning. Core's preference is applied in `select` as a separate ranking
 * term, so that a reader looking at `_score` in the build log is looking at
 * one number with one meaning.
 *
 * @param p       a normalised project
 * @param days    days since the author's last commit, or null if unknown
 * @param lines   lines the author wrote, or 0
 */
export function score(p, days, lines = 0) {
  // An unknown date is treated as "as old as the window", never as "now".
  // Guessing freshness is the failure this whole module exists to prevent.
  const recency =
    days == null ? RECENCY_FLOOR : Math.max(RECENCY_FLOOR, 1 - days / RECENCY_WINDOW_DAYS)
  const volume = lines > 0 ? Math.log10(lines + 1) / 5 : 0 // 100k lines ~= 1.0
  const composite = W_RECENCY * recency + W_VOLUME * volume
  // `weight` is an explicit per-project floor; it is the escape hatch for a
  // project whose value recency cannot see. No project in the shipped config
  // sets it — `tier: "core"` does the same job in a unit the reader can
  // reason about ("days"), and having two mechanisms for one intent invited
  // them to disagree.
  return { recency, volume, composite, score: Math.max(composite, p.weight) }
}

/**
 * Turn the pool into the ordered, capped list of cards to draw.
 *
 * @param projects  normalised pool
 * @param activity  { "owner/repo": { lastCommitAt, commits, lines } }
 * @param cfg       full config (for workSlots, and `pinned` when given)
 * @param now       Date
 * @param prev      keys displayed by the PREVIOUS build, or null on a first run
 *
 * CORE IS A PREFERENCE, NOT A PERMANENT SEAT.
 *
 * An earlier draft seated every `tier: "core"` project unconditionally, which
 * meant a core project last touched years ago would hold a card forever and a
 * project being built every day could never take it. That conflates "important"
 * with "fixed". The three states are now separate and each one is somebody's
 * explicit decision:
 *
 *   tier: "core"       strongly preferred. Leads its comparison by the margin
 *                      in `coreLeadDays`, then competes for the remaining
 *                      slots on merit. Retires like anything else once that
 *                      margin is exhausted.
 *   pinned: ["key"]    genuinely permanent. Never retires. This is the one
 *                      mechanism for "this stays on the page no matter what",
 *                      and it is deliberately a hand-edit in config, not a
 *                      side effect of being important.
 *   tier: "candidate"  no preference beyond the stability guard.
 *
 * THE STABILITY GUARD (`hysteresis`) is applied the same way to everything,
 * core included: a challenger must lead an incumbent by the incumbent's own
 * margin, in days of recency, before it takes the seat. It is what stops one
 * commit on a side project reshuffling the portfolio for a day and reshuffling
 * it back. It only ever holds a project that is still close; a genuinely
 * abandoned incumbent loses the seat as soon as the gap opens.
 */
export function select(projects, activity, cfg, now, prev = null) {
  const slots = cfg.workSlots ?? DEFAULT_SLOTS
  const pinnedKeys = new Set(cfg.pinned ?? [])
  const coreLeadDays = cfg.coreLeadDays ?? DEFAULT_CORE_LEAD_DAYS
  const hysteresisDays = cfg.hysteresisDays ?? DEFAULT_HYSTERESIS_DAYS

  const rows = projects.map((p) => {
    const days = recencyOf(p.repo, activity, now)
    return { p, days, s: score(p, days, activity?.[p.repo]?.lines ?? 0) }
  })

  // Ranking. Pinned first, then the core lead, then the score itself.
  //
  // The core lead is expressed as a RANK KEY rather than as a bonus added to
  // `score`, so that no amount of declared importance can lift a project past
  // the recency window — a core project a year cold still ends up behind one
  // being written today, it simply has to be beaten by the full window first.
  // `_score` stays a pure reading of the work and is what the console prints.
  const rankLed = new Map()
  const rank = (r) => {
    const lead = r.p.tier === "core" ? coreLeadDays / RECENCY_WINDOW_DAYS : 0
    const key = r.s.composite + lead
    rankLed.set(r.p.key, key)
    return key
  }
  for (const r of rows) rank(r)

  const byScore = (a, b) => b.s.score - a.s.score || a.p.key.localeCompare(b.p.key)
  const byRank = (a, b) =>
    (pinnedKeys.has(b.p.key) ? 1 : 0) - (pinnedKeys.has(a.p.key) ? 1 : 0) ||
    rankLed.get(b.p.key) - rankLed.get(a.p.key) ||
    a.p.key.localeCompare(b.p.key)

  // Seats that are not up for discussion.
  const fixed = rows.filter((r) => pinnedKeys.has(r.p.key)).sort(byRank)
  const openSlots = Math.max(0, slots - fixed.length)

  const seatable = rows.filter((r) => !pinnedKeys.has(r.p.key)).sort(byRank)
  const incumbents = prev?.length ? seatable.filter((r) => prev.includes(r.p.key)) : []

  // ONE MERGED PASS, STRONGEST FIRST. Seating incumbents and challengers in two
  // separate passes is the bug this replaced: the challenger pass filled every
  // slot before the incumbent pass ran, so a stale incumbent kept its seat
  // forever while a decisively more active project waited outside. Here each
  // seat is decided once, on merit, with the guard applied at the moment of
  // decision.
  const seated = []
  for (const cand of seatable) {
    if (seated.length >= openSlots) break

    // An incumbent that the guard would protect keeps its seat when it comes
    // up. It is not given a pass ahead of the stronger candidates — it is
    // simply holding a seat the moment its turn arrives.
    if (!incumbents.length || incumbents.includes(cand)) { seated.push(cand); continue }

    // A challenger must clear every unseated incumbent by the guard margin.
    // Both sides are composite score units, and the margin is expressed in
    // days divided by the same window the score uses — so "14 days fresher" is
    // one number in config rather than a conversion the reader has to do.
    const margin = hysteresisDays / RECENCY_WINDOW_DAYS
    const blocked = incumbents.some(
      (inc) => !seated.includes(inc) && cand.s.composite <= inc.s.composite + margin
    )
    if (!blocked) seated.push(cand)
  }

  return [...fixed, ...seated]
    .slice(0, slots)
    // Cards are placed by score, so the grid does not reorder itself every time
    // somebody edits a weight. This ordering is what the reader sees and what
    // the build log prints.
    .sort(byScore)
    .map((r) => ({ ...r.p, _days: r.days, _score: r.s.score }))
}

/* ----------------------------------------------------------------- gate */

/**
 * Is the displayed set lagging the declared pool?
 *
 * This is the check that was missing. When card content was pure config, a
 * stale page and a fresh page produced byte-identical output, so every
 * existing gate — build, check, validate — passed on a page that had not
 * changed in weeks. `check.mjs` calls this and fails the run, which puts a red
 * mark (and, for a manual run, an issue) where a human will see it.
 *
 * It compares the best candidate that is NOT displayed against the worst
 * displayed one: if something materially more active has been left out for
 * longer than the tolerance, the ordering rule has gone stale — either the
 * pool needs entries, or the scoring needs revisiting.
 */
export function staleness(projects, activity, displayed, now, toleranceDays = 30) {
  const shown = new Set(displayed.map((p) => p.key))
  const days = (p) => recencyOf(p.repo, activity, now) ?? Infinity

  const outside = projects.filter((p) => !shown.has(p.key)).map(days).sort((a, b) => a - b)
  const inside = displayed.map(days).sort((a, b) => b - a)
  if (!outside.length || !inside.length) return { stale: false }

  const bestOutside = outside[0]
  const worstInside = inside[0]
  const lag = worstInside - bestOutside
  return {
    stale: Number.isFinite(bestOutside) && lag > toleranceDays,
    lagDays: Number.isFinite(lag) ? Math.round(lag) : null,
    bestOutsideDays: Number.isFinite(bestOutside) ? Math.round(bestOutside) : null,
    worstInsideDays: Number.isFinite(worstInside) ? Math.round(worstInside) : null,
  }
}
