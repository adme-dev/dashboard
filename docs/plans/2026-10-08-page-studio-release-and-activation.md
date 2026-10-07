# Page Studio production release and activation checkpoint — 8 October 2026

Completed production deployment and authenticated agency verification on 7 October.
This checkpoint supersedes the pending-release and rollback-only statuses in the
earlier resumption ledger and customer CMS checklist.

## Current provider/source readback — 8 October

Fresh Dashboard fetch reports main `1ab514938f381b737c9b6e172f231dfa3c07f07b`.
Cloudflare reports successful canonical production deployment
`8810de23-fed2-42c5-b5ca-92821c460914`, created 7 October at 10:41:38 UTC,
from that exact clean source. This subsequent launcher release includes the Page
Studio integration and renderer recovery below; do not replace it with the older
Page Studio artifact. Its successful provider status is not a new browser acceptance run.

Production still binds `EMAIL_RENDERER` to `xeroflow-email-rendering-production`
with entrypoint `EmailRenderer`; preview binds the staging service. Preview native
browser/editor/signup/preview flags remain false. Those flags are absent in production
and default closed. No configuration was changed during this readback.

Fresh Studio fetch confirms the clean pushed `feat/customer-form-settings-drafts`
branch at `6adea020968da49c9a0aa46ff7665b0872b976e9`: zero commits behind, 29 ahead
of main `50d372e1cb0bc92a661379866062dbe75a4539d0`. Preserve that pending work and
the original Dashboard and demo workspaces. New Dashboard verification work starts
from freshly fetched main on `test/page-studio-legacy-upgrade-20261008` in the owned
`page-studio-resume-20261007` worktree.

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

Native signup/editor/browser/preview/Forms stay unavailable by default in production. Preview browser/editor/signup/preview flags read back false, approvals []. Hosted native two-account acceptance still needs real approved identities and supported onboarding. Separate preview login remains pending; authenticated renderer browser evidence is from production.

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

Next: supply two real user-controlled mailbox identities and authorize their signup
messages, complete supported onboarding and legal/email verification, then execute
the [native two-customer hosted acceptance matrix](2026-10-02-native-forms-acceptance.md)
with fresh exact approvals and retained storage/runtime scopes. No mailbox was
inferred, email sent, expired approval renewed or customer gate enabled. Preview
agency sign-in also remains pending. Native production activation and migrations
442–447 remain separate from the already-completed application release.

AI template proposals, verified sender/reply-to, delivery/outbox, published outcomes
and the wider CMS roadmap remain open; the renderer extraction does not establish
capacity or acceptance for those additions.
