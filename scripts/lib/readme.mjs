/**
 * HOW A CARD IS WRITTEN INTO README.md.
 *
 * WHY THE README IS EDITABLE AT ALL. GitHub renders a README from committed
 * markup, so a card that exists as an image still has to be linked by hand —
 * there is no globbing of assets. Leaving that block hand-maintained would put
 * the cast back under manual control and re-create the original bug in a new
 * place: the pins would change on the profile and the page would still show the
 * old cards.
 *
 * Two properties this markup has to keep, both of them load-bearing:
 *
 *   ONE LINE PER CARD. Broken across lines, the markdown parser closes the
 *   inline context and the side-by-side cards stop flowing together — the note
 *   at the top of README.md says so, and it is why this is string concatenation
 *   rather than a template literal that a formatter would wrap.
 *
 *   ORDER IS THE INPUT ORDER, untransformed. The array arrives in pin order and
 *   is mapped, never sorted — the order the author arranged on their profile is
 *   the order the page shows, and this is the step that would silently undo it.
 *
 * It lives here rather than inside `build.mjs` so the ordering property can be
 * tested directly: a build script runs a build when imported, which makes it
 * impossible to unit-test anything it contains.
 */

/** Attribute values are quoted, so only these three characters can break out. */
export const escapeAttr = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")

/**
 * The `<a><picture>` line for one card.
 *
 * The alt and title mirror what the SVG itself carries, so the reader gets the
 * same sentence whether the image loaded or not.
 */
export const cardLink = (p) => {
  const alt = `${p.name} — ${p.why.replace(/\s+/g, " ")} ${p.tags.join(", ")}.`
  return (
    `<a href="${p.url}"><picture>` +
    `<source media="(max-width: 500px)" srcset="assets/generated/work-${p.key}-m.svg">` +
    `<img alt="${escapeAttr(alt)}" title="Open ${p.key} on GitHub" ` +
    `src="assets/generated/work-${p.key}.svg"></picture></a>`
  )
}

/** The whole block body, in the order given. */
export const cardLinks = (cards) => cards.map(cardLink).join("\n")
