# Page Studio production release and activation checkpoint — 8 October 2026


9 October local increment: the manual saved-field picker, explicit fallback repair,
parent Undo/Redo and neutral renderer/storage compatibility negotiation are implemented.
Actual local browser QA caught and fixed authority snapshots cloning RPC methods.
Both reviewed sources remain local only; no Actions, push, deployment, paid model
call, email delivery or customer activation occurred. Coordinated renderer/router/
retained-runtime rollout and real native hosted acceptance remain required.
See [field reference design and local acceptance](2026-10-09-email-template-field-references.md).

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
