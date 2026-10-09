# Projects storage and merge audit — 9 October 2026

## Result

The dated/extra top-level copies measured here total approximately **27.64 GiB** (each top-level container counted once). There is genuine redundancy, but not every checkout is merged. At the initial audit, no directories, branches, databases, archives or caches were deleted, and no merge, push, deployment or GitHub Actions run was triggered. Fetches updated remote-tracking refs only. Later cleanup and release activity is recorded in the dated sections below.

This is a point-in-time audit, not proof that every production feature behaves correctly. Commit ancestry proves history reached main. Patch equivalence is separately labelled and does not prove semantic equivalence after later rewrites. Recheck state before any cleanup.

## Recommended cleanup order

1. Preserve unique source work, local configuration, demo data and release evidence. Never remove a primary repository whose `.git` is shared by live worktrees.
2. Begin with regenerable dependencies/build outputs in inactive copies. These dominate the measured duplicate directories, and can be removed without erasing source history.
3. Retire older clean checkouts whose history is fully in current main, retaining needed branches/receipts. Three DriveAgent release copies total about **2.81 GiB**; ten clean ancestry-merged nested checkouts total about **9.92 GiB**. These are candidates, not an unconditional deletion list.
4. Handle patch-equivalent folders separately after checking ignored local artifacts. Preserve `.release`, `.verification`, `.wrangler`, `.data`, `.superpowers`, signing/build archives, and any local environment files until their role is understood.
5. Reconcile unique branches onto freshly fetched main; do not blindly merge a stale release-labelled checkout or delete it by date.
6. Retarget and verify the Fantasy Limo demo before retiring the two older CMS dependency checkouts.

GiB figures come from `du` allocated-size measurements. Shared/hardlinked/reflinked dependencies mean the sum of folder sizes is not a guarantee of physical space recovered.

## Important findings

- `page-studio-resume-20261007` is active, unreleased work: 10 commits ahead of Dashboard main at audit snapshot `d7941e7ee`. Its 3.34 GiB includes 2.53 GiB of dependencies and local verification receipts; do not discard it. Later audit-only commits add documentation to this branch.
- `xeroflow-banner-effects-20261006` is 115 commits behind and 119 ahead of Dashboard main. `git cherry` reports 118 non-equivalent non-merge commits. No PR matched that exact local head branch in the readback. This is not verified redundant; reconcile the required changes first.
- `dashboard-shadcn-lint` has one non-equivalent commit (`c4e758ff3`); keep source until it is adopted or explicitly abandoned. Its 2.66 GiB is overwhelmingly dependencies.
- `driveagent-worktrees` is mixed: `mobile-inbox-compact-20261007` has 21 non-equivalent commits; `shared-spec-writers-20261007` has five; `mobile-lead-conversation-20261007` has one. Other release/queue/auth copies are ancestry-merged or patch-equivalent.
- `customer-cms-development` and `customer-cms-studio` are ancestry-merged and clean, approximately 4.91 GiB together, but are operational dependencies. The demo `start.sh` changes into `customer-cms-development`; its setup scripts import `pg` there and protocol/migration files through the Studio checkout alias. Preserve the demo PostgreSQL, private data, media and backups.
- Primary `dashboard`, `promotion-knoxgwmhaval` and `driveagent-website` checkouts are dirty and have live processes. They are not disposable copies. In particular the Dashboard root is an old `release/send-scan-foundation` branch, not current main; do not reset it or release it blindly.
- There is another approximately **62.7 GiB** in three nested containers: Dashboard `.worktrees` (22.33 GiB), promotion `.claude/worktrees` (28.33 GiB), and promotion `.worktrees` (12.06 GiB). These containers overlap neither each other nor the extra top-level-copy subtotal; sizes still have filesystem-sharing caveats.
- The nested promotion archive is about 4.71 GiB and contains historical graph/planning snapshots plus a dirty, unmerged voice-grants checkout. Several snapshots have no Git marker, so merge status cannot establish their redundancy.

