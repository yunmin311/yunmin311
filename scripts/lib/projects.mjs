/**
 * THE SELECTED WORK / LANGUAGE SIGNAL MODEL.
 *
 * WHERE THE CARDS COME FROM.
 *
 * The membership of SELECTED WORK is THE PINNED REPOSITORIES ON THE GITHUB
 * PROFILE. Nothing else. The author pins a project in GitHub's own
 * `Customize your pins` dialog and the next rebuild shows it; pins are removed
 * or reordered there and the page follows. There is no pool to maintain, no
 * config array to edit, and no way for the page to disagree with the profile
 * about which projects the author considers worth showing.
 *
 * That decision replaces a scoring rule — recency (0.6) plus volume (0.4), a
 * `core` tier with a day-based lead, a hysteresis margin, a permanent `pinned`
 * list in config — which existed to ANSWER THE QUESTION "which six projects
 * should be shown". GitHub already has a first-class feature that answers it,
 * maintained by the person whose portfolio it is. Keeping the rule meant two
 * curation systems that could contradict each other, and the machine's one
 * won. It is gone, and so are its knobs.
 *
 * So this file no longer ranks anything. It does three things:
 *
 *   cardFrom()          one pinned repository + optional config override -> card
 *   languageScope()     which repositories LANGUAGE SIGNAL counts
 *   resolveCards()      what to draw when the pinned query could not be read
 *
 * LANGUAGE SIGNAL'S SCOPE IS NOT THE CARDS. The grid is a curated shortlist —
 * a claim about taste — and the chart beneath it measures the whole of the
 * public work that shortlist was drawn from. Deriving one from the other meant
 * the percentages could only ever describe whichever six repositories happened
 * to be pinned, which is a fact about the shortlist rather than about the work.
 * So the scope comes from the account's own repository list (see
 * `countsTowardLanguages`) and the two panels answer two different questions.
 * They still share ONE collection of snapshots — see lib/sources.mjs — so the
 * chart cannot be computed from a different observation than the one the build
 * made.
 *
 * WHAT IS CURATED AND WHAT IS DYNAMIC. This distinction is the whole reason the
 * original page went stale, so it is stated exactly:
 *
 *   CURATED (config.json -> cardOverrides)  the words on a card: `name`, `why`,
 *                                           `tags`. Written by hand, for the
 *                                           projects that deserve a sentence
 *                                           somebody thought about.
 *   DYNAMIC (GitHub)                        WHICH cards exist, in what ORDER,
 *                                           and the `url` / `repo` behind each.
 *                                           Also the fallback text for a pin
 *                                           that has no override yet.
 *   DERIVED (this build)                    LANGUAGE SIGNAL's numbers, and the
 *                                           scope it counted them over.
 *
 * A pin with no override is not an error and must not need a code change: the
 * card is built from the repository's own description, primary language and
 * topics. That is the case that makes "pin it and walk away" true.
 */

import { deEmoji } from "./design.mjs"
import { fitCopy, fitTags, fitsCard, fitsTags } from "./cards.mjs"

/* -------------------------------------------------------------- card keys */

/**
 * A stable, filename-safe key from a repository name.
 *
 * The key becomes an asset filename (`work-<key>.svg`), so it is restricted to
 * lower-case letters, digits and single hyphens. Derived rather than configured
 * so a rename on GitHub moves one file instead of silently orphaning the old
 * one under a key nobody remembers choosing.
 */
export const slug = (name) =>
  String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

/* ---------------------------------------------------------- config overlay */

/**
 * The hand-written half of a card, keyed by `owner/name`.
 *
 * Lookup is case-insensitive because GitHub returns the canonical casing of a
 * repository name and a human typing the key will not reliably reproduce it
 * (`yunmin311/DenseGPT` vs `yunmin311/densegpt`). Getting that wrong would
 * silently fall back to the GitHub description and lose the better copy, which
 * is the kind of failure nobody notices.
 *
 * A hand-written `why` is VALIDATED HERE and throws; a machine-derived one is
 * TRUNCATED. The asymmetry is deliberate. A human who overran the budget can
 * shorten it, so failing loudly is a fixable error and produces better copy
 * than a truncation would. Nobody in this repository can shorten a repository
 * description on GitHub, so failing on one would be a build that never goes
 * green again for a reason no commit can fix.
 */
