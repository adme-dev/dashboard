# TheBrief → XeroFlow Banner Studio handoff

Updated: 5 October 2026, Australia/Melbourne. **Pilot deployed; four native draft imports saved in production; the first two fully checked in the editor. Bulk migration remains pending. Editor rotation and font corrections are deployed and visually verified after reload.**

## Resume instruction

Continue the approved TheBrief import pilot and compact banner-library UI. Read this document, the worktree AGENTS.md and current git diff first. Preserve shared work. Read the live project and release records below. Finish any remaining visual checks, then sample structurally different animations before bulk migration. Do not report the full migration or animation parity as complete.

## Workspace and release

- Worktree: `/private/tmp/xeroflow-thebrief-import-20261005`
- Branch: `feat/thebrief-import-pilot-20261005`
- Initial pilot implementation commit: `02372e0ec7e4c04900140481fba55b7e44696572`
- Rotation reset correction: `b6fca705719d0bcb3b113837e8f73f34d035bc5d`
- Last fetched origin/main: `8c8a5b5c4b6ccb6a17dc7a9405169ac4bc671f0e`; branch includes it, 94 commits ahead at final application release84f764bc9, zero behind. Fetch again before release; a branch name alone is not evidence of freshness.
- Implementation, rotation and font fixes are committed. Later documentation-only commits do not change the deployed application. The current user cwd is the separate, dirty DriveAgent website repo: do not implement dashboard changes there.
- Use Node 24: `/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin`. Default shell Node is 20.
- node_modules symlinks to `/private/tmp/xeroflow-driveagent-facebook-rollout/node_modules`.
- Deployment must use `pnpm deploy:check` and guarded `pnpm deploy:preview` / `pnpm deploy:production`. Target is **agency-dashboard** only. Never bypass guards or call wrangler pages deploy directly. Record source commit/deployment ID and check QR/navigation alongside banner features.
- Existing server bundle is close to Cloudflare size limit (~29 KB raw headroom in the pilot release). HappyDOM stays offline in scripts, never in server imports.
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
- Prepared packages now exist for all four samples as `<Creative name> Update.xeroflow.json`. They contain managed-ready media and one bundled font each. All four pilot packages have been imported under confirmed client ownership. Regenerate after further converter/packager fixes. Ignore the older `Bendigo Kia.xeroflow.json` draft package; use `Bendigo Kia Update.xeroflow.json`.
- Previous Bay City proof: `/Users/paulgiurin/Documents/XeroFlow Imports/Bay City Auto Group - Pilot 2026-10-05`.
- Accepted proposal: `/Users/paulgiurin/Documents/XeroFlow Imports/BANNER-LIBRARY-PROPOSAL.md`.

Batch export is available: select rows → Download → HTML5 → General usage → High 90%. **Turn off “Convert custom fonts to SVG”** to preserve editable text. After generation, click Download on the completed batch entry. Safari expanded the batch to `/Users/paulgiurin/Downloads/General usage/`; originals were copied into the durable artifact folder.

## Frozen pilot samples

| Creative | Dimensions | Duration / source plays | Initial blind result | Client mapping |
|---|---|---|---|---|
| Frankston GMSV Update | 1000×1000 | 4s / continuous | Mixed-size text warning; no unsupported animation | User confirmed parent-group client |
| Westernport Ford Update | 1000×1000 | 3s / once | scale(8) text animation failed conversion | Exact client available |
| Bendigo Kia Update | 1080×1080 | 3.9s / continuous | Shape transform-origin failed conversion | Exact client available |
| Brighton Nissan Update | 1200×1200 | 4s / continuous | Text scale + shape transform-origin failed conversion | User confirmed parent-group client |

All four use CSS-keyframe exports. This sample does NOT establish compatibility with all TheBrief animation engines, masks, video, multi-size sets or complex nested effects.

Sources contain bundled custom fonts: Kia Signature600, Nissan Brand300, Louis Global2Bold500, Ford Antenna300. Retain these; Google/system substitutions are not a fidelity pass.

## Confirmed client IDs

Read-only production lookup found:

