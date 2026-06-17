# Conversion Notes — Heliacal Rising Simulator (Flash AS1 → Accessible HTML5)

## Behaviour model (one paragraph)

The simulator demonstrates **heliacal rising** — the day a star first becomes visible
in the morning twilight. The user picks a **day of year**, an **observer's latitude**,
and a **star** (declination + right ascension, or a preset: Sirius / Vega). A 3-D
**horizon diagram** (celestial sphere) shows the observer (stick figure) at the centre
of a green horizon plane, with the Sun, the chosen star, the celestial equator and
0ʰ hour circle (yellow), the ecliptic and meridians (grey), the N/S celestial-pole axes
(blue), and a blue **declination arc** marking the portion of the star's daily path
that lies above the horizon. A bottom **timeline** shows, across one day (midnight→
midnight), the daylight band with twilight gradients (computed from the Sun's
declination and the observer's latitude with a 7° twilight angle) and a blue bar for the
interval the star is above the horizon, plus a draggable red **time-of-day cursor**.
Locking the time of day to the start/end of twilight, sunrise/sunset, noon, or star
rise/set repositions the cursor and rotates the sky (sidereal time) accordingly.
Because the sidereal day is ~4 min shorter than the solar day, advancing the day of
year makes the star rise a little earlier each morning — the heliacal rising is seen
when the star's rise time falls just before sunrise.

## Functional parity — constants & formulas (verbatim from the AS source)

All physical constants are copied exactly from the decompiled ActionScript:

| Quantity | Value (verbatim) | Meaning |
|---|---|---|
| obliquity sine | `0.39714789063478056` | sin(23.4°) — Sun declination |
| obliquity cosine | `0.9177546256839811` | cos(23.4°) — Sun right ascension |
| sidereal/solar ratio | `1.0027397260273974` | sidereal-day rate |
| solar/sidereal ratio | `0.9972677595628415` | inverse |
| equation-of-time slope | `0.06575342465753424` | 24/365 |
| reference day | `78` (0-based) | vernal-equinox reference (March 20) |
| twilight angle | `7°` | from `timelineMC.twilightAngle = 7` |
| day colour | `16641937` (#FDEF91) | daylight strip |
| night colour | `8421504` (#808080) | night strip |
| star-visibility colour | `3182816` (#3090E0) | blue bar / declination arc |
| pole-axis colour | `7711231` (#75A9FF) | NCP / SCP axes |
| equator / 0ʰ colour | `16769909` (#FFE375) | yellow circles |
| grey circles | `14737632` (#E0E0E0) | ecliptic, meridians, dec circle |

Star presets (verbatim): `Vega {ra: 18.6, dec: 38.8}`, `Sirius {ra: 6.8, dec: -16.7}`.
Location presets: `Lincoln, NE → 40.8`, `Cairo, Egypt → 30`.
Initial state (from `onReset`): day 78 (March 20), latitude 40.8 °N, Sirius
(dec −16.7°, RA 6.8 h), view θ=150°/φ=35°, time cursor at noon, *(don't lock)*.

`updateSphere`, `updateStarDeclinationArc`, the daylight-strip / star-visibility maths
(`Heliacal Rising Timeline.as`), the day-of-year ↔ calendar conversion, the fixed-digit
value formatting (`Slider Logic Class v6.as` `toFixed`/snapping), and the eight lock
modes are ported line-for-line.

## AS → HTML5 mapping

| ActionScript | HTML5 port |
|---|---|
| `CelestialSphere.as` + `2..9 CS *.as` (prototype classes via `Object.registerClass`) | `Sphere` object in `simulation.js`; matrices `doA`/`doM`/`doB`, `WtoSz`/`CtoSz`, `Circle`/`Line`/object projection ported with identical coefficients |
| `createEmptyMovieClip`/`drawArc`/`curveTo` great-circle drawing | `<canvas>` 2-D paths; `buildArc()` reproduces the `curveTo` tessellation; front/back arc split (`asin`/`atan2` of the projected basis) ported verbatim |
| `onEnterFrame` / `getTimer()` | not needed — this sim has no continuous animation; renders on demand |
| simple-drag rotation (`updateSimpleDragging`) | Pointer Events with the identical `θ/φ` offset maths, **plus** arrow-key control on the focusable diagram |
| `Standard Slider v6` (bar+grabber hidden → numeric field) | native `<input type="number">` (label + unit), fully keyboard-operable |
| `FComboBox` (location, hemisphere, month, star) | native `<select>` |
| `FRadioButton` group `lockTimeGroup` | native `<input type="radio" name="lockTime">` |
| Latitude map drag / Day-of-year & time cursors | HTML overlay cursors with Pointer drag **and** `role="slider"` + arrow/Page/Home/End keys; coords mapped back through the canvas scale |
| `trace()`, `updateAfterEvent()`, `_root/_parent` | dropped / replaced with explicit references |

## The KL-UNL foundation & `contents.json`

* The foundation folder was copied into `html5/foundation/`. **The `heliacalrisingsim`
  entry already existed** in the shared `contents.json` (title "Heliacal Rising
  Simulator", version 2.0, with Help/About text derived from the original). No new entry
  needed to be added, and that entry was **not modified**. `sim-id="heliacalrisingsim"`,
  `json-url="foundation/contents.json"`.

* **Required repair (deviation):** the shared `contents.json` as shipped is **invalid
  JSON** and could not be parsed by the masthead (`response.json()` threw), which broke
  the title/Help/About for *every* sim, not just this one. Two classes of defect, all in
  **unrelated** entries, were present:
  1. raw control characters (literal newlines) inside string values
     (`ce_hc`, `eclipsingbinarysim`), and
  2. unescaped `"` inside HTML attributes such as `href="../venusphases"`
     (`venusphases` and a few others).
  A mechanical, content-preserving sanitiser fixed only the illegal characters
  (4 control chars collapsed to spaces, 4 inner quotes escaped). **No visible text,
  keys, ordering, or the `heliacalrisingsim` entry were changed**, and the file now
  parses (108 entries). This is the minimum change required to make the supplied
  foundation usable. If the canonical shared `contents.json` is maintained elsewhere,
  apply the same fixes there; otherwise this repaired copy can be used as-is.

* `kl-unl.css`, `kl-unl.js`, `kl-unl-masthead.js` are copied **byte-for-byte unchanged**.

## Assets: reused vs. code-drawn

* **Reused exported bitmap:** the world map (`images/219.png` → `assets/worldmap.png`)
  is placed as a positioned `<img>` (decorative; the latitude readout is the accessible
  value).
* **Code-drawn (no exported file is composited at runtime):** the celestial sphere is
  built entirely from AS runtime drawing calls (`createEmptyMovieClip`/`drawArc`/etc.),
  so it is reproduced on the canvas — the dark sphere body, the great/small circles, the
  pole-axis lines, and the green horizon-plane ellipse. The Sun, star and stick figure
  (small vector symbols that must scale/billboard with the 3-D projection) are drawn on
  the canvas to match the original symbols; the N/E/S/W direction labels are drawn on the
  rotating horizon plane.

## Deviations from the original (and why)

1. **contents.json repair** — see above (the shipped file was invalid JSON).
2. **Sphere shading is approximated.** The original layers several semi-transparent
   "Shading Layer A/B" clips with masks to dim the back hemisphere. The port reproduces
   the *geometry and positions exactly* but approximates the shading with a dark sphere
   body + a translucent back-overlay (back elements read dimmer; front elements bright),
   which matches the original's appearance closely. (Goal C is below behaviour and
   accessibility in priority.)
3. **Object billboard skew not reproduced.** The Sun/star "absolute" orientation applied
   a small depth-based `yscale`/rotation; the port draws them as upright billboards at
   the exact projected position (the visual difference is negligible for small round
   sprites).
4. **Numeric fields show the plain number.** A value like `0` displays as `0`, where the
   Flash field would show `0.0`; the underlying value and snapping (to 0.1 / integer)
   are identical. The original "sliders" already render as numeric fields (their bar and
   grabber are hidden in the source), so they are reproduced as accessible
   `<input type="number">`.
5. **Lock radio buttons** are laid out in one wrapping row (KL-UNL flex grid) rather than
   the original's fixed two-row pixel layout; labels, values, and reading order are
   identical.
6. **MathJax is vendored locally** under `assets/mathjax/` (the foundation ships no
   MathJax include and CDNs are disallowed at runtime). It typesets the unit symbols
   (`°`, `h`). See ACCESSIBILITY.md for the one residual plain-text symbol (the
   hemisphere `<select>` options `° N` / `° S`, which native option text cannot typeset).

No physics, constant, or educational/UI text was altered.