## Extra/top-level checkout inventory

Behind/ahead and patch counts are relative to the recorded remote main. Fresh fetch succeeded for Dashboard, Page Studio, DriveAgent website and promotion, including the two standalone promotion release clones. Non-target canonical repositories were inspected against their already-local refs and are never retirement recommendations.

| Folder | GiB | Behind / ahead | Working changes | Unique / equivalent patches | Assessment |
|---|---:|---|---:|---|---|
| `driveagent-model-guide-release` | 0.93 | 35 / 0 | 0 tracked; 0 untracked | 0 / 0 | History fully in main; retirement candidate if not a primary repository |
| `driveagent-briefing-grounding-release` | 0.93 | 15 / 1 | 0 tracked; 0 untracked | 0 / 1 | Patch-equivalent in main; preserve local artifacts before retirement |
| `driveagent-worker-reconciliation` | 0.13 | 47 / 0 | 0 tracked; 0 untracked | 0 / 0 | History fully in main; retirement candidate if not a primary repository |
| `xeroflow-banner-effects-20261006` | 2.93 | 115 / 119 | 0 tracked; 0 untracked | 118 / 0 | Keep: integration not proved / unique local commits |
| `customer-cms-studio` | 2.26 | 7 / 0 | 0 tracked; 0 untracked | 0 / 0 | Merged code; keep until demo dependencies are moved |
| `driveagent-worktrees/shared-spec-writers-20261007` | 3.22 | 63 / 8 | 0 tracked; 0 untracked | 5 / 0 | Keep: integration not proved / unique local commits |
| `driveagent-worktrees/mobile-commercial-release-20261006` | 0.37 | 92 / 0 | 0 tracked; 0 untracked | 0 / 0 | History fully in main; retirement candidate if not a primary repository |
| `driveagent-worktrees/mobile-inbox-compact-20261007` | 0.31 | 61 / 25 | 0 tracked; 0 untracked | 21 / 0 | Keep: integration not proved / unique local commits |
| `driveagent-worktrees/mobile-lead-conversation-20261007` | 0.31 | 89 / 1 | 0 tracked; 0 untracked | 1 / 0 | Keep: integration not proved / unique local commits |
| `driveagent-worktrees/auth-platform-origin-20261007` | 0.24 | 55 / 1 | 0 tracked; 0 untracked | 0 / 1 | Patch-equivalent in main; preserve local artifacts before retirement |
| `driveagent-worktrees/mobile-lead-queue-20261006` | 4.03 | 109 / 1 | 0 tracked; 0 untracked | 0 / 1 | Patch-equivalent in main; preserve local artifacts before retirement |
| `driveagent-worktrees/auth-platform-release-20261007` | 0.37 | 55 / 0 | 0 tracked; 0 untracked | 0 / 0 | History fully in main; retirement candidate if not a primary repository |
| `customer-cms-development` | 2.65 | 56 / 0 | 0 tracked; 0 untracked | 0 / 0 | Merged code; keep until demo dependencies are moved |
| `driveagent-review-route-release` | 0.95 | 33 / 0 | 0 tracked; 0 untracked | 0 / 0 | History fully in main; retirement candidate if not a primary repository |
| `dashboard-shadcn-lint` | 2.66 | 116 / 1 | 0 tracked; 0 untracked | 1 / 0 | Keep: integration not proved / unique local commits |
| `da-lake` | 1.06 | 66 / 1 | 0 tracked; 0 untracked | 1 / 0 | Keep: integration not proved / unique local commits |
| `page-studio-resume-20261007` | 3.34 | 0 / 10 | 0 tracked; 0 untracked | 10 / 0 | Keep: active unreleased Page Studio work |
| `driveagent-monthly-release` | 0.93 | 34 / 0 | 0 tracked; 0 untracked | 0 / 0 | History fully in main; retirement candidate if not a primary repository |

