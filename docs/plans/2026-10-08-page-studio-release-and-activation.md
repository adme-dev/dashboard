# Page Studio production release and activation checkpoint — 8 October 2026


Current task status and next steps live in the
[running CMS/Studio ledger](customer-cms-status.md#running-ledger--9-october-2026).
This file retains release/source/provider evidence. Historical entries below do
not authorize deploying an older branch or treating local checks as hosted acceptance.

Latest local updates: email field picker and compatibility are committed at
Dashboard `20b4ebe30` / native `1e3219b`; collapsed navigation is committed at
native `d588cf286`. Dashboard application checkpoint is `9ac212310`; later ledger-only commits
do not change that tested build.
The 200px thumbnail cap is committed at native
`6888688e8c13c36eac47601e55f02ac546c13381`: local browser/build/review and final
1,576-file formatting checks pass. All remain unpushed and undeployed.

Local Dashboard build passes at raw 25,458,639/25,468,928 bytes and gzip
7,041,769/9,750,000. The scoped type graph retains the same 205 existing error
identities; repository typechecking is not clean. Native build/types/tests and the
prior full formatting gates pass. The new thumbnail sizing browser regression
passes in light/dark mode and retains horizontal overflow in narrow containers.

No Actions, deployment, email delivery, paid inference or customer activation was
performed for these updates. Hosted signup/Forms/editor acceptance and coordinated
private renderer/router/retained runtime rollout remain required. The new runtime
candidate is still unapproved/uninstalled; native preview AI allowance remains zero.

## 9 October selected platform and existing-account showcase

The owner selected the canonical native editor (local4325) and standalone Nuxt CMS
(local3045), using xeroflowpages.com with optional XeroFlow dashboard entry. The
running ledger now prioritises the existing Fantasy Limo invited-account journey
for Tuesday13October. Agency launch into the original saved hosted site is verified;
normal standalone mailbox sign-in remains awaiting the user.

The standalone launch-origin defect has a locally verified native Worker fix.
75 targeted tests, full28-task build,44-task types,40-task package test run,36
security tests,48 action-runtime tests and8 operator transport tests pass. Review
approves the exact HTTPS invited-client entry and preserved signed/fresh authority.
The original production image/routes/resources remain unchanged. Worker dry-run
passes with only the explicit new invited origin. Full formatting passes1,576files
in320seconds with no fixes; native commit is `e5467a79ae8f86efb7a0beee978cef5ca4713841`.
A local Docker Linux image build was cancelled after host disk exhaustion; no image
was uploaded or deployed. Fresh main fetches passed after initial space recovery.
The cancelled build's14 private cache records were removed by exactID, preserving
shared cache; Docker is stopped. Host free space is about2.2GiB. Packaging/rollout
and the real invited mailbox journey remain pending.

Read-only production inventory on9October confirms Sandbox Worker version
`79919892-c8dc-4266-9571-89e451e53366`, deployment
`c8df6ea3-3c71-4af9-a10e-7eea7f270c27`, container application
`a033a7df-cee9-46f3-a0ed-9d7b93b6f25a` version25, image
`a63aa0d1692a0f9cbe630f01c931fe8a16e4eca60b1ccd02872864129f45b060`.
All three configured custom domains match the complete provider service inventory.
No rollout, source push or Actions were performed by this verification.

## 9 October source reconciliation

This section supersedes older current-source statements below; dated release
entries remain historical evidence. Fresh Dashboard main is `c85bf2653344ac36530e2a479d2a64cf64e58b1d`;
the last verified 8 October production deployment is
`57353fad-8401-496c-951a-71dc569da18d`. CMS light/dark design and invited access
are released, with existing QR navigation retained. Recheck live provider state
before a new release; no deployment occurs merely by updating this ledger.

Native PR119 is merged at `17ac1f3dd292f5da996daac82c523174606a3265`, with
successful Linux/Windows CI. Local appearance, layout-gallery, guarded history and
thumbnail/overview increments extend it through `29be3451d20f5b25ff6ea854c6f1e9136b2be19e`.
Dashboard email proposal/API/UI work through `dd44d62a4` and the newer local V2
field-reference contract remain unpushed and unexposed. Native/runtime deployment,
matching private renderer rollout and customer activation are separate required gates.

Mailboxes and email authorization are already supplied. Supported current-native
sign-in, B verification, both workspace setups and the hosted acceptance matrix
remain pending; no real signed-in session is claimed. Native AI allowance remains
zero. Delivery/outbox, published outcomes and the wider CMS roadmap remain open.
See [the current checklist](customer-cms-status.md) and
[field-reference contract](2026-10-09-email-template-field-references.md).



Completed production deployment and authenticated agency verification on 7 October.
This checkpoint supersedes the pending-release and rollback-only statuses in the
earlier resumption ledger and customer CMS checklist.

## Current provider/source readback — 8 October, 05:38 UTC

Dashboard main is `4d2d16b0581bb3c96510d75a7d6e962000d7087d`, including
merged sign-in email PR #637, Cloudflare transport PR #639 and signup design #640. Production remains
successful deployment `8810de23-fed2-42c5-b5ca-92821c460914` from
`1ab514938f381b737c9b6e172f231dfa3c07f07b`; these later commits have not been
released to production. Customer production activation remains pending.

Current preview is successful deployment `18797d36-b78c-4102-863d-915d6a168520`,
source `11f1a912ce7364815183945aa6edda5066457c74`, at
https://preview.agency-dashboard-6cm.pages.dev/studio/signup. Its guarded build
included then-current main `2e9f18cd74564037077fcf163d57d5eff4db065f`.
This acceptance branch contains temporary signup restrictions to the two approved
mailboxes, expiring 10 October at 00:00 UTC. Do not merge its open signup gate into
production. Editor/browser/provisioning/Forms activation remains separate.

Preview sign-in email uses private Cloudflare Worker
`xeroflow-page-studio-customer-email-staging`, sender `notification@xeroflow.io`.
Cloudflare confirmed delivery to both approved recipients at approximately 02:09 UTC.
The later sign-in request for account A is not additional provider delivery evidence.
The old Resend proposal #638 is closed; no new Resend key was created.

Design PR #640 contains topic -> goals -> Create your account, 14 selectable goals,
Automotive, visible topic scrolling, and original colorful artwork. The deployed
version passed 28 focused tests, lint, guarded build, desktop/mobile browser checks,
and public QR Codes page/navigation checks. Worker raw size is 25,426,668 bytes
of 25,468,928 (42,260 spare); gzip is 7,027,734 of 9,750,000. Both original PR CI
runs passed. Head `2a46f62eb6efe60b411e680742ceb4577e9c5913` included current
email main and passed both fresh CI runs (37731553154 and 37731548667); #640 is merged.

Fresh read-only staging account evidence: A is active/email-verified with a current
session; B is pending/unverified. Both recorded terms acceptance. Neither has a
workspace or saved setup draft. The supplied mailbox identities and email consent
are complete prerequisites; normal browser sign-in/onboarding and B verification
are the next dependency. Keep addresses, sessions and sign-in links out of reports.

GitHub confirms Studio main `50d372e1cb0bc92a661379866062dbe75a4539d0` and the
clean pushed `feat/customer-form-settings-drafts` at
`6adea020968da49c9a0aa46ff7665b0872b976e9`, zero behind/29 ahead. Consolidated draft
[Studio PR #119](https://github.com/adme-dev/xeroflow-page-studio/pull/119) now
ran fresh cross-platform CI; both operating systems failed the dependency audit
before tests. The local audit reproduces nine advisories, so dependency remediation
is required before integration. It retains #110–118 and the later form/email drafts,
managed runtime/storage upgrades and private activation operator. No worker release
or customer activation follows merely from opening that draft.

The owner selected **https://xeroflowpages.com** as the main builder address on
8 October, superseding the optional `app.xeroflowpages.com` proposal. The apex is
now attached to the existing `agency-dashboard` Pages project. Chrome verified
HTTPS navigation from the apex to `/studio` and the production invited-customer
sign-in screen. Cloudflare reports domain, verification and certificate validation
all active. This domain change does not activate native signup or deploy the
new preview design. Existing invited-customer email links still use the established
`APP_URL` origin; native signup must use `PAGE_STUDIO_CUSTOMER_ORIGIN=https://xeroflowpages.com`
when its separately gated production activation is ready. Keep preview's own origin.

Cloudflare configuration and rollback record:

- Zone `dc4c0e5eba26d3509480cfef5300b0bb`, Pages domain `ec6719b6-f4b6-46d5-8ac5-f47bbcda25f9`.
- Proxied apex CNAME to `agency-dashboard-6cm.pages.dev`, record `76125a28fe8fbada2d89c14bb6cf509c`.
- Redirect ruleset `756642ee4bcd474b9f2a1bd1d195ab67`, rule `444535e4c50f4744a6caf42eb9d11d76`: only GET/HEAD on exact apex `/` returns 302 to `https://xeroflowpages.com/studio`, preserving query strings.
- No existing redirect ruleset or apex DNS record was replaced. Wildcard production and staging delivery routes and publisher routes are unchanged.
- Rollback only these newly added apex resources; do not remove or edit wildcard delivery or publisher records. No application deployment or database mutation accompanied this change.

Preserve the original Dashboard, Studio and demo workspaces. Continue in the owned
`page-studio-resume-20261007` worktree from freshly verified current main.

## Verified Page Studio release — 7 October

- Source/current main at both guarded deployments: 12d2b3226ec95cc5f635085c68c9c3dea2b17c8c.
- Integration PR #632 and RPC recovery PR #633 are merged.
- Production Pages: 8de80181-27c1-4be2-8d69-9717edc4b471, successful 09:58:06 UTC, agency-dashboard / main; https://app.xeroflow.io/agency/page-studio.
- Preview Pages: 875b42c1-d085-4303-879c-dad1beca293d, successful 10:03:37 UTC, agency-dashboard / preview; https://preview.agency-dashboard-6cm.pages.dev.
- Production renderer: xeroflow-email-rendering-production / EmailRenderer, version 6d22cd09-b76f-4cbe-bf13-49465461db04, deployment b512fe7d-59d3-4509-aae6-703c07533267. Source tag ec0c081f1fb2ecdc16af9b79b7e6f3f63adaeefb; Worker/shared renderer code is unchanged by the caller fix.
- Staging renderer retained: edfb01c1-b968-4d78-9365-99afc0843b46. Provider readback confirms the correct per-environment named bindings.
- Production build raw 25,408,936/25,468,928, 59,992 bytes spare; gzip 7,020,235/9,750,000. Preview raw 25,408,840, 60,088 spare; gzip 7,020,149. Guards/compactor unchanged.

## Verification

Full local suite: 15,626 passed, 1,939 conditional environment skips. Both recovery CI runs pass (37599408133 and 37599586213), including database coverage, artifact build, full suite and deployment guards. Targeted checks: 36 pass; fresh-checkout harness without emitted renderer: 5 pass. Lint and artifact isolation pass (2,924 Pages files / 122 renderer sources). Dashboard types still exit 2, exactly matching 931 baseline identities, zero added/removed.

Live authenticated checks on app.xeroflow.io after deployment:

- Stateless email preview HTTP 200 with expected synthetic text.
- Draft creation HTTP 200 and response contains rendered HTML. Draft dba26f37-fde1-4b95-a670-5d98479fc77c, labelled Release verification 2026-10-07 — draft only, retained unsent.
- Reloaded gallery shows the single draft; reopened composer restores its exact text; keyboard Enter activates preview successfully.
- Mobile email preview iframe width is 390px; desktop screenshot captured.
- QR Codes still shows eight codes / 35 scans and Campaigns/Competitions links.
- Page Studio portfolio retains Fantasy Limo and reference site, both active.
- Fantasy Limo Business content loads saved revision 1. Existing CMS setup/custom-collection access remains unavailable; its page, API routes and businessContent utility have no diff from the prior production source. This is navigation/read verification, not new CMS activation acceptance.
- No email was sent. No native production migration or access activation occurred.

At the 7 October checkpoint, native signup/editor/browser/preview/Forms were closed. The later controlled preview signup and account status are recorded above. Authenticated renderer browser evidence in this section is from production and does not establish native two-account acceptance.

## Rollback and cleanup

Initial candidate def3bcb5-f2dc-4644-b1a0-3dee9b136087 returned live render 503. Restored c2232396-e128-46b0-9712-19f570e3d170 from eeefcc40f5514f4444b4d1021af174b588a28a2a and confirmed rendering recovery before fixing the RPC Symbol.dispose boundary. The built Pages/real Worker regression reproduced the failure and passes after correction. See the [incident and regression](../incidents/2026-10-07-email-renderer-rpc-disposer.md).

Rollback reference remains c2232396-e128-46b0-9712-19f570e3d170; roll back Pages first and retain renderer while referenced.

Owned integration and recovery branches were removed locally/remotely after verified integration. The clean owned worktree and ignored evidence remain for the unfinished broader Page Studio goal. Original development, Studio and demo worktrees were preserved. Dashboard #603–613 heads are already ancestors of #632's merge; they are integrated historical stacks, not future release bases. Studio #110–118 remain separate pending work.

After these deployments, unrelated PR #634 (launcher animation) merged at 10:29:43 UTC as 1ab514938f381b737c9b6e172f231dfa3c07f07b. It is not part of the Page Studio artifact above. Start subsequent work from freshly fetched main; do not reuse a prior release branch or overwrite another contributor's newer release.

## Remaining activation prerequisites

The populated legacy migration follow-up from the [ownership plan](2026-09-30-customer-site-ownership.md)
is now covered by `test/server/utils/pageStudioLegacyOwnershipUpgradePostgres.test.ts`
and included in the existing PostgreSQL CI step. It constructs active and archived
legacy sites before migration 444, including saved checkpoints/versions, reviews,
builds/releases, live pointers, domains, assets, audit records and invited workspace
membership. First apply and replay must preserve every captured row. Separate checks
retain cross-scope foreign keys, deletion protection and ordinary legacy edits.
Verification on 8 October: the exact updated PostgreSQL CI step passes all **263
tests in 10 files**, including the two new populated-upgrade cases (the focused
ownership run passes 32). Focused ESLint and whitespace checks pass. Independent
full-file review found no critical or important issue; its optional note that the
client-delete assertion also meets older foreign keys is covered by the existing
isolated ownership test and the new direct-owner deletion check.

This is a disposable local database rehearsal, not a production database migration
or proof of every intervening schema migration.

Next: complete supported browser onboarding for the already-approved accounts,
including normal email verification for B, then execute the
[native two-customer hosted acceptance matrix](2026-10-02-native-forms-acceptance.md)
with fresh exact approvals and retained storage/runtime scopes. No expired
entitlement was renewed and no production customer gate was opened. Native
production activation and migrations 442–447 remain separate from the completed
application release. Close the temporary signup gate and operator after acceptance;
expiry is only a backstop.

AI template proposals, verified sender/reply-to, delivery/outbox, published outcomes
and the wider CMS roadmap remain open; the renderer extraction does not establish
capacity or acceptance for those additions.

## Controlled native acceptance refresh — 11 October

Resumed from freshly fetched current main `a78a11945f13c520d3258df9e249b99d46b21b07`
in the existing owned worktree; no additional checkout or source copy was created.
The current preview is closed and retains stale signup sender/terms settings.
The previous two-mailbox acceptance window has expired.

The temporary preview candidate restores the already-approved two-mailbox SHA-256
scope, with expiry `2026-10-12T13:27:09Z`, published terms version `2026-08-02`,
and sender `notification@xeroflow.io`. Both hashes were locally checked against
the supplied test mailboxes. Production signup and all editor/preview-creation/Forms
gates remain unchanged and closed. This temporary configuration must not be merged
into production and must be closed after acceptance; expiry is a backstop.

Only the optional acceptance guard and its regressions were reconciled from the
older branch. Current main's secure `__Host-studio_customer_session` protection
is retained. Review found an explicit-blank configuration fail-open edge: six
regressions failed before the correction. Explicit invalid provider values now
override process defaults and fail closed. Truly absent optional scope retains
the existing normal gate. Independent follow-up review approved the correction.
Focused HTTP/email/CMS/intake/deployment-boundary checks: **71 passed**; scoped ESLint
passed. Full suite: **15,843 passed /1,966 conditional skips**. Typecheck exits 2
with exactly the same 934 normalized diagnostic identities as the prior current-main
baseline, with no edited-file diagnostics. Local build passed: raw **25,459,611 /25,468,928**
(9,317 bytes spare), gzip **7,042,541 /9,750,000**. Disk guard minimum
22,829,207,552 bytes; unchanged 8 GiB stop floor. Guard implementation is isolated
in commit `568df8cb1`; temporary preview configuration is a separate commit. No preview deployment,
email send, native workspace creation, capability activation or production change
has occurred for this refresh yet.

Next: finish local checks and guarded preview release, then supported email login
and onboarding for A/B, fresh exact workspace approvals and the hosted native
acceptance matrix. Retain the successful Fantasy legacy CMS release and both
selected local development servers.

### Preview refresh released

Guarded `pnpm deploy:preview` completed successfully from clean source
`eb64756fed64df8a0365211c94111cc41abdc854`, including current main
`a78a11945f13c520d3258df9e249b99d46b21b07`. Deployment
`6532b482-5531-4d4c-8b42-09a81a4b739c` serves the preview alias. Final release
build raw 25,459,635/25,468,928 (9,293 spare), gzip 7,042,577/9,750,000.
The disk guard minimum was 22,738,579,456 bytes with unchanged 8 GiB floor.

Provider readback matches exact source and the five expected preview variable
changes only. Production deployment `7f98f789-d152-4d2d-90d7-dec3c8f24798`,
production configuration, domains, preview bindings, editor/Forms gates and empty
workspace approval list are unchanged. Both local servers return HTTP 200 after
restoring the original CMS command/environment. No GitHub push or Actions run
was required.

Fresh browser shows native signup enabled in default light mode and includes
Automotive. A normal sign-in request for A returns the generic Link requested
state. Delivery and native onboarding were pending at this release-readback
checkpoint; account A verification follows below.
The connected business mailbox contains no matching B verification message,
and B is not one of the currently signed-in Gmail accounts. No account role,
workspace or editing capability had changed at that checkpoint.

### Account A hosted onboarding verified

The authorized mailbox received the native sign-in email from
`notification@xeroflow.io`, linking to the exact preview native verification page.
Normal UI verification and three-step onboarding completed. Separate staging
workspace `4d3f12be-e2c1-49a2-95c6-abfd4385cbc7` was derived from the fresh
authenticated setup response, revision 4. It is named Page Studio acceptance A,
Automotive, Australia/Melbourne, with Receive enquiries and leads selected.
This did not move or modify Fantasy Limo's original account/site.

The native dashboard displays the saved workspace, Not published, and closed
preview admission. Both theme controls were exercised and light mode restored.
A fresh normal status refresh returns 200 for dashboard and availability; returning
to onboarding reads setup 200 and redirects to the saved dashboard. Private receipt
and light/dark screenshots contain no session cookies or sign-in tokens.

Account B verification, its separate workspace, exact staging approvals/runtime
installation and the two-account hosted acceptance matrix remain outstanding.
Production customer activation remains closed.

### Account B concrete handoff

A was signed out normally after saving its independent workspace. B's native
signup form is prepared in the retained browser tab with Technology and one
enquiry goal selected, test name and the already-approved B address filled.
The Account terms checkbox is unchecked and the email request was not submitted.
The current UI requires accepting Terms of Service and acknowledging Privacy
Policy to resend verification for a pending account; ordinary signin intentionally
withholds mail for pending accounts. Browser policy requires action-time confirmation
for that terms acceptance. Prior signup consent is retained as history, not a
substitute for the current browser confirmation step.

The connected Gmail accounts do not include B; the business mailbox's exact B
verification search returned no match. Alternate Kimi connection health succeeds
but has no mailbox tab in the checked task session. Normal B email verification
remains necessary; no session, portal cookie or authority was fabricated.
The retained screenshot shows the exact unchecked form for review. No B email was
sent during this refresh. Do not activate preview/editor/Forms capabilities until
both fresh exact account/workspace scopes and approvals are verified.

### Account B terms and verification request submitted — 11 October

The user confirmed the exact prepared Terms of Service/Privacy acknowledgment
and verification resend. The normal browser form was submitted once and reached
Link requested for B. Read-only Neon checks targeted project
`square-tooth-23821574`, non-primary staging branch `br-long-mountain-a4f73v10`,
database `neondb`. B remains pending with no identity or workspace; terms version
`2026-08-02` was accepted at `2026-10-10T20:53:04.509Z`. The fresh unconsumed
challenge expires at `2026-10-10T21:08:04.519Z` (11 October 08:08 Melbourne).
No token/hash/session was retrieved or fabricated. Cloudflare's exact-address
suppression query returned an empty list; this does not prove delivery.

The existing ADME Gmail session now requires normal Google reauthentication.
The Workspace account was selected and the browser is retained at “Use your
passkey to confirm it’s really you.” Device authentication requires the user;
it was not bypassed. Alternate Kimi is connected, but neither its session-tab
nor active-foreground lookup found a Gmail mailbox. The mailbox location/forward
for B is requested; no recipient was changed and no forwarding rule was created.

A read-only scope audit confirms A's native identity is active, workspace
`4d3f12be-e2c1-49a2-95c6-abfd4385cbc7` is active with an unrevoked owner
membership and no legacy client binding. B has no native identity, setup draft,
workspace or membership. Exact metadata is retained privately in the scope
readback receipt, without credentials.

Both owned source worktrees were verified; Dashboard origin/main remains
`a78a11945f13c520d3258df9e249b99d46b21b07`, and native Studio remains clean
at `4401438d6766baef4adde0c76741ebc30ab1781c`. No code change, deployment,
GitHub push/Actions run, production migration or capability activation accompanied
this verification step. Next: open B's received native email and complete normal
verification/onboarding; then derive its exact scope and continue staging approvals
and the two-account hosted matrix. Do not substitute database/session manipulation
for verified-mailbox ownership.

### Both real native accounts onboarded — 11 October

The mailbox question is resolved: B has its own already-signed-in Apple Mail
inbox. Google reauthentication was unnecessary for that mailbox. The received
11:53 message was found in B's Spam folder; the later 12:11 normal sign-in message
was received in its Inbox. No sender or recipient was changed. Cloudflare's
private customer-email gateway returned 202 for the first fresh request.

The earlier verification tab showed a consumed/expired-link response. Read-only
staging metadata nevertheless confirmed B had been verified; a fresh normal
signin completed successfully in the connected Chrome session (verify HTTP 200).
Browser onboarding then saved Page Studio acceptance B, Technology,
Australia/Melbourne, with enquiry goal, in independent workspace
`0122922b-2e1f-4492-988a-f85e8e8dc025`, setup revision 1. Its saved dashboard is
visible in light mode and remains Not published with preview admission closed.
No auth cookie or bearer token was copied into artifacts or reports; received
email links were used only for the normal app sign-in flow.

Fresh metadata confirms both A and B are active verified native identities with
distinct active owner workspaces and no legacy client bindings. A remains unchanged
at workspace `4d3f12be-e2c1-49a2-95c6-abfd4385cbc7`, revision 4. Both workspaces
have zero existing site-request and business-owner receipts. Original Fantasy
Limo's production site, storage and memberships are unaffected.

The native two-account signup/onboarding prerequisite is now complete. Proposed
(not applied) staging preview approvals cover only these two workspaces, supported
limousine/IT starters, one unpublished site each, 10 pages, 100 MiB storage and
traffic, 10 builds, no AI/custom domains/publication, and expiry matching the
existing acceptance window. Approver is the user's active staging staff identity.
Independent scope review approved the proposal subject to zero prior receipts
(verified) and actual staged generation-2/native recovery support (verified by the private
version-1 coordinator/executor handshake).
Editor/browser/Forms and all production gates remain closed. No new deployment
or GitHub Actions run accompanied onboarding.

Next: finish the private read-only staged support probe, then guarded preview
creation for the exact two fresh approvals, derive distinct site/storage scopes,
review/install immutable runtime bytes and CMS/Form prerequisites, and run the
remaining hosted API/browser/isolation matrix before customer production activation.

### Controlled preview-creation configuration prepared

Both proposed workspaces have zero site-request/business-owner receipts. The private
read-only coordinator/executor recovery handshake returned exactly `{version:1}`.
The pinned-Node child disposed successfully, exited 0 before deadline, and its owned
process group was contained. Independent review approved the probe after a real
local descendant-cleanup regression was fixed; normal and timeout fixtures both
leave no descendant. Remote session teardown is explicitly not proven by this result.

The preview-only configuration now contains only the reviewed two approvals array
and enables preview creation. Each has a new approval identity; no original expired
policy or entitlement was edited. Production vars and closed editor/browser/Forms
gates are preserved. Focused native dashboard/signup/deployment/TOML checks: 64
passed. No new application code was added; the full 15,843-test source verification
and matching 934-diagnostic baseline remain applicable. Guarded release is pending
at this preparation checkpoint.

### Two-workspace preview configuration released; credential blocker

Guarded `pnpm deploy:preview` passed from clean current-main-based source
`49bada09ecf69e90aa37c77239bbf66e0995825b` (main `a78a11945...`). Preview
deployment `e8b299a6-65a9-41f4-8953-d8b860b489cb` serves the alias. Final raw
25,459,883/25,468,928 (9,045 spare), gzip 7,042,759/9,750,000. Disk guard minimum
12,344,098,816 bytes, above unchanged 8 GiB floor. Owned CMS command/environment
was restored; both selected local servers return HTTP 200. No GitHub Actions push
or run was required.

Provider comparison proves only preview creation enabled and the exact two
approvals changed. Production deployment/configuration/domains and all preview
bindings are unchanged. Editor/browser/Forms gates remain closed.

B's normal dashboard showed Create preview. The action was executed once through
the authenticated UI. It retained independent draft site
`9f855643-0b79-4eae-8b7a-5b8399b1a6de`, business
`9be901e3-bbda-4f9e-a790-db177c7df333`, tenant
`studio-customer-9be901e3-bbda-4f9e-a790-db177c7df333`, IT starter, and original
request `page-studio-9f855643-0b79-4eae-8b7a-5b8399b1a6de-1`.

Coordinator readback shows generation 2, phase failed, attempts 0, error
`Cloudflare D1 request failed (401)`, and database/site/contentBinding resources
all null. This is an actual provisioning credential failure, not signup failure
or completed website preparation. Source inspection confirms the executor uses
its `PROVISIONING_API_TOKEN` for the D1 management API. No resource creation replay,
manual phase/receipt alteration, capability activation or publication occurred.

The Cloudflare connection cannot read/manage user or account token metadata
(both token-management endpoints return 9109 Unauthorized). Targeted checks of
standard owned/canonical env files found no existing provisioning credential to
restore. The secret's value was neither read nor copied. Credential recovery now
requires the user to enter a valid provisioning API token directly into Cloudflare
Worker `xeroflow-provisioning-executor-staging`, secret `PROVISIONING_API_TOKEN`,
under the already-established account. A Chrome handoff tab points to that exact
Worker's settings but requires Cloudflare sign-in. The older authenticated Safari
window became unavailable during inspection; no credential was entered.

B's dashboard is retained at Resume setup, which preserves the same site and
progress. Fix/verify the existing staging credential first, then use that supported
recovery action with fresh readback. A preview creation remains pending until the
shared provisioning credential works. Preserve this site's immutable approval and
request identities; do not renew expired policy by editing dates. Wider native
installation/API/browser/isolation acceptance and production activation are still
outstanding. Both real native account onboarding flows are complete.

### Credential recovery follow-up — 11 October 2026

On the user's request to finish autonomously, checked the existing Cloudflare
connection and recovered the signed-in Safari dashboard. The connection identifies
as `paul@adme.net.au`; the permission-groups endpoint also returns 9109 Unauthorized.
The exact staging executor still has an encrypted `PROVISIONING_API_TOKEN` binding.
Its existing value is not viewable. No token value was read or copied, and no
replacement token was created through another identity or broader credential.

Safari now displays the empty replacement field for that secret in
`xeroflow-provisioning-executor-staging`. No value was entered and neither Save
version nor Deploy was submitted. Cloudflare labels the Worker's environment
"Production", but the selected service itself is the staging executor; this is
not the customer production executor. Screenshot:
`.verification/resume-20261008/native-staging-secret-handoff-20261011.png`.

The browser-control policy requires user handoff for entering, confirming and
submitting a changed authentication credential. The API connection cannot manage
tokens, so that final credential step remains external. B's authenticated
dashboard was retained for supported recovery once the credential is restored.
No provisioning retry, customer resource creation, GitHub push, Actions run or
production deployment occurred during this follow-up. Resume by verifying the
credential repair, then recovering B's existing request before creating A's preview
and continuing the remaining native acceptance checks.

Credential handoff clarification: inspected executor API adapters and current
official Cloudflare documentation. Provisioning uses D1 management/query APIs
and Workers for Platforms script upload/read APIs. The replacement therefore
needs account D1 Edit and Workers Scripts Edit, limited to account
`a5b299b3ad15c1b5b895dc66f9357b17`; no DNS or token-management grant is requested.
Prepared a user-token template URL with only `d1:edit` and
`workers_scripts:edit`, the exact account ID and descriptive staging name.
Cloudflare documents template URLs as form prefill only, not credential creation.
The template has not been verified in the authenticated UI: Safari twice reported
an app-control interruption after fresh state inspection. No token was created,
secret entered, credential deployed or provisioning recovery attempted.

References checked 11 October 2026:
- https://developers.cloudflare.com/d1/tutorials/import-to-d1-with-rest-api/
- https://developers.cloudflare.com/api/resources/workers_for_platforms/subresources/dispatch/subresources/namespaces/subresources/scripts/methods/update/
- https://developers.cloudflare.com/fundamentals/api/how-to/account-owned-token-template/

MCP authorization follow-up: on the user's request to open permission granting,
inspected the configured `cloudflare` server and its live OAuth discovery metadata.
The configured endpoint is `https://mcp.cloudflare.com/mcp`. Its 384 advertised
scopes do not include user or account API-token management. A CLI login was
started to inspect the offered authorization request and cancelled before any
browser approval or callback. No new grant was installed. Reconnecting this OAuth
connection cannot be represented as a proven token-management fix. Opened the
documented provisioning-token template instead for the user to complete the
credential handoff, with the original two required permissions and exact account.
The connected Chrome profile requires Cloudflare sign-in. Its saved-profile
button is Continue as `paul@adme.net.au` using Google; the login page also requires
agreement to Cloudflare terms, so this step was left to the user. The tab was
brought forward and retained. Proof:
`.verification/resume-20261008/native-cloudflare-token-login-handoff-20261011.png`.

User reported sign-in done. Verified the authenticated token form, then opened
its non-mutating summary: Page Studio staging provisioning, only account D1 Edit
and Workers Scripts Edit, exact Paul account. Create Token remains unsubmitted.
Prepared a second authenticated Chrome tab at the staging executor's existing
secret editor with the Value field empty; Save version and Deploy remain
unsubmitted. Both credential tabs and B's saved dashboard are retained. No token
value was read, copied or recorded. Proof files:
`native-cloudflare-token-summary-20261011.png` and
`native-cloudflare-secret-empty-20261011.png` under the ignored verification folder.
The credential handoff is now reduced to Create Token, copy its value into the
prepared secret field, and Deploy. Provisioning recovery remains pending that save.

### Credential repaired; real preview provisioning — 11 October 2026

The user entered and deployed the replacement credential. Provider readback proves
staging executor version `0c7e766e-c188-4626-ba85-d2dfcf639a6f` at 100%, deployment
`d04d162e-5e3c-4231-83ae-87ddd93c7564`, 02:42:35 UTC. Code ETag, bindings and runtime
settings match the prior version; only deployment-source metadata differs. The
token value was not copied into any receipt or report.

B's supported recovery created D1 `66e70089-1e23-45f7-9a6c-c742b15d48e5` and Worker
`ps-content-7657cd49dce048dc8dd10dd444f979f1`, physically verified with the exact
D1 binding. Its first recovered attempt hit the five-minute metadata time budget.
After terminal readback and resource verification, one supported recovery reused
those resources; automatic continuation completed the final checkpoint at
02:59:02.393 UTC. Original site/request identities were preserved. B's normal UI
now shows Awaiting verification, with website/content preparation complete.
This is provisioning completion, not editor, Forms or publication acceptance.
Private receipt/proof: `native-b-provisioning-complete-20261011.json` and `.png`.

A signed in normally using its fresh received email in an isolated incognito
window, retaining B's original session. Create preview was submitted once for
workspace `4d3f12be-e2c1-49a2-95c6-abfd4385cbc7`. It retained business
`9294ff87-ba4f-488f-986d-2a7fa1779615`, site
`eb967d29-a734-4d66-9b06-45399ee5e3ed`, request
`page-studio-eb967d29-a734-4d66-9b06-45399ee5e3ed-1`, D1
`3ea4ed5b-0b3d-406d-98c7-966c281faec6`, and Worker
`ps-content-1fb6c35dc461401a9d73ae9b297078d0`. The first attempt stopped at
03:08:19.383 UTC with the same metadata budget error; physical resources are
verified and retained. No further creation request or manual phase edit occurred.

A bounded timing fix is being prepared locally on Native branch
`fix/staging-provisioning-budget-20261011`, based on fresh main `4401438d...`.
Only staging receives a fixed ten-minute claim; production retains five, and
authority, ownership, expiry fencing, the fifteen-minute invocation cap and
thirty-second reserve are unchanged. Tests-first failures were observed; 34
coordinator tests pass independently. Full build/typecheck/lint and 6,143 tests
pass, with four existing conditional skips. Minimum QA disk headroom was
18,650,771,456 bytes. The existing staging-only dry run passes. The native commit hook passed; source commit is
`528b8ac1c711c3b99e40d3cf646d30b84ba80fd9`. No GitHub push/Actions occurred.
Source receipt: Native `docs/verification/2026-10-11-staging-provisioning-budget.md`.

Exact A/B CMS and separate Forms runtime proposals are prepared and reviewed,
preserving both old CMS scopes/pins. Offline source validation accepts the intended
scopes and denies old Forms scopes, foreign sites and production. They have not
been applied. Native Forms requires a separate exact-artifact staging review,
R2 source/target hash verification, five supported prerequisites and explicit
private capability activation before hosted API/browser/isolation acceptance.
Original Fantasy Limo production CMS remains unchanged; both selected local
servers returned 200. Editor/browser/Forms gates remain closed.


### Staging budget released; both previews complete — 11 October 2026

Deployed only `xeroflow-provisioning-staging` at 03:32:03.730 UTC:
version `e13871e2-d63d-407e-8d3a-3b1c942a6659`, deployment
`7c0e498e-c733-420e-a588-2e98c12e6df2`, 100%, exact source `528b8ac1...`.
Bindings/settings match the reviewed baseline. Production coordinator remained
at version `23ef0df2-424c-4e26-815b-683a0e04e166`, deployment
`7044e59f-3f2b-46aa-a999-3e9de8c3ca8f`.

One supported A recovery acquired the actual ten-minute claim at 03:35:25.626 UTC
and completed at 03:42:24.548 UTC, attempts 1, error null, lease cleared. All
previously verified physical resources and request identities were retained.
Both A and B provisioning jobs are now complete. Private A readback/proof:
`native-a-provisioning-complete-20261011.json` and `.png`.

The next blocker is an implementation gap: native CMS prerequisites and adoption
require a child editor session, while editor admission requires managed CMS
readiness. No existing supported pre-CMS native producer exists. Do not fabricate
claims, sessions or receipts, or weaken editor launch. A fresh read-only review
approved a Dashboard-only setup-purpose design: persisted immutable handoff
purpose, exact `cms:prepare`/`cms:adopt` capabilities, short fixed lifetime,
current native owner/parent/approval authority, exact staging A/B scope gate,
completed provisioner proof, explicit POST issuance/recovery, and no GET minting.
Old editor JWT shape/six capabilities and checkpoint/portal behavior must remain
unchanged. Implementation, SQL integration tests, source review and staging
release are outstanding. Capability activation remains a separate later step.

The exact Forms artifact `6cb34fd939e71028567270190fb6d02c59011b2cdc1c4b0497effb3f702367f5`
(911081 bytes, compatibility 2026-08-18) received separate read-only approval
for staging artifact upload, controlled A/B installation and hosted acceptance;
not production or broad scope. Actual staging R2 readback verified existing
6f21... and 7afd... artifacts. The 6cb... object is absent and must be uploaded
then independently read back before use. Runtime proposals remain unapplied.

### Restricted native setup implemented locally — 11 October 2026

Fresh Dashboard branch `feat/native-cms-setup-20261011` starts at current main
`a78a11945f13c520d3258df9e249b99d46b21b07`; the still-needed signup guard was
reconciled as `9a0538c4f`. Temporary acceptance configuration remains separate.
The implemented Dashboard-only bridge uses genuine persisted setup handoffs,
exact `cms:prepare`/`cms:adopt` grants, a fifteen-minute maximum, strict native
cookie/origin adapters, completed coordinator observations, fresh native owner
checks and deterministic child reuse. Existing editor JWT shape/six capabilities,
four-hour maximum and editor readiness remain unchanged. Setup claims/tokens do
not leave Dashboard. GET/status cannot issue children or advance mutations.

Additive migration 448 was executed atomically against explicit non-primary Neon
branch `br-long-mountain-a4f73v10` in `square-tooth-23821574`, database `neondb`.
Its staging-only full-tuple approval table remains empty. Original preview policy
and deadline are immutable; insertion/withdrawal are audited, renewal/re-enabling
and deletion are refused. No production migration or setup approval was applied.

Fresh source review found and corrected two issues: withdrawal tombstone retention
and native access revalidation after setup availability failure. Final independent
source review has no remaining high/important findings. Genuine restricted claims
are now exercised through retained schema original/recovery callbacks and full
managed adoption/final commit fences, including approval withdrawal after awaited
storage reads. Concurrent native resume reuses one child; expiry and wrong scope
are denied. The current editor/portal behavior is covered alongside these changes.

Local full suite initially passed 16,227 tests with one mechanical route-count
failure after adding GET/POST. Corrected inventory counts are 2242 total routes,
1217 mutations; no God mode bypass is introduced. Focused inventory/HTTP checks
pass 26 tests. Final full suite passes: 2,257 files, 16,228 tests, 59 skipped files / 1,653
conditional skipped tests. Typecheck finishes with exactly the
existing 934 diagnostics, zero new/removed normalized errors. Changed-file lint
passes. Build and guarded preview release remain pending. No GitHub push/Actions.

Exact reviewed 6cb... Forms artifact was uploaded to the staging R2 content-runtime
key; independent remote readback matches SHA-256 and 911081 bytes. Controlled
runtime configuration was then applied to only the staging executor, preserving
both old CMS scopes/pins and every other binding/setting (secret inherited).
Version `f09a23d7-5419-458a-adf2-4650db6e1a75`, deployment
`4d5a3966-af6b-4cda-b478-2323944c5c83`, 04:14:39.266519 UTC, 100%.
Code ETag remains `375779008d19209f42bdf0a63d6791cd21140412701ca87ebf28cb76f08e482c`.
Only CUSTOMER_CMS_RUNTIME_CONFIG (adds A/B to two old scopes) and separate
CUSTOMER_FORM_DRAFTS_RUNTIME_CONFIG (A/B only) changed. This prepares installation;
it does not prove installed CMS, activate Forms, publish or authorize production.
Private runtime source/config/readback receipt lives in Native
`.verification/native-two-account-20261011/runtime-artifact-and-scope-release-receipt.json`.


### Restricted native setup staging release — 11 October 2026

First guarded release attempt stopped before upload: raw 25,469,338 bytes,
410 over the unchanged 25,468,928 safety budget. The duplicated adoption DTO was
consolidated into a shared client/server contract with both old export names
retained. Exact validation/strictness and authority behavior remain unchanged.
69 focused PostgreSQL/adoption/setup/HTTP checks and independent review pass.
Refactor source `c2b01db4d836dd32e420906ae375bc6769d8296e` includes current main
`a78a11945f13c520d3258df9e249b99d46b21b07` and isolated preview-only acceptance
configuration. All unmerged branch work remains owned and accounted for.

Guarded `pnpm deploy:preview` succeeds. Raw 25,468,852 / 25,468,928 (76 remaining),
gzip 7,044,688 / 9,750,000; minimum free disk 15,867,355,136 bytes, stop floor 8 GiB.
Deployment `e8138e1b-878a-4383-b8d4-2266a2497c42`, created 04:29:55.845718 UTC,
successful 04:30:06.281970 UTC, clean exact source c2b01db4..., preview alias.
Provider readback confirms stage Hyperdrive 3865..., provisioner staging, setup
flag true, editor/browser false, Forms absent/closed, notification@xeroflow.io and
unchanged signup expiry. Production is still deployment 7f98f789... / main a78... .
No push or GitHub Actions. Local CMS restored with the same guarded startup.

After successful release, inserted exactly two audited staging setup approvals
from unchanged native owner/site tuples and original preview policy, without
renewing expiry: A `4d709a17-3409-47ae-9943-8383af457a29`, B
`cb115243-0f00-4ac7-afb5-373320b414f0`, both expire 2026-10-12T13:27:09Z.
B's normal existing browser session received the setup-only child at 04:31:40 UTC
and shows the new controls. One collection start retains request
`9c2b6f32-a3c5-4593-96e6-61fddfefa5fd`, operation
`c75625a7-e0e3-44c4-b5b7-0045ddac950b`. Browser timeout did not change that identity:
readback shows the reserved active lease through 04:37:55.428 UTC. Do not blind
replay; observe supported status first. A's separate incognito setup session is
being verified. Native CMS/Forms completion remains pending these real operations.


### Real setup and short-session recovery — 11 October 2026

Both accounts received genuine setup-only sessions through their own native login:
B 04:31:40–04:46:40 UTC; A 04:34:48–04:49:48 UTC. Actual persisted purpose is
cms-setup and exact capabilities are cms:prepare/cms:adopt. Both collection
operations are installed; both workflow/content-tool operations are installed.
A retains collection operation 32ecfc94-df2e-416e-a924-00574c574e71 and workflow
799ddbc5-82b2-476f-9528-9409bbf2b0ad. B retains collection c75625a7... and workflow
e59fd2bf-c92d-43ee-927a-56e884d52809. B collection-staging operation
8aad0a21-b783-44f3-94f3-e95d4b0694a2 crossed the setup-child deadline and remains
reserved after its lease; no receipt/phase was edited and no blind replay occurred.

The supported runtime transition created separate 7afd... successor Workers:
B ps-content-83a050a94cab45ed9e71d675965eb183, A
ps-content-3a6e98581cb44f5fae2fe69974c229c6. Generation state is ready; Cloudflare
metadata independently verifies 2026-08-18 compatibility and each exact original
CONTENT_DB binding. Initial bootstrap Workers are retained unchanged. Do not
confuse the upgrade receipt's database resource name with a Worker script name.

B's GET detected child expiry and returned Resume content setup. One explicit
resume issued a fresh restricted child. Explicit collection recovery retained
its original request/operation and appended recovery 9db814b3-ef8f-43c7-ba2a-b1e5c8277d1b,
revision 1 at 04:53:22.436 UTC; collection now reads Ready. Workflow recovery is
in progress. Original intent/actor provenance and all resource identities remain.

Client-only progress improvement is reviewed/linted and committed ad81d3a99:
show Preparing, allow 300-second client waiting (backend leases/15-minute child
unchanged), keep global refresh read-only, and retain explicit same-request Resume
step after fresh status. A review caught and removed a readonly-only branch that
would strand expired operations. It is not deployed yet; hosted source remains c2b... .

Native Chrome app/window control stopped finding its window at about 04:46 UTC.
Reset/reconnect/exact app-id attempts failed; regular connected Chrome B still
works. Kimi WebBridge health is connected and its supported find-tab reaches B,
but not the private A incognito window. No new extension permissions, cookies,
credentials or identities were created to bypass this. A window access remains
pending the user's async clarification; independent B work continues.

Prepared the approved A/B-only Forms activation manifest with evidence digest
1b62e1a77f657efb76d0da46c09f3dd7a04fadec9757603c6eecd158625071e3,
recorded review time 04:10:44 UTC and original 12 October expiry. Offline operator
dry-run passes, source digest 5117a2def1acbfb159baf33e4b6e80ef154537754f8a4e98dfb983268284c57e.
No online inspection or capability activation yet; all five prerequisites and
managed adoption must still be proven. No native production or Forms flag change.


### Progress UI released; B Forms runtime ready — 11 October 2026

Progress-control release succeeds: exact clean source
6166664a6f2445db5fa30d126b6d612b027e4ba7, deployment
aff55c85-bb1b-4c89-8b08-e704d778b494, created 05:04:16.497534 UTC,
successful 05:04:26.253197 UTC. Raw 25,468,828 / 25,468,928 (100 spare),
gzip 7,044,667; unchanged guard; minimum free disk 14,347,554,816 bytes.
Local CMS is restored and /studio returns 200; native builder remains 200.
No GitHub push/Actions or production change.

B's collection-staging original operation 8aad0a21... is now installed after
explicit recovery; its actual browser shows the first three steps Ready.
One normal Form tools start retains runtime operation
d65dbbc1-3016-4604-84dd-08469fc10712; coordinator readback shows runtime ready,
lease cleared. Draft schema, managed adoption and private capability activation
remain outstanding. Session expiry correctly returns Resume content setup;
B has again explicitly resumed and is recovering installed steps, not replacing
resources or silently extending the original child/approval deadlines.

An isolated in-app browser was attempted as an additional A fallback; it is
unavailable in this environment. The connected Kimi default-session listing
has no A tab. Native app/window access is still unavailable and the user's async
window clarification has no response yet. No account impersonation or token
extraction was used as a workaround. Existing A collection/workflow installation
and its genuine prior session proof remain retained.


### 11 October: retained setup recovery after Forms runtime installation

Hosted account B installed the first four prerequisites. The final Form draft schema operation remained reserved when its fifteen-minute setup child expired; its lease ended at 05:37:18 UTC. No operation state, receipt, intent or expiry was edited manually. Account A remains at two installed prerequisites while its genuine incognito browser session cannot be reached.

A deterministic recovery defect caused warnings after the Forms successor was installed: recovery replayed the ancestor runtime executor instead of reading its retained completion. Recovery now updates authority and reads status only. Pending work still needs an explicit same-request resume. Original runtime pins, strict receipt validation, compare-and-swap recovery heads and final authority checks remain enforced.

Validation: four regression cases failed before the fix; 125 focused PostgreSQL/HTTP tests then passed. Full local suite: 16,238 tests passed across 2,257 files; 1,653 conditional tests and 59 files skipped. Changed-file lint and diff checks pass. Independent source review reported no findings. The known 934 Dashboard type diagnostics are unchanged from the preceding release baseline; no new typecheck claim is made. Staging preview release is pending; production remains unchanged. No pushes or GitHub Actions were triggered.


The recovery-fix staging release at source `e14080753` stopped before upload: raw Worker size 25,468,934 / 25,468,928 bytes (six over). Production and the preceding preview artifact remain unchanged. The repeated start-action comparison was factored into one boolean without changing behavior; all 102 PostgreSQL coordinator tests and changed-file lint passed afterward. The size limit is unchanged. Local 3045 was restored and returned HTTP 200.