export function cardOverrides(cfg) {
  const raw = cfg.cardOverrides ?? {}
  if (Array.isArray(raw) || typeof raw !== "object") {
    throw new Error("config.json: `cardOverrides` must be an object keyed by `owner/name`")
  }

  const out = new Map()
  for (const [repo, o] of Object.entries(raw)) {
    const where = `cardOverrides["${repo}"]`
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
      throw new Error(`config.json: ${where} is not an \`owner/name\` repository key`)
    }
    if (!o || typeof o !== "object") throw new Error(`config.json: ${where} must be an object`)

    for (const field of ["why", "tags"]) {
      if (o[field] === undefined) continue
      if (field === "why") {
        if (typeof o.why !== "string" || !o.why.trim()) throw new Error(`config.json: ${where}.why must be a non-empty string`)
        if (!fitsCard(o.why)) {
          throw new Error(
            `config.json: ${where}.why does not fit a card (desktop 4 lines / mobile 6 lines). ` +
              `Shorten it — this text is hand-written on purpose, so it is not truncated for you.`
          )
        }
      } else {
        if (!Array.isArray(o.tags) || !o.tags.length) throw new Error(`config.json: ${where}.tags must be a non-empty array`)
        if (!fitsTags(o.tags.slice(0, 4))) {
          throw new Error(`config.json: ${where}.tags is too wide for the two lines a card allows. Use fewer or shorter tags.`)
        }
      }
    }
    if (o.name !== undefined && (typeof o.name !== "string" || !o.name.trim())) {
      throw new Error(`config.json: ${where}.name must be a non-empty string`)
    }

    out.set(repo.toLowerCase(), o)
  }
  return out
}

/* ------------------------------------------------------------------ cards */

/**
 * One pinned repository -> one card.
 *
 * The field list is exactly what `panels/work.mjs` draws and what the README
 * block links to. Everything the card shows is decided here, so the panel stays
 * drawing code and the README rewrite stays a template.
 *
 * THE FALLBACK IS DELIBERATELY UNIMAGINATIVE. When there is no override and the
 * repository carries no description, `why` becomes the repository's own name.
 * A card whose body repeats its title looks unfinished — and that is the
 * correct outcome, because the alternative is generating marketing copy about
 * somebody else's project from a filename, which is worse than an obvious gap.
 * The fix is to write the sentence in config, or to write a description on
 * GitHub, and both of those are one edit for the person who owns the project.
 */
export function cardFrom(repo, overrides = new Map()) {
  const key = slug(repo.name)
  if (!key) throw new Error(`pinned repository \`${repo.nameWithOwner}\` has no usable name`)

  const o = overrides.get(String(repo.nameWithOwner).toLowerCase()) ?? {}
  const description = deEmoji(repo.description)

  // Primary language first: on every one of these cards it is the most useful
  // tag, and `fitTags` drops from the END when the run is too wide, so putting
  // it first is what protects it.
  const derivedTags = [
    repo.primaryLanguage?.name,
    ...(repo.repositoryTopics?.nodes ?? []).map((n) => n?.topic?.name),
  ]

  return {
    key,
    name: o.name ?? repo.name,
    why: o.why ?? fitCopy(description || repo.name),
    tags: o.tags ?? fitTags(derivedTags),
    url: repo.url,
    repo: repo.nameWithOwner,
    // Records where the copy came from, so the build log can say which cards
    // still need a sentence written for them instead of leaving it to be
    // noticed on the page.
    unedited: o.why ? false : true,
  }
}

/**
 * Build the whole card list, in PIN ORDER, and refuse a set that cannot be
 * drawn.
 *
 * Order is not touched: the array comes back exactly as GitHub returned it.
 * Two repositories whose names slug to the same key would overwrite each
 * other's card file, so that is rejected by name rather than producing a grid
 * with a card missing and no explanation.
 */
export function cardsFrom(repos, overrides = new Map()) {
  const cards = repos.map((r) => cardFrom(r, overrides))
  const seen = new Set()
  for (const c of cards) {
    if (seen.has(c.key)) throw new Error(`two pinned repositories share the card key \`${c.key}\``)
    seen.add(c.key)
  }
  return cards
}

/* ----------------------------------------------------------- language scope */

/**
 * Does this repository belong in LANGUAGE SIGNAL?
 *
 * The scope is EVERY PUBLIC REPOSITORY THIS ACCOUNT OWNS, which is a different
 * question from "which projects are on the page". The cards are a curated
 * shortlist — a claim about taste — and the chart under them measures the body
 * of work that shortlist was drawn from. Tying the two together meant the chart
 * could only ever describe six repositories, which made a percentage a fact
 * about the shortlist rather than about the work.
 *
 * Four exclusions, each for its own reason:
 *
 *   forks      somebody else's code; counting it would count their lines
 *   archived   no longer maintained, and usually superseded
 *   not PUBLIC GitHub can hand over private repositories to an authorised
 *              token, and this page is public — a chart computed from them
 *              would publish a number nobody outside can verify
 *   the profile repository itself (`<login>/<login>`) — it contains one README
 *              and no code, and it is the page the chart is drawn on
 *
 * The last one is compared case-insensitively: GitHub returns canonical casing,
 * but a login is not case-sensitive and a mismatch here would put the profile
 * repository back into its own chart with nothing to show for it.
 *
 * `visibility` is tested on the node rather than trusted from the query's
 * `privacy: PUBLIC` filter, and `isArchived` is not a filter this connection
 * even exposes. The query narrows; this decides.
 */
export function countsTowardLanguages(repo, login) {
  if (!repo || !repo.nameWithOwner) return false
  if (repo.isFork || repo.isArchived) return false
  if (String(repo.visibility ?? "").toUpperCase() !== "PUBLIC") return false
  if (repo.nameWithOwner.toLowerCase() === `${login}/${login}`.toLowerCase()) return false
  return true
}