## Clean nested retirement candidates

The following 16 nested checkouts have no working changes and either proven main ancestry (10) or patch-equivalent history (6). No process working directory was found inside them at inspection time. That observation does not establish ownership by an idle editor/agent. Ignored files must still be preserved or deliberately classified before removal.

| Folder | GiB | Merge evidence | Ignored local material to review |
|---|---:|---|---|
| `promotion-knoxgwmhaval/.worktrees/oem-website-onboarding` | 3.19 | 1 patch-equivalent commit(s) | `.release/` |
| `dashboard/.worktrees/dashboard-current-release-recovery` | 2.69 | HEAD is ancestor of main | `.wrangler/`, `test/fixtures/.wrangler/` |
| `dashboard/.worktrees/page-studio-initial-staging` | 2.61 | HEAD is ancestor of main | Dependencies/build outputs; review full ignored inventory |
| `dashboard/.worktrees/studio-astro-publishing` | 1.50 | HEAD is ancestor of main | Dependencies/build outputs; review full ignored inventory |
| `dashboard/.worktrees/studio-ai-reference-fix` | 1.38 | HEAD is ancestor of main | Dependencies/build outputs; review full ignored inventory |
| `xeroflow-page-studio/.worktrees/studio-form-release-20260916` | 1.35 | HEAD is ancestor of main | Dependencies/build outputs; review full ignored inventory |
| `promotion-knoxgwmhaval/.claude/worktrees/agent-ab04c3502c24f74eb` | 0.19 | 1 patch-equivalent commit(s) | Dependencies/build outputs; review full ignored inventory |
| `promotion-knoxgwmhaval/.worktrees/admin-shell-no-dealer` | 0.16 | 2 patch-equivalent commit(s) | Dependencies/build outputs; review full ignored inventory |
| `dashboard/.worktrees/recover-portal-bookings` | 0.14 | 1 patch-equivalent commit(s) | `.verification/` |
| `promotion-knoxgwmhaval/.claude/worktrees/notif-bar-fix` | 0.12 | 1 patch-equivalent commit(s) | Dependencies/build outputs; review full ignored inventory |
| `dashboard/.worktrees/page-studio-publishing-lifecycle` | 0.11 | HEAD is ancestor of main | `.verification/` |
| `dashboard/.worktrees/portal-booking-ui` | 0.11 | 1 patch-equivalent commit(s) | `.verification/` |
| `dashboard/.worktrees/page-studio-public-environment` | 0.10 | HEAD is ancestor of main | `.verification/` |
| `dashboard/.worktrees/studio-readiness-base-20260916` | 0.10 | HEAD is ancestor of main | Dependencies/build outputs; review full ignored inventory |
| `xeroflow-page-studio/.worktrees/page-studio-baseline` | 0.06 | HEAD is ancestor of main | Dependencies/build outputs; review full ignored inventory |
| `dashboard/.worktrees/studio-save-reliability` | 0.02 | HEAD is ancestor of main | Dependencies/build outputs; review full ignored inventory |

## Other nested worktrees — preserve until reconciled

60 existing nested registered checkouts were inspected. 18 have working changes; 35 have non-equivalent patch history (these categories overlap). Do not treat all `.worktrees` or `.claude/worktrees` as caches.

