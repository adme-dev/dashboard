# Ingest review closure — R1–R4 (bounded, read-only)

Date: 2026-10-28. Scope: the original `banner-editable-artwork` workspace, R1–R4 from `INGEST-INTEGRATION-REVIEW.md` only. This was a source review plus focused local tests on Node `v24.18.0`. No Git, build, deployment, live DB or provider, native canary, credentials or subagents were used. **This note does not certify hosted or full-PRD acceptance.**

## Source reviewed (SHA-256, unchanged from start to end of review)

| File | SHA-256 |
|---|---|
| `server/api/agency/banner-studio/projects/upload-banners.post.ts` | `ec866ad3b06b8a42b86dd29f42d045d2b043ec70284b180b9d59717116ad812f` |
| `server/api/agency/banner-studio/projects/index.get.ts` | `64746f13a337212b92be6040ff0b133a160768178d9b9fb7fa6bf1aeaab858d7` |
| `server/api/agency/banner-studio/projects/[id].delete.ts` | `5f18fa0870428eaf4a2f3f1167412417f470ab4a4cbab66d4b0f4d6d9153da9d` |
| `server/api/agency/banner-studio/dissect/[jobId]/import.post.ts` | `5a1e19d4d899ccd539a727872616ce7c729b8bfb83e775f3567a7e4ac3d10154` |
| `server/utils/banner/scopedExport.ts` | `314f23b22a522f3787897ffce42ab321675ce2bbe08d35145b6aa1eaaa43f509` |
| `server/api/agency/banner-studio/exports/index.get.ts` | `93be14a254cb5dee7e0413844e6ec15af4f388e96aff13445b22d72a682f31c9` |
| `server/utils/banner/scopedCanvasAccess.ts` | `4603793d9078a280bc433b6ea33799406796e3f72158a061fc3fecbcb4c3f905` |
| `app/pages/agency/banner-studio/index.vue` | `454f2c83b485b23e011ede82fb843404e259aba2957965eb38a54f056dd0845c` |
| `app/types/banner-studio.ts` (`BannerProject` restricted) | `c5f68335674f22d9c37a34750a9267e4844c6747f721e5ff4b8d98737b74a662` |
| `app/pages/agency/banner-studio/brand-kits.vue` (root follow-up) | `1881fc3b882c533087ead9abb0c95e904bf6b40f875190118b0afcdab87ff4c4` |
| Supporting: `dissectionAccess.ts` / `exportRendering.ts` / `export-html.post.ts` | `97fb2754…a162a` / `dd3ec302…b9` / `f2026ad8…dd` |
| Supporting: `shared/bannerScopedCanvas.ts` / `shared/bannerDissectionDelivery.ts` | `d81bc46a…a67a` / `72a3ff3d…dde1` |

## Verdicts

**R1 — closed.** The upload route is now `requireWriteAccess` (`:36`). A supplied `clientId` goes through `requireSocialClientAccess` (`:64`), which checks the UUID, permission group and assignment. Before the first storage write, the whole batch is validated (`:76-97`):
- dimensions must be positive safe integers;
- filenames reject `/ \ ? #`, control characters and any `%XX` escape, plus anything `hasScopedCanvas` detects, which lowercases and decodes.

Together these rules block every original reproducer (`scoped-banner-exports/x.png`, `a%2Fbanner-studio%2Fdissect%2Fx.png` and the double-encoded form). The only free-form value in the URL is the filename (`createBannerAssetStorageKey`), and the format key is built from validated integers. The page-wide consequence is closed generically. The list returns a minimal placeholder on a 403 from a detected canvas and keeps rows in their positions. Delete needs only target `write` authority, never source parsing. So any row already poisoned elsewhere no longer breaks the list and can be deleted.

**R2 — closed in source.** The order in the import route is:
1. An unlocked preflight reads the target (`:65-70`).
2. Locks are taken in sorted order over the union of the incoming job and every job in the canvas, before any authority check (`:71-81`).
3. On replay, the canvas is read again after locking, and a fence returns 409 if it holds a job that was not locked (`:86-90`).
4. The existing canvas gets full write authority (`:91`), followed by an exact snapshot fence under `FOR UPDATE` (`:127`).
5. `assertScopedCanvasLineage` (`:171`) blocks overwriting a protected format and pushing a canvas past 8 jobs. Uploader-only source authority blocks mixing in a second uploader.

