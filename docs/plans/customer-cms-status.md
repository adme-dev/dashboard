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
- [x] Durable local demo files, database/media copies, backup and restart instructions.
- [x] Relevant marketing descriptions updated with explicit local-preview limits.

## Current checkpoint / next action

Website template drafts are implemented, locally verified and committed. Both
implementation branches are pushed; no hosted rollout has happened.

Next concrete slice: simplify the editor using the Vehicle Marketplace reference
(compact block palette and safe debounced preview), then **explicit per-form
template overrides** with an effective website-default preview and reset action.
Preserve shared form identity so a form used on several pages is configured only
once. Customer media blocks and AI proposals follow; AI requires explicit Apply
and preserves manual edits.

## Remaining form and email work

- [x] Website team/customer template defaults (draft only).
- [ ] Vehicle Marketplace-inspired compact block palette and debounced safe preview.
- [ ] Explicit per-form template overrides and reset to website default.
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
  Branch `feat/standalone-site-workspace`; last implementation `f08d9adfe`.
- Studio: `/Users/paulgiurin/Documents/Projects/customer-cms-studio`
  (`dashboard/.worktrees/studio-customer-forms` is a symlink).
  Branch `feat/customer-form-settings-drafts`; last implementation `ebe2413`.
- Both feature branches are pushed. Fetch and check divergence before continuing;
  do not implement in the unrelated dirty Dashboard root or deploy a stale branch.
- Demo: `/Users/paulgiurin/Documents/Projects/customer-cms-demo/README.md`.
  Restart with that directory's `start.sh`; do not start a second server on port 3044.
- URL: `http://127.0.0.1:3044/studio/sites/c34f6347-cc63-4ed7-9a5a-da165ebefed2`.
- Latest local backup: `customer-cms-demo/private/backups/2026-10-01T05-53-20.749Z/`.
  Preserve the private directory and media; do not commit credentials or copied data.
- Recipient sample revision 4: `office@example.test`, with Contact override
  `contact@example.test`. These are inert demo addresses, not approved recipients.
- Template samples: team revision 2; customer revision 2 after the conflict check.
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
schema activation, published outcomes, per-form template overrides, AI design and
email delivery remain pending. The website template draft editor is locally complete.
Unsaved in-app navigation is protected; hard browser refresh/close still discards
unsaved edits, and the UI asks the user to save first.

## Update rule

At each completed slice, tick only verified work, record the implementation
commits and acceptance evidence, and name the next concrete step. Before stopping
mid-slice, replace the In progress note with exact partial changes and blockers.
