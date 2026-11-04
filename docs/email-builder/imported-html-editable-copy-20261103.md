# Imported HTML → explicit editable FigFlow copy — 3 November 2026

**Status: implemented locally on `adme-dev/figflow-authoring-20261102` (uncommitted). The first frozen checkpoint (`d12cad9a…`) was independently reviewed and found NOT commit-ready (3 P1, 2 P2); all five findings are repaired below and await independent re-review. Not merged, not deployed, no hosted or inbox acceptance.** Closes the source side of the [live gap](live-workflow-gap-20261103.md): a complete imported email (one `Html` block in `documentMode: 'email'`) could not open in FigFlow at all.

## What staff can do now

In the composer, a complete imported email shows the existing info alert with a new action, **Create editable FigFlow copy**. It opens a review dialog:

- **Before/after preview** in sandboxed (`sandbox=""`) iframes: the stored compiled original and the proposed copy, desktop and 390 px mobile.
- **Conversion report:** count of sections that become FigFlow layers, protected HTML sections and device pairs; every section is listed with its reason when protected (e.g. *Styled button*, *Side-by-side columns*, *Image sized or combined with other content*).
- **Differences from the original** (limitations) shown verbatim — never hidden.
- **Copy name**, then **Create copy and open in FigFlow**. Creation is refused while the composer has unsaved changes and when nothing can become a layer.

The original template, its HTML, scope and revisions are never written. The copy is a new **draft** in the same client scope and folder, with subject/preview text and provenance carried (`importForm: 'editable-copy'`, source template ID in notes, original SHA-256 retained). After creation the page reloads into the copy with `openDesign=1`, so FigFlow opens through the existing structured-draft path (canonical initialization, CAS, receipts, Apply/undo are unchanged).

## How conversion works (and what it refuses)

`server/utils/email-marketing/importedDesignConversion.ts` — pure, deterministic, server-only (existing `parse5` + `postcss`):

1. A small cascade resolver applies the source's own stylesheet: base rules plus `max-width` (mobile) media rules; specificity, order and `!important` respected. Dark-mode, WebKit-only (e.g. interactive carousels), print and resolution rules are *not* applied — each source's portable fallback is used. Client hacks with attribute/pseudo selectors are skipped and disclosed.
2. Sections are lifted from content-width bands; transparent wrappers are flattened; stacked rows decompose with their padding, solid fill (incl. same-colour `linear-gradient` hacks), vertical margins and inherited typography carried. Text-transform is applied to copy, never to merge tokens (`{{…}}`, `*|…|*`). NBSPs are preserved.
3. Only mappings whose resolved appearance the target blocks can represent become native blocks (colours normalised to canonical hex; translucent/unknown colours or fills, and decorations the target cannot carry, keep the section protected or rich — this is a bounded mapping, not a general losslessness proof): full-width **Image** (src/alt/link), **Text** (plain single-style copy stays editable; otherwise rich text with source typography), **Spacer**. Everything else is a **protected Html** section through the *existing* strict fragment sanitizer (`sanitizeImportedFragment`, same policy as composer Html blocks — not relaxed).
4. Desktop/mobile alternatives: style-only differences become one block with a mobile style override; image alternates become **one Image with `data.mobile.props.url`** (also when they sit in adjacent rows); other differences become `hideOnMobile`/`hideOnDesktop` pairs at root level only.
5. A section-level background image is kept as the block's structured, URL-checked `style.backgroundImage` (cover/centre); the painted fill under it is moved to the block fallback colour. Groups with a background image are never split across blocks.

Refusals: anything that is not exactly one complete imported email (422); no visible content; >140 sections; >50,000 elements.

## Renderer and guard changes (shared output — review carefully)

- **Pre-existing bug fixed:** `hideOnDesktop` rows were `display:none !important` on every device (no mobile reveal). The mobile breakpoint now reveals `tr.edm-hide-desktop` (table-row) and `div.edm-hide-desktop` (block); hide-all is never revealed; duplicate rules deduplicated.
- **Image mobile source:** desktop image is the default (Outlook and clients without media queries); the mobile image is hidden (`display:none; max-height:0; overflow:hidden; mso-hide:all`, inside `<!--[if !mso]>`) and swapped in at the breakpoint. **Defined precedence:** when a dark-mode image (`darkSrc`) is rendered, the mobile source is not emitted.
- **Html blocks** now emit the same `extendedStyleCss(style)` the composer canvas already applied (editor/email mismatch), so a structured background image reaches the email.
- **Guards extended, not bypassed:** module asset verification now requires `mobile.props.url` to be a registered scoped asset (module publication already refuses any background image); preflight diagnostics check mobile sources and block background images like other sent images; saved-output asset verification already scans every `src`/`url()`; staff/campaign content guards already reject ungranted `mobile` changes.
- **Known unsupported, disclosed:** device flags on children nested inside Container/Columns are ignored by the renderer (pre-existing). The converter only sets flags on root children (tested).

