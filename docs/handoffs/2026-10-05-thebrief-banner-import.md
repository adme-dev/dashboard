# TheBrief → XeroFlow Banner Studio handoff

Updated: 5 October 2026, Australia/Melbourne. **Work in progress — not deployed. No pilot banners have been saved into the live XeroFlow library in this turn.**

## Resume instruction

Continue the approved TheBrief import pilot and compact banner-library UI. Read this document, the worktree AGENTS.md and current git diff first. Preserve uncommitted shared work. Fix the remaining import issues, visually compare the four frozen random samples, then verify save/reload in the real editor before bulk migration. Do not report the full migration or animation parity as complete.

## Workspace and release

- Worktree: `/private/tmp/xeroflow-thebrief-import-20261005`
- Branch: `feat/thebrief-import-pilot-20261005`
- HEAD when this document was created: `c07c0e26993d9c7a04efb9d6a8a559910ef7d7a7`
- Last fetched origin/main: `8c8a5b5c4b6ccb6a17dc7a9405169ac4bc671f0e`; branch includes it, 90 commits ahead, zero behind. Fetch again before release; a branch name alone is not evidence of freshness.
- Changes listed below are uncommitted. The current user cwd is the separate, dirty DriveAgent website repo: do not implement dashboard changes there.
- Use Node 24: `/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin`. Default shell Node is 20.
- node_modules symlinks to `/private/tmp/xeroflow-driveagent-facebook-rollout/node_modules`.
- Deployment must use `pnpm deploy:check` and guarded `pnpm deploy:preview` / `pnpm deploy:production`. Target is **agency-dashboard** only. Never bypass guards or call wrangler pages deploy directly. Record source commit/deployment ID and check QR/navigation alongside banner features.
- Existing server bundle is close to Cloudflare size limit (~45 KB headroom in previous release). HappyDOM stays offline in scripts, never in server imports.
- Public feature pages need an accurate update before releasing new capabilities; do not advertise complete ZIP migration.

## User intent and decisions

- Migrate TheBrief creative library into XeroFlow with editable native layers/timelines, preserving artwork, fonts, timing and client ownership.
- Use small batches, with a random blind sample BEFORE bulk downloads/imports. Different animation configurations must be tested.
- Browse like TheBrief: compact list default, grid option, client/folder navigation, thumbnails, dimensions, dates, search/sort.
- Proposed hierarchy: client → folder/category → banner set → size. A shared source folder is not proof that all designs belong to one client. Match per creative.
- Original ZIPs and source hashes are retained. Unsupported conversion must remain explicit, not silently flattened or called equivalent.
- This pilot imports reviewed native JSON plus managed binary assets through normal authenticated APIs. It does not execute imported HTML/JavaScript inside XeroFlow. Direct ZIP upload in the UI remains future work.
- Existing source placement is represented by tags for this first increment; normalized folder/schema management remains future work.
- No publishing or scheduling is part of this import operation. Imported projects are drafts requiring review.

## Source, export and durable evidence

Source folder: <https://app.thebrief.ai/team/6422/project/1768984/designs/folder/420545>

Breadcrumb: Designs / Social Media Templates / Updates. User is signed in to TheBrief in Safari. Use computer-use tools for Safari; do not use AppleScript or extract browser cookies.

Private artifact root: `/Users/paulgiurin/Documents/XeroFlow Imports/Blind sample 2026-10-05`

- `sampling-ledger.json`: frozen random selection from first 50 loaded rows, excluding the already-used Bay City training example. Additional rows loaded later, so this is NOT a random sample of the entire library.
- `blind-baseline-results.json`: initial failures before converter fixes. Preserve this evidence; corrected retests are separate.
- Original four ZIPs and `*.zip.inspection.json`: retained inspected archives, safe paths and SHA256s.
- `source/<ZIP stem>/index.html`, media, fonts: extracted source bytes.
- `*.candidate.json`: baseline candidates. Do not overwrite while claiming original blind outcomes.
- Prepared packages now exist for all four samples as `<Creative name> Update.xeroflow.json`. They contain managed-ready media and one bundled font each; they have not been uploaded. Regenerate after further converter/packager fixes. Ignore the older `Bendigo Kia.xeroflow.json` draft package; use `Bendigo Kia Update.xeroflow.json`.
- Previous Bay City proof: `/Users/paulgiurin/Documents/XeroFlow Imports/Bay City Auto Group - Pilot 2026-10-05`.
- Accepted proposal: `/Users/paulgiurin/Documents/XeroFlow Imports/BANNER-LIBRARY-PROPOSAL.md`.

Batch export is available: select rows → Download → HTML5 → General usage → High 90%. **Turn off “Convert custom fonts to SVG”** to preserve editable text. After generation, click Download on the completed batch entry. Safari expanded the batch to `/Users/paulgiurin/Downloads/General usage/`; originals were copied into the durable artifact folder.

## Frozen pilot samples

