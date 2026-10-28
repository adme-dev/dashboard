# XeroFlow browser creative tools

Live launcher: https://creative.xeroflow.io/

Short alias: https://create.xeroflow.io/ (308 redirect, preserving path/query).
Preview and existing browser-storage origin: https://xeroflow-creative-tools.adme-dev.workers.dev/.

Six Rust/WebAssembly editors run on the user's device. Cloudflare Workers Static
Assets serves the files; a small Worker streams precompressed WASM. No container
or native execution service is required.

| Editor | Upstream version | Current path |
| --- | --- | --- |
| PhotoFlow | 0.16.0 | `/photoflow/0.16.0/` |
| VectorFlow | 0.17.0 | `/vectorflow/0.17.0/` |
| EffectFlow | 0.17.0 | `/effectflow/0.17.0/` |
| FilmFlow | 0.13.0 | `/filmflow/0.13.0/` |
| SoundFlow | 0.13.1 | `/soundflow/0.13.1/` |
| FigFlow | 0.11.2 | `/figflow/0.11.2/` |

The launcher links back to XeroFlow. Automatic XeroFlow project saving and importing
are **not implemented**. Users must save/download their work. Browser storage is
origin-specific and may be cleared by the browser. The separate native preview
executor remains disabled and is not a prerequisite for these editors.

The original `xeroflow-craft-editors.adme-dev.workers.dev` homepage redirects to
this launcher. Its existing editor paths remain accessible to preserve work stored
on that origin. Do not remove that deployment or redirect document routes blindly.

## Reproduce the package

1. Download exact ZIP URLs from `releases.json` to an archive directory.
2. Use Node 24 and Python 3:
   `python3 workers/craft-editors/prepare.py ARCHIVE_DIRECTORY EMPTY_OUTPUT_DIRECTORY`.
   An optional third argument selects another hash-pinned release manifest for
   source-built branding releases. `hosted_version` selects a new URL scope while
   `version` retains the upstream ZIP directory layout.
3. The preparer checks archive size/SHA-256, bounds extraction paths and size,
   retains licenses/fonts, and records file hashes. Large WASM files are losslessly
   Brotli-compressed and verified after decompression. Every asset must fit
   Cloudflare's 25 MiB per-file limit. The photo loader's gzip parts retain their
   original encoding and do not receive a Content-Encoding header.
4. Run `pnpm exec wrangler deploy --dry-run --config EMPTY_OUTPUT_DIRECTORY/wrangler.jsonc`.
5. Deploy with `pnpm exec wrangler deploy --config EMPTY_OUTPUT_DIRECTORY/wrangler.jsonc`.
   This targets only the standalone Worker `xeroflow-creative-tools`, never Pages.
6. Fetch each page, compare decoded WASM hashes with `asset-sha256.json`, and verify
   actual browser startup. Document save/export requires separate functional proof.

Versioned paths isolate service-worker scope. Source-built binaries must use a new
`hosted_version` so immutable WASM cache entries cannot mix different releases.
The HTTP layer preserves emitted WASM URLs and integrity hashes. Worker responses
stream with `encodeBody: manual`; the edge negotiates client encoding. There is no
arbitrary origin fetch, server-side file import, or upload endpoint.

## Artwork and branding

`assets/` contains six generated application illustrations. Exact prompts are in
`image-prompts.json`. Visible launcher titles, HTML loading screens and PWA names
use Flow. Original project names remain in truthful software credits, licenses,
compatible file formats and internal identifiers. Full canvas UI branding is a
source-build task; changing an HTML title alone does not change compiled Rust UI.

## Hosted verification, 28 October 2026

- Account: `a5b299b3ad15c1b5b895dc66f9357b17`.
- Six-app launcher Worker version: `57190876-f984-462a-906f-357456533a74`.
- Source base: `f8cc8c506c74735a4d68cee5564946e488e35ef2`, containing main
  `b87589958e6e068f712a8f387693ea073436cf60` at deployment preparation.
- All six cards and generated images loaded; 390px viewport has one column and no
  horizontal overflow. Sound and Fig editors rendered full 1440x1000 canvases with
  no uncaught browser errors. Photo, Vector, Effect and Film startup was verified
  during the initial deployment. This is startup evidence, not full export testing.
- Evidence: `/private/tmp/flow-six-web-deploy-20261028/live-verification.json`
  and sibling screenshots. Prior four-app evidence lives in
  `/private/tmp/craft-web-deploy-20261028/` and `/private/tmp/flow-web-deploy-20261028/`.
- No XeroFlow Pages deployment occurred as part of this standalone release.

## Launcher design update

The user selected `https://xeroflow.io/platform/financials` and
`https://xeroflow.io/pricing` as the visual references. The launcher reuses the
existing XeroFlow logo and Geist font, centred marketing typography, translucent
panels and three-column desktop grid (two below 1024px, one below 640px).
`starfield.ts` adapts the actual `MarketingStarsBackground.client.vue`: the same
2,000 stars, sprite, colours, drift and scroll dolly. It pauses in background tabs
and renders a static frame for reduced-motion users. Three.js is the already
installed locked 0.135.0 package; its MIT license is included in static assets.
Rebuild the standalone script with:

```sh
pnpm exec esbuild workers/craft-editors/starfield.ts --bundle --minify --format=esm --target=es2020 --outfile=workers/craft-editors/static/starfield.js
```

Marketing design deployment: `7505ebdf-cd28-468b-b3af-58c442996de5`.
`evidence/launcher-layout.json` verifies the live 1440/1024/768/390px layouts,
six images, logo and font. `evidence/starfield-live.json` verifies live rendering,
animation, reduced-motion behavior and no uncaught browser errors.

## Source builds in progress

`source-pins.json` records original archive and lockfile hashes plus branding patch
hashes. Apply each `patches/*-branding.patch` with `patch -p1` to its exact source.
The original licenses, authorship, formats and storage identifiers remain intact.
Agent reports in `evidence/` distinguish renamed UI from retained compatibility
names. Their source-only claims do not establish successful compilation or hosting.

Use the isolated toolchain directory with Rust 1.95.0, target
`wasm32-unknown-unknown`, Trunk 0.21.14 and wasm-bindgen 0.2.129. Trunk obtains
wasm-opt 123 for packages that require it. Run `build-browser.sh` sequentially;
it requires at least 2 GiB free and checks the original Cargo.lock before/after.
Exact craft-fonts revisions: Photo abb83316d96aa59c1cf64784289e378fe9fa5695,
Vector a71c20e30af613287c504f7e685ca8fad77752bc,
Film bfcbf714e45a3ea8e98f88ab2b7971372a576414,
Fig 43913056ce82a3fdad0ef69f6b88d1dc922a8104.
Put them under `SOURCE_ROOT/fonts/<original-engine-name>`.

PhotoFlow, FilmFlow and SoundFlow compiled successfully and rendered in fresh Chrome
sessions; PhotoFlow visibly shows the XF corner mark. VectorFlow, EffectFlow and
FigFlow builds plus FigFlow browser Save/Export regression tests remain pending. The current hosted FigFlow version opens and edits documents,
but its Save/Export controls are not wired; this was reproduced in Chrome and traced
to absent browser save-path handling. Do not claim full document-workflow acceptance.

## Domain and XF loading mark checkpoint (28 October, 12:01 Melbourne)

- Main Worker version: `9f2d6d55-0717-4964-956b-ba01315c2359`.
- Main custom domain: `creative.xeroflow.io` (same existing Worker and assets).
- Alias Worker: `xeroflow-create-redirect`, version
  `17ccfe8d-b8ca-4f06-b46d-412c57c12a29`, custom domain `create.xeroflow.io`.
- Public DNS resolves both names. HTTPS certificate verification passed; main returned
  200, alias returned 308 preserving `/vectorflow/0.17.0/?mode=edit`.
- Header and all six HTML loaders/favicons use the user-approved white rounded XF
  tile. `brand_package.py` retains JS/WASM integrity and updates Effect's SW cache
  version. `evidence/loaders-live.json` checks all six loading screens on workers.dev.
- Browser storage does not transfer between domains. The workers.dev origin remains
  available; download existing work there before opening it on the custom domain.
- The compiled editor corner marks remain a separate source-build acceptance gate.

## Pointer-following card tilt

Worker `98ec415e-0e48-4278-8132-942a55debd0b` adds the requested subtle hover tilt
on both creative-suite hostnames. `static/card-tilt.js` updates card CSS variables
once per animation frame, follows the pointer up to 5/6 degrees, and resets on
leave, cancellation, blur or resize. Scroll invalidates card bounds without
cancelling the next hover frame. Touch/coarse pointers and reduced-motion users
keep still cards. Links and keyboard focus remain normal anchors.

Live six-card hover/reset, touch and reduced-motion evidence:
`evidence/card-tilt-live.json`. Reproduce with:
`node workers/craft-editors/verify-card-tilt.cjs URL REPORT_JSON`.

## CI recovery for the remaining builds

The local disk repeatedly approached exhaustion. Owned local build processes were
stopped and only their disposable compiler targets or redundant extractions removed.
Original archives, patched sources, completed ZIPs, logs and evidence were retained.
`evidence/local-rebuilt-packages.json` records three completed packages and browser
startup; `evidence/source-patch-replay.json` independently verifies all six patched
source trees against the recorded archive and patch hashes.

The dedicated `creative-tools-build.yml` workflow runs only on this rollout branch
and creative-editor paths. VectorFlow, FigFlow and EffectFlow build on clean Ubuntu
24.04 runners (two at a time), with a separate FigFlow native save/export/icon test
job. Actions, upstream sources, font archives, Trunk and wasm-bindgen are checksum
pinned. Rust1.95 toolchain components use official checksums. Jobs have read-only
repository permissions, no deployment secrets and seven-day artifacts with receipts
and logs. Source/patch/Cargo.lock checks must pass before build acceptance. Remote
artifact creation is not hosted browser acceptance; download and check actual editors
before updating the launcher to their versioned paths.
