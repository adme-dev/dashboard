# Banner Studio recovery: session handoff

Prepared 23 October 2026. This is a handoff, not a deployment receipt.

## Instruction for the receiving session

Take over the XeroFlow Banner Studio recovery below, alongside your existing Page Studio work. Preserve both workstreams. Finish validation, reconcile against fresh main, merge, deploy through the guarded release scripts, and record live acceptance. The user has authorized this sequence. DriveChat was explicitly dropped and is out of scope. Do not resume the unrelated AutoMatch upgrade backlog as part of this handoff.

The user requested recovery of the whole Banner Studio upgrade: library categories, importer and ability to import more banners, rendering fixes, effects, and supporting integrations. Do not replace current main with the historical branch or bulk reimport existing projects.

## Exact source and workspace

- Repository: https://github.com/adme-dev/dashboard
- Owned recovery checkout: `/private/tmp/xeroflow-banner-recovery-20261023`
- Pushed branch: `fix/banner-studio-recovery-20261023`
- Implementation commit: `d5021f8cca5bb91087f9f97d91ae6fe25f45a549`
- Base / last verified remote main: `961520050d4e6f25330a0f6d67fda9f8095217d9`
- Historical source checkout: `/Users/paulgiurin/Documents/Projects/xeroflow-banner-effects-20261006`
- Historical branch: `feat/banner-effects-panel-20261006`
- Historical source HEAD: `752c362e5c3abacf084611731fe0dfa76b68a28e`
- Canonical checkout: `/Users/paulgiurin/Documents/Projects/dashboard`; it has unrelated dirty work. Do not reset, clean, switch or deploy it wholesale.

At handoff preparation, `git ls-remote` confirmed the implementation commit on the remote recovery branch and the main hash above. Recovery checkout was clean. This handoff is a subsequent documentation commit; use the branch tip when resuming. No PR, merge, preview deployment or production deployment has been completed for this recovery.

Read applicable repository instructions before continuing. Another user session owns Page Studio / webpage builder. Do not revert its changes. No additional worktree is needed; disk space is a concern.

## Recovered implementation

The implementation commit changes 220 files. It selectively restores Banner/TheBrief code and direct dependencies onto current main, rather than merging the entire historical branch.

- Library list/grid presentation, category/folder/client facets and compact thumbnails.
- TheBrief batch importer, continuation, deduplication, managed assets/fonts and explicit unsupported-content holds.
- Native playback, font weights/aliases, rotation, gradients, image fit, pulse/fade and text rendering fixes.
- Native effects, reusable presets, AI artwork/review/refinement, native glyph depth and texture.
- Design assistant and references, revision retention, render retries/leases and social draft handoff.
- Supporting API, worker, image-generation and client-profile dependencies; direct dev dependency Acorn 8.17.0.

New defects found and fixed during recovery:

- Import permission/client checks occur before deduplication and coordinator access.
- Saved client/creator scope enforced for project reads, project/asset lists, exports and private render downloads.
- Imported asset client ownership passes through upload, digest, persistence and replay validation. Legacy unassigned digests remain compatible.
- Filter-only effects preserve the existing RGBA text color; regression tested.
- Small indexed-access/easing typing issues corrected.

Shared-file reconciliation deliberately retained current main's Website preparations navigation, newsroom self-authentication allowance, build compaction and SheetJS lockfile integrity. Only required sidebar, signed-video capability and banner social-handoff changes were restored. Broader historical social changes were excluded.

## Data preservation and migrations

Prior read-only inventory found 187 projects, including 169 tagged `source:thebrief`. All 165 unique project IDs from available import ledgers were present; all 155 comparable source hashes matched. Four additional Brighton web-size projects were outside those ledgers. Category/folder tags were intact.

This does not establish that every edited canvas is unchanged, nor reconcile the user's recollection of 175+ imports. Do not claim either without additional evidence. No database writes, bulk import or restore occurred in this recovery.

Historical migrations 444/445/450 were recovered as 473/474/475 to avoid main's numbering collisions:

- `473_client_video_generation_profiles_recovery.sql`
- `474_video_shared_brand_guide_recovery.sql`
- `475_banner_effect_presets_recovery.sql`

Read-only schema inspection found the expected tables, columns and `brand_kit_id` already present. Reconcile migration tracking and current schema before any DDL; do not blindly rerun historical migrations. Preserve source archives, historical branches and recovery evidence.

## Verified results and unresolved checks

- **85 test files / 662 tests passed**, including real Chromium native text-effect proof. Evidence: `tests-release.log` and `native-text-effects.png`.
- Independent review covered recovered dependencies, access/replay checks, list scoping and the color fix. Findings were addressed before the implementation commit.
- Changed-file lint comparison: 205 files, 1,763 inherited diagnostics, **zero new diagnostics** relative to the union of main and preserved-source baselines. This is not a clean repository-wide lint result.
- **Typecheck is unresolved.** The initial root `vue-tsc --noEmit` exit 0 was not meaningful because it did not check referenced projects. Actual server and frontend project checks produced errors. Server log has 448 lines; frontend log has 1,919 lines. Frontend finished after increasing heap to 16 GB; do not describe it as still running or passed. Compare diagnostics in changed files against both baselines, fix introduced errors, and document inherited failures.
- Production build, worker-size gate, hosted browser acceptance and release are outstanding.
- A prior `pnpm deploy:check` was invoked, but its final result was not retained. Rerun it and save the receipt; do not infer success from the successful Git push.

