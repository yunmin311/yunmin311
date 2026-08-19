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
| `dataEmpty` | `#1C2128` | `#E4E9EE` | unfilled capacity |
| `dataLow` | `#1F3A5F` | `#BFDBFE` | ramp 1 |
| `dataMid` | `#2C6BC9` | `#60A5FA` | ramp 2 |
| `dataHigh` | `#58A6FF` | `#0969DA` | ramp 3 / peak |

**Budget: ~80% neutral, ~15% muted blue, ~5% accent.** `accent` has exactly four
jobs — a panel's corner marker, the single peak in a chart, the newest item in
a list, and a caret. Anything else reaching for it is decoration.

---

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
4. Both themes rendered and read at 1440 / 768 / 375, no horizontal scroll.
5. Blurred to illegibility, the page still shows: quiet opening → short text →
   photographic band → structured grid → dense instrument row → fine texture →
   one closing line.
