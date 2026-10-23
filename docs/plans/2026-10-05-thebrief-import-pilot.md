# TheBrief → XeroFlow: one-banner migration pilot

User authorised implementation and a one-banner timeline trial on 5 October 2026.

## Outcome

Import one customer-owned animated HTML5 export, compare it with the original,
and establish whether its text, artwork and animation can become editable native
Banner Studio layers and timeline tracks. Retain original bytes and report any
unsupported effects. Successful HTML playback alone is not timeline conversion.

## Source and access

- Freshly fetched `origin/main`: `8c8a5b5c4`.
- Branch: `feat/thebrief-import-pilot-20261005`, worktree
  `/private/tmp/xeroflow-thebrief-import-20261005`.
- Fast-forwarded the existing release work at `e9647caec` to retain the deployed
  Banner Studio and social workflow; current main is its ancestor (88 ahead,
  zero behind). Existing rollout work remains unmerged; do not discard it or
  release from an older isolated main checkout.
- Safari authenticated to team `adme` (6422), Pro / Legacy Plan.
- Exported **Bay City Auto Group Update**, design `gzrx3x1`, project 1768984,
  from the actual editor without modifying it. HTML5 / General usage / High 90%.
- Safari unpacked the download to
  `/Users/paulgiurin/Downloads/Bay City Auto Group Update-HTML`.
- Source is a 1080×1080, four-second, infinitely looping single-slide creative.
  It has seven elements, three SVG files and one PNG. The actual runtime uses
  CSS keyframes plus literal `window.creatopyEmbed.designData`, not GSAP.
- The native candidate contains ten layers: background, four artwork images,
  one blend shape and four editable text lines. Native position/opacity tracks
  retain source delays and cubic-bezier easing. Loop count remains provenance;
  the comparison controls the loop externally.

## Delivery sequence

1. **Offline archive inspection (implemented):** inspect a single ZIP or one
   nested set level; record hashes, paths, dimensions and animation/resource
   hints. Reject unsupported/unsafe archives and enforce shared expansion
   budgets. Never run imported code, fetch dependencies or extract to disk.
2. **Real source fixture (obtained):** export one banner as HTML5 and keep
   a reference preview/video. Record duration, looping and network settings.
   Inspect its actual runtime and data; avoid assuming it uses GSAP.
3. **Native adapter (offline pilot implemented):** map supported objects, positions,
   typography, assets, keyframe times and easing into Banner Studio. Explicitly
   report unsupported transitions, masks or runtime behaviour. Keep original
   source separately; do not replace complex animations with a flattened image
   while claiming timeline recovery.
4. **Private project trial:** use existing client-authorised project/asset APIs,
   with duplicate protection and provenance. Test play, scrub, edit one headline,
   save/reload, undo, then render MP4. No automatic publishing.
5. **Visual acceptance:** compare start, entrance, midpoint, exit and loop
   frames; check fonts and click destination. A sample passes only when the
   native timeline and rendered output agree with the original within a
   documented tolerance and any differences are visible to the operator.
6. **Product extension and bulk migration:** expose the verified path in Banner
   Studio with import report, client assignment and per-design failures. Expand
   archive support and source adapters from real evidence. Inventory the full
   library, preserve design/size identities, and make retries idempotent.

## Current tool

```sh
node scripts/thebrief/inspect.mjs /path/to/banner.zip > /path/to/report.json
pnpm exec vitest run test/thebrief/inspectArchive.test.ts
```

The report is a static preflight, not a runtime security certification, complete
dependency graph, imported project or editable timeline. No UI/backend route
exposes it in production yet. ZIP64, encrypted archives, symlinks, legacy
non-ASCII filename encodings, unusual compression and deeper nesting are
explicitly unsupported in this pilot. Limits: 20 MB input per archive, 10 MB per
file, 40 MB cumulative expansion, 500 entries including nested sets.

The earlier detailed architectural research remains in
`docs/research/2026-10-04-thebrief-banner-import.md`. Arbitrary HTML execution
requires its isolated preview and network controls before any product preview.

## Verification — 5 October

- 209 relevant tests passed across 30 files (archive, converter, renderers,
  Banner Studio state, timeline/masks, export and canvas sizing).