| Folder | Branch | Behind / ahead | Working changes | Non-equivalent patches |
|---|---|---|---:|---:|
| `dashboard/.claude/worktrees/media-studio-sp2c` | `feat/media-studio-sp2c` | 2831 / 37 | 1 | 37 |
| `dashboard/.claude/worktrees/virtual-office-1b-media` | `feat/virtual-office-1b-media` | 3232 / 69 | 7 | 69 |
| `dashboard/.worktrees/audio-studio-p1` | `docs/handoff-audio-funnel-0602` | 2878 / 1 | 1 | 0 |
| `dashboard/.worktrees/cross-domain-tracking-design-20260916` | `docs/cross-domain-tracking-design-20260916` | 287 / 0 | 4 | 0 |
| `dashboard/.worktrees/fantasy-limo-foundation` | `feat/fantasy-limo-foundation` | 274 / 352 | 0 | 352 |
| `dashboard/.worktrees/insights-action-plan-503` | `fix/insights-action-plan-503` | 476 / 0 | 7 | 0 |
| `dashboard/.worktrees/meta-google-pacing-review` | `feature/meta-google-pacing-review` | 2496 / 28 | 2 | 28 |
| `dashboard/.worktrees/page-studio-business-admin` | `feature/page-studio-business-admin` | 348 / 102 | 0 | 102 |
| `dashboard/.worktrees/page-studio-checkpoint-cas` | `fix/page-studio-production-save` | 1507 / 125 | 0 | 92 |
| `dashboard/.worktrees/page-studio-content-admin` | `feat/page-studio-content-admin` | 303 / 2 | 0 | 2 |
| `dashboard/.worktrees/page-studio-current-roadmap` | `docs/page-studio-current-roadmap` | 274 / 1 | 0 | 1 |
| `dashboard/.worktrees/page-studio-form-combined-review` | `review/forms-and-layout` | 274 / 3 | 2 | 3 |
| `dashboard/.worktrees/page-studio-form-layout` | `fix/form-layout-and-consent` | 274 / 1 | 1 | 1 |
| `dashboard/.worktrees/page-studio-forms-release` | `(detached)` | 274 / 349 | 0 | 349 |
| `dashboard/.worktrees/page-studio-preview-ai-acceptance` | `fix/page-studio-preview-ai-acceptance` | 348 / 105 | 0 | 104 |
| `dashboard/.worktrees/page-studio-preview-performance` | `(detached)` | 222 / 0 | 2 | 0 |
| `dashboard/.worktrees/page-studio-production-release` | `(detached)` | 274 / 347 | 0 | 347 |
| `dashboard/.worktrees/publish-video-ai` | `publish-video-ai-producer-harness` | 2462 / 0 | 34 | 0 |
| `dashboard/.worktrees/studio-builder-r07-20260918` | `research/page-studio-builder-r07` | 279 / 1 | 0 | 1 |
| `dashboard/.worktrees/studio-builder-r10-20260918` | `research/page-studio-builder-r10` | 279 / 1 | 0 | 1 |
| `dashboard/.worktrees/studio-completion-20260916` | `fix/page-studio-session-authority` | 256 / 0 | 17 | 0 |
| `dashboard/.worktrees/video-composite-render-spike` | `spike/video-composite-render` | 2597 / 24 | 2 | 23 |
| `oem-agent/.worktrees/clone-studio-v1` | `clone-studio-v1` | 609 / 0 | 1 | 0 |
| `oem-agent/.worktrees/versioned-model-page-publication` | `feat/versioned-model-page-publication` | 103 / 4 | 3 | 0 |
| `promotion-knoxgwmhaval/.claude/worktrees/agent-a40dada844b1b5fb0` | `fix/widget-cors-revocation-kb-category-20260926` | 553 / 8 | 0 | 7 |
| `promotion-knoxgwmhaval/.claude/worktrees/agent-a54d7137dcd32352c` | `fix/chat-home-testdrive-negation-20260926` | 549 / 2 | 0 | 2 |
| `promotion-knoxgwmhaval/.claude/worktrees/agent-a75910c0f8c443194` | `feat/jev-spam-shadow-20260926` | 545 / 3 | 0 | 3 |
| `promotion-knoxgwmhaval/.claude/worktrees/agent-a8b77e550b6cddf5a` | `fix/chat-small-cleanups-20260926` | 545 / 3 | 0 | 3 |
| `promotion-knoxgwmhaval/.claude/worktrees/agent-a8dc5fb2fdaf032b6` | `fix/chat-callback-intent-20260926` | 557 / 3 | 0 | 3 |
| `promotion-knoxgwmhaval/.claude/worktrees/agent-aa5ef6588003cb1db` | `feat/jev-redaction-spend-ledger-20260926` | 561 / 2 | 0 | 2 |
| `promotion-knoxgwmhaval/.claude/worktrees/agent-ab9e5d67ce443450d` | `fix/chat-input-false-positives-20260926` | 550 / 2 | 0 | 2 |
| `promotion-knoxgwmhaval/.claude/worktrees/agent-adab52441e0df6ce6` | `fix/widget-parent-origin-binding-20260926` | 561 / 2 | 1 | 2 |
| `promotion-knoxgwmhaval/.claude/worktrees/agent-ae4f4b71f17066522` | `fix/admin-dealer-membership-gate-20260926` | 557 / 2 | 0 | 2 |
| `promotion-knoxgwmhaval/.claude/worktrees/agent-af0f42fff06a5e237` | `feat/chat-privacy-reminders-20260927` | 539 / 6 | 0 | 6 |
| `promotion-knoxgwmhaval/.claude/worktrees/agent-af1758b056531e7fe` | `fix/security-followups-20260926` | 545 / 2 | 0 | 2 |
| `promotion-knoxgwmhaval/.claude/worktrees/agent-af3c26996bc4befbd` | `feat/jev-keep-warm-20260926` | 561 / 2 | 0 | 2 |
| `promotion-knoxgwmhaval/.claude/worktrees/feat+dealer-mcp-v1` | `worktree-feat+dealer-mcp-v1` | 1228 / 36 | 0 | 35 |
| `promotion-knoxgwmhaval/.claude/worktrees/fix-deposit-expiry-cron` | `chore/deposit-cron-hardening` | 1227 / 4 | 0 | 4 |
| `promotion-knoxgwmhaval/.claude/worktrees/mobile-audit` | `worktree-mobile-audit` | 896 / 0 | 22 | 0 |
| `promotion-knoxgwmhaval/.claude/worktrees/rt-bell-rollup` | `codex/voice-auth-user-resolution` | 1211 / 2 | 0 | 2 |
| `promotion-knoxgwmhaval/.worktrees/archive/motor-group-voice-action-grants-20260918` | `feature/motor-group-voice-action-grants` | 905 / 6 | 2 | 6 |
| `promotion-knoxgwmhaval/.worktrees/northern-gac-south-morang` | `feature/northern-gac-south-morang-clone` | 902 / 8 | 1 | 8 |
| `promotion-knoxgwmhaval/.worktrees/northern-gac-tracking` | `feature/northern-gac-conversion-call-tracking` | 933 / 11 | 0 | 11 |
| `promotion-knoxgwmhaval/.worktrees/shared-enrichment-recovery-20261008` | `docs/shared-enrichment-recovery-20261008` | 39 / 13 | 0 | 13 |