## Evidence and supporting documents

External evidence directory (keep logs here so release guard sees a clean checkout):

`/Users/paulgiurin/Documents/XeroFlow Imports/Recovery 2026-10-23/evidence`

Important files: `tests-release.log`, `lint-baseline.json`, `lint-baseline.mjs`, `typecheck-app.log`, `typecheck-server.log`, `audio-jobs-protocol-check.json`, `audio-jobs-live.multipart`, `native-text-effects.png`.

The lint helper still contains original relative `output/banner-recovery` paths; adjust them before rerunning. Do not recreate untracked evidence inside the checkout before deployment.

Investigation/reconciliation:

- `/Users/paulgiurin/Documents/XeroFlow Imports/Investigation 2026-10-23/REPORT.md`
- `/Users/paulgiurin/Documents/XeroFlow Imports/Investigation 2026-10-23/reconciliation.json`
- `/tmp/xeroflow-banner-live-inventory-20261023.json`

Committed recovery plan and manifest:

- `docs/plans/2026-10-23-banner-studio-recovery.md`
- `docs/plans/2026-10-23-banner-studio-recovery-manifest.json`

Some plan checkboxes and its typecheck/protocol status predate this handoff. Update them with evidence as release gates complete; do not treat them as newer than this checkpoint.

## Runtime and guarded deployment

Use exact Node 24.18.0:

```sh
export PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH
cd /private/tmp/xeroflow-banner-recovery-20261023
pnpm deploy:check
```

The default shell Node 20.10 is wrong. `node_modules` is a symlink to `/Users/paulgiurin/Documents/Projects/studio-customer-launch-20261015/node_modules`. Do not run an install that mutates that shared dependency tree. No environment file was copied into the recovery checkout. Avoid exposing credentials in logs.

Use only the project's guarded `pnpm deploy:preview` and `pnpm deploy:production` scripts. Do not use direct Wrangler Pages deployment. Guards require a clean checkout, current main ancestry, correct target and runtime, dormant CRM search, and recheck source before and after the build.

Target is Cloudflare Pages **agency-dashboard**, account `a5b299b3ad15c1b5b895dc66f9357b17`, public host `https://app.xeroflow.io`.

`pnpm build` uses a 16 GB heap, wraps the worker and checks size. Raw budget: 25,468,928 bytes. Gzip budget: 9,750,000 bytes. Do not raise these limits to force a release. Retain current main's compaction infrastructure and optimize if required.

Last observed production Pages deployment (reverify before release):

- Deployment `614e2ebc-2372-447a-af95-ef59228cfc71`
- Source `961520050d4e6f25330a0f6d67fda9f8095217d9`
- Created 2026-10-21T11:24:21Z

Last observed `audio-jobs` worker at 100%:

- Version `95d45f5f-0f15-4d26-bad8-9da2b6bf2208`
- Deployment `40eaeac2-53c7-4d60-bafe-6463bc8a5030`
- Downloaded artifact SHA256 `0c39e4b0c116ea04fec2ce830e72a092712aae2a05a5292cab68dabc75839234`
- All five recovered render-job SQL literals and lease/fencing markers matched the live artifact; `audio-jobs-protocol-check.json` reports all passed. No worker was redeployed. Reconcile any remaining container change before deciding whether another worker release is needed.

Wrangler authentication was working as Paul at the last check. Reverify rather than assuming it persists. Browser acceptance must verify the visible XeroFlow account/role. Prior investigation used the existing Paul Super Admin session; no fabricated identity or session token is authorized.

## Ordered continuation

1. Confirm ownership of this recovery checkout and your Page Studio checkout. Fetch main, inspect both branches and preserve all unrelated work.
2. Triage frontend/server typecheck diagnostics in recovered files against main and historical source. Fix introduced issues; retain explicit baseline evidence.
3. Rerun affected tests after changes; update the plan, commit and push. Keep release logs outside the repository.
4. Run guarded check and preview build/deployment. Resolve build or size failures without weakening guards.
5. Browser-check library categories/folders/client filtering, existing project navigation, importer preview/continuation/dedup, native effects and established QR navigation. Use bounded authorized test data; do not modify existing customer drafts or bulk reimport the library. Unit tests alone do not prove a fresh hosted import.
6. Review/merge against fresh main while preserving Page Studio changes. Run the guarded production release from the reconciled source. Recheck current production first to avoid overwriting a newer release.
7. Verify live library/importer/editor behavior and saved-project inventory. Record exact Git, Pages and retained/changed worker versions, test results and remaining limitations in the rollout ledger. Commit and push the receipt.
8. Only after evidence and source are preserved, remove this task's completed worktree if useful for disk space. Do not delete the historical recovery source, import archives or other session's worktrees.

## Separate issue not fixed by this branch

The user also reported `/agency/monday` scrolling. Prior browser diagnosis found a 163,826 px content area with 2,508 history rows inside a 903 px clipped container. A temporary `min-height:0; flex:1 1 0%; overflow-y:auto` correction allowed scrolling; it was removed after testing. No Monday source fix is included here. Track separately and do not claim it deployed.

The last estimate was 45–90 minutes, contingent on build/typecheck and size results. It was an estimate, not a release commitment. This session is handing over; do not assume a background build or deployment is still running.
