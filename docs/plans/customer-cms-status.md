# Customer CMS and Studio — current checklist

Last updated: 20 October 2026. Start here after an interruption.
Current upgrade: [managed transfer execution](2026-10-16-managed-transfer-execution.md).
Earlier release: [completed release and remaining activation](2026-10-08-page-studio-release-and-activation.md).
Latest bounded CMS rollout: [Fantasy Limo runtime and activation receipt](2026-10-10-fantasy-cms-runtime-release.md).
Earlier evidence: [7 October reconciliation](2026-10-07-page-studio-resume.md).
This checklist tracks the active standalone CMS work; it does not declare the
entire platform or hosted rollout complete. Detailed decisions and acceptance:
[Form settings completion](2026-10-01-form-settings-completion.md),
[Fantasy Limo demo](2026-10-01-fantasy-limo-demo.md),
[standalone style guide](../design/standalone-cms-style-guide.md),
[Vehicle Marketplace email-builder reference](2026-10-01-email-builder-reference.md).

## Current rollout checkpoint — 20 October 2026

Dashboard PR #664 and Studio PR #129 are merged. The reviewed trees passed CI in
both repositories, including Studio's separate Linux and Windows copy stress
jobs. The three private staging services and three private production services
are now deployed from Studio main `0fe8df57cdbae26b81945c8f573af7931ceec8f9`.
The private management Worker is deployed from Dashboard main
`24f555f62b39891ff019efdffe2de03b30d4477e`. Independent provider readback confirms
their versions and preserved existing settings. The exact successor runtime was
uploaded to its private immutable key and independently downloaded and hashed.
Production migrations 0014–0018 preserve all original registry rows, schema,
ownership and routing. No tenant runtime was globally repinned.

The HTTP-ingress harness fix merged in PR #667 as `36d5981fd`. Its exact-tree
PR CI, exact-main CI and guarded release CI39332068668 passed. Pages deployment
`08f4bb08-2f0b-4eaf-8ef9-f9f96497e265` serves that exact commit. Provider readback
confirms preserved bindings/settings. Post-release checks passed for the four-site
customer dashboard, all four previews, Fantasea editor launch and agency QR Codes.
Hosted transfer/operator consent, two-account acceptance and customer/Pi
activation remain outstanding. Production Pi readback still shows disabled
admission and an empty canary list. See the
[rollout receipt](../page-studio/2026-10-20-managed-transfer-rollout.md) before
continuing; do not repeat completed deployments or reuse the old drift baseline
as if its deployment IDs were still current.

## Historical private transport checkpoint — 19 October 2026

The management service now has a private `managedTransferPreparation` entry point
for source review/reservation, resources, source execution/fencing, destination
execution/catalogue and Forms history. It reuses original native owner/operator
checks and explicit status/start/resume/verify actions. No public route or
automatic transfer chain is added. See the
[runtime policy and rollout order](../page-studio/2026-10-19-managed-transfer-runtime-policy.md).

Local verification: 91 focused transport/configuration/deployment tests and all
384 real PostgreSQL transfer-authority tests pass, including status without
writes, original-session revocation and complete Forms-history preparation through
the service wrapper. Strict Worker types, scoped lint and production dry run pass;
fresh-context review found no actionable issues.

The previous Dashboard CI39234976584 passed production build and dedicated
PostgreSQL checks but failed one stale configuration-inventory expectation. This
increment fixes that expectation; its replacement full CI must pass before release.
Studio b08d3a9 passed Linux CI; Windows remained pending at this checkpoint.
Neither this change nor the prepared configuration is a production deployment.
Authenticated operator consent handoff, hosted transfer/two-account acceptance,
compatible service rollout and customer/Pi activation remain outstanding.

## Active upgrade — 16 October 2026

The active work is safe transfer of managed staging websites into production
authoring. Native original-account authority, immutable resource/execution
requests, source draft fencing, destination catalogue admission and independent
verification are committed on the current launch branch. CMS mutation code has
moved to the private management Worker to meet the unchanged Pages bundle budget.
The management Worker must be released before Pages starts using its new RPC.

