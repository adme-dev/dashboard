# FigFlow email template browser implementation plan

> Execute inline using `superpowers:executing-plans`; final independent review.

**Goal:** Browse the existing authorized email templates and starters from the
standalone FigFlow entry point and open an independent saved design draft.
**Spec:** Approved [EDM PRD](../specs/2026-10-30-figflow-edm-design.md), F06/F07,
and [beta B03](../../email-builder/figflow-beta-20261102.md). User requests this
package first on 2 November; earlier implementation/release authorization applies.
**Architecture:** A lightweight authenticated creative shell retains the existing
canvas in one frame and loads a Nuxt UI email library in another. The app reads
existing scoped template/client APIs, creates drafts with existing CRUD, and uses
the existing composer/native handoff. No cross-origin API grants or second library.

## Constraints and decisions

- Reuse the clean isolated release checkout, branch from fresh main `7a9bdeb74`.
  Preserve the original dirty checkout and shared dependencies; no install.
- Tests run at the end, per owner instruction. No customer emails or migrations.
- Canvas remains mounted while switching to templates; entering the browser does
  not replace an unsaved native document. Authentication stays at both owners.
- Library uses Nuxt UI, semantic colors, bounded scroll, labelled full-width
  controls. Existing dashboard typography; thumbnail-led gallery, clear scope and
  content-editing capability labels rather than compatibility claims.
- HTML-only templates remain visible with composer fallback, not an editable
  FigFlow action. Full HTML mapping and shared-module publication are separate.
- An explicit create-draft action copies current source without editing the
  original. On an uncertain create reply, block retry and direct to draft lookup.
- Keep current native assets/WASM; new shell does not require a Rust rebuild.
- Preserve immutable deployment targets, current live creative assets/bindings,
  Pages size limit and revision/session/origin checks.

## Tasks

- [ ] Add conservative library capability/selection helper and focused tests for
  all eleven starters, malformed source and native-linked documents.
- [ ] Add embedded email library: scoped saved templates/drafts/starters,
  search, client/category filters, previews, honest limits, independent draft flow,
  error/empty/loading states and safe uncertain-create behavior.
- [ ] Reuse composer handoff from the new draft, with a compact embedded workspace
  and an explicit return-to-library action; do not auto-copy on reload.
- [ ] Add creative shell and exact authenticated standalone-index routing while
  leaving all native files and existing EDM prefix intact. Reconcile promotion
  guard against the actual current gateway rather than its old baseline.
- [ ] Update public feature copy and contributor/beta ledger with exact limits.
- [ ] Final focused unit/component/Worker tests, lint, build/size/deploy guards,
  fresh whole-branch review, current-main reconciliation, merge/release and live
  create/open/edit/review/save/reload plus existing canvas/QR checks.

## Review focus

Out-of-scope saved IDs must fail at existing APIs; zero-editable templates must
not open blank; template originals must stay unchanged; lost create replies must
not produce blind duplicate copies; switching library/canvas must retain canvas.

## Progress

2026-11-02: inspected current library, fresh scoped APIs, native handoff, private
asset service and gateway guard. Existing route rules already make agency pages
client rendered. No tests run before implementation.

Ruling after first candidate build: reuse `/agency/email?tab=templates&workspace=figflow`
instead of adding a route. The candidate exceeded the unchanged Pages raw budget
by 1,375 bytes; another route/manifest is unnecessary for an existing library
surface. The original agency email page stays the default. Final release must
rebuild reviewed source and pass the same size guard.

The reused-route candidate reduced the overrun to 436 bytes. The existing agency
route is already client-rendered (`/agency/**: ssr:false`), so its email UI is now
explicitly ClientOnly to avoid shipping unused SSR panel code. Confirmed the
installed Nuxt tree-shake plugin removes ClientOnly default-slot server imports.
No renderer, auth, validation or budget limit is removed or weakened.
