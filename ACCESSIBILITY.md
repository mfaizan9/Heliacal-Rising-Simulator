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