- Bay City Auto Group: `c36fbbd9-34c2-41a6-ac69-5ed955ffd95f`
- Bendigo Kia: exact match verified; resolve its ID from the client API (do not infer IDs).
- Westernport Ford: `7807b3e1-5567-4c44-b4a9-7042f3edb0d0`
- Frankston Motor Group: `8b45925c-bc32-4b7c-afc1-cfc46d81c9dd`
- Brighton Auto Group: `6e072410-8893-4ef8-a38c-3bb655e0eaa0`

User explicitly confirmed on5October2026: Frankston GMSV belongs to Frankston Motor Group and Brighton Nissan to Brighton Auto Group, then requested continued imports. Both assignments are saved; do not ask again.

DB credentials exist in `/Users/paulgiurin/Documents/Projects/dashboard/.env`; never print their values or mint auth tokens. Read-only inspection used dotenv.parse explicitly because inherited DATABASE_URL was empty and prevented node --env-file override. Production writes must use normal authenticated application flows and preserve God Mode execution ledger.

## Implemented and deployed

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
- Initial guarded release: `02372e0ec7e4c04900140481fba55b7e44696572`, https://0297a5d3.agency-dashboard-6cm.pages.dev; production target agency-dashboard/main. Raw25,439,926/25,468,928bytes; gzip6,951,393/9,750,000bytes. Never weaken these budgets.
- Live inspection found static rotation disappeared after GSAP cleared Vue's inline transform. Fixed reset/preset settling, added four playback/stop/rebuild/edit regressions; released `b6fca705719d0bcb3b113837e8f73f34d035bc5d` at https://eb031f63.agency-dashboard-6cm.pages.dev.
- Final rotation test run: **289 tests across42 suites passed**, `/private/tmp/thebrief-final-font-tests.log`. Full lint has baseline61,927errors/782warnings (`/private/tmp/thebrief-final-font-lint.log`), five fewer formatting errors; do not call full lint clean.
- Live Safari verified compact list/grid, client filter (Bendigo only), source-folder filter (both imports), and template gallery categories/list controls. QR Codes/New QR code verified authenticated after rotation release; final application change only quotes editor font families.
- Native editor font difference identified: imported family alias includes a numeric-leading hash token; unquoted CSS font-family in native text is invalid, while quoted export/thumbnail is correct. Fixed in text/button layers by d4580cfab. Final Safari reload shows correct Kia font, intended two-line headline, source-aligned layout and vertical divider. Compared to source/native local CSS harness at3.8s; no pixel-perfect or full vendor-runtime claim.
- Animated masks with shifted pivots, complex/multi-size source exports, and full-library compatibility remain unproven.
- Frankston and Brighton owner mappings are confirmed and imported. No historical offers have been published.

## Live pilot projects

| Creative | Native project | Verified | Review hold |
|---|---|---|---|
| Bendigo Kia Update | https://app.xeroflow.io/agency/banner-studio/351c05c4-cdcc-4e91-9627-6545099f6c86 | Exact client selected; import GET verified saved draft; editor loads1080×1080 native layers and3.9s timeline; scrubbed1.1s shows animation; continuous looping observed beyond one cycle after final release | Static divider and font/layout corrected and visually checked after full reload; retained review marker pending broader migration sign-off |
| Westernport Ford Update | https://app.xeroflow.io/agency/banner-studio/9b20cc2f-586a-495e-851d-99a0643b6bd3 | Exact client selected; import GET verified;1000×1000 native layers; playback ends at3.0s and holds; full reload retains artwork/timeline | Exact-time-zero reference ghost remains a qualified comparison discrepancy |
| Frankston GMSV Update | https://app.xeroflow.io/agency/banner-studio/ae7a4d3a-70ff-4da3-a9f3-b34f7f6157d7 | User-approved Frankston Motor Group owner; authenticated import reports saved; independent read confirms9layers,1000×1000,4s continuous; bundled font hash matches uploaded bytes | Final live editor visual/reload check interrupted by concurrent Safari session |
| Brighton Nissan Update | https://app.xeroflow.io/agency/banner-studio/781db8c6-3a30-47ba-a9d6-87bf91ebf168 | User-approved Brighton Auto Group owner; saved draft; editor screenshot confirms1200×1200 artwork, rounded header, Nissan font and4s timeline; independent read confirms8layers and font hash | Live playback/reload check still pending |