## Evidence and limits

- 25 top-level/named Git roots and 60 additional existing registered nested worktrees inspected; registries contain 271 total paths across Projects and other locations.
- `git status`, current `origin/main` refs, ancestry, `git cherry`, worktree registries, ignored-directory names and process working directories were checked. No credential values or private database contents were inspected.
- Orca CLI guide was available, but its installed runtime returned `runtime_unavailable`; Orca workspace ownership is unverified. No application was restarted and no Orca workspace was removed.
- The three DriveAgent code-clean release candidates are `driveagent-model-guide-release`, `driveagent-monthly-release`, and `driveagent-review-route-release`; the last also has ignored `.data` to preserve/classify.
- Fresh remote main snapshots:

  - `https://github.com/adme-dev/dashboard.git`: `c85bf2653344ac36530e2a479d2a64cf64e58b1d`
  - `https://github.com/adme-dev/xeroflow-page-studio.git`: `17ac1f3dd292f5da996daac82c523174606a3265`
  - `https://github.com/adme-dev/driveagent-website.git`: `029243eaef2e498bc0e90210cb88acdce288736c`
  - `https://github.com/adme-dev/promotion-knoxgwmhaval.git`: `f8a464b8b38dd1ad5ad2df489dce77f8d1aa2496`

Raw local metadata remains in `/tmp/projects-*-audit*.json` and `/tmp/projects-audit-*.json` for follow-up. Refresh merge/dirty/process evidence immediately before cleanup; the report remains useful even after those temporary files expire.