Dashboard `97e2b565a53063c62235e2451bdd5d5430c0a016` passed
[CI38892637334](https://github.com/adme-dev/dashboard/actions/runs/38892637334).
The preceding abdd50ed build passed 16,390 main-suite tests, dedicated PostgreSQL
stages and production build; its raw Worker was 25,446,325 /25,468,928 bytes.
Only 22,603 bytes remain, so new heavy transfer verification stays in the private
management Worker. No feature-branch deployment job ran.

The combined native handoff now passes 451 real PostgreSQL tests: original
transfer authority, terminal schema, current CMS origin and destination authoring.
It inspects copy/history outside database locks, then atomically retains the
source and selects the exact verified destination. Interrupted responses recover
the same completion. Current-owner authoring and source-retention recovery remain
valid after old import sessions expire, and reject revoked ownership or plans.
The completion coordinator has 59 focused tests including real PostgreSQL and
workerd transport. Existing live-publication compatibility is covered separately.
These working-tree changes still require their combined commit CI.

Migrations470 and471 are applied: zero new evidence/completion rows, expected
immutable/deferred triggers present, existing sites/release pointers/bindings and
(for471) CMS scopes/objects/applications unchanged. No site was transferred or
activated by these schema changes. Receipts are in
`.verification/managed-transfer/{copy-verification,completion}-migration-receipt.json`.

Studio e39839d CI exposed a missing committed protocol planner file. Fix d57f2bf
includes that reviewed planner and its tests; its exact-commit CI is pending.
The later source-retention and destination Forms runtime work passes actual RPC
checks locally. The complete private authoring flow saves all four draft types,
reads and reconnects, and remains valid after the old operator is revoked. The
first write now uses 140 counted operations, below the unchanged 256 limit
(previously 388). Full private copy RPC also passes with actual D1/R2 and source
fencing. Final closure stress checks and observer review are still in progress.

Customer progress and explicit recovery controls pass the final 114-test group,
including five current native authority PostgreSQL cases. Inspection-only customers retain status visibility without
mutation permission; completed transfers suppress obsolete staging controls.
Still outstanding: finish runtime stress checks and physical-observer review,
commit both repositories, pass exact-source CI and artifact budgets, then complete
hosted two-account acceptance and guarded release.
Existing local tests and pushed code do not prove these hosted outcomes.
Production activation remains separately gated.

A fresh read-only Chrome check of Fantasea's live account shows the four domain
setup paths, but custom-domain capacity is not enabled and no custom domains are
connected. The separate Cloudflare credential handoff has no verified completion
receipt. Do not infer domain readiness from the presence of the setup UI.

The historical acceptance and visual-feedback work below remains recorded. It
must not be mistaken for completion of this current transfer/release upgrade.

## Next work — visual feedback, 12 October 2026

The [visual feedback decisions and priority plan](2026-10-12-page-studio-visual-feedback.md)
preserves Paul's original PRD and selects a narrow first slice: get bounded,
sanitised selected-element text through the genuine hosted AI contract, with the
same context visible before Send and tested exact targeting. Source inspection
found separate local, controlled-manifest and hosted paths; enriching the local
picker alone would not reach the hosted agent. Existing source discovery should
be extended rather than rebuilt.

Implementation has not started. Next steps: concrete hosted admission plan,
Fantasy targeting fixtures/baseline, text capture and compatibility/privacy/parity
tests. Then prove selection cycling with a covered-element fixture. Screenshot
capture needs a hosted feasibility spike; pinned comments, client brand guidance,
annotation and design-system sharing follow their recorded dependencies.

Preserve the Tuesday Fantasy showcase and the completed production release.
Existing shared-form/authority/media and editor load/save performance work remains
open. This documentation does not activate native production signup or change
feature flags, storage, accounts or deployments.


## Running ledger — 12 October 2026

Both genuine native test accounts are fully provisioned. Each has all five CMS
prerequisites installed, managed content adoption complete, and its private Forms
capability independently confirmed Active. No phase, receipt, lease or approval
expiry was manually changed. The Cloudflare provisioning credential is working.

The bounded preview is live at Dashboard source
`f015cfd2b69d48f0e9c54334ef81c77b9aa2ca53`, deployment
`2f27de15-1355-41f6-b6ad-0494a585e880` (11 October 13:57 UTC; 12 October 00:57
Melbourne). Forms, editor and browser flags are enabled only for this reviewed
preview acceptance. Current eligible native policies are exactly A/B, one owner
each, with the original `2026-10-12T13:27:09Z` expiry. AI allowance remains zero;
neither publication nor email delivery is enabled.

The earlier 18:56 UTC A **Open Studio** launch progressed beyond the previous
browser block. It created an editor-purpose child, exchanged the one-use ticket, confirmed
current authority and managed content, and allocated A's own sandbox. The launch
then returned HTTP 503 during filesystem hydration at the 60-second operation
limit. Browser server time was 65,477 ms; Worker trace time was 64,646 ms. All 53
control-plane authorization calls succeeded (HTTP 200), totaling 38,412 ms. This is
now a measured staging lifecycle timeout, rather than an unresolved credential
request. The earlier B browser-block screenshot remains historical evidence only.

A bounded correction is deployed: only trusted staging `open-editor`
receives a fixed 300-second limit. Production, default and all other actions keep
60 seconds. Every fresh authority, session expiry, managed-state and I/O check is
preserved. Independent review, 126 focused checks and the full 6,159-test command
passed (four existing conditional skips), as did build, types, lint and normal
commit hooks. Native source `c0f99311dd6fba696fb8c66f4bd19e20ebd7e1c5` contains
fresh main `4401438d6766baef4adde0c76741ebc30ab1781c`. Only staging Sandbox Worker
was released as version `9c3e9be7-9a62-4653-bb96-4e4e1abc9f4f`, deployment
`412b14dc-e4c8-4782-a71b-c30bb0e0d858` (11 October 20:12:42 UTC). Exact before/after
readback confirms all settings/bindings and container version 38/image unchanged;
production settings and deployment are unchanged. A fresh genuine B owner launch
returned HTTP 200 in 117,957 ms and the scoped session POST returned 303. Its native
editor child was created at 20:15:19 UTC and expires at 00:15:19 UTC. No new email
was needed. The following editor root returned HTTP 410 `STALE_PREVIEW_URL` after
existing recovery; safe SDK logs identify `runtime-mismatch` with a healthy,
running container. Screenshot: `native-b-runtime-mismatch-20261012.png`.

The second deployed correction refreshes the exact editor port after native startup
and warm page preparation. SDK RPC setup replaces its runtime identity even when
warm, so a previous port activation becomes stale. Both refreshes retain fresh
authority/expiry checks, exact-origin validation and existing fail-closed recovery.
No global SDK override or retry was added. Independent review, 134 focused checks,
6,167 full-command tests (four existing skips), build and types passed; modified
files pass lint and the normal hook checked all 1,581 files with no fixes.
Native source `3b9a18a54e0a91f7dcbec9ba1888f1701bbf541d` was released only to
staging as version `80e3b463-cfb2-431a-8550-854114b991a3`, deployment
`3c60610b-3742-40c7-85c1-e6d5f0a90e7d` (11 October 20:50:49 UTC). Settings,
bindings, seven routes and container version/image are unchanged; production
settings and deployment are unchanged. B's genuine launch returned HTTP 200 in
83,659 ms; its scoped session handoff returned 303. Editor pages, overlay script
and font requests returned 200 without the previous stale-runtime failure.

B's native editor rendered in light mode. A real heading edit ("Technology that
works for your team") reached a durable checkpoint (HTTP 201, 51,386 ms), showed
Saved, and survived a full browser reload. Full-browser editing and light/dark
switching worked; light was restored. Collapsed thumbnails are integrated into the
bottom toolbar. Unauthenticated browser fetch returned 401. Screenshots are in
`.verification/resume-20261008/native-b-editor-ready-20261012.png` and
`native-b-editor-saved-reloaded-light-20261012.png`.

B was then signed out through the normal native UI. A credentialed request using
its previous editor session returned 403, confirming current parent revocation.
A normal approved sign-in message was requested for pgiurin@gmail.com, delivered
from notification@xeroflow.io, and consumed through the genuine browser flow.
No tokens/cookies or secret URLs were recorded. A's own workspace/recipient reads
returned 200; its foreign B read and one valid-shaped foreign write returned 403;
A's own recipient state remained unchanged (revision 0/null record). Proof:
`native-a-to-b-scope-denial-20261012.json`. A's genuine editor launch then returned
HTTP 200 in 59,835 ms, followed by scoped session handoff 303. Both desktop and
mobile frames rendered A's own limousine starter in the light editor. A's child
was issued at 21:14:03 UTC, expires at 01:14:03 UTC, and is unrevoked. This is fresh
normal issuance; no older session expiration was changed. The active A editor was
left open for review. Screenshot: `native-a-editor-desktop-mobile-ready-20261012.png`.

The reviewed code is now merged and deployed to production under the user’s explicit
authorization; see the 12 October release receipt below. Native customer production
activation remains gated on the outstanding acceptance cases and measured
performance: a 51-second save is close to the preserved 60-second operation limit.
No form/template email or publication was performed. Feature and merge commits
used `[skip ci]`, with zero Actions runs. Original Fantasy Limo retains indefinite access.

### Hosted results established

- B recipient draft saved and reloaded revision 1 with the approved test mailbox.
- Team and Customer templates independently saved and reloaded revision 1 with
  different subjects. These are image-free drafts; no emails were sent.
- A newer Team draft saved revision 2. The old UI draft attempted one save and
  received HTTP 409, preserving unsaved edits. Explicit reload confirmed the newer
  subject and revision 2; Customer and recipients stayed at revision 1.
- B's read and write attempts against A's recipients returned HTTP 403; B's own
  settings and revision stayed unchanged.
- A's foreign read returned HTTP 403. The first test harness stopped on its null
  unsaved default record before writing. A corrected write used its real owned
  checkpoint, but native window access failed before observing the result; that
  write case is now completed by the genuine A sign-in above.
- B's first Forms workspace load showed unavailable. Explicit read-only refresh
  returned HTTP 200 with its correct owned checkpoint and pages. This first-load
  limitation is recorded, not claimed fixed.
- Exactly two staging editor domains were attached after empty global hostname
  and DNS checks. All five previous domains remain. Certificates report Active;
  native Chrome guest requests return `TOKEN_INVALID / Unauthenticated` JSON.
- Existing agency QR Codes navigation loads its eight codes and 48 scans.

### Local checks and release boundaries

The response-merging fix passed 35 focused tests and independent review. The full
Dashboard source suite passed 16,268 tests, with 60 files/1,658 conditional tests
skipped. The five rebuilt Worker boundary checks then passed, including against
the final editor preview artifact. Typecheck retains exactly 934 existing
diagnostics; no globally clean typecheck is claimed.

This resume also passed 78 Forms authority/HTTP/media tests and 95 native editor
handoff/session/launch tests against disposable local PostgreSQL schemas, plus
108 native customer workspace tests. Native full validation for the preceding
operator fix passed 6,150 tests, four existing conditional skips, build 28 and
typecheck 44 plus security types. Independent source/config reviews approved the
bounded rollout. The final native route receipt committed as `e93e359` after its
full hook checked 1,581 files with no fixes.

The staging-only schema lease fix keeps production's five minutes and all fresh
authority/runtime pin/database-clock/CAS fences. It is verified at executor version
`b5cbb7be-92ae-4f19-9449-6adc590864de`; customer runtime bytes remain unchanged.
The local operator timeout fix is committed at
`f15b98caf572134ec8903a3e3eef6c2640efe17b`. It changes only the exact activation
transport ceiling; initialization, reads and disposal stay bounded at 30 seconds,
with no automatic mutation replay or server authority extension.

Current preview bundle: raw 25,467,559/25,468,928 bytes (1,369 spare), gzip
7,044,545/9,750,000. Size/disk guards are unchanged. Builder 4325 stayed running;
owned CMS 3045 was paused only for shared builds and restored with the identical
startup script. Both return HTTP 200; latest free disk is about 11.27 GiB.
No source pushes or GitHub Actions were triggered.

### Production and remaining work

Fantasy Limo's original production CMS remains Ready with indefinite active
access, 75 pages and 109 media assets. Dashboard production is unchanged at main
`a78a11945f13c520d3258df9e249b99d46b21b07`, deployment
`7f98f789-d152-4d2d-90d7-dec3c8f24798`. Original account, data, publication and
domain are preserved for Tuesday's showcase.

Remaining: manual form insertion, per-form settings, shared forms/default
overrides, supported viewer/membership and capability-withdrawal cases, staging
media storage, progress-card accuracy, save latency and separate production
reconciliation. Both genuine owner handshakes, bidirectional foreign recipient
read/write denial and normal logout revocation are verified. Starter checkpoints
contain no forms. Browser shared-definition creation currently lacks the required
typed creation intent. Native hosted viewer/member revocation and per-capability
withdrawal controls are not exposed. Media acceptance needs a dedicated staging
media binding; production storage is not borrowed. These cases remain explicit
gaps and do not count as completed hosted acceptance or a platform launch.

Detailed provider receipts and historical checkpoints are in the
[release ledger](2026-10-08-page-studio-release-and-activation.md).

### Editor preparation warning — historical local verification (released 10 October)

The following records the pre-release 10 October verification; the release above
supersedes its pending wording. The hosted invited account can read website content
but lacks admin setup permission. Its first portal adoption-status GET returns 403 and the preparation
panel incorrectly presents that as a website setup failure. The frontend now
omits this admin-only panel for a denied initial portal status read, matching the
connection panel. It does not infer Ready, widen API permissions or change roles.
Agency errors, 401/503/malformed statuses, attempted writes and later denied
refreshes remain visible; site/audience resets discard old response effects.

Tests-first reproduced two failures. The fix passes 33 focused UI/endpoint tests,
scoped lint and independent review. Full local suite: 15,821 passed / 1,971 environment
skips. Typecheck retains the recorded 934-error baseline with no diagnostics in
either edited file. Normal local CMS rendering verifies that independent
connection/content errors remain visible while the denied preparation panel is
omitted. Local production build and deployment guards pass: raw 25,459,220 bytes
(9,708 spare), gzip 7,042,553 bytes, minimum free disk 26,141,478,912 bytes under
the unchanged 8 GiB stop guard. One batched source push follows these local gates;
no production deployment for this fix yet. The local CMS was restored with the
same data/configuration and guarded startup after the build.

Earlier local documentation receipts were reconciled onto freshly fetched main
in this short-lived branch. Their entire pre-fix tree matches the retained docs
branch; no old product source is brought forward. This lets the updated ledger
travel with the single reviewed source push rather than another Actions run.

### Selected platform and Tuesday showcase

The selected platform is the canonical editor at `http://127.0.0.1:4325/`
and standalone Nuxt CMS at `http://127.0.0.1:3045/studio/sites/c34f6347-cc63-4ed7-9a5a-da165ebefed2`.
It is accessible through XeroFlow or independently through `xeroflowpages.com`.
The 5187 prototype remains a separate reference. Default appearance is light,
with a dark-mode option.

Fantasy Limo retains its original saved site, account and ownership scope for
Tuesday 13 October. Production agency Launch Studio was verified with its actual
75-page saved editor document. The deployed editor shows the new light/dark
controls, compact page previews and layouts gallery. Staging also verified the
collapsed controls inside the toolbar and full-browser/canvas transitions.
No website content, saved checkpoint, publication or public domain was changed.
The [existing website preview](https://preview-c34f6347cc634ed79a5ada165ebefed2.xeroflow.io/)
remains live; staging form submissions remain disabled.

Standalone membership uses the existing invited `pgiurin@gmail.com` identity.
The user completed normal production mailbox sign-in on 10 October at
06:49:31 UTC. The independent My sites page now shows the correct Fantasy Limo
profile and its exact existing website. Manage website returned 404 / Website
not available. A read-only database inspection isolated the cause: the original
trial entitlement expired at 05:44:06.576 UTC on 10 October (16:44 Melbourne),
before this login. Site/client/user remain active, the original editor membership
is intact, and live sessions exist. No session token or credential was inspected.

The user explicitly authorized removing the trial / indefinite access. The
original entitlement was changed transactionally from `trial` with an expired
end date to `active` with `effective_until = NULL`. Seven isolated localhost
PostgreSQL checks passed and independent review found no Critical/Important
blockers before execution. The transaction used exact entitlement/client/tenant,
site/editor membership and original-expiry guards. Every other entitlement field
was compared before commit. Exact site and membership row hashes are unchanged.
An append-only billing access audit records the user instruction and before/after
terms without impersonating an agency actor. No financial subscription or charge,
role grant, customer migration, content change or publication was created.

The existing normal production session now opens the hosted Fantasy Limo CMS:
75 saved pages, 109 media assets and eight forms on pages. The Open Page Studio
button launched the invited editor in a new tab. The saved Fantasy homepage,
existing fleet/occasion/navigation content, original page routes and the
thumbnail count 1–4 of 75 were verified in the actual editor. Save status remained
waiting for changes; no editing, AI call or publication was performed. No source
build, deployment or GitHub Actions run was needed. Screenshots and execution evidence:
`.verification/resume-20261008/fantasy-ongoing-access-receipt-20261010.json`,
`fantasy-hosted-cms-active-20261010.png`, and the `access-renewal/` operation/test
scripts. The earlier bounded renewal proposal is superseded, not executed.

### Earlier showcase checks — 10 October, after ongoing access

These initial checks preceded the bounded runtime release and activation recorded
below. Their setup failures are superseded by the final installed receipts;
separate Forms/customer launch gates remain open.

Normal invited Gmail mailbox evidence confirms the received sender is
`notification@xeroflow.io`, display name XeroFlow Page Studio, with Inbox placement.
A cropped sender-header screenshot excludes the visible thread's earlier sign-in
URL. This closes invited mailbox delivery/From acceptance; separate agency mailbox
appearance is not inferred from it.

The hosted invited CMS and editor both switch light/dark and were restored to light.
Pages search `/contact` returns one of 75 saved pages and opens its actual SEO/form
details. All 18 first-page media thumbnails load; the library reports 109 assets,
and media details open. Saved draft history loads without restoring or writing.
Full-browser edit and return to canvas work. Collapsed thumbnails integrate into
one toolbar with Pages/Sections/Overview/Show, with no separate collapsed shelf.
Save status remains waiting for changes. Temporary DOM diagnostic timeouts during
mode transitions resolved on subsequent observations; no failed transition is
misreported as a completed action without visible verification.

Hosted Forms settings return 503 `FORM_SETTINGS_UNAVAILABLE`: storage is not
connected. Agency CMS preparation returns 403 `COLLECTION_ACCESS_DENIED`.
Read-only inspection and the actual collection policy identify the internal demo
plan's missing `builder.collectionSchemas` flag; `portal_creation_enabled` is false.
Both business-content/enquiries modules and the one-site capacity are otherwise
present. This is distinct from the fixed sign-in and now-active entitlement.
Within the existing full standalone CMS/showcase goal, the exact original internal
demo plan now enables the entitlement flags for collection schemas and invited
collection-record access; effective access still awaits runtime configuration
and completed storage preparation.
Twelve isolated localhost PostgreSQL checks passed and independent review approved
the guarded transaction. Original site and membership hashes, all usage limits,
roles, enabled modules and active/no-expiry terms are preserved. An append-only
access audit records the feature change; no charge or extra site capacity is added.
Native customer production activation remains separate and unchanged.

Normal agency readback now succeeds: existing content storage is connected,
collection preparation is pending and canConfigure is true. The existing guarded
Prepare collections action was invoked once through the actual agency sign-in.
It returned 503 `COLLECTION_SETUP_PENDING`: a reviewed website runtime must be
configured. Provider readback confirms production executor has its original
`2dd87c86...` runtime pin/date and no collection/workflow/CMS transition policies;
the staged configuration has explicit reviewed upgrade policies. No private Worker
or runtime pin was changed, no upload/deploy occurred, and setup was not replayed.
Original storage connection remains successful; collection installation is not
claimed complete.

The approved increment adds an explicit legacy CMS runtime configuration for
only the exact existing Fantasy production scope, retaining default/other-site
pins and staging behavior. Native customer production admission stays closed.
Local scope-denial/compatibility tests, independent review and the exact approved
artifact/rollback evidence must precede the private runtime release. The user approved the bounded design. Native implementation is committed as
`f6fc07e5c709e19cd82f7cf43da90db058494b99` on freshly based
`fix/fantasy-cms-runtime-opt-in-20261010`; [PR122](https://github.com/adme-dev/xeroflow-page-studio/pull/122)
was opened and later merged as recorded below. Sixteen new selector checks first failed meaningfully before the fix;
41 focused selector/executor checks now pass. Valid unlisted scopes retain their
previous legacy configuration. The actual candidate artifact passed 36 private
RPC checks. Full local build, 44-task types, 40-task package tests plus security,
action/operator checks and 1,580-file lint passed; dependency audit is clean.
Independent source/migration review approved. The mandatory commit hook also
passed with the pinned Node24/pnpm11.9 toolchain.

The exact artifact is the prior validated `6cb34fd9...` candidate (911,081 bytes),
not the transient `c9465259...` build produced before package outputs refreshed.
Original production bytes `2dd87c86...` were downloaded and hash-verified for
rollback. A private exact-scope configuration is validated; default pins and
native customer/Form-drafts production gates remain unchanged. Matching executor,
coordinator and router dry runs pass. Production platform migrations 9–13 were
needed because the coordinator then retained 1–8; the new local SQLite compatibility
check proves original active/disabled route rows and worker identities survive.
Wrangler's D1 request is rejected with provider 7403 despite whoami reporting
D1/Worker write scopes. The connected Cloudflare API's read-only D1 query succeeds
and is the available D1 path. No credential is created or privilege expanded.

One batched source push opened PR122. Normal full CI
[38037838313](https://github.com/adme-dev/xeroflow-page-studio/actions/runs/38037838313)
runs lint before types/tests/build. Linux completed successfully. Windows passed
lint/types but the unchanged Forms transport test failed during a five-second
PowerShell/CIM process-inspection call (`spawnSync powershell.exe ETIMEDOUT`),
with seven other transport tests passing. No new-code assertion failed. One
failed-job-only Windows rerun failed on the same process-inspection timeout.
A reviewed test-only fix now budgets 20 seconds for PowerShell inspection and
40 seconds for its enclosing Windows allocation test; production initialization
remains 30 seconds, with real process discovery/termination assertions intact.
All eight local transport cases pass. Commit `e6351995fa9efa26211295f8931bca4eba49c412`
passed the mandatory 1,580-file hook and was pushed once. Updated CI
[38041737528](https://github.com/adme-dev/xeroflow-page-studio/actions/runs/38041737528)
finished: Linux full verification passes; Windows transport now passed in 16 seconds,
then its package suite reports nine unchanged workspace tests timed out at five seconds
(71 other sandbox files / 932 cases pass). Isolated workspace 94 cases passed locally in 2.26 seconds.
Sandbox Vitest lacks the existing CMS suite's CI/Windows file-worker bound;
review approved matching that bound without extending assertion or production
deadlines. Full bounded sandbox verification passes locally: 72 files / 941 tests in 48.35 seconds.
The only source delta is sandbox Vitest worker scheduling; no assertion timeout,
production deadline or in-test concurrency is changed. Mandatory 1,580-file hook passes with no fixes. Scheduling commit
`2c9791287311dbc0dca56de20ec4c930a6ba64e0` was pushed once; updated
[CI 38044971266](https://github.com/adme-dev/xeroflow-page-studio/actions/runs/38044971266)
passed on both platforms. There have been three source pushes total and one failed-job-only
retry; normal policy/secret jobs also run automatically. No manual compiler
publication, Docker rebuild or additional blind retry was started. Runner contention
is the supported inference; exact CPU/crypto bottleneck is not proven. No blind
retry or production change occurred before the final successful CI gate.
Earlier commentary inferred the wrong CI step order and is superseded by these
actual step readbacks. All four local gates and policy/secret scans passed.
Final CI 38044971266 passes Linux in 32m48s and Windows in 37m20s, with all policy/secret
checks passing. PR122 merged at 11:05:54 UTC as `4401438d6766baef4adde0c76741ebc30ab1781c`;
clean detached source equals fresh origin/main. Approved 6cb runtime was uploaded
and its 911,081-byte readback hash matches. Existing platform migrations 9–13
were applied in order with tracking; original database/worker/route rows are
unchanged. Effective-worker readback matches routed originals; an existing
unrouted acceptance worker remains retained but excluded by the view.
Private matching services are released from 4401438: executor version
`cd0aa33b-bc2e-4822-a4ba-3fa80fac3972`, deployment
`111cf7ba-ae5d-48ca-8f15-43a40e7d9818`; coordinator version
`23ef0df2-424c-4e26-815b-683a0e04e166`, deployment
`7044e59f-3f2b-46aa-a999-3e9de8c3ca8f`; router version
`47da7327-e2f7-49de-b3d7-c2c185ee171c`, deployment
`c0839552-fac7-4bb8-a3fd-38fc4e28e5d7`. Provider source, original bindings/secrets,
compatibility dates and default pins match retained evidence. Only Fantasy
exact-scope opt-in is added. No editor container/public website deployment.
Guarded agency preparation now confirms collections, workflows and CMS storage
installed on original customer D1; custom-collection controls appear. Guarded activation
started once, froze the saved checkpoint, acknowledged its one business-content
item and completed. The agency UI now shows Ready with all five steps checked.
Fresh hosted pgi sign-in readback retains 75 pages, 109 media assets and eight form placements in light
mode, and a fresh Open Page Studio handoff loads the same 75 pages, waiting for
changes. No content edit, model call, email send or publication occurred.
The existing editor account can read business/custom collections, but its
preparation panel still shows a permission warning because that panel requires
admin setup authority. This is a remaining presentation issue; no role/membership
was elevated. Production Form-drafts operation/runtime/capability tables remain
empty and their separate activation gate remains closed. Hosted custom-record
save/field-picker acceptance and full native customer launch are not claimed.
The completed native feature branch is retired locally and remotely; the owned
worktree stays detached at merged 4401438 for the selected local editor. Both local
worktrees, dev servers, original customer data and private release receipts are
preserved. The paired release receipt contains exact evidence and limitations.
Preserve the existing authenticated agency setup request; do not replace it.
The local CMS 3045 guard stopped its server when free space dropped below 8 GiB.
After free space recovered to about 22 GiB, the same documented 8 GiB guard restored
it (PID 31702, monitor 31692, tool session 93385); HTTP 200 and normal local browser
75 pages / 109 assets / four shared forms were verified. No local data/login was replaced.
Native 4325 and the hosted CMS/editor
remain separate surfaces. Current native receipts live under
`.verification/fantasy-cms-runtime-20261010/` in the owned native worktree.

Evidence: `.verification/resume-20261008/fantasy-hosted-showcase-checks-20261010.json`
and `fantasy-cms-capability-proposal-20261010.json`.
The earlier showcase-only fetch confirmed Dashboard main `cade35ed2` and native
main `c333ca76`. Those initial browser checks used no email send, model call, build,
deploy or Actions run. The later bounded native release is recorded above.

### Current production release — 10 October

PR [650](https://github.com/adme-dev/dashboard/pull/650) merged the exact tested
head `6bea965737eb913046cea4e61c41581e2084493a` after
[CI 37998551876](https://github.com/adme-dev/dashboard/actions/runs/37998551876)
passed all 29 steps, including PostgreSQL access regressions, the production build,
the full suite, social regressions and deployment guards. Fresh main was checked
before merge and the owned checkout was fast-forwarded to actual merged main
`cade35ed255efde69e7a2ba7593751556347adb2`.

`pnpm deploy:check` and guarded `pnpm deploy:production` exited 0. The latter rebuilt
that exact clean source through the immutable `agency-dashboard` wrapper. Canonical
production deployment `a130ffbb-bc9b-4fb3-a3f5-15c2ebe502dc` completed on 9 October
at 22:41:28.277 UTC (10 October local time). Cloudflare confirms production/main,
the matched source, unchanged domains, separate production/staging auth services
and both customer Forms gates unset. Raw 25,459,217/25,468,928 bytes (9,711 spare)
and gzip 7,042,528/9,750,000 bytes passed the unchanged size guards. The production
rebuild retained at least 10,140,901,376 free bytes under the 8 GiB stop guard.
Exact 2,943-file hashes, terminal outcomes and filtered provider readbacks remain
in `.verification/resume-20261008/studio-login-production-release-receipt-20261010.json`
and its related receipts.

The merge automatically triggered ordinary
[main CI 38000214379](https://github.com/adme-dev/dashboard/actions/runs/38000214379).
It also completed successfully on exact merged source `cade35ed2`; all 29 CI steps
passed, including the full suite and final social/deployment guards.
No extra CI dispatch, source push or deployment was made for this local receipt.

Normal authenticated production QR Codes navigation was rechecked after release:
eight codes and 48 scans remain. The hosted Fantasy website preview still returns
200; no site content or publication changed. One fresh normal general Studio link
was requested after the fix was live and Check your inbox was verified. The
correct-profile production login and hosted CMS are now verified after the
user-authorized ongoing access change. The invited editor saved-content
journey is also verified with the existing homepage and 75-page document.

### Earlier production receipts — 9 October

- Dashboard PR649 merged to then-current main `c752cefc18c828b8c20b8cef4726f11fd7a582f9`.
  Guarded production deployment `92a95ff6-2edc-4424-9c5f-4e1203e109f4` completed
  on 9 October at 07:46:59 UTC. Cloudflare confirms exact clean source, branch
  main and canonical production deployment in `agency-dashboard`.
- Native PR121 merged as `c333ca7699476d1eb83823047874b4824d864b89`.
  Production Worker `e35d0166-a177-4e5d-8989-767478ea8b0d`, deployment
  `cf1db6ba-5c20-444b-87ef-29415305ea47`, container version 26 at 100%, uses
  immutable image digest `ea21f6f9178ea7982f5f06a2027a30d1e26277e8dbee1884fd800d591e0f5f5c`.
  Exact image hashes, licensing and rollback pairs are in the native release docs.
- Agency and invited Studio magic links now use `notification@xeroflow.io` through
  Cloudflare Email Sending. Private production/staging workers were deployed first;
  live Pages bindings point to their respective environments. One fresh staging
  agency request was made for the actual signed-in user's mailbox; received From
  address and delivery are still awaiting mailbox verification.
- Full local and CI suites passed: 15,765 tests, with 1,961 environment skips.
  CRM 54, social 785 and deployment guards 21 passed. Sender-specific review and
  failure/privacy checks passed. Existing repository type/lint debt is not claimed fixed.
- The production Worker passed the unchanged size guard: raw 25,459,103/25,468,928,
  gzip 7,042,448/9,750,000. Exact 2,940-file hashes and provider receipts remain in
  `.verification/resume-20261008/`.
- After deployment, normal authenticated production Fantasy Limo overview loaded
  its unchanged saved/approved preview version `ade33ea8`. Established QR Codes
  navigation loaded eight codes and 48 scans. No QR or site data was modified.

Working source locations remain the owned Dashboard checkout
`/Users/paulgiurin/Documents/Projects/page-studio-resume-20261007` (local documentation
branch `docs/studio-login-release-receipt-20261010`) and native Studio checkout
`/private/tmp/page-studio-native-integration-20261008`. Their application source
includes the released main commits above. The documentation receipt is local and
separate from deployed application source `cade35ed2`; it does not change artifacts.
The unrelated dirty Dashboard root is preserved. Completed fix branch
`fix/studio-assigned-account-login-20261010` was retired locally and remotely only
after fresh proof that its remote head remained `6bea965737` and both remote/local
heads were ancestors of current main `cade35ed2`. The remote deletion used an
explicit expected-head lease; the active worktree, server, data and receipts remain.

### Disk recovery and current local state

Our Docker packaging and heavy Nuxt builds contributed to disk pressure, including
an ENOSPC failure. Only reinstallable dependencies from three inactive, clean,
ancestry-merged DriveAgent release copies and exact owned private Docker cache
records were removed. No source worktree, customer database, media or Git history
was deleted. Failed local image removal is not counted as successful cleanup.

After verified production upload, this owned Dashboard checkout's ignored `dist`
and `.nuxt` output was removed (about 283 MB allocated). Release logs and hash receipts
remain. At that earlier checkpoint Docker and CMS 3045 were stopped. The selected CMS
was subsequently restored as recorded below; Docker remains stopped. Its database
and configuration are preserved. A further continuation removed only
dependencies from four clean, merged, inactive Dashboard/Studio copies and pruned unreferenced pnpm cache entries. The store shrank
from 9.2 GB to 5.5 GB; host free space reached about 8.9 GiB on 9 October. Local editor 4325 still
responds normally. Latest capacity and remaining large folders are recorded in the [storage audit](../audits/2026-10-09-projects-storage-and-merge-audit.md).

### 10 October verification and capacity checkpoint

At this earlier checkpoint fresh fetch showed Dashboard main
`c752cefc18c828b8c20b8cef4726f11fd7a582f9`.
Cloudflare readback confirms the same canonical production deployment and separate
production/preview auth services. Production sender version `f8d23f26-af67-44d8-9fcb-9019223fa805`
is at 100%, with its Email binding restricted to `notification@xeroflow.io`.
An exact suppression lookup for `pgiurin@gmail.com` returned no entry.

A read-only telemetry query for the isolated production request window found one
sender invocation at 11:34:37.013 UTC on 9 October: outcome `ok`, response 202, matching
sender version. This is timestamp-correlated gateway acceptance evidence; recipient
and credentials were not inspected in logs, and it does not prove Gmail receipt.
At this earlier checkpoint the normal independent Fantasy CMS route was signed out.
The subsequent actual sign-in and profile-selection diagnosis are recorded below.

Available disk had fallen to about 5 GiB while our heavy jobs were stopped. Docker's
supported reclamation utility completed, preserving all pre-existing images,
containers and volumes, and reducing Docker.raw allocation by 226,099,200 bytes
(about 216 MiB). Docker was stopped again. Free space after the operation was about
5.37 GiB; CMS 3045 remains stopped until capacity improves. Exact utility digest,
object-preservation checks and before/after sizes are recorded privately.

### 10 October assigned-profile sign-in fix

The user's normal sign-in reached South Morang, an older active profile with no
websites. Read-only production PostgreSQL inspection confirmed two active profiles
for the same mailbox: South Morang and Fantasy Limo. The existing Fantasy profile
already has editor membership on its original saved website. No account, role,
membership or website ownership was changed. The general Studio link selector
previously offered both profiles because membership filtering applied only to an
exact website redirect; the observed access denial under South Morang was correct.

Fix `744bfbf54b4127169a393d8be077d6131908c98d` now requires an active client and
exact active/draft website membership for general Studio root/index redirects,
including query strings and trailing slashes. Pending invitations keep their
expiry/cancellation checks, and exact website redirects and general client-portal
behavior retain their existing boundaries. Token/session handling, response privacy
and roles are unchanged. Real PostgreSQL regressions reproduced the wrong-profile
selection before the fix and pass afterwards. Independent review found no blockers;
scoped lint passed. Full local tests exited 0: 2,243 files and 15,827 tests passed,
with 71 files and 1,958 environment tests skipped. Production build exited 0 with
raw 25,459,224/25,468,928 bytes (9,704 spare) and gzip 7,042,556/9,750,000 bytes.
The build retained at least 10,496,835,584 free bytes under the 8 GiB stop guard.
These local verification receipts preceded the completed PR/CI/production release
recorded above.

The unrelated browser context was signed out through the normal UI and one fresh
normal link was requested for the exact Fantasy website. The user's correct-profile
CMS → Open Studio journey remains pending. Request acceptance and the earlier
South Morang login do not establish standalone Fantasy acceptance.

Twenty old local Studio image copies were removed only after each exact immutable
Cloudflare registry manifest returned 200 and matched both header and body SHA-256.
Current image `ea21f6f9` and rollback images `a63aa0d1`/`c8383987`, other images,
containers and volumes remain; the remote registry was unchanged. Docker.raw
allocation fell from 17,112,764,416 to 11,337,895,936 bytes (about 5.4 GiB).
Docker was stopped again; CMS 3045 remains stopped during heavy release work.
Private cleanup, registry proofs and terminal logs remain under
`.verification/resume-20261008/`. No credential was persisted in those receipts.

### Local CMS restoration and current capacity

After successful deployment, only the owned ignored/untracked `dist` directory was
removed, with all 2,943 artifact hashes checked against preserved release evidence.
This recovered 94,883,840 allocated bytes; `.nuxt` was kept for startup. Source,
Git history, private data/configuration/media and all release receipts remain.

The selected isolated CMS was restored on loopback port 3045 with unchanged
`.verification/local-first-20261008/start.mjs`, Node 24.18.0, pinned PATH and the
16 GB heap. Its development-only and exact loopback/database guards remain intact.
The new process group is monitored against an 8 GiB free-disk stop floor.
Normal browser navigation using the existing local session verified Fantasy Limo,
75 saved pages, 109 media assets and four forms. Open Studio is disabled in this
local preview as expected. This is local acceptance, separate from production.

The restore retained at least 10,320,990,208 free bytes. At this documentation
checkpoint host free space was about 9.8 GiB; Docker remained stopped and CMS 3045
was ready. Exact PID/session, current capacity, log and resume/owned-stop commands
are preserved privately in `studio-local-cms-handoff-20261010.json` and the live
`studio-local-cms-restore-20261010.json` receipt. The owned worktree remains active.

### Remaining work

| Work | Current status |
|---|---|
| Invited standalone Fantasy CMS access | Verified: normal correct-profile mailbox login → hosted CMS → original saved 75-page editor; existing entitlement active with no expiry by user instruction |
| Editor light/dark, layouts, history, thumbnails, overview and collapsed toolbar | Released; invited production light/dark, full-browser/canvas and collapsed toolbar verified; 75 saved pages retained |
| Saved email field picker, fallback repair and Undo/Redo | Released; local integration/store/private renderer verified, hosted customer acceptance pending |
| Magic-link sender correction | Invited email received in Gmail Inbox from notification@xeroflow.io and normal login verified; separate agency mailbox appearance remains pending |
| AI email proposals | Local implementation/review complete; hosted enablement pending, native preview allowance remains zero |
| Two native accounts and hosted Forms | Both genuine owners provisioned; all five prerequisites and managed adoption complete; private Forms Active; bounded preview flags enabled. Owner launches, B save/reload, cross-account denials and logout verified. Per-form/shared fixtures and remaining role/capability checks are open |
| Fantasy Limo legacy CMS runtime and activation | Released from native main 4401438; original database retained; all five agency preparation steps Ready; invited collection reads and fresh 75-page editor open verified. Editor-only preparation warning remains a presentation issue |
| Sender/outbox/outcomes and wider CMS launch | Pages/SEO reads, media previews and history verified; native Forms activation and default draft persistence/conflict checks verified. Hosted custom-record saves/field picker, per-form/shared fixtures and actual proposal/email delivery remain open |

This remains the primary ledger. **The full platform launch is open.** Existing
invited access is separate from native customer activation. The assigned-profile
fix is released after reviewed PR, CI and a guarded current-main rebuild. Fetch
current main before any new work or release. Keep mailbox/browser acceptance
separate from source and provider release evidence.

Detailed evidence: [field picker](2026-10-09-email-template-field-references.md),
[AI proposals](2026-10-08-email-template-ai-proposals.md),
[auth sender](2026-10-09-xeroflow-auth-sender.md), and
[release ledger](2026-10-08-page-studio-release-and-activation.md).

## Completed and verified locally

- [x] Fantasy Limo standalone customer dashboard using its existing saved site.
- [x] Normal customer sign-in and scoped site membership for the invited-customer demo.
- [x] Overview and saved Pages & SEO browser (75 pages).
- [x] Searchable media library with authenticated image previews (109 assets).
- [x] Separate Forms configuration and Enquiries inbox navigation.
- [x] Shared form definitions and explicit adoption: four forms, eight placements;
      Booking enquiry is one form used on five pages.
- [x] Shared-identity enforcement for typed manual/AI form operations in Studio.
- [x] Draft confirmation messages and conditional same-site redirects, with simulation.
- [x] Customer-owned, revisioned outcome drafts and stale-save protection.
- [x] Website-wide team recipient drafts and shared-form overrides, including
      inheritance impact, effective addresses and explicit obsolete-override cleanup.
- [x] Browser validation of recipient saves, override preservation, conflicts,
      discard/reload, in-app navigation protection and mobile layout.
- [x] Separate website Team notification and Customer reply template drafts in
      customer-owned storage, with independent revisions and stale-save protection.
- [x] Structured template blocks, subject/preheader, brand styles, approved variables,
      undo/redo and sandboxed desktop/mobile previews with synthetic answers.
- [x] Template browser/API acceptance: save/reload, audience separation, conflicts,
      variable validation, navigation guards and 390px layout without overflow.
- [x] Polished Content/Design/Details editor, three design looks, enquiry starting
      layouts and optional business header/contact footer/social links/disclaimer.
- [x] Durable local demo files, database/media copies, backup and restart instructions.
- [x] Relevant marketing descriptions updated with explicit local-preview limits.

## Current checkpoint / next action

The entries below are historical implementation checkpoints. The running ledger
above contains the current source, production receipts and remaining acceptance work.

**Historical early 9 October snapshot — sources and unfinished launch work:**
Freshly fetched Dashboard main is `c85bf2653344ac36530e2a479d2a64cf64e58b1d`.
The last verified production deployment is `57353fad-8401-496c-951a-71dc569da18d`
from that source on 8 October. Invited CMS access and the light-first Studio style
are released; QR navigation was retained. Normal mailbox sign-in to Fantasy Limo's
independent CMS remains unverified. Confirm provider state again before release.

Native PR #119 is merged at `17ac1f3dd292f5da996daac82c523174606a3265`;
its Linux/Windows CI passed. Local work now adds default-light/dark editor appearance,
visual page/section layouts, guarded history and page/section thumbnails plus grouped
overview, with the collapsed-toolbar correction through `d588cf286`. The latest
200px thumbnail cap is committed at `6888688e8`, with local browser/build/review
and final formatting checks passed. These increments
are locally reviewed/tested and remain unpushed/undeployed to conserve Actions.
Their local branches retain current main ancestry; they are not production artifacts.

Dashboard's six local email-AI commits through `dd44d62a4` connect proposal schemas,
Gateway models, real CMS-login allowance, API and explicit preview/Apply UI. Operator
models remain disabled and native preview allowance remains zero. The 9 October
[field-reference contract](2026-10-09-email-template-field-references.md) adds local
V2 validation/rendering/storage and the locally verified manual picker. Coordinated
worker release and hosted field/schema acceptance remain unfinished. See the
[AI proposal plan](2026-10-08-email-template-ai-proposals.md) for exact boundaries.

The controlled signup preview was last verified at `5dec4699` / source `1f4e1250`.
Both real test mailboxes and sign-in authorization are supplied. A was verified;
B verification and both workspace setups remain pending. No current native signed-in
session is proven. Supported onboarding, exact approvals/runtime/storage installation,
explicit Forms capability activation and the full two-account matrix remain required.
Do not ask for mailbox identities again or mint sessions to bypass this prerequisite.
The later source/provider receipts supersede historical pending-CI/source statements
below. The entire customer CMS/Studio launch goal remains open.

**2 October — saved template history:** implemented, independently reviewed and
verified in the Fantasy Limo demo on desktop and mobile. Customers can browse
saved revisions, preview one, and explicitly restore it as an unsaved draft.
Saving preserves other form templates and current inheritance. Original demo
designs are restored (Team 8 / Customer 16). Private staging router is deployed;
Dashboard preview `00e6ade1` is deployed and live CMS/QR/closed Forms checks pass.
No new type diagnostics against the 499-identity baseline. See [history release record](2026-10-02-email-template-history.md).
Dashboard source `3f48a7845` includes current main `9c095c174`; Studio source
`6adea020` includes current main `50d372e1c`. Both feature branches are pushed.

**2 October preview follow-up:** explicit cleanup of custom email templates whose
shared form was removed is implemented and independently reviewed. Website
defaults list only server-confirmed removed definitions; stage Remove, Undo or
save with revision protection. Existing unused forms retain their templates.
The local browser/API checks pass, including exact default preservation and
390px layout. See [cleanup receipt](2026-10-02-email-template-cleanup.md).
Deployed to preview `4f9a92f4`, source `de1a2eb67`, with native access still closed.

**2 October preview:** native customer authority, APIs and Forms UI are implemented,
reviewed and deployed (`1d44f4ee`, source `a0e369591`). Signed-in CMS/QR navigation
and the native unavailable state pass in Chrome. Customer activation stays closed.
The private operator and its final bounded-file-read fix are reviewed, committed
and pushed. The final build passes, with no new type diagnostics.

**Historical 2 October next step, now superseded:** supported signup/approval, exact staging
setup/activation and the hosted acceptance matrix. No hosted native acceptance or
production enablement is claimed. See the [connection receipt](2026-10-02-native-forms-ui-release.md),
[integration plan](2026-10-02-native-forms-acceptance.md), and earlier
[backend receipt](2026-10-02-native-forms-staging-receipt.md).

Website template drafts are implemented, locally verified and committed. Both
implementation branches are pushed. Dashboard preview and the private staging
router are deployed; hosted form storage activation and production remain pending.

Current priority: **hosted deployment and managed form-drafts activation**, authorized
1 October. The staging router and Dashboard preview release are deployed.
The managed storage/runtime upgrade must finish before hosted saves can be enabled.
AI template proposals follow that prerequisite, using the existing text allowance,
schema validation, explicit Apply and preservation of manual edits. Local logo/image
blocks and shared-form overrides remain verified. See [release record](2026-10-01-cms-hosted-release.md).

Hosted smoke found an expired synthetic staging entitlement (30 September), so
the site workspace correctly denies access. Site list and agency QR navigation
pass. No supported preview-renewal path has been located: admission also checks
the immutable original preview policy. Hosted acceptance needs an audited renewal
implementation or a fresh authorized fixture; no access checks or dates were changed. The private physical schema
installer/readback passes nine SQLite tests. The private retained coordinator now
passes 17 real D1 tests for recovery, leases, cancellation, identity and database
fencing. Exact form-extension compatibility is now implemented in collection,
workflow, staging and actual CMS binding checks; 86 focused tests pass, including
a real Worker read of existing CMS content after form installation. A separately
retained runtime successor, provider inspection and matching routing selection are
now implemented with 23 new runtime tests. Paired form runtime/storage contracts
and native original-session/recovery admission pass independent review and 41
local PostgreSQL tests. Private worker bridges, actual provider/schema verification
and recovery pass focused tests and independent review after two fence/status fixes.
Separate scoped RPC capability activation and all six actual-bound draft methods
are implemented and independently reviewed. Final native status fixes pass 78
Dashboard tests, including 46 real PostgreSQL cases. Full Studio build, typecheck,
lint and tests pass (40 package tasks, 36 security and 48 action-runtime tests).
Hosted acceptance remains pending two fresh approved native test identities,
exact installed scopes, remote private transport and the acceptance matrix.
Coordinator migrations 0011–0013 are now applied before the new private workers.

## Remaining form and email work

- [x] Current native customer form authority: fresh session, workspace role and
      exact retained site/entitlement checks; 44 local PostgreSQL cases pass and
      independent review approved.

- [x] Native customer workspace/draft APIs and safe template/media previews;
      shared validation preserves invited-client routes. Independent review approved;
      98 focused tests and 69 local PostgreSQL cases pass (including 44 authority
      and 19 portal regressions). Dedicated staging Forms gate remains closed.
- [x] Connect native overview/Forms to native APIs, preserving invited-client UI.
      Independent review and 47 UI tests pass. Real Chrome verifies restored portal
      editing, dirty/discard behavior and native closed-gate routes at 390px.
- [x] Deploy matching native connection with gates closed; CMS/QR navigation and
      native unavailable state verified in Chrome.
- [ ] Verify the enabled native hosted browser journey.
- [x] Private staging activation caller implemented/reviewed, with offline default,
      exact scoped proof, one uncertain readback, no replay and owned child cleanup.
      Studio `c219655`; focused tests/types/lint and normal 1,553-file hook pass.
- [x] Bound operator manifest ingestion; eight Node tests and scoped final review
      pass, including file growth, partial reads and descriptor cleanup.
- [ ] Execute the two-customer hosted acceptance matrix; approved mailboxes are supplied,
      A is verified, B verification and both workspace setups remain pending.

- [x] Website team/customer template defaults (draft only).
- [x] Vehicle Marketplace-inspired compact block palette and debounced safe preview.
- [x] Explicit per-form template overrides and reset to website default.
- [x] Explicit cleanup for overrides whose shared form was removed; preserve them
      until the customer reviews and saves the cleanup. Local browser/API acceptance
      and independent review pass; closed preview deployed, hosted acceptance pending.
- [x] Structured template editing, subject/preheader, brand styling and
      desktop/mobile preview.
- [x] Stored template history browser and targeted unsaved restore; local browser/API
      acceptance and independent review pass. Hosted runtime upgrade remains pending.
- [x] Customer-owned logo/image references, scoped library picker, required alt text,
      sizing/alignment and bounded safe previews.
- [x] Extract private email rendering before adding backend features; released and
      verified with 59,992 raw bytes remaining at the Page Studio production build.
      Recheck capacity on current main before subsequent backend additions.
- [x] Local AI proposal implementation through the gateway/credit conventions,
      validated output and explicit Apply preserving manual edits.
- [ ] Hosted AI proposal/Apply acceptance and enablement under approved allowance.
- [x] Local saved-field template picker, explicit fallback repair and Undo/Redo.
- [ ] Hosted field/schema acceptance and verified sender/reply-to, including
      selection of the customer email field for actual delivery.
- [ ] Approved notification outbox: idempotency, suppression, bounded retries,
      redacted delivery history, explicit test sends and delivery activation.
- [ ] Publish approved outcome revisions; redirect only after durable acceptance.
- [ ] Customer-owned webhook connections, mapping, signatures and retry controls.
- [ ] Converge the legacy enquiry inbox onto customer-owned submission storage.
- [ ] Inquiry assignments/notes, export, retention and operational metrics.
- [ ] Customer-facing reuse/new-form controls and explicit detach/undo.
- [x] Original Fantasy Limo legacy runtime release and agency CMS activation;
      five preparation steps Ready, original database and saved 75-page editor retained.
- [ ] Broader native customer/Form-drafts runtime upgrades and adoption acceptance.

## Wider CMS journey still requiring acceptance

- [ ] Native sign-up → customer creation/provisioning → standalone dashboard
      acceptance (distinct from the working invited-customer demo).
- [ ] Standalone editor launch, editing, save/reload and release acceptance.
- [ ] Connected customer content collections/blog/gallery workflows in this demo.
- [ ] Customer invitations/roles and membership/subscription standards end-to-end.
- [ ] Custom domain and production launch journey.
- [ ] Analytics/SEO operations beyond the saved-page inspection already present.

These wider items may have foundations elsewhere; unchecked means not accepted
end-to-end in this standalone demo, not necessarily zero code exists.

## Historical resume information — 2 October

Use the current working sources in the running ledger above. These paths and
commits are preserved as historical evidence, not current release bases.

- Dashboard: `/Users/paulgiurin/Documents/Projects/customer-cms-development`
  (`dashboard/.worktrees/customer-cms` is a symlink).
  Branch `feat/standalone-site-workspace`; current history implementation `3f48a7845`.
  Preview `00e6ade1-0d35-4784-8b3b-9a7c62ea298d` uses that exact source.
  Includes native authority/API/UI, template cleanup and reviewed revision history.
- Studio: `/Users/paulgiurin/Documents/Projects/customer-cms-studio`
  (`dashboard/.worktrees/studio-customer-forms` is a symlink).
  Branch `feat/customer-form-settings-drafts`; deployed private executor, coordinator
  source `e26199556`; router updated to `6adea020`, version
  `c12c04e7-441f-48ad-b363-0d13f3aacfd0`. Private operator `c219655` remains included.
  New history-capable runtime artifact is unapproved/uninstalled; digest and exact
  service versions are recorded in the history release record.
- Implementation checkpoints are pushed; final integration review approves closed-gate
  preview, with hosted acceptance remaining.
  The Dashboard integration plan and its
  `.superpowers/sdd/2026-10-02-native-forms-acceptance/` ledger track current task
  ownership and review status; the earlier Studio integration ledger records the
  completed private backend work. Fetch/check divergence before continuing;
  do not implement in the unrelated dirty Dashboard root or deploy a stale branch.
- Demo: `/Users/paulgiurin/Documents/Projects/customer-cms-demo/README.md`.
  Restart with that directory's `start.sh`; do not start a second server on port 3044.
- URL: `http://127.0.0.1:3044/studio/sites/c34f6347-cc63-4ed7-9a5a-da165ebefed2`.
- Latest local backup: `customer-cms-demo/private/backups/2026-10-02T00-13-54.328Z/`.
  Preserve the private directory and media; do not commit credentials or copied data.
- Recipient sample revision 4: `office@example.test`, with Contact override
  `contact@example.test`. These are inert demo addresses, not approved recipients.
- Template samples: Team revision 8 and Customer revision 16 after history acceptance;
  original designs preserved, including the Booking enquiry override for five pages;
  website default has a 200px logo and 520px photo. Contact details are explicitly fictional.
  Evidence: `customer-cms-demo/check-templates.mjs` and
  `customer-cms-demo/fantasy-limo-email-templates.png`.

## Earlier local verification and boundaries — 1 October 2026

Recipient slice: 50 focused tests and browser checks pass. Template slice: 15
focused Dashboard tests and 37 Studio tests pass, with independent review and
browser/API acceptance. Studio build (28 tasks),
typecheck (44 plus security types), package tests (40 tasks), action runtime (48)
and full formatting (1,520 files) pass. Known broader failures: Dashboard typecheck
has 934 existing diagnostics, none in the changed slice; Studio security has one
pre-existing staging route-count assertion failure (35 pass).

No merge/deployment or email delivery enabled for these local slices. Hosted
schema activation, published outcomes, AI design and
email delivery remain pending. The website template draft editor is locally complete.
Unsaved in-app navigation is protected; hard browser refresh/close still discards
unsaved edits, and the UI asks the user to save first.

## Live editor UX acceptance — 1 October 2026

Direct Heading/Text/Answers/Button/Divider actions replace the block dropdown.
Preview loads automatically and refreshes after a 400ms typing pause. Invalid
input pauses preview; request cancellation and sequence guards prevent stale
successes/errors from replacing current results. Leaving the editor cancels both
timers and in-flight requests. Refresh remains available for explicit retries.
Saving is still explicit; browser testing left both saved template revisions at 2.

Eight focused tests pass (four preview lifecycle tests plus four existing template
contract/renderer/authority tests). Browser checks cover automatic first preview,
one-click blocks, edit → live preview, undo, invalid-variable pause/recovery,
Booking fields, discard/reload and 390px layout. Independent review found no
blockers; targeted lint passes. Dashboard typecheck remains at 934 existing
diagnostics, with none in the changed editor/composable. Screenshot:
`customer-cms-demo/fantasy-limo-live-template-editor.png`.

## Update rule

At each completed slice, tick only verified work, record the implementation
commits and acceptance evidence, and name the next concrete step. Before stopping
mid-slice, replace the In progress note with exact partial changes and blockers.

## Polished templates and business identity — 1 October 2026

Content, Design and Details separate the message from appearance and business
identity. Clean/Warm/Classic change only style; explicit starting-layout replacement
is undoable and preserves identity. Details supports an optional business name and
tagline, phone, contact email, address, HTTPS website/social links and disclaimer.
Empty details are omitted. Existing saved templates retain their original appearance
until edited; new drafts avoid a duplicate legacy footer. Identity remains part of
each website audience template, not a central business-profile settings record.

13 focused tests and targeted lint pass. Browser/API checks verify identity
save/reload, separate audiences (team 2/customer 3), style/layout preservation,
undo/redo, strict validation, stale-save rejection and 390px layout with no horizontal
overflow. Screenshot: `customer-cms-demo/fantasy-limo-email-design.png`. The saved
customer sample uses explicitly fictional contact details. Dashboard typecheck stays
at its 934 baseline diagnostics, none in this slice. Studio build/typecheck/package
and action checks pass; its known route-count security assertion remains unchanged.
Studio full formatting passed (1,520 files); independent review found no remaining
blocker after legacy-template compatibility and duplicate-new-footer fixes.

No deployment or sending. Logos/images, central business-profile reuse and actual delivery remain separate
work. Per-form overrides were completed in the following slice. Contact email is displayed
content, not a verified sender or reply-routing setting.

### Shared-form override design

Preserve the existing website/audience revision as the atomic concurrency boundary.
Add bounded, unique shared-definition overrides to its customer-owned JSON record.
Dashboard accepts a targeted override/reset operation, validates current definition
ownership, reads and preserves the other drafts, then appends with expected revision.
Website saves preserve all form overrides. Reset removes one override (does not copy
the current default). Existing documents remain valid with absent overrides.

The UI inherits the existing semantic colours and typography: a simple status row,
Customise action, effective preview and explicit reset confirmation. Editing reuses
the three-tab editor. Shared-form page count and website-default impact stay visible.
Acceptance covers isolation, concurrent/stale saves, default propagation, reset,
shared placements, mobile and no delivery side effects.

### Override acceptance — 1 October 2026

- [x] Form → Team template / Customer template shows effective inheritance.
- [x] Explicit Customise copies the effective design for all shared placements.
- [x] Explicit confirmed reset removes one override and follows future defaults.
- [x] Website saves preserve all custom form templates; impact reads 3 of 4 forms
      for the final customer sample. Team and customer revisions remain independent.
- [x] Server validates current definition ownership, checkpoint and frozen revision;
      validates stored scope/audience before preserving other templates.
- [x] Worker verifies complete acknowledgement, including overrides; records remain
      append-only customer-owned JSON, without a new database migration.
- [x] Matching 1.5 MB aggregate UTF-8 payload bounds fail before RPC with actionable
      validation, leaving the draft editable. New/legacy defaults preserve appearance.
- [x] Browser acceptance: saved override, cancel reset, confirm/save reset, reload,
      shared five-page scope, dirty-navigation protection and 390px layout.
- [x] Authenticated local API acceptance: two-form preservation across website edits,
      reset inheritance, audience isolation, stale saves (409), foreign forms (404), injected fields (400) and missing login (401).

Evidence: `customer-cms-demo/check-template-overrides.mjs` and
`fantasy-limo-form-template-override.png`. Focused Dashboard tests: 21 pass.
Worker storage/router tests: 38 pass. Independent full-file review resolved initial
default parity and aggregate-size findings; no remaining blockers. Removed-form
overrides remain stored and need an explicit cleanup UI in a later slice.
No merge, deployment or email delivery occurred.

Broader checks for this slice: Studio build (28 tasks), typecheck (44 tasks
plus security types) and package tests (40 tasks) pass. The existing security staging-route count assertion
still fails (35 pass/1 fail); Dashboard typecheck stays at 934 existing diagnostics,
none in the changed files.

Final formatting: the first full lint read the pre-format version and reported
three corrected formatting findings. Targeted recheck passed; the final full
pre-commit check passed all 1,520 files with no fixes. Implementation checkpoints:
Dashboard `737a7a025`, Studio `6987586`; both feature branches pushed.

## Email logo/image acceptance — 1 October 2026

- [x] Optional header logo and image content blocks select from the website library.
- [x] Required alt text, 40–600px width, alignment, replacement, removal and undo.
- [x] Six references maximum, including logo; only asset IDs and presentation fields
      persist in customer-owned JSON. No migration is needed.
- [x] Authenticated scanned/non-archived raster reads; signature/MIME and actual
      stream size verified, at most 512 KB each and 2 MB total rendered bytes.
- [x] Missing images show preview warnings and block saving; reset can remove an
      override without resolving its images. Authority is checked again before write.
- [x] Browser acceptance: logo/photo selection, replacement, width/alignment,
      save/reload, discard, remove/undo and 390px picker/preview without overflow.
- [x] Local API checks: asset references only, unchanged team and Booking override,
      two embedded preview images, missing-image warning, unavailable save (400)
      without revision change and external-URL rejection (400).

Evidence: `customer-cms-demo/check-email-media.mjs` and
`customer-cms-demo/fantasy-limo-email-images.png`. Customer sample revision 14 has
Fantasy Limousines logo and countryside limousine photo; team remains revision 2.
Dashboard focused tests: 40 pass. Studio storage/router tests: 39 pass. Independent
full-file review found no remaining blockers; targeted Dashboard lint passes.
Studio build, typecheck and full formatting pass. Broader baseline remains 934
Dashboard type diagnostics (none in edited files), and the existing Studio security
route-count assertion (35 pass/1 fail). Local private backup recorded above.

No merge, deployment or sending. The picker uses existing website media; upload
and AI image generation inside this editor remain separate. Inline browser preview
acceptance does not establish delivered-email image/client compatibility. Hosted
activation requires the matching Dashboard and worker contracts first.

### Next-slice implementation pointers

Inspect `server/utils/pageStudio/aiAllowance.ts` and `aiUsage.ts` for existing
text-model admission, reservations and replay semantics. Image-credit wallets are
separate; do not charge a text template proposal against image credits implicitly.
The current usage wrapper requires signed Studio session claims and a configured
staging/production environment, so native customer-CMS authorization and the local
demo adapter need an explicit design before reuse. Do not fabricate session claims
or silently call an unmetered provider. AI proposals must produce the approved
structured template, preserve manual edits until Apply, and keep sending disabled.

Final media checkpoints: Dashboard `7a8deed16`, Studio `0101046`. Studio pre-commit
formatting passed all 1,520 files with no fixes. Both feature branches are pushed;
no merge or deployment occurred.


### 7 October: approved private renderer extraction (staged)

The resumed current-main integration now passes the unchanged Pages size guard
with 60,429 raw bytes remaining (76,270 bytes saved). Full repository tests:
15,622 pass/1,939 environment skips. Private Worker RPC parity, failure isolation,
post-render authority checks and campaign draft-status races pass. Production
customer access remains closed. Independent review findings on allocation bounds
and exact customer image limits are fixed and covered by regression tests; hosted
browser acceptance remains pending. Preview deployment `6e4f2650-22a7-4103-9a8c-c64f0f91888f` uses clean source `383091cd9` and the verified private staging binding. Draft PR #632 is open; production is unchanged. [Evidence and limitations](2026-10-07-page-studio-resume.md).


### 11 October: retained setup recovery after Forms runtime installation

Hosted account B installed the first four prerequisites. The final Form draft schema operation remained reserved when its fifteen-minute setup child expired; its lease ended at 05:37:18 UTC. No operation state, receipt, intent or expiry was edited manually. Account A remains at two installed prerequisites while its genuine incognito browser session cannot be reached.

A deterministic recovery defect caused warnings after the Forms successor was installed: recovery replayed the ancestor runtime executor instead of reading its retained completion. Recovery now updates authority and reads status only. Pending work still needs an explicit same-request resume. Original runtime pins, strict receipt validation, compare-and-swap recovery heads and final authority checks remain enforced.

Validation: four regression cases failed before the fix; 125 focused PostgreSQL/HTTP tests then passed. Full local suite: 16,238 tests passed across 2,257 files; 1,653 conditional tests and 59 files skipped. Changed-file lint and diff checks pass. Independent source review reported no findings. The known 934 Dashboard type diagnostics are unchanged from the preceding release baseline; no new typecheck claim is made. Staging preview release is pending; production remains unchanged. No pushes or GitHub Actions were triggered.


The recovery-fix staging release at source `e14080753` stopped before upload: raw Worker size 25,468,934 / 25,468,928 bytes (six over). Production and the preceding preview artifact remain unchanged. The repeated start-action comparison was factored into one boolean without changing behavior; all 102 PostgreSQL coordinator tests and changed-file lint passed afterward. The size limit is unchanged. Local 3045 was restored and returned HTTP 200.


Source `5de9b2d06` also stopped before upload: the compiler expanded the shared action check, leaving raw size 25,468,969 / 25,468,928 (41 over). No budget adjustment or upload occurred. The next simplification shares the duplicate six-field adoption status projection; GET and POST retain their exact original schema parsers and final authority checks. All 23 setup PostgreSQL/HTTP tests and lint passed. Local 3045 was restored again.


Source `295476d20` stopped before upload at raw 25,468,933 / 25,468,928 (five over). The shared adoption projection saved 36 compiled bytes. The compiler-expanded action boolean is reverted to the original reviewed and full-suite-tested comparisons, preserving the recovery fix and projection dedup. The original full-suite-tested logic and both strict parsers remain unchanged. No upload, guard relaxation or production change occurred.


Source `25ed17b11` also stopped before upload at raw 25,469,106 / 25,468,928 (178 over), demonstrating that tiny source reductions did not provide reliable compiled headroom. Local 3045 was restored and returned HTTP 200; no upload or budget change occurred. Four upgrade identity modules now reuse the existing collectionDigest rather than duplicate canonical JSON and SHA-256 implementation. Each strict schema still parses first. Independent review confirms byte-identical canonical JSON, UTF-8 SHA-256 and lowercase hex output, unchanged pins/exports, and no dependency cycle. Changed-file lint passes; the full local suite is being rerun before commit/release.


Upgrade identity consolidation final validation: all 16,238 tests passed across 2,257 files (59 files/1,653 conditional tests skipped), including independent native identity fixtures and ordering parity. Full suite elapsed 214.67 seconds. Independent review and lint passed. No new type diagnostics claim or budget adjustment.


### 11 October 06:09 UTC: verified recovery-fix staging release

Clean source `55d2d8db80cb237fbfe9da49d5200c4abf1225ae` includes freshly fetched main `a78a11945f13c520d3258df9e249b99d46b21b07`. Guarded `pnpm deploy:preview` succeeded; Cloudflare readback confirms deployment `79119437-9ce0-4200-bd6b-b262d5d0c9f2`, created 06:09:47.154201 UTC, successful at 06:09:56.914986. Preview alias is https://preview.agency-dashboard-6cm.pages.dev. Raw Worker size 25,467,543 / 25,468,928 (1,385 remaining); gzip 7,044,518 / 9,750,000. Minimum free disk 10,432,270,336 bytes, above unchanged 8 GiB stop floor. Local 3045 was restored and verified HTTP 200; native 4325 was not stopped.

Production Cloudflare readback remains deployment `7f98f789-d152-4d2d-90d7-dec3c8f24798`, source current main `a78a11945f13c520d3258df9e249b99d46b21b07`, success. No pushes/Actions or production changes occurred. Account B refreshed the actual preview and explicitly resumed its genuine setup through the dashboard. Hosted recovery and final draft-storage acceptance are now being verified; A's isolated window is still unavailable.


Hosted recovery on the verified preview: B explicitly resumed a genuine setup child, then recovered collection, workflow, collection-staging and Forms runtime in order. All four now show Ready without the ancestor-runtime warning. Read-only D1 confirms Forms runtime ready with no lease and the original draft schema operation still reserved; its earlier lease was expired. The pending schema authority was recovered explicitly; normal same-request resume is the next step. No expiry, intent, phase or receipt was manually edited.


B's final schema recovery returned HTTP 200, reserved status, retained request `be381daf-1166-425f-abf5-09fd9c3e7568`, new recovery head `68589030-c5f7-4bda-8fed-a392bf61a8bd`. No execution occurred during recovery. The subsequent full status GET exceeded its existing 30-second browser deadline and was aborted (CDP Network.loadingFailed net::ERR_ABORTED); the setup action POST itself succeeded. The client GET timeout now matches POST at 300 seconds so slow provider readback can finish. This changes neither fifteen-minute child expiry nor original review/preview deadlines, backend fences or leases. Independent source review, lint and diff checks pass. Another guarded staging release is pending; all production and native identities remain unchanged.


### 11 October 06:20 UTC: setup readback timeout release

Guarded preview deploy succeeded from clean source `b10c53c4f7a848d7ecaa560baf4714bcbdeb213c` on current main `a78a11945f13c520d3258df9e249b99d46b21b07`. Cloudflare readback verifies `a8f5d60d-e35f-42fa-838d-1a89a414d087`, created 06:19:52.179691 UTC, successful 06:20:02.122399. Raw size 25,467,699 / 25,468,928 (1,229 spare), gzip 7,044,633. Minimum disk 10,187,137,024 bytes, unchanged 8 GiB stop floor. Local 3045 restored; native 4325 remained running. B reloaded the verified preview. GET and POST now both wait up to 300 seconds without changing authority expiry. Hosted readback and schema execution remain pending. No production changes, pushes or Actions.


Long status GET on the timeout-fixed preview returned HTTP 200 and exposed the normal Resume step control. B selected it once; the client performed its fresh status preflight before attempting the same original schema operation. The previous setup child expired during that attempt and the dashboard correctly returned Resume content setup. D1 remains reserved with original operation `1c1f8a96-4c92-4565-9784-d45aef2fc0d5` and retained lease until 06:29:47.294 UTC. A new genuine setup child was resumed at about 06:26 UTC; completed-operation recovery is underway. No lease/expiry/phase edits or premature duplicate execution.


### 11 October: bounded native Forms schema verification fix

The last five-minute schema lease expired with B still reserved. Target D1's exact original operation marker and reviewed source/target digests exist, but coordinator completion remains withheld. Source review identifies 14 leased fences for existing-schema readback, each performing nine native callbacks and nine Cloudflare management reads. A tested native change selects a ten-minute staging lease from the validated environment; production remains five minutes. All authority, predecessor, runtime pin, token, database-clock and completion CAS fences remain unchanged, as do setup child and approval expiries.

Native tests-first staging case failed before change; 36 focused checks then passed. Full suite: 6,147 pass, four existing conditional Astro skips; build 28 and typecheck 44 plus security types pass. Tenant artifact remains exact reviewed 6cb digest/911,081 bytes. Independent source and concrete deployment-config reviews pass. Full native lint and staging executor release are pending. The derived config omits all vars and inherits current live configuration, avoiding replacement of A/B controlled scopes by older committed settings. No production change, pushed commits or GitHub Actions. Broader hosted acceptance remains incomplete; A's incognito window remains unreachable.


### 11 October 07:03 UTC: verified staging Forms schema lease release

Native clean source `f7182581b9e4672bc3c3b7a445e14b337e04defa` contains fresh main `4401438d6766baef4adde0c76741ebc30ab1781c`. Full lint and required commit hook both pass 1,580 files without fixes. Guarded staging executor deploy succeeded: `a8549573-edcc-43b6-8cdc-7fb4d4cd5371` at 07:03:04.127535 UTC, version `b5cbb7be-92ae-4f19-9449-6adc590864de`, 100%. Every binding and actual plaintext/JSON variable compares identically before/after, and the PROVISIONING_API_TOKEN secret entry remains (no value read/copied). Only deployment annotations changed. Production executor remains `111cf7ba-ae5d-48ca-8f15-43a40e7d9818` / `cd0aa33b-bc2e-4822-a4ba-3fa80fac3972`, unchanged.

Wrangler dry-run caught scratch tsconfig path resolution before upload. Final ignored config sits beside the original and differs ONLY by omitting vars/enabling keep_vars; dry-run 1,924.55 KiB/330.36 KiB gzip. It preserves the controlled A/B config rather than overwriting it with committed older scopes. Exact target/current-source guards and independent concrete config review pass. Minimum deploy disk 10,910,769,152 bytes above the unchanged 8 GiB floor.

B refreshed its genuine dashboard to resume under this release; final supported schema completion/adoption remains pending. A's isolated window remains unreachable. No production release, pushes or Actions.


### 11 October: B schema complete and verified-response UI correction

Read-only D1 at 07:17:25 UTC confirms B's exact original draft schema operation `1c1f8a96-4c92-4565-9784-d45aef2fc0d5` is installed, lease cleared. The released staging claim was independently observed as ten minutes; original child/approval expiries were not extended. All five backend prerequisites are now complete for B. Managed adoption and Forms capability remain pending; A remains at two prerequisites with an unreachable incognito window.

The UI discarded each successful guarded response and repeated expensive full status verification, often exhausting its setup session. A client-only strict merger now validates kind/original request/recovery head/adoption ID/progress digest, updates only the returned operation, and prevents older reads, replaced snapshots or unmounted pages from merging results. Confirmation belongs to one step and exact snapshot; uncertainty, malformed/mismatched responses or refresh invalidate it and require successful readback. Client transport waits up to 900 seconds; every backend expiry/fence remains unchanged. No readiness, capability or editor access is inferred.

Tests-first: seven component regressions failed; three additional review findings (settled concurrent GET error and two adoption-start head cases) failed before correction. Final focused 35 tests pass, lint/diff and independent source review pass. Final full suite 16,268 pass across 2,258 files, 60 files/1,658 conditional tests skipped. Five additional skips are the built Worker boundary tests after removing only owned rebuildable dist output to free 91 MB; they must run on the rebuilt artifact before release. Typecheck has exactly 934 diagnostics/498 normalized identities, no new or removed identities versus the preceding baseline. It is not globally clean. Local 3045 restored after checks, native 4325 untouched. No pushes/Actions; client release pending.


### 11 October: confirmed-response build checks and disk recovery

Clean Dashboard source `07be3478a85f54d4a044c2aba5891d2b7951e237` passed the local build under the unchanged disk/size guards: raw 25,467,459/25,468,928 (1,469 spare), gzip 7,044,453. Five rebuilt Worker boundary tests pass, completing the artifact checks omitted during the source suite. Full source suite 16,268 pass plus these five artifact checks; 35 focused UI/projection regressions pass. Type diagnostics exactly match 934/498 identities with no new or removed errors. Independent review is clear after three regression-first corrections.

Free space after repeated local builds was about 8.5 GiB, below the next deployment build's 9.5 GiB start floor. No guard was lowered. Worktree source, configuration, data, dependencies and evidence were preserved. pnpm cache status identified a modified Nuxt UI package; its cached index and 566 referenced files were preserved in a private local 543,572-byte archive. The supported pnpm store prune removed 221,543 cache files/4,336 unused packages and restored about 14 GiB free. Installed dependency directories and all worktrees remained intact. See https://pnpm.io/cli/store for the supported cache semantics. No broad process termination or project deletion.

Fresh origin/main remains `a78a11945f13c520d3258df9e249b99d46b21b07`, included in the reviewed candidate. deploy:check passes for agency-dashboard; guarded pnpm deploy:preview is now running. Native 4325 stays running; owned 3045 is paused only for shared Nuxt build output and will be restored. No Actions/pushes or production changes. Hosted B managed adoption and A browser access remain outstanding.


### 11 October 09:09 UTC: confirmed-response preview released

Guarded pnpm deploy:preview from clean source `07be3478a85f54d4a044c2aba5891d2b7951e237`, latest included main `a78a11945f13c520d3258df9e249b99d46b21b07`, succeeded. Cloudflare readback verifies preview deployment `1204a008-d7dd-4f28-a9b0-0ef03852a69e`, created 09:09:39.242697 UTC, success 09:09:52.404. Raw size 25,467,623/25,468,928 (1,305 spare), gzip 7,044,559; minimum disk 14,017,150,976 bytes under unchanged 8 GiB floor. Local CMS 3045 was restored immediately; native 4325 preserved. B reloaded the actual preview to recheck managed adoption. No production change, pushes or Actions. All five B backend prerequisites remain installed; A access and hosted Forms/isolation/editor acceptance remain incomplete.


### 12 October: user-authorized merge and production release

The user explicitly instructed merge and production deployment. Dashboard PR
https://github.com/adme-dev/dashboard/pull/652 merged to
`b47394ab2d730f8411eab89d3d35807700566ab4`; Native PR
https://github.com/adme-dev/xeroflow-page-studio/pull/123 merged to
`f678ba8dd61fdd5e67523b826c138c51dd80540b`. Both integration trees are identical
to the reviewed, locally tested candidates. Both included freshly fetched main;
normal PR merges used `[skip ci]` after checking neither repository requires CI
statuses. No workflows were disabled, fabricated or bypassed. Actions readback
shows no runs for either feature head or merge commit.

Production database migrations 442–448 ran in order on the verified Neon default
branch `br-small-hall-a4qtwjgo`, with five-second lock and sixty-second statement
limits. Migration 444 backfilled 104 legacy owners and replaced the existing
client foreign keys while retaining UUID scopes and ON DELETE RESTRICT. All 12
site rows and 12 entitlement rows compare unchanged before/after. Both replacement
foreign keys are valid. Native identities, accounts, workspaces, site requests
and setup approvals remain empty. Fantasy retains its original tenant/client/site,
active internal-fantasy-limo-development entitlement and null expiry.

Native production Worker releases from f678ba8:

| Target | Version | Deployment |
| --- | --- | --- |
| xeroflow-page-studio-sandbox | 83a5fae0-e8e3-4cb2-82ca-2dc476c1b5ce | c71cdb30-633f-4ea4-8981-d61cc9755540 |
| xeroflow-provisioning-production | 60069269-a76f-4408-a405-938df41b4642 | 5eebf4ef-6dd2-4973-a738-1e875c0d269d |
| xeroflow-provisioning-executor-production | e027b1b8-eba5-4322-b350-f116bbc90c53 | 13a6c179-3828-4c30-831d-10960a3b3839 |

All three have 100% deployment readback and identical live bindings, plaintext
vars, secret names/types, compatibility dates and flags. Reviewed derived configs
omit stale declared vars and retain live vars. Sandbox used containers-rollout=none:
application `a033a7df-cee9-46f3-a0ed-9d7b93b6f25a` stays version 26, image ea21,
namespace 7a62943866fe48d09196d391bc8d4090 and max 10. No tenant runtime artifact,
customer Worker, container or router was replaced. Rollback versions are Sandbox
e35d0166-a177-4e5d-8989-767478ea8b0d, scheduler 23ef0df2-424c-4e26-815b-683a0e04e166,
executor cd0aa33b-bc2e-4822-a4ba-3fa80fac3972. The production Pages rollback is
7f98f789-d152-4d2d-90d7-dec3c8f24798/source a78a11945.

Fresh native security 36 tests and both dependency audits pass with no known
vulnerabilities. Existing full source validation remains 6,167 Native and 16,268
Dashboard tests, plus artifact checks and approved independent cumulative review.
Dashboard type checking retains the documented existing 934 diagnostics/498
normalized identities; it is not globally clean.

Native production signup/customer editor activation remains gated. Staging
shared-form intent/fixture, hosted viewer/membership/capability cases, dedicated
media storage, progress-card accuracy and near-limit save latency remain separate
outstanding work. No staging identities, grants or policies were copied into
production. The merged feature branches were retired locally and remotely after verification; owned
worktrees remain temporarily because they serve the requested local demos and
contain release evidence/dependencies, not as future release bases.

Dashboard production deployment `10c5455a-a93d-4bb7-b8ec-99e1be63f170` succeeded
at 11 October 22:32:28 UTC (12 October 09:32 Melbourne), from clean merged source b47394ab2.
Cloudflare canonical readback confirms main and the exact source SHA, identical production environment
configuration and domain bindings including xeroflowpages.com. Raw Worker 25,467,487
/ 25,468,928 bytes (1,441 spare); gzip 7,044,487/9,750,000. Minimum free disk
11,764,830,208 bytes, above unchanged 8 GiB stop floor. Fresh 21 deployment guard tests and
all five rebuilt Worker boundary tests pass. Local CMS 3045 was restored and returns 200;
native 4325 remained running and returns 200. Live browser verification confirms Fantasy Limo’s original standalone account
renders in light mode, switches to dark mode and returns to light. Overview
retains 75 pages, 109 media assets and 8 forms. Agency CMS shows all five setup
steps Ready. QR Codes navigation renders 8 codes / 48 scans. The public preview
and /studio each return 200. Production native signup gates and configuration
remain unchanged. Evidence: production-fantasy-overview-20261012.png,
production-fantasy-cms-light-20261012.png, production-fantasy-cms-dark-20261012.png
and production-qr-navigation-20261012.png in .verification/resume-20261008/.

The normal production Open Page Studio action completed its genuine handoff to
Fantasy’s existing 4e275d editor hostname. The production editor shell and
light-mode toolbars load. Both Desktop and iPhone previews subsequently render
Fantasy’s own Make an entrance page, fleet and services. Document, overlay, hook,
persistence and observed image requests return 200. The initial cold frames were
slow and briefly blank; cold-load latency remains a performance follow-up.
No content edit, publish, email or AI operation was performed in production.
The working editor and Fantasy dashboard remain open for the owner. Screenshot:
production-fantasy-editor-20261012.png.


### 2026-10-16: immutable copy and complete Forms history admission

The private management Worker now derives the exact source dependency closure and retains deterministic destination graph identities. All required current records, historical schema dependencies and checkpoint content dependencies are included; unsupported sizes fail before copying. The large generated graph verifier stays outside the Pages bundle. The native Forms history path independently validates every typed revision, retains its expected destination receipt, and records verification only after a distinct read-only inspection.

Verification: the combined native PostgreSQL suite passes 322 tests, and the additional history coordinator passes 19 tests. Copy planning, Worker boundaries, generated verifier and deployment configuration pass 104 focused tests. Forms planner and HTTP checks pass 23 tests, with native/Studio parity at 0, 10 and 1,000 history rows. Worker typecheck, dry-run build and changed-file lint pass. Server types retain the existing 295-diagnostic baseline. Independent review found no blocking findings.

Migrations 466, 467 and 469 were applied to the configured database with zero rows in the new tables, both expected triggers per table, and unchanged fingerprints for sites, release pointers and resource bindings. Receipts are in `.verification/managed-transfer/{copy-graph,forms-history,forms-history-verification}-migration-receipt.json`. No customer activation occurred. Migration 468 is unused; terminal selection is reserved as 471 after copy verification 470.

Actual copy/history orchestration, final atomic selection, retained old-live authority, recovery UI and hosted acceptance remain outstanding. The exact prepared-runtime policy is intentionally unconfigured until artifact digests are reviewed. The latest a113 CI build and database groups passed; one unrelated governance UI test timed out, passed all 16 cases on isolated rerun, and the failed CI job is rerunning. No production deployment or DNS change is claimed.


### 2026-10-23: effective source release and expired-transfer recovery

**Deployed and verified:** Studio PR #148 fixes source runtime discovery to use the effective native runtime after CMS setup. Reviewed source merged as `33b32bc6619703619d9459d3045731d7d84b5615`; all four CI verification/stress jobs passed. Only `xeroflow-provisioning-executor-production` changed: version `ddba9f22-5ecc-4e73-8470-7e99a5100a76`, deployment `787dc494-de10-4edf-9fd4-8e38b2a1898a`, 100% traffic. Exact before/after readback preserved all 17 bindings, observability and the other services. Dashboard remains at `961520050d4e6f25330a0f6d67fda9f8095217d9`. The release report is retained in `.superpowers/sdd/2026-10-20-transfer-controls/native-transfer-effective-source-release.md` of the dedicated release checkout. This release has not yet passed a resumed hosted source execution.

**Implemented and tested locally, not deployed:** expired-transfer recovery has its first non-authorizing foundation. Dashboard commit `f9862f8e139ebeae5ed7455a538c3b3d0e4ad185` adds immutable recovery history, a closed recovery head and legacy admission checks before/after work; 485 PostgreSQL/authority/control/workflow tests passed. Studio commit `4a6921d49ff1576f1399a1c9f4296bc60b16cd21` adds atomic closed/revoked CAS, legacy admission guards and database protection against a delayed catalogue containment callback; 102 distinct tests, types and scoped lint passed. Both exact file sets received independent approval. These commits cannot approve, enable or resume recovery. Migrations were exercised only in owned local test databases; no production recovery head or renewal was created.

Subsequent reviewed local increments:

- Dashboard `a51a4f422aaaadb3ed8f05751ad8356673d07f1a` implements private bounded plan renewal: at most seven days, exact original allowances, original operator, immutable audit and atomic site-pointer change. Only the predecessor's status is cancelled; original dates and terms remain intact. No live entitlement was issued.
- Dashboard `0ae55c1cf` defines strict public recovery requests and projections; 36 contract tests pass. Dashboard `7b6ae13714d4c68fc703980202dbb8a1109d1295` implements private initial recovery open/status/revoke. The final 95-case PostgreSQL suite covers controls, renewal and recovery, including replay, races and final-clock expiry. Opening a review closes legacy execution; it cannot enable transfer work or create another recovery epoch.
- Studio `e7dd4ffd46dc9ec32b45fd6c6c9f50fc6fdcc8a8` verifies all four real catalogue SQL batches statement by statement, with and without later content. Eight cases pass, with schema and row snapshots unchanged after each late statement. This does not depend on REST batch rollback and is not combined source/destination eligibility proof.

Dashboard `88eb17561` connects the new public HTTP/private management transport to those private helpers. Across four focused suites, 82 distinct HTTP/transport regression cases passed, including the exact historical open replay after revocation. Strict management types and scoped Nuxt ESLint passed; the generated full Nuxt lint configuration is absent in this sparse worktree. A separate read-only resource observer is in progress. Neither is a released recovery workflow; owner consent, cross-store admission, all remaining phase fences and hosted acceptance still remain.

**Fresh hosted evidence:** the original customer A request remains revision 5 with its original checkpoint. Read-only Refresh now returns `needs-attention` and no phase actions because its original approval/plan expired. Resources and the four catalogue steps remain previously verified; source execution, freeze and copy were not claimed complete. The bounded signup/session window has also expired: the public configuration returns `enabled:false`, and a genuine desktop sign-in attempt cannot request a link. Desktop Mail/browser control now works; permission access is no longer the sign-in blocker.

Customer B's current site was inspected in a read-only database transaction on 22 October 22:05 UTC (23 October Melbourne). It has no CMS adoption scope, generation, application or adoption receipt; its trial expired on 22 October 12:00 UTC. Installed schema prerequisites and a successful provisioning resume do not establish adoption or transfer readiness. Evidence receipts: `native-a-expired-ui-20261023.json` and `native-b-adoption-read-only-20261023.json` in the dedicated release checkout's `.verification/release-20261020/`.

**Next implementation and acceptance tasks, in order:**

1. Prove complete-resource/catalogue reconciliation, including noninterference of delayed legacy SQL; partial or uncertain effects remain unsupported.
2. Connect the reviewed private publishing-plan renewal and initial closed-review controls to the complete recovery flow. Retain exact old limits and immutable history; do not treat plan renewal or an open review as transfer permission.
3. Complete fresh owner/operator consent, cross-store admission and explicit recovery identities through every remaining phase and finalizer. A recovery head by itself never grants permission.
4. Add a separate explicit existing-source adoption grant for B's unfinished CMS adoption. It must not revive old preview/CMS grants or authorize another provisioning/runtime/schema operation.
5. Release a newly reviewed two-mailbox sign-in window, obtain genuine fresh sessions, and exercise the complete hosted A/B transfer and isolation matrix.
6. Run the separately scoped agency Pi pilot, including reject/accept/save/reopen/restore, cancellation and negative checks, after the hosted gates pass. Pi remains disabled; implementation, CI and infrastructure alone do not prove this pilot.

Do not deploy a stale worktree or extend the old acceptance records to make these tests pass. Preserve the original source and saved progress; public websites, DNS, publication and live Forms are unchanged by this recovery work.

### 2026-10-23: complete observation transport and immutable recovery evidence

Current branches were refreshed against Dashboard main `961520050d4e6f25330a0f6d67fda9f8095217d9` and Studio main `33b32bc6619703619d9459d3045731d7d84b5615`; both recovery candidates include current main. Draft PRs remain Dashboard #690 and Studio #149. These increments are committed and pushed for CI, not deployed.

- Dashboard `ab027cd61` implements fresh private observation/initial-close inspection (157 real PostgreSQL control/inspection cases passed). `9cdb3135d` connects the bounded private Management receiver; `555c036ef` and Studio `11b66b2` connect the fixed Control gateway and strict inspection client.
- Dashboard `7a9f6b854` adds complete PostgreSQL inventory prerequisites, with explicit queries across all nine later-phase admission stores (50 real PostgreSQL cases passed). `1ec222b05` and Studio `2226284` extend the private wire to complete inventory, without an incomplete-observation fallback. Shared canonical fixtures and their digest agree; 38 Dashboard transport and 20 Studio client cases pass.
- Dashboard `5336903d9` adds immutable complete reconciliation receipts, authenticated historical retrieval and migration 474 (90 real PostgreSQL cases passed). Fresh capture brackets the remote observer with current authority/source/head checks, validates all required evidence, and performs a final locked authorization after insertion and retained-hash readback. Historical replay never refreshes its timestamps or grants authority. CI explicitly runs the receipt database suite. Migration 474 ran twice only in disposable local schemas.
- Studio `f9f9d25` implements atomic initial G2 closure with fresh pre/post authorization and exact event/head proof (50 store/closure cases passed). `cd9a6d8` connects the private production executor using its captured first-primary database and Control bindings (34 boundary/resource regression cases passed). No public HTTP endpoint or transfer admission was added. Strict types and scoped lint pass; the Control client and business package build.
- Studio `9d00228` updates Storybook, Vitest and ip-address to patched versions through the generated pnpm lockfile. Both local audits report no vulnerabilities; 1,600 relevant tests passed, including four actual Storybook browser tests. The new full Linux/Windows CI runs remain separate acceptance evidence.

All listed slices received independent SPEC PASS / QUALITY APPROVE reviews in the release checkout's `.superpowers/sdd/2026-10-20-transfer-controls/`. The actual combined Studio source/destination inventory observer is still under final test/review. The end-to-end explicit reconciliation coordinator, fresh-login verification of a previously closed event, renewed consent, recovery admission and remaining phase/finalizer fencing are not complete. Customer B's bounded existing-source adoption and genuine hosted isolation checks remain outstanding. No production recovery migration, renewed grant, customer activation or Pi enablement occurred in these increments.


### 2026-10-23: explicit inspection controls and bounded adoption implementation

Dashboard candidate now includes `f2881ce0a` (private closed-recovery coordinator), `f615b5b2c` (explicit authenticated inspection transport), `8e71f8d85` (review/open/inspect/close UI), `cdbb74aa0` (separate existing-source adoption grant) and `e11b2877f` (three recovery routes recorded in the isolation inventory). Studio candidate includes `3787b4b` (complete read-only physical inventory), `fe70685` (fresh-login verification of the retained closed head), `629e7e5` (exact native adoption-source proof) and `788e0ff` (inventory executor and fixed production forwarding). All scopes received independent review. These are implementation commits, not production activation.

The inspection path derives private selectors from retained records, brackets remote reads with fresh database authority, preserves immutable capture evidence and never retries an uncertain remote mutation automatically. Its explicit UI separates opening a recovery review from permission to resume a transfer. Inspection does not create consent or enable execution. Real Chrome verification exercised the actual Nuxt UI modal/component at desktop and 390px mobile width using a local synthetic API harness; it was not hosted account acceptance.

Verification for these increments: 17 additional real-PostgreSQL coordinator cases, 59 HTTP/transport cases, 18 component cases, 95 Studio closure/verification cases and 122 Studio inventory integration cases passed. The adoption grant passed 54 owned cases, the final two dispatch regressions and 115 legacy regressions. Scoped types/lint passed; broader pre-existing Nuxt ambient/Neon diagnostics remain disclosed. Migration 475 was executed and reapplied only in disposable local PostgreSQL schemas. No live grant, source change, entitlement renewal or production migration occurred.

The full Dashboard CI run on the earlier `5336903d9` candidate passed 17,479 tests and failed its mechanical route-count assertion. Commit `e11b2877f` adds the exact three scoped routes to that assertion without relaxing isolation. Studio CI on the earlier `cd9a6d8` candidate exposed a GSAP example optional-peer Node types mismatch; commit `62df8d9` aligns the example with the existing Node type peer. Its typecheck, three browser tests and frozen-lock validation pass; renewed full CI remains pending.

Remaining work is explicit: fresh immutable review and owner/operator consent; matching PostgreSQL/D1 admission; recovery identities and fences through every remaining phase/finalizer; adoption HTTP/customer integration; current-source release; genuine hosted A/B activation and isolation; then the separate Pi canary. Pi remains disabled. Neither local proof nor a closed recovery head completes these gates. Public websites, domains and live Forms are unchanged.


### 2026-10-23: owner approval screens and paired admission (local candidates)

The earlier remaining-work lists are superseded by this checkpoint where they
refer to adoption UI, review consent, or initial paired admission. These pieces
are implemented and independently reviewed; none is a production activation.

- Dashboard `f9393d732` and `73efc2268` connect the separate existing-source
  adoption grant to operator and native customer controls. Fresh account changes
  and document lifecycle changes invalidate the view. Actual Chrome desktop and
  390px checks used a synthetic local API, not genuine hosted customer evidence.
- Dashboard `a56103e60` implements immutable complete reviews and distinct genuine
  owner/operator consent; `fc7544f3f` connects the fixed private and authenticated
  public review routes. `dad541565` adds the owner review page and operator
  renewal/create/consent/approval controls. The UI persists only exact public
  request references for explicit lost-response reconciliation. It reads current
  server state after reload before offering another approval. Component14 and
  HTTP13 checks, scoped lint and bounded strict Vue types pass; mobile review
  details and confirmation were checked in actual Chrome.
- Dashboard `ba6613b236c81cb6cc1490f9033b6db2804d42eb` records pending/applied
  admission only with fresh matching PostgreSQL and D1 proofs. Studio
  `1340310baedfa0cb11f474843663205954bce9c0` and
  `ca1f25b6d4a341cb16184df17a505ea74440fbd5` provide the immutable D1
  prepared/enabled ledger and private executor integration. Dashboard
  `3e8038404` supplies the bounded private admission transport. No production
  renewal, admission, migration, upload or installation was performed.
- Studio `60034b14adbb616d26433e6d4679e5dc3853928f` implements read-only
  enabled-recovery and source-discovery checks against actual SQLite state.
  All26 new and16 existing execution cases pass. Dashboard `142b44e5f` adds matching atomic PostgreSQL request retention and
  requires a separate recovery runtime descriptor; ordinary runtime configuration
  cannot create a permanently unusable saved request. Its45 cases and71 prior
  regression cases pass. Dashboard `1fbb9dcbb` supplies the private phase transport
  with42 cases, fresh environment checks and no public fallback. Studio `66256f4`
  supplies actual private read-only factory and forwarding integration. These read
  capabilities cannot upload or install a recovery runtime.

CI status: Dashboard's earlier `035c733e3` production build passed the unchanged
bundle limit after lossless literal compaction, but its full suite failed one
configuration-inventory assertion (17,603 passed). `b0663ac3b` records precisely
that new configuration row and passes the targeted inventory suite; full run39881850313 passed. The newer UI and phase candidates still require their own full CI. Studio run39875143813 passed both transfer
stress jobs. Two Windows integration tests exceeded their5-second default;
Ubuntu's hosted runner lost communication during lint. Neither result is a
production release receipt. The scoped test-only timeout repair is committed as Studio `df6d8a5`; all
assertions remain unchanged. Dashboard `f13863b6f` adds dedicated serialized
PostgreSQL approval/admission and source-association CI steps so those tests run
with the disposable database instead of being skipped by the ordinary suite.

Outstanding: complete the recovery identity and physical provider checks through
source execution, freeze, destination execution, copy/history, final selection,
and original-source retention; connect explicit recovery continuation controls;
release the current reviewed candidates; open the bounded two-mailbox sign-in
window; verify genuine A/B adoption, transfer and account/session isolation; then
run the separately scoped agency Pi pilot. Pi is still disabled. No public site,
DNS record, publishing pointer or live Forms endpoint changed in these increments.


### 2026-10-23: explicit admission controls and interrupted-step recovery

Dashboard `34e308ac6` adds the current-PG admission coordinator (34 contract/real
PostgreSQL cases), `a001a11a5` adds its strict operator HTTP and private Management
transport, and `63cba14de` adds the explicit readiness screen. Studio `b981766`
exposes actual prepare/enable operations through the fixed private executor and
corrects original-input replay after a lost post-CAS acknowledgement. Actual D1
and factory regressions prove unchanged request retries retain one event, while
later or revoked state denies the earlier transition. All scopes received
independent approval before commit.

The readiness UI preserves exact public action IDs across reload, obtains a fresh
authenticated status read, and requires explicit confirmation for each step. A
PostgreSQL applied record never implies current D1 readiness. A cross-tab advance
past an interrupted preparation has an explicit Use newer saved state action;
it only clears obsolete local work and requires another website verification.
103 combined transport, HTTP, component and isolation-inventory tests passed.
Scoped lint, Management strict types, bounded Vue types and the Management dry
run passed. Actual Chrome/Nuxt UI checks completed all four steps with synthetic
local data, checked 390px layout without overflow or console errors, and proved
refresh returns readiness to unverified. This is not hosted account acceptance.
Browser receipt: `transfer-recovery-admission-ui-browser-20261023.json`, SHA256
`9884c73aeabfeb56ef0c7a16d2cc5520c508bc1f31d1c727197604d7ad3b5ad7`.

Dashboard `fde236dd7` adds a dedicated disposable PostgreSQL CI step for the
coordinator; current run39887266912 is pending completion. Studio `da42fcd`
fixes only formatting of two fixture arrays reported by Windows CI; their parsed
JSON and canonical protocol digests are unchanged. Current Studio run39887166626
is pending completion. The preceding candidate runs were superseded; Studio's
Ubuntu runner shutdown during lint is not attributed to an application defect.
Neither current candidate has a full CI pass or a release receipt yet.

Remaining source recovery is being implemented as a descriptor-bound physical
runtime change with fresh PG authority and an atomic tenant database install.
It is not callable from the public readiness screen. Source execution, freeze,
copy/history, destination verification, selection and original-source retention
still require their recovery-aware execution paths before genuine A/B hosted
acceptance and the separate Pi canary. No production migration, grant, customer
activation, publishing pointer, DNS or Forms change occurred. Pi stays disabled.

### 2026-10-23: recovery integration and resumed execution work

Dashboard recovery PR #690 now includes released main `3150d0533`, preserving
the Banner Studio release. Integration commit `0d6cecf5e` passed 647 local tests
(including 86 real PostgreSQL cases) and strict Management types. Full CI run
`39905884235` is still running; this is not a production release receipt.

Studio `17509a6` fixes the actual hosted catalogue invocation exceeding its D1
query budget. Start now retains the reservation, and each explicit Resume
advances one verified phase. Existing authorization and physical verification
checks and the original query limits remain intact. The actual catalogue RPC,
native phase-boundary and destination-execution regressions pass. Commit
`8a02cf1` records four exact secret-scan false positives, independently recomputed
as deterministic fixture effect hashes; the new scan passes. Full Linux/Windows
CI run `39905834064` is still running.

The resumed source-recovery agent's exact claim-acknowledgment and read-only
claim-observation fix is independently approved and committed as `a699814`.
The new upload/install/selection engine has a separate independent approval
with 29 passing tests, package types and lint. Its private executor wiring is
still being completed. A separate agent is implementing the source-freeze
PostgreSQL contract and retention checks. Neither constitutes hosted acceptance.

Release sequencing must include the compatible freeze RPC and physical reader
in the pinned successor artifact before retaining its recovery request. Existing
retained requests cannot silently change artifact or descriptor. Later
destination/copy/history/selection/retention recovery paths and genuine hosted
customer acceptance remain outstanding, followed by the separate Pi canary.
Pi remains disabled; no public site, domain or production grant changed here.