| Creative | Dimensions | Duration / source plays | Initial blind result | Client mapping |
|---|---|---|---|---|
| Frankston GMSV Update | 1000×1000 | 4s / continuous | Mixed-size text warning; no unsupported animation | Pending user decision |
| Westernport Ford Update | 1000×1000 | 3s / once | scale(8) text animation failed conversion | Exact client available |
| Bendigo Kia Update | 1080×1080 | 3.9s / continuous | Shape transform-origin failed conversion | Exact client available |
| Brighton Nissan Update | 1200×1200 | 4s / continuous | Text scale + shape transform-origin failed conversion | Pending user decision |

All four use CSS-keyframe exports. This sample does NOT establish compatibility with all TheBrief animation engines, masks, video, multi-size sets or complex nested effects.

Sources contain bundled custom fonts: Kia Signature600, Nissan Brand300, Louis Global2Bold500, Ford Antenna300. Retain these; Google/system substitutions are not a fidelity pass.

## Client IDs and pending question

Read-only production lookup found:

- Bay City Auto Group: `c36fbbd9-34c2-41a6-ac69-5ed955ffd95f`
- Bendigo Kia: exact match verified; resolve its ID from the client API (do not infer IDs).
- Westernport Ford: `7807b3e1-5567-4c44-b4a9-7042f3edb0d0`
- Frankston Motor Group: `8b45925c-bc32-4b7c-afc1-cfc46d81c9dd`
- Brighton Auto Group: `6e072410-8893-4ef8-a38c-3bb655e0eaa0`

A question is pending: should Frankston GMSV belong to Frankston Motor Group, and Brighton Nissan to Brighton Auto Group, or remain unassigned? Do not infer an answer from elapsed time. Exact matches can proceed independently.

DB credentials exist in `/Users/paulgiurin/Documents/Projects/dashboard/.env`; never print their values or mint auth tokens. Read-only inspection used dotenv.parse explicitly because inherited DATABASE_URL was empty and prevented node --env-file override. Production writes must use normal authenticated application flows and preserve God Mode execution ledger.

## Implemented but unreleased

### Library browsing

- `app/pages/agency/banner-studio/index.vue`
- `app/pages/agency/banner-studio/templates.vue`
- `app/components/banner/LibraryItems.vue`
- `app/components/banner/LibraryThumbnail.vue`
- `app/utils/banner-library.ts`
- `test/banner/libraryBrowse.test.ts`

Compact list/grid preference; client sidebar; source-folder/category filter; search/sort; 36-item pagination; dimensions/date; lazy previews; custom-template API pagination in batches of 100. Templates use real category metadata, not invented client ownership. Project page includes TheBrief import-modal hook.

### Animation and preview fixes

- `scripts/thebrief/convert-html.mjs`
- `app/types/banner-studio.ts`
- `app/utils/banner-transform.ts`
- `app/utils/banner-html-builder.ts`
- `server/utils/banner/htmlBuilder.ts`
- `app/components/banner/Artboard.client.vue`
- `app/components/banner/Thumbnail.client.vue`
- `test/thebrief/convertHtml.test.ts`, `fixture.ts`, `nativeRendering.test.ts`, `thumbnail.test.ts`

Uniform scale() conversion; native pixel transform-origin; split text lines preserve parent pivot; unsupported transform order/origin changes stay warnings. Local bounded font manifest extraction. Thumbnails now resolve custom dimensions, load managed font catalog before generating previews, centre-fit and rescale, while retaining empty iframe sandbox and no animation scripts.

Converter retest reports no unsupported-animation warnings on all four source files. Safari comparisons now cover entrance/middle/final frames for all four after corrections to backgrounds, static rotations, uppercase text and rounded panels. This is manual CSS comparison, not pixel-perfect or complete vendor-runtime certification. Westernport has a faint reference-only ghost at exact time zero; investigate before certifying its first frame.

### Prepared-package import

- `app/utils/thebrief-import.ts`
- `app/components/banner/TheBriefImportModal.client.vue`
- `scripts/thebrief/package-import.mjs`
- `test/thebrief/importPackage.test.ts`

Zod validates bounded native data and local binary manifests; verifies SHA256; exact conservative client suggestions; original source/folder/timing tags; managed asset/font uploads; draft creation followed by GET verification. Same-canvas comparison ignores JSONB object-key order, preserves array order. SVG illustrations are rasterised to PNG for supported asset delivery, with warnings; original SVG remains in ZIP. No source HTML execution.

### Local comparison harness

- `scripts/thebrief/preview-pilot.mjs`: generic design title, source-local custom fonts, end-time based on duration.
- `scripts/thebrief/serve-pilot.mjs`: local-only font MIME/CORS/CSP updates for opaque sandbox frames.

Reference is original exported CSS with scripts removed; native side is XeroFlow renderer. Both seek to common timestamps. This is CSS playback comparison, not full vendor-runtime certification.

## Current verification and open work

