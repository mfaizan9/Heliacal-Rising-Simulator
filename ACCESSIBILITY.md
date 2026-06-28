# Accessibility Notes — Heliacal Rising Simulator

Target: **WCAG 2.1 AA** (AAA where reasonable). Built on the KL-UNL foundation.
Human screen-reader QA is still recommended; this documents the affordances added.

## Structure & semantics
- One `<h1>` — the simulation title — is rendered by the `<kl-unl-masthead>` component.
  No competing `h1` is added.
- `<main>` landmark contains four `<section class="panel">` regions, each with an
  `<h2>` (the horizon diagram's `<h2>` is visually hidden via `.sr-only`). Heading order
  does not skip levels.
- A skip link ("Skip to the horizon diagram") is the first focusable element.
- `<html lang="en">`.

## Text alternatives (1.1.1)
- The canvas horizon diagram is decorative at the pixel level; its **state** is exposed
  through a polite live region (`#sky-status`) and the diagram container is
  `aria-describedby` that region plus an instructions paragraph.
- The world map `<img>` uses `alt=""` (decorative); the latitude value is the accessible
  data, available as a labelled numeric field and as a `role="slider"` on the map line.
- Timeline canvas is `aria-hidden`; its data is reachable via the time-of-day slider's
  `aria-valuetext` and the live region.

## Keyboard (2.1.1 / 2.1.2 / 2.4.7) — full operability
Every control is reachable in a logical tab order with a visible focus ring (from
`kl-unl.css` `:focus-visible`). No traps. Map of custom widgets:

| Control | Keys |
|---|---|
| Horizon diagram (`role="application"`) | ←/→ rotate horizon (θ ±5°), ↑/↓ change altitude (φ ±5°, clamped 7–90°) |
| Time-of-day cursor (`role="slider"`, only when *don't lock*) | ←/↓ −5 min, →/↑ +5 min, PageDn/PageUp ∓1 h, Home=midnight, End=just-before-midnight |
| Day-of-year cursor (`role="slider"`) | ←/↓ −1 day, →/↑ +1 day, PageDn/PageUp ∓10 days, Home/End = year ends |
| Latitude map line (`role="slider"`) | ↑/→ +0.1°, ↓/← −0.1°, PageUp/PageDn ∓1°, Home=+90, End=−90 |
| Numeric fields (day, latitude, declination, RA) | native `<input type="number">` — arrows step, typing + Enter commits |
| Selects (location, hemisphere, month, star) and lock radios | native keyboard behaviour |

Each keyboard path mutates the **same state object** as the pointer path, so mouse,
touch and keyboard stay in sync. The diagram's pointer handlers do not block focus or
trap Tab.

## Colour & contrast (1.4.1 / 1.4.3 / 1.4.11)
- Palette comes from the KL-UNL CSS custom properties; sim chrome meets ≥4.5:1 for text.
- **No state is encoded by colour alone.** The physically meaningful spectra are kept
  (blue star-visibility bar/arc, yellow daylight) but always paired with text: the
  timeline prints "star above horizon", "star never rises", or "star never sets"; the
  live region states latitude, hemisphere, star coordinates, and visibility in words.
- Direction labels N/E/S/W are drawn in white with a dark shadow on the green plane for
  contrast and are also implied by the spoken state.

## Timing / motion (2.2.2 / 2.3.3)
- There is **no continuous animation** — the sim renders only in response to user input,
  so there is nothing to pause and nothing flashes. `prefers-reduced-motion` therefore
  has no continuous motion to suppress (a media-query hook is present).
- Reset is provided by the masthead (`sim-reset` event); no second Reset button is added.

## Live region
- `#sky-status` (`aria-live="polite"`) announces meaningful changes **on commit** (field
  change, drag release, slider key, lock change, reset) — not on every drag tick — e.g.
  "March 20. Latitude 40.8 degrees north. Star declination −16.7 degrees, right ascension
  6.8 hours. The star is above the horizon for part of the day." Wording matches the
  on-screen/timeline text.

## Mathematics (MathJax)
- Unit symbols are typeset by MathJax via the foundation helper (`klunlInitEqn` is
  redefined in `simulation.js`): declination `\(^{\circ}\)` and right ascension
  `\(\mathrm{h}\)`. Right-clicking these opens the MathJax context menu (Show Math As →
  TeX/MathML); the menu is not disabled or overridden. MathJax is vendored locally.
- **Residual plain-text symbol:** the hemisphere `<select>` options read `° N` / `° S`.
  Native `<option>` text cannot contain MathJax markup, so the degree sign there is plain
  Unicode (kept verbatim to match the original on-screen text). All other math symbols in
  the UI are MathJax-typeset. The numeric values inside the editable fields are form
  values (not static math notation).
- Canvas-painted text (timeline hour labels, the "star above horizon" labels, the N/E/S/W
  direction letters) is part of the diagram artwork and cannot expose the MathJax menu;
  the equivalent information is available in the live region. No genuine equations are
  displayed by this sim.

## Responsiveness / touch
- Desktop → iPad → phone-portrait: the KL-UNL grid plus a sim breakpoint at 56rem
  collapses to a single stacked column (panels full-width in reading order, no horizontal
  scroll). The canvases keep their original internal coordinates and scale via CSS.
- Pointer Events drive mouse + touch through one path; `touch-action: none` on the
  draggable canvases/map prevents the page from scrolling during a drag. Interactive
  targets meet the ≥44px minimum; no hover-only affordances.

---

## AUDIO / SCREEN-READER PASS

A narration-only retrofit so the simulation is usable by audio alone (target: NVDA on
Windows, VoiceOver on macOS). **No behavior, layout, visual, physics, or on-screen text
was changed** — only screen-reader semantics were added. All new markup uses the
existing `.sr-only` class; new logic is in `simulation.js`; foundation files untouched.
*Final confirmation still requires a human listening test on NVDA (Windows) and
VoiceOver (macOS) — this pass reasons about the accessibility tree only and must not be
claimed as verified.*

### Values made units-complete (quantity + number + unit, spoken as words)
The unit was previously shown only as a visual MathJax glyph (`aria-hidden`), so values
read as bare numbers. Each value field's accessible name now carries its unit in words
(visible text unchanged; the `.sr-only` suffix is appended inside the `<label>`):

| Control | Spoken accessible name | Value read |
|---|---|---|
| `#dec-value` declination | "declination: in degrees" | native number, e.g. "minus 16.7" |
| `#ra-value` right ascension | "right ascension: in hours" | e.g. "6.8" |
| `#lat-value` latitude | "latitude: in degrees" | e.g. "40.8" |
| `#doy-day` day | "day of year: day of the selected month" | e.g. "20" |
| `#hemi-select` hemisphere | "hemisphere, north or south"; options `aria-label` "degrees north" / "degrees south" | — |

Custom sliders already expose units via `aria-valuetext`, updated on every change:
- Day-of-year cursor → e.g. **"March 20"** (label "Day of year").
- Latitude map line → e.g. **"40.8 degrees north"** (label "Observer latitude on world map").
- Time-of-day cursor → e.g. **"noon" / "6:30 AM"** (label "Time of day").

### Negative values
`spokenNum()` replaces a leading "-" glyph (often dropped by readers) with the word
**"minus"** in every spoken string (live region + canvas description). Declination is the
only signed quantity; e.g. the live region says *"Star declination minus 16.7 degrees"*.
(RA 0–24 h and latitude — shown unsigned with a north/south word — never need it.)

### Unit-word mappings applied
`°` → "degrees"; `h` (right ascension) → "hours"; hemisphere `° N` / `° S` →
"degrees north" / "degrees south"; leading `-` → "minus". The visual `°` / `h` remain
MathJax-typeset and are marked `aria-hidden` so they are not double-read.

### Live status region (`#sky-status`, `aria-live="polite"`)
Updated on **commit** (field change, drag release, slider key, lock change, reset) via a
**140 ms debounce** (`setStatus`) so continuous drag/key changes are coalesced into one
announcement and an identical message is never repeated. Wording (units-complete, matches
on-screen text), e.g.:
> "March 20. Latitude 40.8 degrees north. Star declination minus 16.7 degrees, right
> ascension 6.8 hours. The star is above the horizon for part of the day."

Visibility phrasing matches the timeline exactly: *"The star never rises." /
"The star never sets." / "The star is above the horizon for part of the day."* When a
lock is active it appends *"Time of day locked to the start of twilight."* etc. View
rotation (drag/arrow keys) announces *"View rotated to azimuth 150 degrees, altitude 35
degrees."*

### Canvas description (the `<canvas>` is invisible to readers)
A dedicated, **non-live** `#diagram-desc` (`.sr-only`) is referenced by the diagram's
`aria-describedby` (alongside the operating instructions) and is rebuilt from state on
every `render()` via `updateDiagramDesc()`. Because it is not a live region it does not
interrupt; it is read when the diagram receives focus / on demand. Example:
> "Horizon diagram for an observer at latitude 40.8 degrees north on March 20. It shows
> the green horizon plane with the north, east, south and west directions, the observer,
> the Sun, and the star Sirius at declination minus 16.7 degrees and right ascension 6.8
> hours. The star is above the horizon for part of the day. The view is rotated 150
> degrees in azimuth and tilted 35 degrees in altitude."

The sphere and timeline canvases are `aria-hidden`/decorative at the pixel level; the
world-map `<img>` is `alt=""`. The diagram container is `role="application"` so arrow
keys reach the rotation handler.

### Standards / compatibility
Standard ARIA only (`aria-live`, `aria-valuetext`, `aria-label`, `aria-describedby`,
`role="slider"`/`"application"`, `.sr-only`) — no reader-specific hacks — so it targets
both NVDA and VoiceOver. MathJax typesetting, responsiveness, layout, and physics were
re-checked and remain intact after the pass.
