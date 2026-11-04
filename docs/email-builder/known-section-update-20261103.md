# Known generated sections → FigFlow layers, zero-gap columns, and the E04 R1 receipt repair (3 November)

Status: **local source only, uncommitted.** Independent review (3 Nov) approved the zero-gap repair (B) and the E04 R1 repair as scoped source repairs. It requested changes to the known-section update (A: 2 P1, 1 P2). Those were repaired in [section 4](#4-review-round-a-repairs). The re-review (R2) closed the lock and literal-text cases and requested 1 P1 + 1 P2; those were repaired in [section 5](#5-r2-review-repairs). R3 closed the async item. The independent architecture assessment then chose the conservative **A0 conversion boundary** ([section 6](#6-a0-conversion-boundary-for-carried-links)), which replaces section 5's URL guard. **A0 is source-approved** by independent review (Kimi, 3 Nov, 0 P0/P1/P2, report `.verification/kimi-known-section-a0-independent-review-20261103.md`, sha256 `63d6ed3d…`) against freeze `00d1afcb…`, which is archived read-only at `.verification/opus-known-section-a0-20261103/frozen-00d1afcb`. Source approval is not runtime, WASM/Undo, router, hosted or owner acceptance. Nothing here is merged, deployed, published or accepted in a hosted environment. No campaign completion is claimed.

Owner: Opus (implementation). Review: independent reviewer via the parent. Queue items: [13 (E04) and 15 (E02/E03)](figflow-current-task-list.md). PRD rows E02, E03, E04 and E05 are in the [checklist](figflow-edm-prd-checklist.md).

## 1. Reviewed update for saved copies that still hold the split CTA as HTML (b-ii)

New starters already build the split call-to-action as structured Columns (Image | Heading, Text, Button). Drafts saved before that change still carry the section as an `Html` block, which FigFlow shows as a protected placeholder. This change lets a designer explicitly convert those sections.

**What happens:**

- The composer shows an alert only for a structured, template-owned (not campaign) draft that has designer access, and only when the saved draft contains at least one exactly recognised section. The alert reads: "Any unsaved composer changes are saved first; the section update itself is only saved when you apply it, and Undo reverts it."
- **Review section update** saves any unsaved composer changes first. If that save fails, it stops. It then checks that the saved projection is current. Next it opens the existing designer handoff on that exact head revision and proposes `{op:'adopt-known-section', blockId}` for each recognised block.
- The proposal is a preview. Nothing is written until the designer chooses Apply in the existing review panel. Apply is one canonical revision through `saveDesignerTemplateDesignDraft`, which uses CAS against the handoff base, replays the operations through `assertDesignerOperationsResult`, and writes receipts. Undo is the existing composer undo.
- Nothing is rewritten on open, load or save.

**Recognition is not authority.** `recogniseKnownSection` (`shared/emailRendering/designKnownSections.ts`) parses the values and then re-runs `oemSplit` with them. The section is recognised only when the regenerated HTML is byte-identical to the stored HTML. The block must also have no data other than `props.contents` and zero padding. The `data-edm-layout` marker on its own is never enough. Generator-parameter text (title, copy, button label) is carried as authored, but only when it reads identically as literal text and as HTML (see section 4). Any other edit makes the section unknown, so it stays untouched. The server re-derives recognition from the persisted base revision. The client's list is only a hint.

**Server operation** (`shared/emailRendering/designDesigner.ts`, `adopt-known-section`):

- **Refused:**
  - the root block and unrecognised blocks;
  - any explicit or inherited block/style lock, via the shared `designStructureLocked` rule (since section 4);
  - module-linked blocks and any block under a locked parent;
  - carried links that fail the designer `safeLink` rule (since section 4), or whose image URL or button path contains any `&` (A0, since section 6; this replaced section 5's reference-name guard).
- **In-place replacement:** the block is replaced where it sits in its own parent list (top level, a Container, or a column). New block ids are `designerBlockId(operationId, operationIndex, k)`. Content grants and lineage are created only for content fields that are present. The Html block's lineage and grants are removed.
- **Not a native operation:** it is deliberately absent from `designerCapabilities().operations`. Native FigFlow cannot issue it.

### Tests

The tests run the real handoff, canonical writer and renderer (`test/unit/emailDesignDesignerPersistence.test.ts`, *known generated sections through the designer review/Apply owner*, 6 tests). They cover:

| Required case | Test evidence |
|---|---|
| Review writes nothing; Apply writes one revision | `revisionCount` stays 0 after propose and is 1 after Apply; the Html block stays until Apply |
| Carried edited text | Originally `Book <today> & save`, which the review showed rendered as markup. Now literal-safe values (`Spring "drive" event & more`, `Book today & save – 50% off "now"`) are carried, and their visible leaf text is asserted equal in the old Html, the preview and the saved HTML (section 4) |
| Nested-container replacement | A section inside a `Container` is replaced inside that Container, not moved up a level |
| Deterministic ids and replay | Ids equal `designerBlockId(op, index, k)`; an independent harness replaying the same operation produces an identical saved design |
| Dangling lineage and grants | None remain for replaced blocks; 10 new lineage entries are created; untouched blocks, grants and lineage are byte-equal |
| Idempotency | An identical propose replays to the same proposal revision; a different payload under the same operation id gives `IDEMPOTENCY_CONFLICT`; a repeated Apply returns `applied` with one revision |
| Exact base CAS | A staff edit between open and propose gives `REVISION_CONFLICT`, with no proposal. A section edit between review and Apply gives `REVISION_CONFLICT`, and the newer edit stands |
| Recognition changes | Edited HTML (a one-character style change), extra block data (`hideOnMobile`), non-Html blocks and the root are all refused with `EDIT_FORBIDDEN` and no write |
| Module and parent locks | Explicit block lock, style-field lock, locked parent Container and module-linked parent are each refused (four separately labelled variants) |
| Fresh authority | Demoted to staff before propose gives `DESIGNER_REQUIRED`; access revoked before Apply is refused, with no write |

The builder wiring is tested separately (`test/unit/emailKnownSectionReview.test.ts`, 5 tests; it executes the real component source slice). It covers:

- Offered only for unmodified sections, never on campaigns, never without designer access.
- Opens on the exact saved head and proposes only the recognised ids.
- Saves first, then opens. A failed save stops the flow.
- A stale projection after save stops the flow.
- A composer change during open stops the flow before propose. Edits are kept and no baseline is set.
- The disclosure text is present.

**Mutation checks** (each was reverted; source hashes restored and verified):

- Dropping the parent-lock, module-link or explicit-lock checks fails the lock test.
- Keeping the Html lineage fails four flow tests with `INVALID_DESIGN`.
- Removing the snapshot check, save-first or projection check in the builder fails the matching wiring test.
- Removing the Html grants is not observable, because composer drafts never grant Html fields. The removal is defensive only.

Earlier evidence for the converted Electric Drive document in the CI edm2 package is in `.verification/opus-known-section-20261103/` (native screenshots, recognition probe).

## 2. Columns gap: explicit 0 is honoured (starter review P2)

Before the fix, both email outputs used `(props.columnsGap as number) || 16`, so the structured split CTA's declared `columnsGap: 0` rendered as 8px cell padding. The composer canvas and native both use `?? 16`. The renderer now uses `columnsGapOf(value)` in both the HTML and MJML paths: a finite non-negative number is used as given, and a missing or invalid value gives 16.

- `test/unit/emailColumnsGap.test.ts` (5 tests) covers:
  - gap 0, 24 and missing, in both HTML and MJML;
  - the fallback table (`0, 7, undefined, null, NaN, -4, '20'` → `0, 7, 16, 16, 16, 16, 16`);
  - the reviewer's exact Electric CTA target.

  Against the pre-fix renderer it fails 3 of 5 (`gap-before-fix.log`).
- One existing assertion pinned the old behaviour. *caps full-width VML inside a narrow declared column* set `columnsGap: 0` but expected the 36px that only a 16px gap produces. It now expects 52px for gap 0 and still 36px for gap 16. The pre-edit file is archived as `emailRenderingQuality.test.ts.before`.

## 3. E04 R1: rootless body no longer drops the import receipt

`updateTemplate` now refuses a `body_source` that cannot carry the stored receipt: no object `root`, or a non-object `root.data` or `root.data.props`. It throws `TemplateSourceShapeError` (400 `invalid_template_source`) when a receipt is stored. Templates without a receipt are unaffected.

- Before/after probe: `.verification/opus-imported-conversion-repair3-20261103/receipt-before-after.json`.
- Real-PG test: 2/2, log in the same directory.
- Route boundary: `test/unit/emailDesignLegacyRoutes.test.ts` checks that the PATCH handler's thrown `TemplateSourceShapeError` becomes h3 `400 invalid_template_source`.

## 4. Review round A repairs

The independent review (`.verification/opus-known-section-gap-independent-review-20261103.md`) requested changes: 0 P0 / 2 P1 / 1 P2. Each repair below was preceded by a failing regression. The red logs are in `.verification/opus-known-section-r2-20261103/`.

**P1-1: inherited style locks were bypassed.**
- Adoption now uses the shared `designStructureLocked(design, blockId, true)` rule. This is the same predicate that structural insertion and library boundaries use. It covers explicit block/style locks on the section or any ancestor, including `root.*` and container style fields.
- The existing parent `ownLocked` check and the module-link check are unchanged.
- The builder hint uses the same rule, so it no longer offers sections the server would refuse. The server remains the authority.
- Owner regression: root props, container style and root style locks are each refused through the real proposal owner, with revisions, source and handoff state unchanged (no proposal payload).

**P1-2: literal copy became markup or entities.**
- Text layers render rich HTML, and native FigFlow shows Text/Heading containing tags or entities as non-text. Rather than change the Text renderer, recognition now fails closed. A section is recognised only when its title, copy and button label contain no `<` or `>` and no `&` followed by `#` or an alphanumeric (an HTML parser may read that as a character reference, with or without `;`).
- Everything else keeps its original Html section, with its literal output unchanged. Plain `&`, quotes, `%` and merge tags are still carried.
- Carried links now also pass the designer `safeLink` rule: an https image, and a button URL with no quotes or whitespace. Otherwise the section stays Html. This was found while checking the carried values; one of the image renderer's `src` paths does not escape.
- Regressions:
  - The values `Book <today> & save`, `Keep literal &copy; text`, `Legacy &copy without semicolon`, a title with `<b>`, and a button `&amp;`/`&#38;` are refused, both in recognition and through the real proposal owner, with unchanged state.
  - Carried values are compared by visible leaf text (happy-dom) across the old Html, the preview and the committed HTML.
  - Unsafe image/button links are refused.

**P2: async continuation could retarget an old handoff.**
- `reviewKnownSections` captures, once:
  - the owner (template, campaign, client, draft, head);
  - the full route query;
  - a builder lifetime, ended from the existing unmount hook;
  - the complete local snapshot (content and metadata).
- It rechecks all of them after open and after propose, before any baseline, presentation or router write.
- On any change it stops. The opened handoff or returned proposal stays unapplied on the server, and nothing is retried under a new owner or operation. While the builder is still alive it shows an explicit message instead of the generic "retry to reconcile" text.
- `setLocalBaseline` now runs only after the final check.
- Regressions (deferred open and deferred propose, each for six drifts): navigation, owner change, client change, complete local drift, unmount, and navigation plus drift. Further tests cover the drift message and the unmount-hook wiring.
- Builder wiring tests now total 20 (source-slice execution, not a mounted Nuxt router).

**Mutation checks** (`mutations.log`; all reverted, hashes verified):
- The old self-only lock rule fails 2 tests.
- Dropping the literal-safe check fails 2; dropping the link check fails 1.
- Dropping the post-propose recheck fails 7; dropping lifetime/route from the recheck fails 4.
- Dropping the client lock hint fails 1; dropping the drift message fails 1.
- A lifetime that never ends fails 2; a hook that doesn't end it fails 1.

**Reviewer counterexamples (artifacts untouched; their 38-entry freeze re-verified):**
- **Verbatim copies** (paths redirected only): 17 passed / 9 failed.
  - Seven failures are the intended fail-closed `EDIT_FORBIDDEN` refusals of literal `<today>`/`&copy;` copy:
    - two direct adoption cases;
    - four owner-suite tests built on the old `<today>` seed, one of which expected `REVISION_CONFLICT`;
    - the owner literal-copy counterexample.
  - Two are the async harness lacking the new `designStructureLocked` binding.
- **Adapted copies:** 26/26 pass. Every edit is listed in `reviewer-counterexamples-rerun/adapted/ADAPTATIONS.md`.

**Shared-file note:** builder harnesses that execute source slices are unchanged. A first attempt registered a new top-level `onBeforeUnmount` and broke two harnesses (17 failures, log kept). The lifetime is now ended from the builder's existing unmount hook.

**Results:**
- Lint is clean on the touched files.
- Focused: 19 files, 220 passed.
- Broad (`vitest run email edm Render figflow flyhub importedEmail importedDesign godMode`): 411 files passed / 19 skipped; 3,504 tests passed / 325 skipped; exit 0.

## 5. R2 review repairs

The R2 review (`.verification/opus-known-section-r2-independent-review-20261103.md`) closed P1-1 and the P1-2 text cases. It requested 1 P1 and 1 P2. Each repair below was preceded by a failing regression. The red logs are in `.verification/opus-known-section-r3-20261103/`.

**P1: entity spellings in carried image and button URLs changed the destination.**
- Root cause: the generator HTML-escapes attributes, so the original Html parses to the literal URL. The structured Image and Button renderers interpolate that URL unescaped, and attribute parsing then decodes character references. For example, `&#35;` becomes a fragment, `&copy;` becomes ©, and `&#x26;` becomes a separator.
- The fix is a conservative refusal at the recognition boundary (`literalUrlSafe` in `designKnownSections.ts`). The renderer and saved URLs are unchanged: escaping in the renderer would change existing saved URLs authored as `&amp;`. A section is recognised only if every `&` in the image URL and button path is one of:
  - not followed by `#` or an alphanumeric;
  - a plain `name=` query pair that cannot decode: no `&word;`, and no legacy no-semicolon name (the HTML standard's 106) followed by something other than an alphanumeric or `=`.
- Ordinary separators (`&utm_source=`, `&w=600`, even `&copy=1`) are carried.
- Regressions:
  - **Image and button, success:** ordinary separators give exact parsed `src`/`href` in the preview and the committed projection, through the real owner, with one revision.
  - **Image and button, refusal:** `&#35;tail`, `&copy;`, `&#x26;b=2`, `&amp;b=2`, `&copy-x=1` and `&lt;` are each refused through the real owner. Full transaction state, the saved Html bytes and recognition are unchanged.
  - **Oracle test:** all 106 legacy names decode in happy-dom's spec-conformant parser. Every accepted URL across a corpus of 106 names × 14 followers, plus extras, parses back exactly.

**P2: save-first lifetime and live draft identity.**
- Root cause: the lifetime, owner, route and snapshot were captured only after `await save()`, and the owner recheck read the captured draft object, not `designFlow.draft.value`.
- The intent is now captured before any await: instance lifetime, route, owner (template/campaign/client), live draft document and complete local snapshot. It is rechecked after the save, the open and the propose, reading the live draft each time.
- The only change allowed is the save advancing the same draft's head. That new head becomes the open base, and the live head must then stay fixed.
- A successful save stands. On any other change the handler stops before the next request or any baseline, presentation or route write, with an explicit message while the builder is alive. Nothing is retried, and pending unknown writes remain with `useEdmDesignRoundtrip`.
- Regressions:
  - Deferred save with six drifts each: unmount, owner, client, navigation, local edits, live draft replaced by another document. The save stands and nothing else starts.
  - Live draft ref replacement (document or head) during deferred open and during deferred propose.
  - An equivalent live re-read is tolerated.
  - Save-first now opens on the advanced head.

**Mutation checks** (`mutations.log`; all reverted, hashes verified). Each is caught:
- Dropping the URL check: 12 failures.
- Allowing numeric references: 5.
- Legacy names only at end of string: 3.
- Ignoring legacy names: 3.
- Dropping the post-save check: 4.
- Dropping the live head check: 2.
- Dropping the live document check: 3.
- Re-capturing the lifetime after save (the old bug): 1.

**Reviewer probes rerun as copies** (outputs redirected; their 25 artifacts byte-unchanged): 24 passed / 4 failed.
- All three async counterexamples now pass.
- The four failures are the reviewer's entity-URL cases, which expected adoption to preserve the URL. They now get the reviewer-permitted conservative refusal (`EDIT_FORBIDDEN`). My owner tests prove refusal leaves full state and the saved Html unchanged.

**Results:**
- Lint is clean on the touched files.
- Focused: 19 files, 244 passed.
- Reviewer neighbour set: 9 files, 114 passed.
- Broad (same scope as before): 411 files passed / 19 skipped; 3,528 tests passed / 325 skipped; exit 0.

## 6. A0 conversion boundary for carried links

**Why:** R3 showed that names admitted by the section 5 guard (`&notin`, `&copysr`, `&ubrcy_`, `&notin-`) still changed destination in the production delivery/plaintext consumer. The investigation (`known-section-url-architecture-20261103.md`) traced this to a general contract conflict. Raw Button, light-Image and Avatar paths treat the canonical URL as HTML attribute text, while every other owner treats it as a literal URL. The independent architecture assessment (`.verification/opus-known-section-url-architecture-independent-review-20261103.md`) chose the smallest safe repair for A: a conversion-only refusal, with no serializer change. Neither C nor C′ is implemented.

**Rule:** `conversionSafeLink` in `designKnownSections.ts`. If the carried image URL or button path contains any `&`, the section is not recognised. It stays as its original Html, byte for byte, and neither the builder hint nor the server converts it.
- The 106-name table and `literalUrlSafe` are removed. There is no parser modelling and no URL decoding or encoding.
- `safeLink`, byte-identical regeneration, literal-text refusal, ancestry/parent/module locks, authority, CAS, idempotency, deterministic lineage and the save-first/live-intent async behaviour are unchanged.
- No renderer, tracking, delivery, importer, native, schema or package file changed.

**What this means for users (disclosed in the composer alert):** "Only unedited generated sections with plain text and links without “&” (for example tracking parameters) qualify; others stay as HTML, unchanged." Ordinary multi-parameter links such as `?utm_source=…&utm_medium=…` are therefore **not converted**. Those sections keep working as their original Html. Not every saved CTA is convertible.

**Tests (failing first; red logs in `.verification/opus-known-section-a0-20261103/`):**
- **Image and button separately, through the real proposal owner, 23 link values each:**
  - ordinary multi-parameter links (`a=1&b=2`, `utm_source/utm_medium`, `w/h/fit`, `copy=1&amp=2`);
  - numeric references (`&#35;`, `&#35`, `&#x26;`, `&#x26b`);
  - named references (`&copy;`, `&amp;`);
  - unknown names (`&foo;`, `&Ecy0;`);
  - malformed references (`&#x;`, `&#;`, `&#xZ;`);
  - partial names (`&copy-x=`, `&lt`) and a double reference (`&amp;amp;`);
  - all four R3 prefixes and a trailing `&`.

  Each is refused with the **full post-open state** unchanged (handoffs, receipts, revisions, head, projection), the saved Html bytes unchanged and recognition null. The previous ampersand positives became these unsupported-conversion cases rather than being deleted.
- **Batch:** with one eligible and one ineligible section in either order, the whole proposal is refused with state unchanged. There is no partial conversion.
- **Ampersand-free image and button links, positive:** the real proposal is non-mutating; one Apply writes one revision; canonical readback of the converted blocks holds the exact literal values. The link reads identically in the original Html, the preview and the committed HTML for:
  - direct attribute parsing;
  - the production tracking logical-href callback (`rewriteTrackableHrefs`, an identity callback, no provider);
  - `inspectDeliveryContent`;
  - `deliveryPlainText`.
- **Unit test:** the module exports no name table or URL-parser guard. `&` links are refused, and ampersand-free links are recognised.
- **Builder:** the disclosure text is asserted.
- **Retained, all passing:**
  - the inherited/self/parent/module locks, literal-text, nested, deterministic-id, CAS and replay cases;
  - authority after awaits;
  - the save-first and live-draft async cases;
  - the unknown-write recovery tests in the neighbour set.
- **Mutation checks** (`mutations.log`; all reverted, hashes verified):
  - admitting every link fails 48 tests;
  - leaving the image link unchecked fails 24;
  - leaving the button path unchecked fails 25;
  - dropping the disclosure fails 1.

**Owner example:** the available reconstruction of "Electric Drive (copy)" (`/private/tmp/figflow-opus-work/repro/electric-doc-before.json`, sha256 `6485f1c7…`, built from the pre-structured starter) has one split CTA. Its image URL and `book-a-test-drive` path contain no `&`, so it is **eligible** and converts, leaving no Html. This is a reconstruction, not the live saved record, which could not be read in this stage. The owner example is therefore **not** recorded as completed: live verification remains a hosted/runtime gate (`owner-example-check.json`).

**Results:**
- Lint is clean on the touched files.
- Focused: 19 files, 279 passed.
- Neighbours: 12 files, 150 passed, including tracking-links, delivery-content and review-workflow suites. A first neighbour run used a wrong tracking-test path and ran 10 of 11 files; its log is kept.
- Broad (same scope as before): 411 files passed / 19 skipped; 3,563 tests passed / 325 skipped; exit 0.
- The first broad run had one failure: `godModeGateInventory` timed out at 5 s under full parallel load. It passes standalone (8/8, 1.07 s) and in the focused and second broad runs. Its log is kept (`regression-first-run-gate-inventory-timeout.log`); it is not attributed to this change, which touches no server route.

## 7. Separate follow-up (not closed by A)

The general saved-content serialization defect stays open, separately from A:
- Raw Button/light-Image/Avatar attribute emission makes some existing links' destination parser-dependent. For example, tracked/plaintext destinations can differ from direct links for spellings such as `&notin` or `&copysr`.
- Today a single canonical `&amp;` link reads differently on the light and dark/VML paths.

The coherent contract is literal canonical URLs escaped once at serialization, behind an **explicit persisted compatibility/version boundary**. Old revisions keep their established rendering; new or reviewed content uses literal mode. That needs:
- an authorised read-only content audit;
- a compatibility decision with reviewed before/after outputs;
- MJML/VML/email-client and Linux CI evidence;
- its own independent review.

The E04 importer's handling of decoded attributes is part of that separate scope; E04's approved behaviour and scope are unchanged here. Tracked as queue item 16.

## Not claimed

- Hosted acceptance, Linux native build of edm3, and any browser or email-client acceptance.
- Campaign completion, merge, deploy, package publication, or pointer changes.
- Any full TypeScript/SFC typecheck. Lint passed on every touched file.