/**
 * The repository list LANGUAGE SIGNAL counts, in the order GitHub returned it
 * (by name, so the list is stable between runs).
 *
 * There is no second list anywhere: this is the only place the scope is
 * derived, and every consumer — the collection, the chart, the state file, the
 * gate — reads its output.
 */
export const languageScope = (repos, login) =>
  repos.filter((r) => countsTowardLanguages(r, login)).map((r) => r.nameWithOwner)

/**
 * The two sentences on the LANGUAGE SIGNAL panel.
 *
 * They live here rather than inline in the collector because the panel cuts its
 * note to a fixed number of lines SILENTLY — `.slice(0, mobile ? 3 : 2)` — so a
 * note that grew past the budget would ship as a sentence ending mid-word with
 * nothing anywhere reporting it. Keeping the wording somewhere a test can reach
 * is what makes that checkable: see the width assertion in test-projects.mjs,
 * which measures these strings with the same wrap the panel uses.
 *
 * The caption says what the number is over. It used to read "across the
 * selected work above", which stopped being true the moment the scope became
 * the whole account — a caption naming repositories the chart does not measure
 * is worse than no caption.
 */
export const LANGUAGES_CAPTION = "LINES I WROTE, ACROSS EVERY PUBLIC REPOSITORY"

/**
 * The panel's note, sized to the lines it is actually given.
 *
 * The wording is not free: on the phone layout the panel draws three lines of
 * thirty-six characters and SILENTLY drops the rest, so a sentence a few words
 * longer than this ships cut mid-word with nothing reporting it. Saying "across
 * all 15 public repos" instead of "across 15 public repos" costs four characters
 * and pushes it to four lines — which is how the width assertion in
 * test-projects.mjs came to exist, and why the phrase reads the way it does.
 *
 * The completeness statement survives as the number itself: a complete reading
 * names the scope, and a partial one says how much of it was reached.
 */
export function languageNote({ commits, measured, scope, partial }) {
  const covered = partial ? `${measured} of ${scope}` : String(scope)
  return (
    `Lines I added in ${commits} commits I authored, across ${covered} ` +
    `${scope === 1 ? "public repo" : "public repos"}. Generated and vendored excluded.`
  )
}

/* ----------------------------------------------------------- the decision */

/**
 * Which cards this run draws — the ONLY place the fail-closed rule lives.
 *
 * Kept pure and separate from the network call so the rule can be tested
 * without one. `pins` is what the pinned query returned, or `null` when it could
 * not be completed; the two cases are the whole decision:
 *
 *   pins is a list  -> build the cards from it, in its order. An empty list is a
 *                      real answer (the author unpinned everything) and yields
 *                      an empty grid rather than a fallback.
 *   pins is null    -> HOLD. Draw the cards the last successful run recorded and
 *                      report why. NEVER substitute a ranking: recent pushes,
 *                      stars and activity are all guesses about which projects
 *                      matter, made during the one run least able to justify
 *                      them, and the page would change and then change back.
 *
 * The only case that throws is having nothing at all to draw — a first run whose
 * pinned query failed. That is a real failure and should be loud, because the
 * alternative is shipping a page with an empty showcase and no explanation.
 */
export function resolveCards({ pins, pinnedError, overrides = new Map(), lastKnownGood = null }) {
  if (pins) return { cards: cardsFrom(pins, overrides), held: false, holdReason: null }

  const last = lastKnownGood?.cards
  if (!Array.isArray(last) || !last.length) {
    throw new Error(
      `SELECTED WORK cannot be drawn: the pinned repositories could not be read (${pinnedError ?? "unknown error"}) ` +
        `and no previous run recorded a card set to hold on to.`
    )
  }
  return { cards: last, held: true, holdReason: pinnedError ?? "the pinned query did not complete" }
}

/* ---------------------------------------------------------------- signals */

/**
 * What do we actually know about one repository this run?
 *
 * THREE STATES, and collapsing any two of them is a bug:
 *
 *   "fresh"    measured, and the reading says this repository has commits by
 *              this author.
 *   "stale"    measured, and the reading says it has none. Real evidence — the
 *              clone succeeded and the whole history was read.
 *   "unknown"  NOT measured. Carries no information at all.
 *
 * Membership no longer depends on any of this: the pins decide what is shown.
 * What survives is the distinction the panel needs — a pinned repository whose
 * analysis failed this round must read as UNAVAILABLE in LANGUAGE SIGNAL, never
 * as zero lines, and must stay on the page as a card. Scoring "we could not
 * reach it" as "it contributed nothing" would silently shrink the chart's total
 * and re-normalise every percentage around the hole.
 *
 * @param snapshot a snapshot from lib/authored.mjs, or undefined if the repo
 *                 was never requested at all
 */
export function signalState(snapshot) {
  if (!snapshot || snapshot.outcome !== "ok") return "unknown"
  return snapshot.lastCommitAt ? "fresh" : "stale"
}
