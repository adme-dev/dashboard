# FigFlow email-template fidelity implementation plan

> Execute inline with Kimi on the isolated native mapping implementation. Parent owns all tracked inputs, source pins, reviews, final checks, CI and release. Follow the existing approved PRD; do not restart product approval. Run tests at the end of each bounded implementation, as requested.

**Goal:** Transfer a complete email design into editable FigFlow email elements,
return reviewed changes to the same canonical draft and preserve staff edits
when reopening either editor.

**Architecture:** Email-specific canonical blocks own the design and compiled
email output. Native FigFlow is an editable semantic projection, never an
arbitrary-canvas HTML exporter or flattened image. Preserve original imports,
unsupported source, responsive rules, assets and revision identity. Separate
faithful display, permitted edits, publication and email-client acceptance.

**Spec:** `../specs/2026-10-30-figflow-edm-design.md`; latest user screenshots and
Emailify reference reaffirm the full-template requirement. The previous limited
content editor and newly deployed library are insufficient for that requirement.

## Current evidence

- Live user screenshots show lost backgrounds, typography, CTA styling and entire
  menu/features/HTML/footer sections. Treat native import as failed acceptance.
- Existing native import uses default 12px text, fixed heights, 16px extra gaps,
  locked empty custom frames and fixed 240px images. Canonical styles are retained
  in JSON but not projected visually.
- The original HTML importer stripped stylesheets/classes/conditional comments
  and image-bearing styles. PR821 repaired this in the XeroFlow composer and
  restored the supplied designs in place; native FigFlow fidelity stays open.
- User supplied three distinct designs: 680px Cinco de Mayo 4x4 BEE folder,
  600px Ford October newsletter (pasted twice; one identical source), and Nissan
  summer service. Keep full original source privately; no recipient click URLs
  or payloads in repository fixtures/logs.
- The separate nested-dialog fix is merged in PR819 and deployed at Pages
  `5f983868-e194-41b3-8856-6699d0953ca4`, source
  `af8c7e4deac8cf070f093ccb3dfeffc93b86b0c6`. It does not fix template fidelity.

## Task 1 — native styled projection

- [ ] Kimi implements only expanded native `edm.rs` in the existing private temp
  source checkout. Parent regenerates/reviews tracked bridge patch and pins.
- [ ] Map EmailLayout, Container, Columns, Text/Heading, Button, Image,
  Spacer/Divider with real styles, inherited defaults, measured text and image
  proportions. No unexplained gaps or blank custom sections.
- [ ] Project menu/features/footer text honestly; required compliance stays
  protected. Unsupported HTML is visible and explicitly unsupported.
- [ ] Exact no-op canonical return; permitted content edits survive reflow;
  reject arbitrary nodes/styles/metadata. Preserve original source and all mobile
  fields. This task alone does not enable broader designer edits.

## Task 2 — supplied imports and reusable conversion

- [x] Import all referenced images/backgrounds via existing email assets, with
  content hashes, URL rewriting, bounded downloads and uncertain-write recovery.
  Never follow click or unsubscribe links to gather assets.
- [x] Preview the actual existing import path, record losses, then preserve
  typed source semantics or safely isolated responsive HTML. Do not bypass
  sanitization through a generic template write or save a degraded import as a
  successful full-template conversion.
- [x] Keep one saved draft per distinct user source with operation-key receipts;
  originals remain available for reconstruction. Report editable/conversion limits.
- [ ] Add explicit before/after conversion for known legacy HTML sections;
  preserve exact source digest/provenance and legal/merge-field content. Unknown
  HTML remains protected, never silently flattened or discarded.
- [ ] Preserve declared 600/620/680px widths, responsive stacking, image sizing,
  font substitutions, background images and meaningful inline text runs.

## Task 3 — designer edit and staff reopen contract

- [ ] Separate designer return validation from existing staff content-only guard.
  Allow only reviewed styles/structure; preserve scope, policy, lineage, unknown
  fields, immutable dependencies and protected content.
- [ ] Use canonical designer revision writer with fresh authority and CAS;
  rendered proposal review plus explicit Apply, one composer Undo action.
- [ ] Canonical state reconstructs all supported design details; native artifacts
  are required before any native-only design state is accepted. Never accept
  unpersisted freeform native changes under a content-only receipt.
- [ ] Staff edits/saves in XeroFlow survive the next native open, subsequent
  designer Apply and another staff edit/reload.

