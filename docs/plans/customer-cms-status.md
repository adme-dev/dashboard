# Customer CMS and Studio — current checklist

Last updated: 10 October 2026. Start here after an interruption.
Current: [completed release and remaining activation](2026-10-08-page-studio-release-and-activation.md).
Earlier evidence: [7 October reconciliation](2026-10-07-page-studio-resume.md).
This checklist tracks the active standalone CMS work; it does not declare the
entire platform or hosted rollout complete. Detailed decisions and acceptance:
[Form settings completion](2026-10-01-form-settings-completion.md),
[Fantasy Limo demo](2026-10-01-fantasy-limo-demo.md),
[standalone style guide](../design/standalone-cms-style-guide.md),
[Vehicle Marketplace email-builder reference](2026-10-01-email-builder-reference.md).


## Running ledger — 9 October 2026

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
One fresh production request was made after the sender deployment, with the
15-minute request confirmation verified in the browser. That link has now expired.
Mailbox delivery and the independent CMS → saved editor journey still await the user's normal sign-in. The staging
agency login completed by the user is separate evidence. Do not silently convert
this account to a native customer or duplicate its site ownership.

### Production receipts

- Dashboard PR649 merged to current main `c752cefc18c828b8c20b8cef4726f11fd7a582f9`.
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
`/Users/paulgiurin/Documents/Projects/page-studio-resume-20261007` (owned fix
branch `fix/studio-assigned-account-login-20261010`) and native Studio checkout
`/private/tmp/page-studio-native-integration-20261008`. Their application source
includes the released main commits above; this documentation update does not
change the deployed artifacts. The unrelated dirty Dashboard root is preserved.

### Disk recovery and current local state

Our Docker packaging and heavy Nuxt builds contributed to disk pressure, including
an ENOSPC failure. Only reinstallable dependencies from three inactive, clean,
ancestry-merged DriveAgent release copies and exact owned private Docker cache
records were removed. No source worktree, customer database, media or Git history
was deleted. Failed local image removal is not counted as successful cleanup.

After verified production upload, this owned Dashboard checkout's ignored `dist`
and `.nuxt` output was removed (about 283 MB allocated). Release logs and hash receipts
remain. Docker and CMS 3045 remain stopped to reduce pressure; restore the selected
local CMS with its existing isolated start script and 16 GB heap when local work
resumes. Its database and configuration are preserved. A further continuation removed only
dependencies from four clean, merged, inactive Dashboard/Studio copies and pruned unreferenced pnpm cache entries. The store shrank
from 9.2 GB to 5.5 GB; host free space reached about 8.9 GiB on 9 October. Local editor 4325 still
responds normally. Latest capacity and remaining large folders are recorded in the [storage audit](../audits/2026-10-09-projects-storage-and-merge-audit.md).

### 10 October verification and capacity checkpoint

Fresh fetch still shows Dashboard main `c752cefc18c828b8c20b8cef4726f11fd7a582f9`.
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
These are local verification receipts; PR/CI/production release still follow.

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

### Remaining work

| Work | Current status |
|---|---|
| Invited standalone Fantasy CMS access | Access foundations released; wrong-profile selector fix locally verified, release and correct-profile CMS → editor acceptance pending |
| Editor light/dark, layouts, history, thumbnails, overview and collapsed toolbar | Released; actual saved Fantasy editor and staging controls verified |
| Saved email field picker, fallback repair and Undo/Redo | Released; local integration/store/private renderer verified, hosted customer acceptance pending |
| Magic-link sender correction | Released; matching production gateway invocation returned 202 Accepted, received From address and mailbox access pending |
| AI email proposals | Local implementation/review complete; hosted enablement pending, native preview allowance remains zero |
| Two native accounts and hosted Forms | Pending verification/workspace setup and separately approved runtime activation; Forms flags remain unset |
| Sender/outbox/outcomes and wider CMS launch | Pending hosted roles, saves/conflicts, collections, domains, analytics/SEO and delivery acceptance |

This remains the primary ledger. **The full platform launch is open.** Existing
invited access is separate from native customer activation. The assigned-profile
fix requires its reviewed PR, required CI and guarded current-main release. Fetch current main before merge and deployment. Keep mailbox/browser
acceptance separate from source and provider release evidence.

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
- [ ] Managed hosted schema/runtime upgrades and safe adoption rollout.

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