## Preview follow-up — 9 October

At the user's request, the preserved Fantasy Limo demo was restarted through its
existing `customer-cms-demo/start.sh`. The local server now listens on
`127.0.0.1:3044`, running from `customer-cms-development`. Chrome verified the
CMS overview with 75 saved pages, 109 media assets and four forms. No sign-in
bypass or website-content save was used. Production was not changed.

Local preview: http://127.0.0.1:3044/studio/sites/c34f6347-cc63-4ed7-9a5a-da165ebefed2

`customer-cms-development` is now an active server dependency, in addition to the
restart-script dependency found during the audit. Do not remove its dependencies
or checkout while this preview is running. The original demo/private/media/backups
remain preserved; this is the saved local demo, not native hosted acceptance.

## Hosted preview clarification — 9 October

The user clarified they wanted Fantasy Limo's hosted **website** preview, not the
local CMS fixture. Its exact Open staging link was read from the signed-in agency
publishing workspace and opened successfully:

https://preview-c34f6347cc634ed79a5ada165ebefed2.xeroflow.io/

The staging panel identifies live approved version `ade33ea8`, published
28 September at 22:23. Chrome displayed Home – Fantasy Limo, the Make an entrance
homepage, fleet/occasion/service-area links and the staging notice that form
submissions are disabled. No release, publish or preview-build action was invoked.

The hosted website does not depend on the local CMS checkout copies. Those copies
are dependencies only of the separately preserved local demo. The unnecessarily
restarted local server was stopped again (owned session `62682`, exit 0); its data,
media and pre-existing PostgreSQL process remain intact. This supersedes the prior
follow-up's statement that port 3044 should be kept running.


## Disk-pressure recovery during local packaging — 9 October

The new local Page Studio Linux image build exhausted host free space and was
cancelled (terminal exit130), without uploading or deploying an image. Source,
customer data and all worktree registrations remain intact. Docker was stopped
through its supported CLI; a scoped cache-recovery inspection follows separately.

For immediate recovery, `driveagent-model-guide-release` was rechecked: clean
working state, HEAD ancestor of its current local main, ignored/untracked dependency
directory and no open files in that directory. Only its `node_modules` was removed
(819MB allocated before removal; about566MB additional host space observed).
The folder, Git history, configuration, data and release evidence were preserved.
Dependencies can be restored from its lockfile if needed. This supersedes the
initial statement that no caches/dependencies were removed; no source retirement
or other checkout cleanup is claimed.

Scoped Docker recovery is complete. The initial regex-filter cleanup reported0B
and left the selected records present; it is not counted as successful removal.
Exact-ID cleanup then removed all14 private reclaimable cache records created
at04:27UTC by this cancelled build. Readback confirms zero selected records remain
and all16 shared records remain. Docker was stopped successfully, restoring its
initial stopped state. Host free space reads about2.2GiB; additional capacity is
needed before attempting another full Linux packaging build. No global cache
prune, image deletion, source/worktree removal or database cleanup was performed.

## Later cleanup and release capacity checkpoint

The dependency-only cleanup additionally covered the inactive, clean,
ancestry-merged `driveagent-monthly-release` and `driveagent-review-route-release`
copies. Their source, history, configuration and data remain. A later exact-ID
Docker cleanup removed 15 owned private records from the smaller packaging build;
shared baseline records were preserved. Local image deletion initially failed
with Docker metadata I/O errors and is not claimed successful. Docker remains stopped.

