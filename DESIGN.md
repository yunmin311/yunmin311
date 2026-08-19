# Design baseline — Modern Pixel Interface

The system every generated panel is built against. Declared before drawing, so
the panels are checked against it rather than against taste. Values that came
from measuring real work are marked **(measured)**; nothing here was derived
from design principles alone.

---

## 1. Reference values

| Source | What was measured |
|---|---|
| `anuraghazra/github-readme-stats` (70k★) **(measured)** | card 287–450px wide · body **14px/600** · headline number **24px/800** · line-height **25px** · inset 25/50 · icons 16px |
| `lowlighter/metrics` **(measured)** | card ~480px · body 14px · section heading 16px · footnote 10px |
| `Owl-Listener/designer-skills` — `spacing-system` | base unit **8px**, scale 2/4/8/16/24/32/48/64, *compact mode = one step down for data-heavy views* |
| `Owl-Listener/designer-skills` — `typography-scale` | 4–5 sizes in regular use · uppercase labels get **wide tracking** |
| `Owl-Listener/designer-skills` — `dark-mode-design` | *don't invert — redesign surfaces per theme*; semantic tokens, not flipped hex |

**The canvas is 831px.** Measured on the live profile, not assumed:
`document.querySelector('article.markdown-body').getBoundingClientRect().width` → **831**.
Panels were being drawn at 880 and scaled to 0.944, which resampled a pixel face onto
fractional pixels — the actual reason the type kept reading as soft. Two 432px cards plus the
space between them came to 871 and wrapped, which is why the two-up rows collapsed into one
column. So:

| canvas | px | why |
|---|---|---|
| full panel | **824** | under 831, renders 1:1 on desktop, still scales down on a phone |
| half panel | **408** | `2 × 408 + 7px word space = 823`, so two fit side by side |
| hero | **831** | its longest line is 59 glyphs × 14px = 826 and needs the full column |

**The ratio that matters.** In the reference, the headline number is `24 / 450 ≈ 5.3%` of the
box that holds it, and body is `14 / 450 ≈ 3.1%`.

> **Sizing rule.** Type is sized against the box it sits in, never against the
> canvas. A size may only be used where it stays under **6% of its container's
> width**. 11px needs ≥184px; 22px needs ≥366px.

This is the rule the first two drafts broke: 22px numerals were dropped into
208px readout cells (10.6%) and 150px slots (14.7%), which is why they collided
with borders and with each other. The canvas was 880px wide, so it looked fine
in isolation and wrong in place.

---

## 2. Type — two poles, no middle

The face is **Departure Mono** (SIL OFL, Helena Zhang), embedded as a subset
WOFF2 data URI. It is drawn on an 11-pixel em — unitsPerEm 550, advance 350,
cap height 400, all multiples of 50 **(measured from the binary)**. So:

| size | font-pixel | advance | cap | used for |
|---|---|---|---|---|
| **11px** | 1.0px | 7px | 8px | everything inside a panel |
| **22px** | 2.0px | 14px | 16px | the hero line, and nothing else |

Any size between the two puts glyph edges on half pixels and the face goes
soft — that is what "the pixel font looks bad" turned out to mean. There is no
middle step, so hierarchy comes from the three other levers:

- **case** — UPPERCASE is a label, sentence case is content
- **tracking** — 1px on uppercase labels (0.09em), 0 everywhere else
- **colour** — `ink` for values and names, `inkDim` for labels and prose, `inkFaint` for rulers, footnotes and meta

Panels are the *small and steady* pole throughout. The whole personality budget
is spent in one place: the hero.

---

## 3. Spacing — 8px scale, compact mode

`4 · 8 · 16 · 24 · 32 · 48`. No arbitrary values; every y position and inset in
the panels resolves to this scale.

| token | px | applies to |
|---|---|---|
| `tight` | 4 | between a marker and its label |
| `xs` | 8 | between a label and the value it names |
| `sm` | 16 | between rows of a list |
| `md` | 24 | panel inset, and between groups |
| `lg` | 32 | between a chart and the readout under it |
| `xl` | 48 | reserved; panels are compact and rarely need it |

---

## 4. Grid — one unit, held everywhere

`U = 2px`. Every piece of chrome is a whole multiple: markers 2×2, meter
segments 4 tall on a 2 gap, contribution marks 2/4/6/8/12. Hairlines are 1px,
which is deliberate — a rule is not a pixel.

Elements get bigger by occupying more cells, never by scaling the cell. Mixing
pixel sizes between elements is what breaks the illusion that they share a
surface.

