# Linux PhotoCraft document bridge

27 October 2026. The reusable Linux CLI exports a bounded native text subset,
edits one selected heading, saves/reopens the native document and produces the
existing guarded Banner wording-return plan. Actual CLI evidence is
`output/editable-artwork-linux-native/cli-final-20261027T032217Z/acceptance.json`;
`bridge-cli-latest.json` points to it. All ten recorded predicates pass.

This is the Linux lane of [LINUX-NATIVE-ROUNDTRIP.md](LINUX-NATIVE-ROUNDTRIP.md),
using [DOCUMENT-BRIDGE.md](DOCUMENT-BRIDGE.md)'s shared source/sidecar/wording
contracts and the separately accepted [font runtime](LINUX-FONTS.md). No desktop
application, `/Applications`, display, browser automation or remote engine is
needed by this CLI. The public online job operation remains `render-preview`.

## Supported subset and preservation

This first Linux bridge maps only 1–32 eligible single-line native text layers,
with at most 500 source layers and a 4096 × 4096 canvas. Source Sans 3 static
Bold 700, version 3.052, is the sole accepted face. Its PostScript identity is
`SourceSans3-Bold`; its SHA-256 is
`9214b9d95e4231c609802815c2646c98174e2102d0d37f88978a7f8e71006e6a`.
The font worker retains the pinned bytes and OFL license. No font download or
image build is performed by the bridge.

`assessBridgeLayers` remains the common assessment authority. Linux adds the
font worker's exact cmap coverage checks and an explicit text-only exclusion for
images and masks. Unsupported styles, transforms, animation, QR/logo layers,
fonts and glyphs receive exclusion reasons. Even supported text is excluded if
fresh measured bounds or placement exceed its unchanged box/canvas. Negative
bearings reject; the bridge does not shift text to hide overflow. No eligible
text, or more than 32 candidates, rejects the export before construction.

Every source layer, asset, mask and project property stays in the exact original
snapshot inside the hashed sidecar. Nothing is silently flattened or replaced.
The proof appends one explicitly labelled supported heading to the existing
124-layer lifestyle project; it does not substitute its original typography.
Only this appended layer 125 maps into the Linux native file. Images/masks are
preserved in Banner's original source, not represented in this native subset.
Independent native alpha/mask evidence remains in
[ONLINE-ENGINE-LINUX.md](ONLINE-ENGINE-LINUX.md).

## Reusable CLI

Requires existing repository dependencies, Python 3, Docker and the accepted
`output/editable-artwork-linux-native/fonts-v1/runtime.json` from the font lane.
CLI inputs/outputs must be explicit local paths under workspace `output/`.
Output directories must be new. Each operation reserves and fsyncs an exclusive
intent file and parent directory before any container runs; an interrupted or
failed operation permanently owns its directory. Choose a new directory to
start a new attempt.

```sh
pnpm exec tsx scripts/banner-studio/photocraft-linux-bridge.ts export \
  --project output/my-project.json --board custom_2480x3508 \
  --width 2480 --height 3508 --revision 1 --out output/my-linux-export

pnpm exec tsx scripts/banner-studio/photocraft-linux-bridge.ts edit \
  --project output/my-project.json --revision 1 \
  --sidecar output/my-linux-export/document-sidecar.json \
  --sidecar-sha256 TRUSTED_EXPORT_DIGEST \
  --native output/my-linux-export/document.pcraft \
  --layer 125 --text 'COME CELEBRATE WITH US' --out output/my-linux-edit

pnpm exec tsx scripts/banner-studio/photocraft-linux-bridge.ts import \
  --project output/my-current-project.json --revision 1 \
  --sidecar output/my-linux-export/document-sidecar.json \
  --sidecar-sha256 TRUSTED_EXPORT_DIGEST \
  --native output/my-linux-edit/document.pcraft --out output/my-linux-return
```

Replace `TRUSTED_EXPORT_DIGEST` with the digest retained by the originating
trusted session when export completed. A returned sidecar or binding file does
not confer authority to choose its own expected digest. The operator supplies
the fresh full project and current editor revision; this local CLI cannot read
the editor's live epoch.

Export writes `document.pcraft`, `document-sidecar.json`,
`document-binding.json` and `document-assessment.json`. Edit writes
`edited.pcraft`, reopened `document.pcraft`, `returned-document.json` and
`proposal.json`. Import writes only the returned manifest and proposal plus its
owned staged input and receipts. Unique JSON execution/measurement receipts
retain exact font/executable hashes, image isolation, real metrics and container
identities. No command writes a Banner project or applies a store transaction.

## API and trust boundaries

`workers/banner-engine/native/photocraft.ts` exports:

- `exportLinuxProject({ project, key, dimensions, revision, root, manifestPath? })`
  returns `{ sidecar, sidecarHash, mappings, nativePath }`.
- `editLinuxWording({ sidecar, expectedSidecarHash, currentProject,
  currentRevision, nativePath, root, layerId, text, manifestPath? })`
  returns `{ plan, returned, nativePath }`.
