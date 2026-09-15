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
 *   tier: "core"       always displayed; the work that defines the page.
 *   tier: "candidate"  eligible, competes for the remaining slots.
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
 * Deliberately NOT used: stars, forks, watchers. Those measure an audience, not
 * work, and on a page that carries no other vanity metrics they would be the
 * only ones — see the note at the top of panels/work.mjs.
 */

const DAY = 86400e3

/** How far back recency is measured before a project stops contributing. */
const RECENCY_WINDOW_DAYS = 180

/** Floor for a project with no recent commits, so it ranks last, not at zero. */
const RECENCY_FLOOR = 0.05

/** Weight of recency vs volume in the composite score. */
const W_RECENCY = 0.6
const W_VOLUME = 0.4

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
      // outrank something being actively built.
      weight: Number.isFinite(p.weight) ? Math.max(0, p.weight) : 0,
      // Days a challenger must lead the incumbent before displacing it. See
      // `select` for why the guard is needed at all.
      hysteresis: Number.isFinite(p.hysteresis) ? Math.max(0, p.hysteresis) : 0,
    }
  })
}

/** The single derived list both panels read. */
export const displayable = (projects) => projects

/**
 * Repositories the language chart counts.
 *
 * Derived from the same pool as the cards, so the two panels cannot disagree
 * about what the work is. Only `count` projects are eligible; `exclude` and
 * `n/a` are dropped HERE, once, rather than in a second list kept in sync by
 * hand.
 */
export const languageRepos = (projects) => projects.filter((p) => p.languages === "count").map((p) => p.repo)

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
  return { recency, volume, composite, score: Math.max(composite, p.weight) }
}

/**
 * Turn the pool into the ordered, capped list of cards to draw.
 *
 * @param projects  normalised pool
 * @param activity  { "owner/repo": { lastCommitAt, commits, lines } }
 * @param cfg       full config (for workSlots)
 * @param now       Date
 * @param pinned    keys to keep in place (previous build); see below
 *
 * HYSTERESIS. `pinned` is the set of candidates displayed by the previous
 * build, read from the committed `assets/generated/selected-work.json`. A
 * challenger has to lead an incumbent by the incumbent's `hysteresis` days of
 * recency before it takes the slot. Without it a single commit on a side
 * project reshuffles the portfolio for a day and reshuffles it back, which
 * reads as noise rather than as a decision.
 *
 * The guard only ever holds a project that is still eligible and still close;
 * a genuinely abandoned incumbent loses the slot as soon as the gap opens.
 */
export function select(projects, activity, cfg, now, pinned = null) {
  const slots = cfg.workSlots ?? 6
  const rows = projects.map((p) => {
    const days = recencyOf(p.repo, activity, now)
    return { p, days, s: score(p, days, activity?.[p.repo]?.lines ?? 0) }
  })

  const byScore = (a, b) => b.s.score - a.s.score || a.p.key.localeCompare(b.p.key)

  const core = rows.filter((r) => r.p.tier === "core").sort(byScore)
  const rest = rows.filter((r) => r.p.tier !== "core").sort(byScore)

  // Core always shows. If config declares more core projects than there are
  // slots the extra ones are dropped by score rather than silently shrinking
  // the page, because the layout is a fixed six-card grid.
  const chosen = [...core]

  // Slots left once core has taken its place. Core is not subject to the
  // guard: it is pinned by declaration, not by history.
  const openSlots = Math.max(0, slots - chosen.length)

  if (pinned && pinned.length && openSlots > 0) {
    const incumbents = rest.filter((r) => pinned.includes(r.p.key))
    const challengers = rest.filter((r) => !pinned.includes(r.p.key))

    // The guard is expressed in days of recency, so it is directly comparable
    // to the gap the reader can see: "this challenger must be N days fresher
    // than what it would replace." Converted to score units because that is
    // what the ordering runs on.
    const guardOf = (inc) => (inc.p.hysteresis / RECENCY_WINDOW_DAYS) * W_RECENCY

    // SEAT THE STRONGEST FIRST, from one merged list. Seating challengers and
    // incumbents in two separate passes is the bug this replaced: the
    // incumbent pass only ran after the challenger pass had already filled
    // every slot, so a stale incumbent silently kept its place forever while a
    // decisively more active project waited outside. Merging means each seat is
    // decided once, on merit, with the guard applied at the moment of decision.
    const seated = []
    const seatable = [...rest].sort(byScore)

    for (const cand of seatable) {
      if (seated.length >= openSlots) break
      const isIncumbent = pinned.includes(cand.p.key)
      if (isIncumbent) { seated.push(cand); continue }

      // A challenger must clear every incumbent that would otherwise hold a
      // seat, by that incumbent's own guard margin.
      const blocked = incumbents.some(
        (inc) => !seated.includes(inc) && inc.p.hysteresis > 0 && cand.s.score <= inc.s.score + guardOf(inc)
      )
      if (!blocked) seated.push(cand)
    }

    chosen.push(...seated)
  } else if (openSlots > 0) {
    chosen.push(...rest.slice(0, openSlots))
  }

  return chosen
    .slice(0, slots)
    .sort((a, b) => b.s.score - a.s.score || a.p.key.localeCompare(b.p.key))
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