## Route and authority

`POST /api/email/templates/[id]/editable-copy` — see *Review repairs* below for the current contract (the first version's receipt and fence design was found unsafe in review). God-mode inventories record one reviewed gate row (`application_governance_bypass`, same read-or-write shape as the banner snapshot) and counts 2341/1280/413; prior-row digests unchanged.

## Evidence (local, bounded)

Private inputs (parent's read-only exports, not committed): Ford `267b434c…8837`, Nissan `b5f7b579…3294`, Cinco `1a37261e…0cff` — unchanged after all runs. Local evidence (gitignored): `.verification/opus-imported-conversion-20261103/` with `SHA256SUMS` (61 entries; the first version of this report said 60), `source-sha256.txt`, scripts, logs, 20 screenshots.

| Check | Result |
|---|---|
| Actual renderer output in system Chrome (headless), 800 px and 390 px, original vs copy | Visible text **line membership** identical in both directions in all 6 views (not ordered/multiplicity equality); visible `<img>` sets identical by **truncated URL suffix** multiset in all 6 views (CSS backgrounds not counted); Unsubscribe / Make the Switch / Learn More / See More counts identical; heights Ford 6116 vs 6171 (desktop), Nissan 2962 vs 2966, Cinco 1682 vs 1710; 0 broken images |
| Sections (native / protected / device pairs) | Ford 29/38/15 · Nissan 11/10/4 · Cinco 9/11/4 |
| Canonical admission (`composerToDesignDraft`) | All 3 admitted, deterministic; editable fields Ford 26 (6 images × url/alt/link + 8 text), Nissan 6, Cinco 2 |
| Actual pinned FigFlow WASM (f131 package `58eabea2…`, relay `f433cee4…`) via real `connect` packets, fenced network | **6/6** (3 sources × content/designer) admitted with exact canonical no-op return; 0 page/console errors; 0 blocked requests; package bytes unchanged. Canvas shows images and plain text as layers, each image once; rich text and protected HTML appear as the native projection's explicit "preserved" placeholders |
| Browser-computed hide classes (renderer) | Root show/hide-mobile/hide-desktop/hide-all and the `div` wrapper correct at both widths; nested Container children ignore flags (pre-existing, disclosed) |
| Focused tests (9 files, 74 tests, 0 skipped) | converter 8, route 6, modal 5, render responsive 4, edmResponsive 5, design assets 7, content diagnostics 16, god-mode gate 8 + isolation 15 |
| Broad local regression (`vitest run email edm Render figflow flyhub importedEmail importedDesign godMode`), final source | 407 files passed / 18 skipped; 3,449 tests passed / 323 skipped; exit 0. Skips are the existing opt-in database/runtime suites — not validated here |

These are local, fixture-bounded results. They do **not** prove: hosted Pages/private-renderer behaviour, ordinary staff/client access, recipient-facing signed image delivery, real email clients (Gmail/Outlook/Apple Mail), native visible *edit + save + reopen* of a converted copy, or the full campaign journey.

## Honest limits of the copy

- Buttons, multi-column rows, narrower-than-section images (logos, icons) and rich text stay **protected** or rich: visible and preserved, editable in the composer (existing Html region editing), shown as locked placeholders in FigFlow. This is the remaining E02–E04 native gap.
- Web fonts (`@font-face`) are not carried; text uses each stack's first standard family. Outlook-only conditional branches and VML backgrounds are omitted. Background images use cover/centre. Protected sections lose properties outside the fragment policy (e.g. `min-height`).
- Device pairs that are not image/style-only remain two root blocks (FigFlow shows both placeholders).

## Budget

Nitro's worker preset minifies. Esbuild estimate of new Pages server code: converter ≈ 21.7 KB minified (37.6 KB unminified), route ≈ 3–6 KB, against 58,223 bytes of strict raw headroom at `981943bb1`. Renderer changes live in the private renderer artifact. **Must be confirmed by CI's strict emitted measurement; limits unchanged.**

## Review repairs (after independent review of `d12cad9a…`)

Review report: `.verification/opus-imported-conversion-independent-review-20261103.md` (SHA `9416cb6c…`). Frozen reviewed bytes are preserved under `.verification/opus-imported-conversion-20261103/frozen-d12cad9a/` (23/23 match). Repair evidence: `.verification/opus-imported-conversion-repair-20261103/`.

- **P1-R1 — typed receipt, full binding, atomic fence.** Editable copies have their own request namespace in the existing import owner (`importRequestTemplateId(..., 'editable-copy')`); ordinary import v1 identities are unchanged. The receipt stores an immutable typed binding (operation, version, writer, request key, source template ID, reviewed source digest, name, client) and every replay must match it exactly; descriptive `sourceProvenance` is never consulted. The preview digest now binds ID, client, subject, preheader, folder and body. The existing `createTemplate` owner gained an optional source fence: one `INSERT … SELECT … WHERE EXISTS (unchanged source row)` statement, plus a fresh write-authority callback after rendering and before insert. A real local PostgreSQL 17 check (disposable socket cluster, own schema, dropped) proves semantic jsonb matching, identity replay, refusal on every changed field, and refusal when the source changes during the awaited authority check.
- **P1-R2 — recovery.** The route authenticates, then recovers this request's typed receipt under the copy's *current* scope before touching the original (deleted/moved originals no longer hide a committed copy). `data.outcome` is `not_committed` only when no receipt exists and the fence can no longer pass (re-checked after seeing a missing/changed original); `conflict` when the identity is bound elsewhere; anything else (auth, access, transport) is unknown. The dialog keeps the exact request until a receipt, a `not_committed` refusal, or an explicit **Abandon unconfirmed request**; it persists per source in session storage across close/unmount/reload, counts as busy for the leave guard, and never reloads over local composer edits (shows **Open copy in FigFlow** instead).
- **P1-R3 — appearance.** Named/`rgb()` colours normalise to hex; translucent or unknown text colours and fills keep the section protected with its raw value; a lifted background image keeps its own fill beneath it; `text-decoration` is never folded away. Reviewer counterexamples now compile to white-on-black, keep the underline and keep the black fill under the image.
- **P2-R4 — async context.** Each preview load carries a source + generation; stale replies are ignored, the preview is invalidated on source change, and a pending request is never retargeted (the save URL comes from the request, not current props).
- **P2-R5 — viewport.** Container-aware layout (`@container`, `@5xl:` columns); the chosen iframe width is kept (`min-width`, no `max-width` clamp) and the preview region scrolls horizontally.

Diagnostics remain **advisory** presence/alt/weight warnings, not URL or asset authorization. Pages size remains an estimate until CI's strict measurement.

| Repair check | Result |
|---|---|
| Red before repair | converter R3 cases 4/4 red on frozen source; new dialog tests 7/8 red against the frozen dialog; reviewer probes `pure-probes.json`, `binding-probes.json`, `conversion-probes.json` |
| Focused (12 files) | 94 passed, 1 skipped (the database-gated fence test, run separately) |
| Real PostgreSQL fence | 1/1 passed on a disposable local cluster; schema dropped |
| Broad local regression | 407 files passed / 19 skipped; 3,458 tests passed / 324 skipped; exit 0 |
| Actual Ford/Nissan/Cinco after repair | same visible text-line membership and image suffix multisets in all 6 views; editable fields Ford 26 / Nissan 6 / Cinco 2; deterministic |
| Actual edm2 WASM | 6/6 converted-copy admissions with exact no-op; 0 blocked requests |

## Second review round (final re-review of `fde6c82d…`)

Final re-review `.verification/opus-imported-conversion-independent-rereview-20261103.md` closed R3/R5 and blocked R1/R2/R4. Reviewed repair bytes preserved under `.verification/opus-imported-conversion-repair-20261103/frozen-fde6c82d/` (26/26). Corrections, using existing owners only:

- **R1 — write-once receipt at the persistence boundary.** `updateTemplate` (the only content writer before a copy gets a canonical design document) strips any incoming `importReceipt` and, inside the same `UPDATE`, carries the row's stored receipt forward with `jsonb_set`; a template without one cannot gain one. Once a copy has a canonical document, migration 491's trigger already requires `body_source` to equal the head revision's blocks, and the canonical writers cannot change root props (`importReceipt` is outside the strict designer root schema and outside staff/content grants), so the receipt travels unchanged. Replay compares the request to the stored binding *as created* (the copy's client may later move) and requires current access to the copy's present scope. Real local PostgreSQL 17 (disposable cluster, removed): rewrite, removal, removal of the whole props object and impostor-add are all ineffective; metadata saves keep it; bodies without a stored receipt stay byte-identical.
- **R2 — no false terminal outcome.** `not_committed` is gone. Missing/changed original and fence failures return `stale`; a delayed earlier attempt can still commit if the source is restored, and a later retry of the same key returns that copy (tested interleaving). The dialog keeps the exact request on every failure until a receipt or an explicit **Abandon unconfirmed request**.
- **R4 — per-source settlement.** A create result settles only its own source and request key (session storage and memory); it never reads, clears or replaces another source's pending request. Visible confirmation/error applies only while that source and request are active; confirmations are kept per source so A→B→A shows A's own result. Tested: late success, late failure and late `stale` for A while B has a pending request — B's stored entry is byte-identical afterwards.

| Round 2 check | Result |
|---|---|
| Red before | new R4 test red against the `fde6c82d` dialog; reviewer `control-probes.json` cases |
| Focused (14 files) | 107 passed, 2 skipped (the database-gated fence file without its socket) |
| Real PostgreSQL fence + receipt | 2/2 passed; cluster removed |
| Broad local regression | 408 files passed / 19 skipped; 3,465 tests passed / 325 skipped; exit 0 |

