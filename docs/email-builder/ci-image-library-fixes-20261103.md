# Image-library CI fixture correction — 3 November 2026

The two assigned assertions from general CI `41505334628` are fixed with **test-only changes** in `test/unit/emailNativeLibrary.test.ts`. Before editing, the complete file reproduced **11 passed / 2 failed / 0 skipped** at the reported lines 75 and 96. After correction, the complete file passes **15/15**, and the focused image/library/legacy regression matrix passes **101 tests in 11 files, 0 failures, 0 skips**. The 101 includes the 15 assigned-file tests; these counts are not additive. No production policy, grant, lineage, authority check or refusal was changed.

The coordinator supplied source HEAD `f13160e2706969c6d8420f6e4820644be120f5c4`. All commands used the explicit root `/Users/paulgiurin/orca/workspaces/dashboard/figflow-edm-release-20261101`, Node `24.18.0` and existing dependencies, without Git commands, installs, CI or builds. The actual shared module path is `shared/emailRendering/designModules.ts`, not the proposed `shared/email-design/designModules.ts`. Investigation proved that production code needed no change, so no ownership expansion was requested or used.

The root cause is a stale test setup. Both failures obtained their supposed legacy image through `source()`, which calls current `insertDesignImage`. The approved new-image default adds both `alt` and `url` grants, and stable `imgu_<operationId>` URL-field lineage, to newly inserted registered images. The two older tests removed the image's lineage and then expected an alt-only denial. Removing lineage does not revoke a saved explicit URL grant. Their inputs therefore still authorized the attempted replacement under the intended legacy URL-grant rule.

This was verified before the fix. `trace.mts` / `trace.json` show the current image has alt+URL grants, still permits replacement after all its lineage is removed, and refuses with `EDIT_FORBIDDEN` when URL permission is actually absent. No server-verified-library flag is supplied in that trace. The original test bytes hash to `4e41f80549e26eb5e8183cb7a794d8c6b90a58b00cdd2e4beaaf703c3af0455c`, exactly matching the prior committed-test record in `docs/email-builder/native-library-bridge-20261102.md` (the report identifies the coordinator-confirmed earlier source). The preserved `.verification/campaign-ui-handoff-20261103/source.diff`, whose recorded read-only base is `6c7f60c5586f9d199f2192e25cf76811fd151532`, explicitly shows the insertion helper moving from alt-only grant/lineage to alt+URL. `history-comparison.json` retains that exact hunk and hash comparison; no Git history operation was used.

The prior campaign unit script selected `emailDesign*.test.ts` and `emailNativeImageReplacement.test.ts`, but omitted `emailNativeLibrary.test.ts`. That explains how its earlier passing matrix did not catch these stale assumptions. This task changes no historical run script, test exclusion or CI inventory; the assigned file is explicitly included in the new focused matrix.

The correction constructs the saved pre-URL-grant image explicitly in `legacySource()`, independent of current insertion defaults: original Image props/asset, original alt field/node identities, and only an alt grant. Only the two legacy scenarios switch to that fixture. Their lineage removal still models an image without library provenance. The main legacy assertion now also checks that alt is granted and URL is absent, checks exact `EDIT_FORBIDDEN`, and proves the refused operation leaves its input unchanged. Adding an explicit URL grant then succeeds while preserving policy and lineage.

Two additional cases keep new and historical behavior separate:

- A fresh insertion has its explicit URL grant and stable URL-field identity; replacement succeeds without claiming the server-only provenance exception, preserving policy, lineage and the original input.
- Inserting a second image into a document containing a historical alt-only image grants only the new image. The saved image's props, original lineage and alt-only policy remain exact, and replacement of that saved image still fails without provenance authority.