- `proposeLinuxReturn` takes the same binding/source inputs without `layerId`
  and `text`, returning `{ plan, returned }`.
- `createLinuxTextMeasurer({ root, manifestPath?, expectedBinding? })` returns
  the shared `BridgeTextMeasurer` callback. Supply the sidecar's `linuxBinding`
  as `expectedBinding` when revalidating a reviewed proposal.

API callers create their owned output directory; paths and optional manifest
are trusted operator configuration, not job input. These APIs expose no native
command string, executable, image, mount, remote asset URL or output path inside
the container. The CLI exposes no manifest override. Fixed internal operations
use `executeFontContainer`, inheriting its isolated network-none/nonroot/read-only
container, bounded CPU/memory/process/time/log/output budgets and verified cleanup.

The hashed sidecar adds `linuxBinding` (accepted immutable image, font metadata,
coverage and capability proof) and `nativeArchiveHash` (the exact exported ZIP
bytes). Typed edit requires this exact original archive hash before opening any
native input. Thus altered derived caches cannot enter native execution merely
because shared return comparison normalizes them. A typed edit also requires
the unchanged baseline and exactly one resulting selected wording change.

Arbitrary returned documents are inspected only. `inspect_archive.py` invokes
the existing bounded ZIP reader without extraction and adds an exact entry
allowlist: manifest, fixed preview names, and referenced text-cache tiles/PSD
blobs. Extra/missing entries, raster/mask layers, wrong version, path traversal,
duplicates and oversize archives/manifests reject. The host subprocess has a
15-second kill deadline and 16 MiB output cap; staged native inputs are regular
files up to 64 MiB. Derived text caches may legitimately differ on return, but
are never imported into Banner or trusted for fit measurement.

Every changed wording measurement constructs approved source style and new text
in a fresh Linux scratch document with an inert read-only mount. It verifies
the actual native family, weight, PostScript name and absence of synthetic
bold/italic. Font bytes are rehashed inside that same container before execution.
Native `type.info` supplies ascent, descent, advance and bounds; the unchanged
Banner line box determines the baseline. Imported caches and self-reported fit
fields are never evidence. The shared planner rejects protected/unsafe copy,
overflow, changed native style/structure and stale source/revision. Input
snapshots and final synchronous comparisons guard asynchronous source changes.

Host integration must re-run `validateBridgeApply` with fresh measurement,
check its live epoch immediately before applying, and use one existing history
transaction. The coordinator owns actual Banner store/browser undo, redo and
save/reopen acceptance; this CLI's proposal alone does not prove those outcomes.

## Measured results and verification

Final CLI evidence maps only appended layer 125 and changes
`DISCOVER SOMETHING NEW` to `COME CELEBRATE WITH US`. Fresh return bounds are
`{ left: 0, top: 0, right: 1170.39990234375, bottom: 120 }` inside its unchanged
2233 × 140 box. The original 124 layers compare exactly against the original
lifestyle source. Original source files and the exported native baseline retain
their SHA-256 values after the run. All nine recorded containers are absent.

`cli-receipts.json` retains the actual reusable argv, exit codes, stdout/stderr
and timings. Five real CLI negatives reject: stale revision, measured overflow,
unsupported glyph, changed native archive bytes and unreferenced payload.
The final trusted sidecar digest is
`53f0d9f43c74911715a44cfc5c292422e24b5c443027b3ec0576a258fe9dd25b`.

Focused verification:

```sh
pnpm exec vitest run test/banner/documentBridgeLinux.test.ts \
  test/banner/documentBridge.test.ts test/banner/documentBridgeArchive.test.ts
pnpm exec eslint workers/banner-engine/native/photocraft.ts \
  scripts/banner-studio/photocraft-linux-bridge.ts test/banner/documentBridgeLinux.test.ts
```

83/83 tests pass, including 31 Linux tests. Scoped ESLint passes. Unit metrics
are explicitly mocked; real Linux metrics come from the retained CLI receipts.
The tests cover wrong font/weight/glyph/style, protected copy, raster/mask/style
changes, stale/tampered bindings, overflow, concurrent project mutation,
candidate limits, reused output reservations, malformed/oversize archives,
extra payloads, top-level/nested native diagnostic rejection and exact-byte
rejection before native execution.

A focused strict TypeScript invocation extending Nuxt's app config produced
108 diagnostics in imported application composables/shared code, including
missing Nuxt auto-import globals; no diagnostic names the new CLI or native
module. It is not a clean application typecheck. The exact temporary config and
log are retained at `output/editable-artwork-linux-native/bridge-types.json`
and `bridge-types.log`.

The worker verified HEAD `47ec30c3522f6ab660d730776709770c8a22d7c8` contains
the supplied main `4469d6a2fb873c2d7b90ece9a359dd571def0ba2` and preserved all
pre-existing dirty work. No app/shared contract edit, commit, rebase, database,
provider, deployment, purchase, global installation or hosted operation occurred.
Full-artwork visual fidelity, all fonts/scripts/styles, image/mask interchange,
hosted multi-tenant execution and commercial print approval remain outside scope.