Free space recovered to roughly 14–15 GiB before the final build. The production
release enforced an 8 GiB stop threshold and completed with minimum 10.09 GiB free.
After successful upload/provider readback, only the owned Dashboard's ignored,
untracked `dist` and `.nuxt` directories were removed (approximately 96 MB +187 MB).
Exact deployment logs, source receipts and artifact hashes remain preserved.
The local CMS remains stopped while disk pressure is reduced; local data is intact.

Current scoped sizes: Docker.raw 16 GB allocated; DriveAgent worktrees 8.9 GB,
including shared-spec-writers 3.2 GB and mobile-lead-queue 4.1 GB. The former retains
unique commits; the latter supports a preview. Neither was retired or dependency-pruned.
The owned Dashboard dependencies remain 2.5 GB, and native editor dependencies 2.1 GB.
macOS reported 17,585 MB used swap during release; this is additional memory pressure,
not solely attributable to our processes and not treated as a deletable build artifact.

## Continued dependency/cache recovery

Fresh fetch confirms Dashboard main `c752cefc18c828b8c20b8cef4726f11fd7a582f9`
and native Studio main `c333ca7699476d1eb83823047874b4824d864b89`. Four additional
copies were rechecked: clean state, exact main ancestry, ignored/untracked dependency
folders, and no matching process working directory, arguments or open files.
Only `node_modules` was removed from:

- `dashboard/.worktrees/dashboard-current-release-recovery`
- `dashboard/.worktrees/page-studio-initial-staging`
- `dashboard/.worktrees/studio-astro-publishing`
- `dashboard/.worktrees/studio-ai-reference-fix`

The last two are native Studio repositories despite their parent folder name;
their ancestry was checked against native main, not Dashboard main. Checkouts,
Git metadata, environment/configuration, databases, `.wrangler`, verification
receipts and other local artifacts remain. Source state remained clean afterwards.
Exact heads, gates and dependency sizes are in the two private continuation receipts.

The pinned Dashboard pnpm 10.17.1 `store prune` completed successfully after checking
that no package installation/mutation was running. It reported 95 global virtual
store packages, 78,609 files (3.69 GB) and 1,707 package entries removed. Store allocated
size fell from 9.2 GB to 5.5 GB. This removes unreferenced cache entries, not source or
customer data; future installs can download them again. Documentation:
https://pnpm.io/cli/store . Shared package files mean folder/cache sizes do not equal
physical space recovered. Actual free space was 7.7 GiB at the start and 8.9 GiB after
this continuation, with other machine activity ongoing. Local editor 4325 still
returns HTTP 200; Docker and local CMS 3045 remain stopped.

## 10 October Docker allocation recovery

Capacity was about 5 GiB at resumption, with the selected CMS and Docker stopped.
A supported Docker reclamation operation briefly started the engine, verified
that no existing container was running, pulled the vendor utility from Docker's
published instructions, and ran its pinned registry digest with `--rm`. A 3 GiB
stop guard bounded the operation. No image, container or volume deletion, disk-image
resize, database change or build was performed.

The utility completed successfully. Readback confirmed every pre-existing image,
container and volume remained. Docker was returned to its original stopped state.
Docker.raw allocated bytes fell from 17,338,925,056 to 17,112,825,856: 226,099,200 bytes
(about 216 MiB) reclaimed. Host free bytes changed from 5,569,085,440 to 5,764,214,784;
other host activity means this is not a pure attribution measurement. Capacity is
still insufficient for restarting heavy development/build work.

Exact utility digest, object IDs, minimum free space and terminal outcomes are in
`.verification/resume-20261008/docker-reclaim-20261010.json`; command output is in
the matching ignored log. The operation follows the vendor's disk-reclamation
instructions: https://docs.docker.com/desktop/troubleshoot-and-support/faqs/macfaqs/ .
It is separate from the earlier failed local image-deletion attempt, which remains
recorded as unsuccessful. Source and customer data remain preserved.