The existing refusals remain: ungranted and alt-only logos, legal values, unknown block data, protected ancestors, block/inherited/mobile URL locks, pinned module subtrees, nonimages and descriptor collisions. The shared replacement gate still requires an explicit URL grant or the existing server-verified historical insertion exception, followed by canonical editability and structure/URL lock checks. Read-only inspection of the server owner confirms registered-asset lookup and immutable insertion receipt/digest/source provenance remain in their original path; lineage shape or alt permission alone cannot supply that authority. The server's existing unit transaction harness exercises receipt-digest refusal and replay/post-await authority. Those are mocked unit boundaries, not new real-PG acceptance.

Evidence is confined to `.verification/ci-image-library-fixes-20261103/`:

| Check | Completed result | Evidence |
| --- | --- | --- |
| Before edits, entire assigned file | 11 passed, 2 failed, 0 skipped; exit 1 | `red.log`, `red.json`, immutable `before/` copy |
| Corrected assigned file | 15 passed, 0 failed/skipped; exit 0 | `green.log`, `green.json` |
| Image/library/legacy/asset/staff regression matrix | 101 passed, 11 files, 0 failed/skipped; exit 0 | `regressions.log`, `regressions.json`, `run-tests.sh` |
| ESLint, actual owned file before/after | 0 errors/warnings before and after | `lint-before.json`, `lint-after.json`, `lint-delta.json` |
| Scoped TS program | 0 owned and 0 transitive diagnostics; exit 0 | `checks.cjs`, `checks.log`, `types.json` |
| Protected dependencies and source | Only assigned unit test changed among 10 watched files | `dependencies-before.json`, `dependencies-after.json`, `summary.json` |
| Previous native frame evidence | All 260 existing frozen manifest entries verified read-only | `summary.json` |

The regression files are `emailNativeLibrary` (15), `emailNativeImageReplacement` (5), `emailDesignModules` (11), `emailDesignModulePersistence` (10), `emailDesignLegacyModulePublisher` (6), `emailDesignDesigner` (21), `emailDesignDesignerPersistence` (11), `emailDesignStaffEdit` (9), `emailDesignAssets` (6), `emailDesignAssetStorage` (3), and the existing `emailEdmImageLibraryPicker` component suite (4). No UI recovery file or composer was edited. All runs use `--cache=false` and complete unfiltered files. The existing Vite warning about future native config loading and `__dirname` remains visible and unsuppressed; it is not a failed assertion.

Reproduction from the explicit task root, with `/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin` prepended to PATH:

```sh
node node_modules/vitest/vitest.mjs run test/unit/emailNativeLibrary.test.ts --cache=false
bash .verification/ci-image-library-fixes-20261103/run-tests.sh
node --import tsx .verification/ci-image-library-fixes-20261103/trace.mts
node .verification/ci-image-library-fixes-20261103/checks.cjs
```

The TS check uses ES2022, ESNext/bundler resolution, `strict:false`, existing Node/Vitest declarations and `skipLibCheck`, rooted at the owned test. It is not a full Nuxt/SFC/repository typecheck. ESLint compares the original and final text using the actual test path's configuration, with no new ignore or rule change. The changed file and all new helper/evidence/report content were reviewed; `source.diff` records the complete test change.

| Final source | SHA-256 |
| --- | --- |
| `test/unit/emailNativeLibrary.test.ts` | `2cb70f960202fd5f9936f8a47e8697cb489409e332ba9a543e487204473137b9` |
| Unchanged `shared/emailRendering/designModules.ts` | `242c38a0e35187e2fd34ec860a0f978fc8c2d85a5a6516bc89ca409238ee8f1f` |

`final-freeze.json` contains every new evidence/helper/report hash and the final test hash, excluding the manifest itself. Shared designer/composer and server module/revision owners, package/lock files, previous native manifest and parent CI handoff match their before hashes. No native source/build, SQL, database connection, migration 499, approval pin, configured environment, browser, provider/send, deployment or other frozen evidence was touched. No real browser/database resources were created, so no such cleanup was needed. This resolves only the assigned two general-CI failures; the other CI failures and independent 499 DB review remain separate and are not claimed fixed or accepted.
