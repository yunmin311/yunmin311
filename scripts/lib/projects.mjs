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
 * THE ONE RULE, IN FIVE LINES:
 *
 *   snapshots  = authoredSnapshots(pool)          ONE clone per repo, per build
 *   scope      = select(projects, ...)            what is on the page
 *   ordering   = recency(0.6) + volume(0.4)       how the cards are placed
 *   stability  = hysteresis, in days              what it takes to displace
 *   permanence = `pinned: []` in config           what never moves, by hand
 *
 * FAIL-CLOSED SELECTION. A showcase is a curated thing, and an external
 * collection failure is not evidence about the work. So the rule holds the
 * previous membership whenever this run cannot fully justify a change: if any
 * project went unmeasured, or a currently displayed one did, the cast is frozen
 * and only the ordering is recomputed. `select()` reports this as `held`, and
 * `_state` on each result distinguishes a project that is genuinely inactive
 * from one that simply could not be measured. See `signalState`.
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
 * What do we actually know about one repository this run?
 *
 * THREE STATES, and collapsing any two of them is a bug. The earlier version
 * had two, because "we could not measure it" and "it has not been touched" both
 * arrived as `lastCommitAt: null` and both scored the same floor. A five-second
 * clone failure could therefore read as "abandoned" and drop a project off the
 * profile for six hours.
 *
 *   "fresh"    measured, and the reading is recent enough to act on.
 *   "stale"    measured, and the reading genuinely says this is not active.
 *              Real evidence. Entitled to lose a card.
 *   "unknown"  NOT measured. Carries no information about activity at all and
 *              must never be scored as though it did. The only permitted
 *              consequence is that this run lacks the evidence to change
 *              SELECTED WORK's membership.
 *
 * @param snapshot a snapshot from lib/authored.mjs, or undefined if the repo
 *                 was never requested at all
 */
export function signalState(snapshot) {
  if (!snapshot || snapshot.outcome !== "ok") return "unknown"
  // A successful walk that found no commit by this author is real evidence:
  // the repository cloned, its whole history was read, and none of it is ours.
  return snapshot.lastCommitAt ? "fresh" : "stale"
}

/**
 * Days since this author's last commit, or null when the age is not knowable.
 *
 * Returns null for an unmeasured repository rather than Infinity, because
 * "unknown" is not "infinitely old" — see `signalState`.
 */
