# FigFlow email template browser

Status, 2 November 2026: implementation and focused checks complete; revised
production build and hosted acceptance pending. This is the template-browser
portion of beta B03/F06/F07, not shared-module publication or full HTML mapping.

## Workflow

The standalone FigFlow entry has Canvas and Email templates navigation. Switching
views keeps the original canvas frame mounted. The email view loads the existing
authenticated app at `/agency/email?tab=templates&workspace=figflow`; there is no
new cross-origin data API or separate template database.

The browser lists authorized saved templates/drafts and the eleven starters.
Search, client/category filters and previews reuse existing template data and
components. Content-editing labels describe source capabilities, not permissions,
email-client acceptance or send readiness. HTML-only designs offer a composer copy.

Use in FigFlow asks for a name and authorized destination, reads the source again,
then creates an independent saved draft through existing template CRUD. The
confirmed draft ID opens the existing composer/native handoff. An uncertain
create blocks blind retries and points to Drafts. Existing drafts can be reopened
without copying. No library original or campaign is overwritten.

Native edits still require Return for review and explicit Apply. Staff can
continue editing in the composer. Returning to the library prompts Save, Discard
or Stay for unsaved edits; pending actions require reconciliation. Content-only
Apply keeps unsaved metadata dirty. Save-and-return does not issue a competing
route replacement that could cancel the pending navigation.

## Admission and boundaries

New handoffs with no editable fields return `NO_EDITABLE_CONTENT` within the
existing transaction. Initialization/conversion rolls back, retaining owner
source/HTML. Historical sessions remain readable/cancellable; old zero-field
sessions show composer guidance instead of a blank native frame.

The private asset service serves only the existing EDM package and an exact
standalone-index navigation shell. The creative gateway still authorizes before
both routes. `?canvas=1` serves the original standalone package through the existing
authenticated path. All native JS/WASM bytes remain unchanged. Shell policy permits
only the fixed app/native frames; it carries no credentials or write authority.
Current live source/runtime/bindings are pinned by the reconciled promotion guard.

## Verification

- Initial focused browser/helper/flow checks passed 25 tests; review added dirty
  navigation and historical-session checks. Final counts will be recorded with
  the production receipt, not inferred from overlapping runs.
- Real isolated PostgreSQL revision/transaction checks: 61 passed, including
  zero-field legacy initialization rollback and unchanged structured head.
- Native asset/shell tests: three passed. Preparation/gateway guard tests: six
  passed. Private admission checks passed; target guards retain existing values.
- Independent source review found and resolved return-navigation/metadata issues.
  Targeted lint passes. No customer email or production migration was performed.
- First candidate on `7a9bdeb74` exceeded the unchanged Pages raw budget by 1,375
  bytes. Reused the existing email route instead; a revised build is pending.
- Source guard detected incoming Banner Studio main `44c86f832` and refused stale
  release. Reconcile that base before production; earlier candidate artifacts
  cannot be deployed as current-source proof.

## Remaining product work

HTML/Postcards/OEM editable mapping (B02), reusable module browser/publication,
390px navigation triage (B04), and the Apple Mail/Gmail/Outlook matrix (B05/F10)
remain open. Seeing a template in the browser does not make every layer editable.
The [original beta](figflow-beta-20261102.md) remains the historical failure record.
