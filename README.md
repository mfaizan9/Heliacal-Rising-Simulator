# Heliacal Rising Simulator — Accessible HTML5

An accessible (WCAG 2.1 AA) HTML5 re-creation of the legacy Adobe Flash *Heliacal
Rising Simulator*, built on the shared KL-UNL foundation. Behaviour matches the
original; chrome and layout follow the KL-UNL pipeline.

## ⚠️ It must be served over HTTP — double-clicking `index.html` will NOT work

The KL-UNL masthead (`foundation/kl-unl-masthead.js`) loads its title / Help / About
text with `fetch('foundation/contents.json')`. Browsers block `fetch()` of local
files under the `file://` protocol (same-origin / CORS security), so opening
`index.html` directly shows an **empty or broken masthead**. Serve the folder over
HTTP and the fetch succeeds and the sim loads normally.

## How to run it locally

Run a static server **from inside this `html5/` folder** (so the folder is the server
root), then open the printed URL:

```sh
# Python 3
python3 -m http.server 8123
#   then open  http://localhost:8123/

# Node
npx serve
#   (or)  npx http-server
```

Or use the VS Code **Live Server** extension (Open with Live Server on `index.html`).

Because you serve from inside `html5/`, the sim sits at the server **root**, so the URL
is `http://localhost:8123/` — *not* `.../html5/index.html`. Serving from the root is
also what makes the masthead's internal `../foundation/...` references resolve
correctly (`../` at the server root clamps back to the root).

## Production

When deployed to the cloud host (served over HTTP/HTTPS) it just works. The `file://`
limitation only affects local double-clicking.

## What's inside

```
index.html            KL-UNL scaffold (.app-shell + <kl-unl-masthead> + panels)
foundation/           KL-UNL foundation files (see CONVERSION_NOTES.md re: contents.json)
styles/styles.css     sim-specific styles only (kl-unl.css is the shared base)
simulation.js         all sim logic (sphere engine, timeline, controllers, UI)
assets/
  worldmap.png        reused exported bitmap (the latitude map; from images/219.png)
  mathjax/tex-svg.js  MathJax, vendored locally (no CDN at runtime)
CONVERSION_NOTES.md   behaviour model, AS→HTML5 mapping, deviations
ACCESSIBILITY.md      ARIA / keyboard / colour / live-region notes
```

No build step, no bundler, no framework, no CDN, no analytics. Everything is local.