The owned-Postgres proofs (`dissectionJobsPostgres.test.ts:1106-1222`) cover these cases: lock order, a fence after preflight, replay dependencies, other uploader and erase-source. **They were skipped here** because `BANNER_JOBS_PROOF_URL` was not set. The concurrency claims rest on the proof workers' runs.

**R3 — mitigated as designed.**
- Project list: a source-denied row becomes `{id, name:'Restricted artwork', status:'restricted', restricted:true}` without filtering pagination. Errors that are not 403 still propagate.
- Own export history: a revoked export becomes `{id, restricted:true, url:null}`. A 503 still propagates. Other users' scoped exports are excluded in SQL, as before.
- UI: Banner Studio index and brand kits drop restricted rows from the client facets and pickers, and block edit and duplicate (delete only). The overlay, audio, style and brief consumers tolerate a missing `canvasData`/`tags`. Nothing in the app consumes the export-history list.
- By design, a session invalidation still leaves the uploader's own protected work unreadable. It is now visible as a placeholder and can be deleted.

**R4 — closed.** `prepareScopedExport` lowercases `projectId` (`:109`) before the snapshot, recheck and provenance. The raster key and row use `parsed.projectId.toLowerCase()`. Download and list parse provenance against the database row's `id`/`project_id`. The unit test `bannerScopedExport.test.ts:28` covers an uppercase request.

## Tests run (Node 24.18.0)

`vitest run` over 10 files:
- `bannerUploadProjectRecovery`
- `app/bannerRestrictedProjectList`
- `bannerScopedCanvasFlows`
- `bannerScopedProjectDelete`
- `bannerExportsPrivateUrls`
- `bannerScopedExportRendering`
- `bannerDissectionReadiness`
- `utils/bannerScopedCanvasPostgres`
- `utils/bannerScopedExport`
- `utils/bannerScopedCanvasAccess`

Result: 9 files passed and 1 was skipped (owned PostgreSQL). **150 passed, 28 skipped.**

## Remaining defects (actionable, none reopen R1–R4)

1. **Low — the redacted name can be recovered through server search.** `projects/index.get.ts:59-62` applies `p.name ILIKE %search%` to the real name before redaction, and does not escape `%`/`_`. A user who is authorized for the client but denied the source can grow a substring probe until the placeholder appears, and so recover the hidden name. Dissected projects are named `Dissected — <AI-extracted brand>`. The `status` and `clientId` filters leak the same way, but those are target metadata. Fix: when a search filter is present, drop redacted rows (or match only the placeholder name), and escape the wildcards.
2. **Low (robustness) — `banner_projects` lock upgrade from FOR SHARE to FOR UPDATE.** In delete (`:20-21`) and import (`:91/:116` then `:127`), `projectAccess` takes `FOR SHARE` and `assertScopedProjectUnchanged` then takes `FOR UPDATE` on the same row. Two transactions on one project whose job locks don't overlap can deadlock, for example a double-clicked delete, delete racing a new import, or two imports into an unprotected project. PostgreSQL aborts one with 40P01, which surfaces as a generic 500. This fails safely: the transaction rolls back with no corruption. Fix: take the project `FOR UPDATE` right after the source locks, or map 40P01 to 409.
3. **Low (performance) — the read-only list opens one transaction per protected row and takes `FOR UPDATE` on the source jobs.** This serializes the list against imports and exports and costs N round-trips per page.
4. **Low — a deterministic provenance mismatch or a missing R2 object fails the whole export history with 503.** It is not turned into a placeholder. This affects only canary exports made before the fix (uppercase ID) or deleted objects, and admission is off.
5. **Compatibility notes, no change requested:**
   - Target-authorized delete lets an assigned colleague delete another uploader's protected project. That sets `project_id = NULL` and leaves the project-owned ingestion permanently unreadable. It is kept, not destroyed.
   - `banner_exports ON DELETE CASCADE` leaves scoped R2 export objects orphaned. They stay private and are not leaked.