## Task 4 — verification and release

- [ ] Finish bounded implementation before focused unit/native/renderer checks.
  Review modified files, validate patch/pin reproducibility, Linux CI native tests
  and matching browser-package receipt; no speculative local Rust builds.
- [ ] New immutable native package prefix; retain previous package for rollback.
- [ ] Hosted actual-WASM test on the user's complete templates: desktop and 390px,
  nonblank sections, expected geometry/styles/assets, edit/review/Apply/reload,
  staff edit and second native reopen. Compare against canonical preview.
- [ ] Apple Mail/Gmail/Outlook matrix separately; browser previews do not certify
  those clients. No real customer email sends.
- [ ] Release current main only, exact source/deployment IDs and per-host rollback;
  coordinate Dashboard Pages with the Page Studio release owner. Parent owns
  Dashboard release, other owner retains Page Studio/Management operations.

## Assistance

Kimi supplied a source analysis and prepared Task 1 in the isolated temporary
`edm.rs`. That increment has not been compiled, promoted to the tracked patch,
released as a new browser package or accepted in actual WASM. It is not complete. Grok was
attempted through Orca and then its actual CLI; CLI failed with HTTP402 usage
balance exhausted. No Grok output is claimed. Parent continues independent work.

## Import repair implementation detail (user Ford failure, 14:21)

Full HTML exports use a separate document mode. Parse/sanitize HTML and CSS with
bounded parser ASTs; retain safe class hooks, media rules, font faces, background
images, hidden variants and token-sanitized Outlook conditional fragments. Keep
the existing conservative fragment importer unchanged. Do not pass untrusted
styles to the application DOM: a scriptless same-origin frame exposes only
parent-owned selection/resize handlers and blocks clicks, forms and connections.

The private renderer returns that complete document directly when it is the
single imported email root; do not nest it inside a second 600px wrapper. Preserve
full document/head/body during granular staff text/image/link edits. Use the
original three sources and existing saved draft IDs for repair, not more copies.

Parent adds a direct pinned PostCSS dependency already present in the dependency
graph. Keep lockfile drift out. New tests exercise the full-document mode,
fragment isolation invariants, hidden variant retention, parser bounds and unsafe
CSS/HTML/conditional rejection; implementation precedes final checks. The broader
native-template milestone stays open.

## HTML repair checkpoint

The three private originals now compile in isolated complete-document mode.
Browser comparison at desktop (600/680px) and 390px matches original document
width, body height, visible image count and headings for all three. No broken
images. Ford has one charging image, one Power Promise and one Unsubscribe per
viewport. Actual component click/type/Tab editing retains the full head, all ten
source style blocks and 49 Outlook conditionals; selection does not reload the
frame. Kimi follow-up found no scoped source blocker. Focused import/editor/
private-renderer tests: 95 passing; Worker TypeScript and focused lint pass
(two existing legacy v-html warnings). Production release and all three same-ID repairs are now confirmed in
`../../email-builder/html-import-repair-20261102.md`. Native template milestone
remains open.

## Owner clarification — Emailify-style authoring, 2 November

The owner explicitly confirmed that the Emailify component-based authoring flow
is part of this implementation. The full editor milestone remains open until:

- [ ] A designer creates an email in FigFlow from a complete template or shared
  email modules, with faithful canvas rendering of supported sections.
- [ ] The designer adds, reorders, duplicates and removes permitted sections, and
  edits typography, colours, imagery, spacing, buttons and column structure.
- [ ] Desktop/mobile preview uses compiled canonical output and exposes responsive
  stacking, spacing and image behaviour before the design is returned.
- [ ] The designer saves a template or selected reusable section to the existing
  scoped XeroFlow libraries with explicit revision/publish identity.
- [ ] Returning changes requires rendered review and Apply to the same current
  draft; a staff edit/save then a second FigFlow reopen preserves all changes.
- [ ] Sendable output, media delivery and real-client evidence pass their own
  gates; neither a working canvas nor a browser preview establishes completion.

This expands no third-party dependency or licensing commitment. Emailify is the
interaction reference; FigFlow owns its implementation and the existing private
email renderer owns compilation. Unknown arbitrary HTML remains preserved and
requires an explicit reversible conversion before native-layer editing.

