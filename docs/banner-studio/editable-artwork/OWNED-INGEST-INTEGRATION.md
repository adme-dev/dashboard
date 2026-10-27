# Protected ingestion integration — 28 October 2026

## Release approval checkpoint — 27 October 2026, 22:07 UTC

The tested application candidate is **`ab380c6e423bc528c9fa4054dd7912c91b7d62fe`**, including application main **`5e3f5b5472bf6827d094bae2bae029aa4e6f5820`**. The final source preflight detected main advancing to **`3d89462ffee9a74f372adc198d9d01ab39eec1a7`**; its sole change is the marketing release runbook, now reconciled. Only documentation differs from the tested application tree. The full suite passed **21,731 tests / 4,065 skipped** (2,624 files passed / 118 skipped); the subsequent scoped typing/formatting cleanup passed all **82 affected checks** and scoped lint. The full production build passed **3,032-module import closure**, all **six exact-artifact startup checks**, and unchanged limits: **25,341,792 / 25,468,928 raw bytes**, **7,262,419 / 9,750,000 gzip bytes**. Module-manifest SHA-256: `846f1b045aef94043defc58c607cbc9270de68d59c35e5f55f9ff318920d3115`. Local native R2 and Chromium proofs and 75 job/import plus 30 canvas PostgreSQL tests retain their separate evidence scopes; counts overlap.

**Production has moved independently.** Fresh Cloudflare readback identifies main `5e3f5b5472bf6827d094bae2bae029aa4e6f5820`, deployment **`c1c09443-5dc4-4f52-ae51-ed3bb39fb016`**. The three previously verified synthetic saved-export download URLs return **404** on this release. The customer baseline is still revision `2026-10-26T03:49:11.160Z`, canvas SHA-256 `e7f7c22f77232601fd80b63c1df7c604b523924e3198eac5c39640bff55b168f`. The candidate restores those routes while retaining the current marketing source. Earlier claims that production still runs `c910df968` are superseded by this readback.

The guarded production release command was **rejected before execution by automatic approval review**. Its stated reason: releasing the entire candidate is a consequential service mutation beyond clearly authorized local qualification and draft-branch work; the restoration purpose alone does not establish production-release authorization. Do not retry directly or indirectly without explicit approval. The prepared action is `pnpm deploy:production` in the isolated release worktree, targeting only `agency-dashboard`, followed by exact deployment, saved-download, editor/QR and unchanged-customer verification. No new credentials are required. The draft PR remains unmerged; merging it after required checks and review is necessary to keep later main releases from dropping the Banner changes again.