---

## 5. Colour — semantic, designed per theme

Not an inversion. Each theme gets a data ramp built for its own background:
dark ramps *up* into light, light ramps *down* into dark.

| token | dark | light | role |
|---|---|---|---|
| `page` | `#0D1117` | `#FFFFFF` | canvas |
| `panel` | `#161B22` | `#F6F8FA` | panel fill |
| `line` | `#30363D` | `#D0D7DE` | borders |
| `lineSoft` | `#21262D` | `#E4E8EC` | dividers inside a panel |
| `ink` | `#C9D1D9` | `#24292F` | values, names |
| `inkDim` | `#8B949E` | `#57606A` | labels, prose |
| `inkFaint` | `#6E7681` | `#818B98` | rulers, footnotes, meta |
| `accent` | `#58A6FF` | `#0969DA` | the bright blue |
| `titleInk` | `#79C0FF` | `#0969DA` | panel and section titles |
| `dataEmpty` | `#1C2128` | `#E4E9EE` | unfilled capacity |
| `dataLow` | `#1F3A5F` | `#BFDBFE` | ramp 1 |
| `dataMid` | `#2C6BC9` | `#60A5FA` | ramp 2 |
| `dataHigh` | `#58A6FF` | `#0969DA` | ramp 3 / peak |

**Budget: ~80% neutral, ~15% muted blue, ~5% accent.** `accent` has exactly four
jobs — a panel's corner marker, the single peak in a chart, the newest item in
a list, and a caret. Anything else reaching for it is decoration.

---

## 5b. Motion

Two layers, both switchable per component in `scripts/config.json`.

**Entrance** runs once when the image loads. **Ambient** never stops, and it is
what makes the page read as powered rather than printed. Each module gets its
OWN ambient behaviour, because different instruments behave differently:

| module | ambient |
|---|---|
| hero | typewriter and caret |
| 01 about | indicator keys lighting in turn |
| section rules | drawn out from the left |
| work cards | selection marquee, plus the arrow |
| coding rhythm | every column's ceiling cell flickers, as a level meter does |
| language signal | a highlight sweeping the bar |
| starred + activity | **one shared** row highlight — they are a matched pair sitting side by side, and two different effects made them read as unrelated gadgets |
| contribution field | a diagonal wave; cells bucketed by `(col + row) % 8` so the crest travels |
| fortune | caret |

**Rule: no effect may start from `opacity: 0`.** An SVG shown through `<img>`
does not reliably start its animations — browsers defer them while the image is
off-screen. QA caught three panels rendering completely *empty* because their
rows were still at zero opacity. Every recipe animates `transform` only, so a
stalled animation leaves the element at its natural size and position.
`prefers-reduced-motion` is honoured in every animated file.

**Rule: motion may not repaint data.** Scan heads and highlights are low-opacity
passes over a chart; the peak indicator is applied to the cell already marked as
the peak. An animation that alters a reading is a lie that moves.

## 5c. Hover

A README cannot have one. GitHub strips script, and an SVG loaded through
`<img>` receives no pointer events, so `:hover` has nothing to attach to. The
only hover that works is the browser's native tooltip, so every image carries a
`title`. Anything more would need the page to stop being a README.

## 6. Do not

From the anti-AI-taste list, plus what this brief rules out:

- gradients · left colour bars on cards · Inter · grey placeholder blocks
- rainbow or per-language colours · brand colours in the contact row
- trophies · visitor counters · generic stats cards · snake · 3D contributions
- pixelating photographs — the pixel language is the *chrome*, never the image
- a third type size, however tempting

## 7. Verify

1. Every type size under 6% of its container's width.
2. Every y position and inset on the 8px scale.
3. Every chrome dimension a multiple of 2.
4. **No image scaled on desktop.** On the live profile,
   `[...document.querySelectorAll('article.markdown-body img')].filter(i => i.naturalWidth !== Math.round(i.getBoundingClientRect().width))`
   must come back empty. A scaled pixel face is a soft pixel face.
5. Two-up rows actually sit two-up — check the rendered `top` of each image, not the source.
6. Both themes verified on the real page, not only in the local preview: emulate
   `prefers-color-scheme: dark` and confirm each `img.currentSrc` ends in `-dark.svg`.
7. No divider within 8px of the baseline above it or the cap-top below it.
8. Blurred to illegibility, the page still shows: quiet opening → short text →
   photographic band → structured grid → dense instrument row → fine texture →
   one closing line.

