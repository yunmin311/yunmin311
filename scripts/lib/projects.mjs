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
 *   cardFrom()       one pinned repository + optional config override -> card
 *   languageRepos()  which of those cards LANGUAGE SIGNAL counts
 *   signalState()    was this repository measured, or merely not reached
 *
 * LANGUAGE SIGNAL's scope is the SAME pinned set: `languageRepos(cards)`. The
 * chart sits directly under the grid and is read as a caption on it, so a
 * second repository list — even one derived from the first — is a way for the
 * two panels to disagree. Both read one list of snapshots. See lib/sources.mjs
 * for the collection, which happens once per repository.
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

const LANGUAGES = ["count", "exclude", "n/a"]

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
    if (o.languages !== undefined && !LANGUAGES.includes(o.languages)) {
      throw new Error(`config.json: ${where}.languages is \`${o.languages}\`; expected count, exclude or n/a`)
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
    languages: o.languages ?? "count",
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
 * Repositories LANGUAGE SIGNAL counts.
 *
 * THE SCOPE IS THE PINNED SET, which is also exactly what is displayed. The
 * chart sits directly under SELECTED WORK and is read as a caption on it, so
 * "the language mix of the work above" is the only reading that matches what a
 * reader sees.
 *
 * `languages` is three-state and stays that way, because the states are still
 * real and would otherwise have to be re-expressed as a second list:
 *   `count`    contributes to the chart (the default, and what every pin is)
 *   `exclude`  real code, but generated or vendored, so it distorts the mix
 *   `n/a`      nothing comparable to count at all (a stylesheet collection)
 * An opt-out is a deliberate hand-edit in config, never an inference.
 */
export const languageRepos = (cards) =>
  cards.filter((c) => c.languages === "count").map((c) => c.repo)

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