export function recencyOf(repo, activity, now) {
  const snap = activity?.[repo]
  if (signalState(snap) !== "fresh") return null
  const last = new Date(snap.lastCommitAt).getTime()
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
    const state = signalState(activity?.[p.repo])
    const days = recencyOf(p.repo, activity, now)
    const lines = state === "unknown" ? 0 : activity?.[p.repo]?.lines ?? 0
    return { p, state, days, s: score(p, days, lines) }
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
  const incumbentSet = prev?.length ? new Set(prev) : null
  const incumbents = incumbentSet ? seatable.filter((r) => incumbentSet.has(r.p.key)) : []

  // ---- the fail-closed decision, BEFORE any seat is assigned ----------------
  //
  // Membership changes only when this run can actually justify them. Two
  // conditions, both required:
  //
  //   1. every SEATABLE project was measured. One unmeasured project means the
  //      ordering cannot be trusted, because the missing project might belong
  //      anywhere in it. This is why a collection failure is disqualifying even
  //      when it happens to a project nobody was going to display: the run no
  //      longer knows what it does not know.
  //
  //   2. every PREVIOUSLY DISPLAYED project is present and measured. An
  //      incumbent we cannot see is an incumbent we cannot compare against, and
  //      dropping it on no evidence is exactly the behaviour being removed.
  //
  // With no previous run there is nothing to protect, so a first build seats on
  // whatever it has and does not need to clear this bar.
  const unmeasured = seatable.filter((r) => r.state === "unknown")
  const missingIncumbents = incumbents.filter((r) => r.state === "unknown")
  const canChangeMembership = !incumbentSet || (unmeasured.length === 0 && missingIncumbents.length === 0)

  if (incumbentSet && !canChangeMembership) {
    // Hold the line: the previous membership, filtered to projects that still
    // exist in the pool (a key removed from config is an author's decision and
    // is NOT a collection failure). Ordering is still recomputed from whatever
    // readings are available, so the page stays coherent; only the CAST is
    // frozen.
    //
    // Note what is deliberately NOT done here: an incumbent that failed this
    // round keeps the membership it earned last round. It is not scored as
    // inactive, not re-scored at the floor, and not replaced by whoever
    // happened to clone successfully.
    const held = rows.filter((r) => incumbentSet.has(r.p.key))
    return {
      picked: held
        .slice(0, slots)
        .sort(byScore)
        .map((r) => ({ ...r.p, _days: r.days, _score: r.s.score, _state: r.state })),
      held: true,
      reason: unmeasured.length
        ? `${unmeasured.length} project(s) could not be measured`
        : `${missingIncumbents.length} displayed project(s) could not be measured`,
      // A project can be missing for both reasons at once, so the two lists are
      // unioned rather than concatenated — the report is a set of affected
      // projects, and naming the same one twice reads as two failures.
      unmeasured: [...new Set([...unmeasured, ...missingIncumbents].map((r) => r.p.key))],
    }
  }

  // ---- normal path: the evidence is complete --------------------------------

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

    // An unmeasured challenger has no score to argue with, so it cannot
    // displace anyone — but this only arises on a first build, since an
    // unmeasured project anywhere else already held the membership above.
    if (cand.state === "unknown") continue

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

  return {
    picked: [...fixed, ...seated]
      .slice(0, slots)
      // Cards are placed by score, so the grid does not reorder itself every time
      // somebody edits a weight. This ordering is what the reader sees and what
      // the build log prints.
      .sort(byScore)
      .map((r) => ({ ...r.p, _days: r.days, _score: r.s.score, _state: r.state })),
    held: false,
    reason: null,
    unmeasured: [],
  }
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
 *
 * IT COMPARES ONLY WHAT WAS ACTUALLY MEASURED. This gate drives the build red,
 * so it is the one place where misreading "unknown" is expensive in the other
 * direction: treating an unmeasured project as "not stale" would report the
 * page as healthy on a run whose evidence was incomplete, and treating it as
 * "infinitely old" would fail a build for a five-second network error. Neither
 * is true, so unmeasured projects are dropped from BOTH sides of the
 * comparison and `measured` reports the count it kept. A run with too few
 * readings to compare returns `stale: false` and `comparable: false`,
 * explicitly, rather than a number that looks like a verdict.
 */
export function staleness(projects, activity, displayed, now, toleranceDays = 30) {
  const shown = new Set(displayed.map((p) => p.key))
  const state = (p) => signalState(activity?.[p.repo])

  const outside = projects.filter((p) => !shown.has(p.key))
  const inside = displayed

  const measured = (ps) => ps.filter((p) => state(p) === "fresh").map((p) => recencyOf(p.repo, activity, now))
  const outDays = measured(outside)
  const inDays = measured(inside)

  const unmeasured = [...outside, ...inside].filter((p) => state(p) === "unknown").length
  const notComparable = { stale: false, comparable: false, unmeasured }

  // Nothing outside to compare against is not a problem — it is a pool that is
  // entirely on the page. Nothing INSIDE means the page is empty.
  if (!outDays.length || !inDays.length) return notComparable

  const bestOutside = Math.min(...outDays)
  const worstInside = Math.max(...inDays)
  const lag = worstInside - bestOutside
  return {
    stale: lag > toleranceDays,
    comparable: true,
    lagDays: Math.round(lag),
    bestOutsideDays: Math.round(bestOutside),
    worstInsideDays: Math.round(worstInside),
    unmeasured,
  }
}