References reviewed 2 November 2026: [Emailify overview](https://www.hypermatic.com/emailify/),
[component workflow](https://www.hypermatic.com/emailify/email-component-library/),
[responsive preview](https://www.hypermatic.com/emailify/responsive-email-preview/),
and [email HTML export](https://www.hypermatic.com/emailify/figma-to-html-email/).
This acceptance sequence reflects the owner's approved PRD rather than a claim
that Emailify's Figma plugin runs inside FigFlow.

## Remaining original-owner bridges — 08a / 08b

The original PRD journeys remain in scope after the bounded local core3/3 gate.
Implement through existing owners in this order; no second library, campaign
draft store, sender or finance/workflow engine.

1. **Native workspace library (08a):** reuse the Nuxt library/image panels beside
   the canvas. Add one exact read-only native context action, bound to current
   mode/origin/channel/native document/revision, returning mapped selected blocks
   and insertion target. Capture operations without a generic native command.
   Cancelled reads do not save. Before any library mutation, existing design
   edits go through durable propose, compiled desktop/mobile review and explicit
   Apply; no automatic save/publish or active-handoff guard bypass. After exact
   canonical receipt/readback, reopen the same owner at its new saved head.
2. **Registered imagery (08a):** retain existing scoped upload/publication and
   image insert. Add only strict replace-published-image to the existing command
   family, taking asset ID/block ID/head/operation ID. Server derives actual
   bytes/hash/MIME/dimensions/delivery URL and preserves IDs/alt/link/layout/locks
   and referenced assets. No URL/descriptor/base64 authority or Rust catalog fetch.
3. **Owner-aware writer (08b):** migration491 already has a unique campaign_id
   document slot. Generalize current template-only owner reads/projections and
   immutable writer, not hidden template copies or new campaign-draft tables.
   Use existing lock order/CAS/fresh authority/operation receipts; canonical head
   and campaign projection commit together. Additive498 is proposed, after a
   fresh collision check;497 stays reserved for independent M06.
4. **Exact template selection (08b):** existing campaign creation uses an exact
   authorized published template revision with complete pins, metadata and scope.
   One atomic existing-owner operation creates the campaign and initial canonical
   revision; lost reply returns that same campaign. Existing REST/MCP edits use
   the same writer for opted-in campaigns. Preserve existing MCP hash semantics
   alongside canonical UUID revisions. Legacy campaigns and frozen send snapshots
   are untouched; send preparation must not silently rewrite canonical HTML.
5. **Campaign-owned handoff (08b):** owner-discriminated start/lookup with stored
   owner validation; native admission adds campaign-draft while preserving kind.
   Campaign controls appear only with trusted availability. Save staff edits,
   open the exact campaign head, review/Apply, reload, staff edit and reopen twice.
   Keep current, restart or explicitly create a new campaign from a retained
   proposal; no implicit copy, forced overwrite or recipient/status/approval clone.

Required local vertical checks include actual selected-section publish/insert
 twice/update conflict/cancel/detach; verified image replacement; native nested
column0 and stale/revoked/unknown-write cases; two independent campaigns fromR1
remaining pinned after template/module heads advance; and real campaign-kind
native structural/staff round trips. Matching Linux/package/WASM and later hosted
checks are separate. No unexecuted test or seeded pin closes these user journeys.

M06 reviewed corrections are integrated, configured497 is verified/applied, and
the web-version picker/final-delivery checks are pushed in956330e9b. Full CI,
hosted review/send acceptance and public documentation remain open; flag stays off.
Opaque native-artifact staging, known HTML conversion, full-template tolerances,
real email clients and AM/job/brief/budget research retain their recorded gates.

### Campaign integration obligations from independent foundation review (3 November)

Before any campaign opts into the canonical projection, slice4 must audit both `prepareCampaignHtmlForSend`/`preparedCampaignHtml` and the M06 `review.ts` submit preparation write. An opted-in campaign must retain its saved canonical HTML and registered assets; mirroring cannot issue an HTML-only UPDATE behind the revision owner. Return a readiness issue for assets needing canonical correction, and map `email_design_campaign_revision_required` to a readable conflict instead of500. Legacy preparation stays with its existing owner. Snapshot plus first conversion must share the caller's transaction, so non-content touches cannot strand an immutable baseline. No separate preparation, review or sender engine is introduced.

Migration498's campaign triggers must use relevant-column and row-change guards so counter/webhook/status-only commits do not run full HTML hash checks. Retain initial pointer validation and document deferred consistency. Independent497/498 coexistence passed8 real-PG cases; the trigger-cost correction and preparation-path integration remain separate acceptance items.
