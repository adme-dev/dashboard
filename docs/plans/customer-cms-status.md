# Customer CMS and Studio — current checklist

Last updated: 1 October 2026. Start here after an interruption.
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

Website template drafts are implemented, locally verified and committed. Both
implementation branches are pushed; no hosted rollout has happened.

Next concrete slice: **customer-owned logo/image blocks** in templates, using
scoped site media and safe previews. Per-form template overrides and reset are
implemented and verified locally. The compact block palette, safe live
preview, design looks and business header/footer are now locally verified.
Preserve shared form identity so a form used on several pages is configured only
once. Customer media blocks and AI proposals follow; AI requires explicit Apply
and preserves manual edits.

## Remaining form and email work

- [x] Website team/customer template defaults (draft only).
- [x] Vehicle Marketplace-inspired compact block palette and debounced safe preview.
- [x] Explicit per-form template overrides and reset to website default.
- [ ] Explicit cleanup for overrides whose shared form was removed; preserve them
      until the customer reviews them.
- [x] Structured template editing, subject/preheader, brand styling and
      desktop/mobile preview.
- [ ] Stored template revision-history/restore UI (session undo/redo is complete).
- [ ] Customer-owned media/image blocks in templates; previews must remain safe.
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
  Branch `feat/standalone-site-workspace`; last implementation `737a7a025`.
- Studio: `/Users/paulgiurin/Documents/Projects/customer-cms-studio`
  (`dashboard/.worktrees/studio-customer-forms` is a symlink).
  Branch `feat/customer-form-settings-drafts`; last implementation `6987586`.
- Both feature branches are pushed. Fetch and check divergence before continuing;
  do not implement in the unrelated dirty Dashboard root or deploy a stale branch.
- Demo: `/Users/paulgiurin/Documents/Projects/customer-cms-demo/README.md`.
  Restart with that directory's `start.sh`; do not start a second server on port 3044.
- URL: `http://127.0.0.1:3044/studio/sites/c34f6347-cc63-4ed7-9a5a-da165ebefed2`.
- Latest local backup: `customer-cms-demo/private/backups/2026-10-01T06-50-40.120Z/`.
  Preserve the private directory and media; do not commit credentials or copied data.
- Recipient sample revision 4: `office@example.test`, with Contact override
  `contact@example.test`. These are inert demo addresses, not approved recipients.
- Template samples: team revision 2; customer revision 12 with a Booking enquiry override for five pages;
  website design/contact details remain unchanged and explicitly fictional.
  Evidence: `customer-cms-demo/check-templates.mjs` and
  `customer-cms-demo/fantasy-limo-email-templates.png`.

## Verification and boundaries

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