All local source work is retained. [PR 720](https://github.com/adme-dev/dashboard/pull/720) is the review surface; remote CI remains pending and is not represented as passing. The release packet is `output/banner-release-candidate-20261028/`. All dispatched workers are settled (97 released, two previously user-retained; none reclaimable).

[Craft tool status](TOOLS-DEPLOYMENT-STATUS.md): PhotoCraft/VectorCraft have a deployed **disabled private canary**, not active hosted integration. EffectCraft/FilmCraft/FigCraft/SoundCraft have no qualified adapters or deployed integrations. The earlier native one-run and live AI-provider automatic-review rejections remain unresolved. Scoped project analysis admission is also disabled. Full PRD, reconstruction, provider quality and print readiness remain incomplete. The remaining low-severity lock/performance limits are explicitly recorded in [the residual review](INGEST-RESIDUAL-CLOSURE.md).

Earlier checkpoints below are historical.

This increment is implemented locally and integrated into the existing release candidate, but has not been released. Project/client upload admission remains statically disabled in `shared/bannerDissectionCapabilities.ts`. Personal legacy upload remains supported. The full editable-artwork PRD and hosted provider/print acceptance remain incomplete.

## Behavior

PNG uploads retain verified original bytes, source dimensions/hash and explicit optional A4 physical intent. Fresh configured-role, uploader, assignment, project ownership and session checks protect job read/retry/cancel/execution/dispatch, including rechecks around storage and provider boundaries. Bounded multipart transport runs before the Pages preset buffers the request. Duplicate/unknown fields fail before effects.

Scoped derived PNGs use authenticated, private/no-store GET/HEAD delivery, exact persisted registry identity, bounded body reads and final authority checks. Their catalogue row and manifest registry register atomically in one non-retrying transaction. Lost acknowledgement preserves evidence without replay or compensation. Source keys are removed from outward snapshots.

Saved protected canvases carry immutable source markers, including text-only imports. Save/copy/history paths reauthorize sources and preserve lineage; deletion detaches import destinations while retaining source and delivery evidence. Unsupported public templates, review links, ad/scheduled publishing, AI transformations, MCP/audio access and generic asset mutations reject protected artwork. This does not recall already downloaded bytes.

Saved PNG/JPG/GIF exports use server-built HTML with authorized source bytes embedded. Atomic R2 custom metadata retains bounded source dependencies and original target authority, so historical downloads remain protected after canvas edits. HTML/ZIP uses server-prepared content; it does not trust caller HTML. Creation needs write authority; download needs read authority. Protected restore, MP4 and public publishing remain unsupported with explicit errors.

## Evidence at integration

- Combined focused regression: **1,023 passed, 91 opt-in tests skipped**, 55 files passed and two skipped. Local HTTP and workerd tests ran with loopback access. `/private/tmp/banner-owned-all-focused.log`.
- Final job/lifecycle proof: **59 actual PostgreSQL tests passed** in an owned disposable local cluster; source hashes unchanged during proof, cluster stopped and removed. `output/editable-artwork-owned-ingestion/postgres-proof.json`.
- Flow worker: **16 actual PostgreSQL tests passed**, including assignment locks, opposite source ordering, concurrent PATCH/delete, immutable metadata retention and catalogue exclusion before LIMIT. See [flow report](INGEST-SCOPED-FLOW-GUARDS.md).
- Integration review caught an invalid-object cancellation wait. Its new test reproduced the hang, then **68 delivery/bounded-reader tests passed** with nonblocking cancellation. `/private/tmp/banner-owned-cancel-red.log` and `banner-owned-cancel-green.log`.
- Real local Chromium proof: **10 passed**, covering protected PNG/JPG/GIF and retained HTML/ZIP with private-image and text-only provenance, independent pixel decoding, no private URL or cookie forwarding, and positive owned-process cleanup. See [browser proof](INGEST-SCOPED-RENDERER-PROOF.md). Root made the test temp directory portable for Linux after that run; candidate rerun remains required.
- Fresh read-only Cloudflare configuration check: `agency-files` managed public domain disabled and custom domain list empty. `/private/tmp/banner-media-bucket-public-readback.json`. No bucket setting changed. This is configuration evidence, not hosted route/renderer acceptance.
- Existing legacy MCP/audio files retain unrelated lint debt; the other seven root authority/delivery/pipeline/gate files in the targeted lint command passed. Full server typecheck is not clean; worker reports distinguish owned-path checks from repository diagnostics.

Counts overlap; do not add them into a unique test total. Synthetic storage/provider fixtures are not hosted provider proof. No new credentials, paid provider calls, native canary execution, production DB mutations or customer artwork changes occurred in this increment.

## Release boundary

The candidate is `adme-dev/banner-artwork-release-20261027` at base `c910df968ac1bef181f9aa99c14008ed2897edac`, including freshly fetched main `eb294e8600cc4054d1c9dd98eb46ec61c1ea9958`. The original dirty worktree and unrelated edits were preserved; only an explicit 119-file manifest was copied, with source and destination hashes checked before mutation. Final review, real local renderer proof and full immutable build/startup/size gates are in progress. The subsequent cancellation fix must be included before final qualification.

The last production release remains Pages `eb493158-0d78-4f9c-9102-89f20ae5a770`, source `c910df968ac1bef181f9aa99c14008ed2897edac`. The current increment has no deployment ID. Scoped admission must remain disabled until acceptance is established. No bundle limit or deployment guard was relaxed.

## Independent review follow-up — 27 October 2026, 21:26 UTC

The first candidate build passed 3,019-module import closure, unchanged raw/gzip budgets (25,446,379 / 25,468,928 raw and 7,459,466 / 9,750,000 gzip), and all six exact emitted-artifact startup checks. This artifact precedes the final cancellation/type/review repairs and is not a releasable final-source proof.

The first complete candidate regression run passed 21,188 tests, with two mechanical inventory snapshot failures and 3,857 opt-in/environment-dependent skips (2,576 files passed, two failed, 114 skipped). The exact inventory delta was inspected: three new routes, three additional write gates and four fresh-authority lexical rows; subsequent upload hardening will add another write gate. Snapshots will be updated after final integration, retaining their assertions and exact digests. No behavior test failed in that full run.

Independent Claude review verified the earlier F1-F12 fixes and found R1-R4. R1/R3 project-list poisoning and inaccessible-source cleanup are assigned to a bounded worker; list placeholders must reveal no source content and preserve pagination. R2 existing-canvas import lineage/lock ordering is assigned separately with actual PostgreSQL proof. Root reproduced R4 uppercase project-ID provenance failure, canonicalized IDs before persistence, and passed the focused export regression. Root also reproduced revoked-source export history failing unrelated rows, then added restricted placeholders containing only export ID, restricted flag and null URL; infrastructure failures still propagate. All seven export-list tests pass. These follow-ups are not yet final release acceptance.

Integrated TypeScript checking exposed two introduced interface errors (multipart MIME optionality and project-creation transaction callback type). Both are repaired locally; 104 related upload/creation/export tests pass. The full server typecheck remains failing on unrelated existing diagnostics and is not represented as clean.
