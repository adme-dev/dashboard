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
- Existing HTML import strips stylesheets/classes/conditional comments and entire
  inline styles containing image URLs. Hidden variants can become visible. It
  cannot establish faithful import of the supplied BEE/Ford/Nissan exports.
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
- [ ] Preview the actual existing import path, record losses, then preserve
  typed source semantics or safely isolated responsive HTML. Do not bypass
  sanitization through a generic template write or save a degraded import as a
  successful full-template conversion.
- [ ] Keep one saved draft per distinct user source with operation-key receipts;
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

Kimi supplied a detailed source analysis and is implementing Task 1. Grok was
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
(two existing legacy v-html warnings). Production release and same-ID draft
repair remain pending at this checkpoint. Native template milestone remains open.
