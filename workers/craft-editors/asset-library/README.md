# Motorstack asset-browser island

This is an isolated Vue/Nuxt UI v4 panel for the standalone Rust editors. It does not
build or import the agency dashboard. All controls use Nuxt UI components; fields
use `UFormField` and `UInput`. Component CSS is loaded inside open Shadow DOM roots
so Tailwind's reset cannot affect the editor canvas or its HTML shell.

The frontend-design skill was read before fields were built. The visual plan uses
XeroFlow's selected dark creative-suite direction: ink `#15161b`, panel `#1b1e27`,
soft edge `#ffffff24`, white `#fafafa`, muted `#a1a1aa` and cyan `#67e8f9`. Geist is
used with compact, left-aligned controls. Brand chips, categories, local name search and an explicitly applied optional model filter sit above a
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
media. The browser fixture verifies the File reaches a drop handler while an
unsaved marker remains intact. **Actual import in the Rust editors needs separate
browser acceptance**; no placement-as-layer or native format conversion is claimed.

The mock browser check covers local search, explicit trimmed model requests (no request while typing), category disabling, reset on brand change, image sending, PDF and WOFF downloads, Escape,
320px layout, SoundFlow download-only behavior, 401 sign-in and 503 retry with no
page errors. Malicious cross-origin asset URLs are rejected and the panel makes no external browser requests. Evidence is `/private/tmp/xf-asset-library-verification.json` and
`/private/tmp/xf-asset-library-ui.png`. It does not install an OS app, publish files,
modify documents, or call external Motorstack services.
