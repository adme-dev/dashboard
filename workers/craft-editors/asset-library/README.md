# Motorstack asset-browser island

This is an isolated Vue/Nuxt UI v4 panel for the standalone Rust editors. It does not
build or import the agency dashboard. All controls use Nuxt UI components; fields
use `UFormField` and `UInput`. Component CSS is loaded inside open Shadow DOM roots
so Tailwind's reset cannot affect the editor canvas or its HTML shell.

The frontend-design skill was read before fields were built. The visual plan uses
XeroFlow's selected dark creative-suite direction: ink `#15161b`, panel `#1b1e27`,
soft edge `#ffffff24`, white `#fafafa`, muted `#a1a1aa` and cyan `#67e8f9`. Geist is
used with compact, left-aligned controls. Brand chips, categories, local name search and an explicitly applied optional media-model filter sit above a
bounded scrolling image/file grid. The artwork is the main visual element; extra
ornament and animations were omitted. The panel remains usable at 320px width and
respects reduced motion.

Build from the repository root, with the existing Node24 dependencies:

```sh
pnpm exec vite build --config workers/craft-editors/asset-library/vite.config.mjs
node workers/craft-editors/verify-asset-library.cjs
```

The two outputs are `static/asset-library.js` and `static/asset-library.css`.
The host only needs to load `/asset-library.js` as a module in each editor HTML.
The module adds an Assets action after `xf-dock-ready`, and loads CSS in its shadow
roots. It does not navigate the active editor or create another authentication path.
All requests are same-origin and require the host's registered-user gate.

No provider URL or API key reaches this UI. Asset URLs must match the exact
`/__assets/motorstack/file` path on the current origin. Provider names/copy are
rendered as text. SVG/PDF/fonts are download-only; direct sending is limited to
PNG/JPEG/WebP/AVIF images and disabled for SoundFlow.

"Send to editor" fetches a file and sends the editor's existing canvas a synthetic
file-drop event. The editor decides whether it opens a new document or imports
media. The target must be the visible, connected canvas with the host editor’s explicit
canvas id (including legacy Craft paths); decorative/preview canvases are never
fallbacks. The browser fixture verifies the File reaches that drop handler while a
decoy receives nothing and an unsaved marker remains intact. A hidden/missing target
refuses the operation. **Actual import in the Rust editors needs separate
browser acceptance**; no placement-as-layer or native format conversion is claimed.

The mock browser check covers local search, explicit trimmed media-model requests (no request while typing), reset when leaving media or changing brands, bounded plain-text truncation warnings, verified-MIME filename aliases, image sending, PDF and WOFF downloads, Escape,
320px layout, SoundFlow download-only behavior, 401 sign-in and 503 retry with no
page errors. Malicious cross-origin asset URLs are rejected and the panel makes no external browser requests. Evidence is `/private/tmp/xf-asset-library-verification.json` and
`/private/tmp/xf-asset-library-ui.png`. It does not install an OS app, publish files,
modify documents, or call external Motorstack services.

The model control applies only to “Photos & brochures”. Other categories never send
a model parameter. Backend `truncated`/`warnings` are shown as bounded plain text so
a capped selection is visible to the user. `helpers.test.mjs` covers JPEG aliases,
all explicit canvas ids and warning projection.