- Font upload/reuse now refreshes the shared catalog, preserves all family weights, and reconciles changed faces. Eight font tests plus thumbnail regression pass. Source font aliases include archive hash; originals remain retained.
- Server project creation serializes imports with a per-client/source-hash transaction lock and reuses an existing project, preserving GodMode execution boundaries. Browser import attempts persist a local hold before uploads and stop uncertain retries until reconciliation. Asset uploads are not globally idempotent; do not claim exactly-once uploads.
- Source duration and loop count now persist as artboard playback metadata. Editor, Play All and HTML export respect once/continuous/finite playback; frame/video capture intentionally renders one cycle. Existing projects without metadata retain defaults.
- Converter retains source backgrounds/images, static rotation, uppercase text and uniform border radius. Unsafe/unsupported transforms remain explicit warnings. SVG artwork is rasterized with notes; source vectors retained privately.
- Prepared packages deduplicate identical converted image bytes even when source filenames differ.
- Build initially exceeded immutable raw Worker budget by7,460bytes. Moving browser-only import modal into `.client.vue` produced a successful build: raw25,439,713/25,468,928bytes; gzip6,951,257/9,750,000bytes. Final release rebuild still required after font-review fix.
- Main freshly fetched; candidate includes origin/main8c8a5b5c4b6ccb6a17dc7a9405169ac4bc671f0e. Guarded deploy check passed. **No deployment or live saved-project verification yet.**
- Combined tests before final font-review fix: **274 tests across38 suites passed**, `/private/tmp/thebrief-final-tests.log`. Final focused font/thumbnail run:9 passed. New files scoped lint clean. Full lint remains a baseline backlog:61,932errors and782warnings; do not report full lint clean.
- Marketing feature pages now describe compact browsing accurately.
- Animated masks with shifted pivots, complex/multi-size source exports, and full-library compatibility remain unproven.
- Frankston and Brighton owner mappings remain pending. Import only exact-client pilot packages first.
- Need live library/list/grid/QR navigation checks, draft import, saved owner/tags/canvas/font verification and editor reload. Preserve full conversion notes in private migration ledger before scaling.

## Commands for next session

```sh
cd /private/tmp/xeroflow-thebrief-import-20261005
export PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH
pnpm exec vitest run test/thebrief test/banner/libraryBrowse.test.ts
pnpm exec eslint app/utils/thebrief-import.ts app/components/banner/TheBriefImportModal.client.vue scripts/thebrief/package-import.mjs scripts/thebrief/preview-pilot.mjs scripts/thebrief/serve-pilot.mjs test/thebrief/importPackage.test.ts
pnpm lint
```

Example private package generation:

```sh
TSX_TSCONFIG_PATH=scripts/thebrief/tsconfig.json node --import tsx scripts/thebrief/package-import.mjs \
  '/Users/paulgiurin/Documents/XeroFlow Imports/Blind sample 2026-10-05/source/Bendigo Kia Update-1080x1080-px' \
  '/Users/paulgiurin/Documents/XeroFlow Imports/Blind sample 2026-10-05/Bendigo Kia Update-1080x1080-px.zip' \
  'Bendigo Kia Update' \
  '/Users/paulgiurin/Documents/XeroFlow Imports/Blind sample 2026-10-05/Bendigo Kia Update.xeroflow.json'
```

Comparison: `TSX_TSCONFIG_PATH=scripts/thebrief/tsconfig.json node --import tsx scripts/thebrief/preview-pilot.mjs <source-dir> <private-output-dir> <design-name>` then `node scripts/thebrief/serve-pilot.mjs <private-output-dir> 8777`. Open local URL in Safari with computer use and inspect start, entrance, middle, final and loop/restart. Previous Bay City comparison server may still occupy8776.

## Next actions in order

1. Finish import/font review fixes and tests; read every changed file before commit.
2. Generate all four current packages and font-aware private comparison pages, retaining baseline evidence separately.
3. Compare source/native in Safari at multiple timestamps. Record failures and fixes. Add a structurally different/multi-size example before widening claims.
4. Resolve/preserve loop behavior and pending client decisions; unassigned samples remain held.
5. Complete UI browser verification, build/deploy guards, source freshness, public feature text and release record.
6. Import exact-client pilot packages through authenticated XeroFlow UI. Verify project owner, source tags, dimensions, native layers, font appearance, animation and save/reload. Keep review status until passed.
7. Only then perform controlled batches; keep a migration ledger of source→client→project IDs and QA outcomes. Never publish historical offers as part of migration.

## Code recovery backup

The primary workspace remains the worktree above. Because it is under /private/tmp and changes are not committed, a durable recovery snapshot is also stored beside this handoff:

- `banner-import-worktree-2026-10-05.patch`: tracked-file diff against HEAD (binary-capable).
- `banner-import-new-files-2026-10-05.tar.gz`: all untracked implementation/test/document files from this worktree, with relative paths.

Do not apply blindly over current files. Compare current branch/diff first; these are fallback recovery artifacts, not a released build. No credentials or original client creative assets are included in this code snapshot.
