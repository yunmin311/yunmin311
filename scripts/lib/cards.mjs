/**
 * THE WORK CARD'S COPY BUDGET, and the wrap that enforces it.
 *
 * WHY THIS IS A SEPARATE FILE.
 *
 * A card is a fixed-height box: 4 lines of body copy on the desktop layout and
 * 6 on the phone one, wrapping at a known per-line character count because the
 * face is monospaced. `panels/work.mjs` throws when copy overruns that budget —
 * deliberately, because a silently clipped sentence is worse than a red build.
 *
 * That throw was safe while every card's text was hand-written in config.json:
 * a human typing into a file can be told to shorten it. It stops being safe the
 * moment card text can come from a PINNED REPOSITORY'S GITHUB DESCRIPTION, which
 * nobody edits before it arrives. A 300-character description would then fail
 * the build on every run until somebody changed a repo on GitHub — a permanent
 * build failure caused by external data, which is exactly the class of bug this
 * change exists to remove.
 *
 * So the budget lives here, once, and both sides import it:
 *
 *   panels/work.mjs   draws to it   (imports `wrap` and the line counts)
 *   lib/projects.mjs  truncates against it before anything is drawn
 *
 * The numbers are DERIVED from the layout constants rather than typed in, so
 * widening a card cannot leave the truncation quietly wrong. `test-projects.mjs`
 * drives the real `wrap` from `panels/work.mjs` over adversarial copy and
 * asserts the truncated result still fits, which is the property that actually
 * matters; this file only makes it possible to check.
 */

import { W_HALF, W_MOBILE, S } from "./design.mjs"
import { adv, MICRO } from "./type.mjs"

const innerWidth = (w) => w - S.sm * 2
const charsPerLine = (w) => Math.floor(innerWidth(w) / adv(MICRO))

/**
 * The two layouts, and what each can hold.
 *
 * `lines` is the only number here that is not derivable from geometry — it is
 * the card's design decision, and it is declared here so `panels/work.mjs`
 * cannot disagree with the truncation. Desktop is the tighter layout in total
 * (53 x 4 = 212 characters) even though its lines are longer; the phone layout
 * holds 36 x 6 = 216, so neither can be ignored.
 */
export const CARD_COPY = {
  desktop: { inner: innerWidth(W_HALF), max: charsPerLine(W_HALF), lines: 4 },
  mobile: { inner: innerWidth(W_MOBILE), max: charsPerLine(W_MOBILE), lines: 6 },
}

/** How many lines the tag run may occupy. The card draws at most two. */
export const TAG_LINES = 2

/** How many tags a card is allowed, before the width check has its say. */
export const TAG_MAX = 4

/**
 * Greedy wrap at a known advance. The face is monospaced, so this is exact
 * rather than an estimate — the same reason `panels/work.mjs` has always used
 * it instead of measuring.
 *
 * A SINGLE TOKEN LONGER THAN A LINE IS BROKEN, and that is a correction rather
 * than a preference. The original version could only break at a space, so one
 * 300-character URL produced ONE line of 300 characters: it "fit" the line
 * budget by any count, and drew straight off the edge of the card. Since the
 * budget check asks this function how many lines a text needs, a text that
 * could not be broken was also a text that could never be judged too long —
 * so the check would wave through exactly the input that overflows.
 *
 * Lives here, imported by both the panel and the truncation, so there is one
 * definition of "what fits" rather than two that drift.
 */
export function wrap(text, px, size = MICRO) {
  const max = Math.floor(px / adv(size))
  const out = []
  let line = ""
  for (const raw of String(text).split(/\s+/)) {
    let word = raw
    // Nothing to break between, so it is broken mid-token. There is no third
    // option that keeps the text inside the card.
    while (word.length > max) {
      if (line) { out.push(line); line = "" }
      out.push(word.slice(0, max))
      word = word.slice(max)
    }
    const next = line ? `${line} ${word}` : word
    if (next.length > max && line) {
      out.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line) out.push(line)
  return out
}

/**
 * Would this text survive BOTH layouts without the card throwing or overflowing?
 *
 * Two conditions, and the second is not redundant: `wrap` breaks over-long
 * tokens now, so a line can never exceed the budget — but the check is written
 * out anyway, because "the lines fit the height" and "no line is wider than the
 * card" are separate claims and only one of them is visible in a line count.
 */
export const fitsCard = (text) =>
  Object.values(CARD_COPY).every((b) => {
    const lines = wrap(normalise(text), b.inner)
    return lines.length <= b.lines && lines.every((l) => l.length <= b.max)
  })

/** Would this tag run fit the two lines the card gives it, on both layouts? */
export const fitsTags = (tags) =>
  Object.values(CARD_COPY).every((b) => wrap(tags.join(" · "), b.inner).length <= TAG_LINES)

/**
 * Collapse whitespace the way every other text panel does before drawing.
 *
 * GitHub descriptions are typed by hand and are full of runs of spaces and
 * stray leading whitespace. They also wrap differently from the same sentence
 * written cleanly, so normalising first is what makes the budget meaningful.
 */
export const normalise = (text) => String(text ?? "").replace(/\s+/g, " ").trim()

/**
 * Shorten `text` until it fits both layouts, cutting at a WORD boundary.
 *
 * An ellipsis is appended because the alternative — a sentence that stops
 * mid-thought with no mark — reads as a typo rather than as a shortened
 * description. The character is the same U+2026 already used by `clamp()` for
 * star descriptions, so the bitmap face is known to carry it.
 *
 * The one case that cannot be cut at a word boundary is a single token longer
 * than a whole line: a URL, or a description that is one unbroken string. There
 * is nothing to truncate between, so it is hard-trimmed to the narrower
 * layout's line budget. That is the only path here that can cut inside a word,
 * and it exists so a pathological description degrades to a short card instead
 * of a build that never goes green again.
 */
export function fitCopy(text) {
  const s = normalise(text)
  if (!s) return ""
  if (fitsCard(s)) return s

  const words = s.split(" ")
  for (let n = words.length - 1; n >= 1; n--) {
    const candidate = `${words.slice(0, n).join(" ").replace(/[,;:.!?\-–—]+$/, "")}…`
    if (fitsCard(candidate)) return candidate
  }

  return `${s.slice(0, CARD_COPY.mobile.max - 1).trimEnd()}…`
}

/**
 * Deduplicate, cap, and width-check a card's tag run.
 *
 * Deduplication is case-insensitive because a repository's primary language and
 * one of its topics are frequently the same word in different cases
 * (`TypeScript` and `typescript`), and a card that printed both would look
 * broken rather than informative.
 *
 * The count cap is not sufficient on its own — four long hyphenated tags
 * overrun the two lines the card allows — so the joined string is checked with
 * the same wrap the card will use, and tags are dropped from the end until it
 * fits. Dropping from the end keeps the primary language first, which is the
 * most useful of them.
 */
export function fitTags(tags) {
  const seen = new Set()
  const out = []
  for (const raw of tags ?? []) {
    const tag = normalise(raw)
    if (!tag) continue
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(tag)
    if (out.length >= TAG_MAX) break
  }
  while (out.length && !fitsTags(out)) out.pop()
  return out
}