All four projects retain `import:needs-review`, original source hash, folder and timing. Do not re-import to overwrite edits. Server dedup by client/source hash returns existing project. New copies require an explicit separate workflow.

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

1. Read release and private ledger; do not repeat completed imports. Preserve review tags until migration sign-off.
2. Font/rotation, source comparison and saved editor reload are complete for Bendigo. Westernport once-only playback and reload are verified; investigate the qualified exact-time-zero reference ghost before claiming first-frame parity.
3. Frankston/Brighton are imported under confirmed parent clients. Finish remaining live playback/reload visual checks without duplicating them.
4. Select additional unseen, structurally different/multi-size or masking animations. Freeze sample before inspecting. Compare source/native at entrance, middle, exit and loop/restart; preserve baseline outcomes.
5. Only then perform controlled batches with source→client→project migration ledger. Never publish historical offers as part of migration.
6. Direct ZIP upload, robust folder schema, full-library inventory/export and complex-engine adapters remain future increments. Prepared JSON import is the current live capability.

## Code recovery backup

Primary worktree is under /private/tmp, so durable recovery artifacts are stored beside the private handoff:

- `banner-import-2026-10-05.bundle`: committed branch history beyond origin/main; preferred recovery artifact. Fetch into an isolated checkout after inspecting refs.
- `banner-import-worktree-2026-10-05.patch`: binary-capable diff from pre-pilot `c07c0e26993d9c7a04efb9d6a8a559910ef7d7a7` to the recorded final commit, including formerly new files.
- `banner-import-new-files-2026-10-05.tar.gz`: historical pre-commit snapshot; superseded by bundle, do not apply over current files.

Do not apply blindly. Branch includes a substantial pre-existing local commit chain; no push/merge was performed. Reconcile onto freshly fetched main before any integration. No credentials or client creative bytes are committed in the repo.

## Final release record

- Production application source: `84f764bc968110cbaafae1c969811cead37084b4`, includes font fix `d4580cfab1f45142ead0de87ddaacf76b96cbcd7`.
- Deployment: https://32ae8e6a.agency-dashboard-6cm.pages.dev, target agency-dashboard/main; guarded deploy completed exit0. Live app: https://app.xeroflow.io.
- Source main: `8c8a5b5c4b6ccb6a17dc7a9405169ac4bc671f0e`, freshly fetched and included.
- Raw Worker25,439,972/25,468,928bytes (28,956headroom), gzip6,951,383/9,750,000bytes.
- Release log: `/private/tmp/thebrief-font-release.log`; test log `/private/tmp/thebrief-final-font-tests.log`.
- Private saved-project ledger: `/Users/paulgiurin/Documents/XeroFlow Imports/Blind sample 2026-10-05/live-migration-ledger.json`.
- No push/merge or full-library migration performed. Structural-animation coverage and further batch migration remain outstanding.

## Latest import continuation

- Four pilot drafts now exist; no additional batch has been downloaded/imported yet.
- Read-only persistence and font verification: `Blind sample 2026-10-05/confirmed-pilot-persistence-and-fonts.json`. Both uploaded fonts match the retained source bytes by SHA256: Louis Global2Bold weight500 and Nissan Brand weight300. No direct database writes were used.
- UI issue discovered: adding another package after a completed import rebuilds existing rows, resetting their saved labels/client selections. Database project dedup remains protective; record a future UI fix to preserve completed row state. For now use a fresh modal per batch.
- Safari is concurrently switching between this task and unrelated local browser-test/review pages (ports5227/3112). Repeated tool actions are rejected or screenshots show the other session. Asked user to pause the other session's Safari controls; answer pending. Do not fight another automation session or act on stale selectors.
- Next immediate action once Safari is available: verify Frankston and Brighton playback/reload; select next TheBrief batch, with unseen structural/multi-size animation samples frozen before inspection. Preserve editable fonts during HTML5 export.
- User asked whether editing motion/tweening and correct fonts required changes: explained implemented native keyframes/timing/origin/loop support, rotation/scale/font fixes; complex masks/engines remain unproven.