- Added a native-state round trip: convert → load → edit headline → undo/redo →
  generate save payload → JSON round trip → reload. **The API is mocked in this
  test; this is not a live project save.** All keyframes survive.
- Real Safari comparison at 0, 0.35, 1.5 and 3.9 seconds visually agrees at the
  displayed 480×480 scale. This is a manual smoke check, not pixel certification.
  The reference uses original CSS with vendor scripts removed, restarted and
  paused at each requested timestamp. The native view uses the real XeroFlow
  HTML builder and installed GSAP. Both wait for fonts.
- Fixed native gradient background rendering, colour blend support, imported
  font smoothing/whitespace baseline, accidental default fades (explicit
  opacity holds), and the renderer/editor's reverse seek to zero losing holds.
  The reverse-seek test reproduced the failure before the fix.
- `pnpm lint` and `pnpm typecheck` fail repository-wide. The earlier lint run had
  62,819 findings; new-file checks are clean after corrections. Typecheck has
  broad existing failures; no clean repository-wide claim is made.
- Nuxt preparation succeeded. No production deployment or uploaded Banner
  Studio project exists for this pilot. No source artwork was published.

## Reproduce the private trial

Use Node 24.18.0 and the repository's installed dependencies:

```sh
TSX_TSCONFIG_PATH=.nuxt/tsconfig.app.json node --import tsx \
  scripts/thebrief/preview-pilot.mjs /path/to/export-directory /path/to/private-output
node scripts/thebrief/serve-pilot.mjs /path/to/private-output 8776
```

Open `http://127.0.0.1:8776/` in Safari. The server binds only loopback and sets
CSP, no-store and no-referrer headers. It permits Google font CSS/fonts, local
artwork and local GSAP; it blocks connections, forms and embedded objects.
Preview iframes have an opaque origin and token-bound timestamp messages.
This controlled development harness is **not** a production untrusted-HTML
sandbox. Keep original exports/private assets outside the Git repository.

## Discovered gaps / follow-up ledger

| Finding | State / next action |
| --- | --- |
| Source header baseline depends on a larger trailing space | Corrected locally with a preserved line-box strut; compared visually |
| Source uses `mix-blend-mode:color` | Added renderer/editor support locally |
| Static layers faded out in the target by default | Adapter now emits explicit hold tracks |
| Reverse seek to zero blanked native holds | Fixed client/server builders and editor timeline; regression test |
| Source exit begins at six seconds, outside four-second loop | Reported; correctly excluded from visible conversion |
| Live persistence and client assignment | Not integrated; use existing authenticated project/asset APIs and God Mode boundary |
| SVG artwork upload | Existing asset API accepts raster/video, not SVG; choose sanitised SVG storage or disclose raster conversion, never silently flatten text/timelines |
| Loop settings | Retained in provenance only; implement per-project playback/export mapping |
| Mid-effects, masks, visible exits, multi-slide exports | Not supported; reject or report, obtain real fixtures |
| Mixed styling within one text line | Explicitly rejected instead of silently losing styling |
| Fonts and click destinations | Google font dependency remains; click migration not implemented |
| Product import action | Not built/deployed; preview is a developer prototype, not an upload screen |
| Bulk library migration | Pending inventory, idempotency, client mapping and per-design reporting |
| Product MP4/save/reload acceptance | Still pending on an actual private saved project |
| Beta PSD export | Visible in this account's download selector; not tested and does not establish timeline recovery |

Next implementation gate: add a bounded, client-scoped staging/import path
with immutable assets/provenance, explicit compatibility report and a private
native project. Do not put Happy DOM in the Pages request bundle blindly; the
existing bundle has little headroom. Keep parsing in an isolated job or measured
client-side adapter, and preserve all project/asset authorization checks.

## Bulk inventory finding

The official [Designs API](https://docs.thebrief.ai/public-api/rest-api/designs)
documents cursor pagination (up to 50 records/page), project/folder IDs and
design IDs. API-generated designs are excluded by default and need an explicit
inventory pass. The eventual migration ledger must account for these plus
templates, rather than assuming one designs-list response is the entire library.
API access and entitlement have not been verified for this account.
