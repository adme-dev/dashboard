# Customer CMS and Studio — current checklist

Last updated: 2 October 2026. Start here after an interruption.
Resumed 7 October: [current reconciliation and next actions](2026-10-07-page-studio-resume.md).
This checklist tracks the active standalone CMS work; it does not declare the
entire platform or hosted rollout complete. Detailed decisions and acceptance:
[Form settings completion](2026-10-01-form-settings-completion.md),
[Fantasy Limo demo](2026-10-01-fantasy-limo-demo.md),
[standalone style guide](../design/standalone-cms-style-guide.md),
[Vehicle Marketplace email-builder reference](2026-10-01-email-builder-reference.md).

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

Next: two real customer test mailboxes, supported signup/approval, exact staging
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
- [ ] Execute the two-customer hosted acceptance matrix; real mailboxes pending.

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
- [ ] Plan bounded server extraction before adding backend features: current Pages
      bundle has only 6,152 bytes remaining under the unchanged safety budget.
- [ ] AI template proposals through the existing gateway/credit conventions;
      validate output and require Apply; preserve manual edits.
- [ ] Verified sender/reply-to and customer email-field selection.
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

## Resume information

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


### 7 October: approved private renderer extraction (local)

The resumed current-main integration now passes the unchanged Pages size guard
with60,678 raw bytes remaining (76,519 bytes saved). Full repository tests:
15,612 pass/1,939 environment skips. Private Worker RPC parity, failure isolation,
post-render authority checks and campaign draft-status races pass. Production
customer access remains closed; independent review and staging acceptance are
pending. [Evidence and limitations](2026-10-07-page-studio-resume.md).
