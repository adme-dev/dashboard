# E01 — start a blank email directly in FigFlow: plan (3 November, read-only planning)

Status: **plan only.** No product, test, canonical-queue or frozen file was changed. New material is only this document and `.verification/opus-e01-blank-start-plan-20261103/` (one pure probe). Implementation waits for the A0 source-review disposition, then main reconciliation, per the coordinator.

Requirement (PRD E01): a designer chooses Email, selects an authorised client/agency scope, **starts blank** or from a starter, and creates a named design. They must not have to import HTML or make a dummy composer template first. Today the Starters path works; there is no blank start (queue item 14).

## 1. What exists today (owners)

| Concern | Owner | Behaviour today |
|---|---|---|
| Entry point | `app/components/email/FigflowTemplateBrowser.client.vue` (on `app/pages/agency/email/index.vue`) | Templates / Drafts / Starters tabs. Selecting a row opens the existing name + client dialog (`createDraft`, lines 90–135). Starters `POST /api/email/templates` with `template_kind: 'draft'`, then go to `figflowComposerQuery(id)` (`?id=…&workspace=figflow&openDesign=1`). Includes uncertain-create recovery (no blind retry). |
| Browser admission | `app/utils/edmFigflowLibrary.ts:6` `figflowTemplateCapability` | `canOpen` only when the converted design has at least 1 editable field. This is a UX gate. Starter tiles also show `/email/template-previews/<starter>.jpeg`. |
| Blank document | `app/types/edm.ts:93` `createEmptyDocument()` | EmailLayout root, no children, default canvas/text/font props. It is already the base of `buildStarterTemplateDocument` and the composer's reset. |
| Create | `server/api/email/templates/index.post.ts` → `createTemplate` | `requireWriteAccess`, client scope checks, name 1–200, `body_source` any, renders once. No design document is created yet. |
| Lookup / authoring availability | `server/api/email/design/roundtrip.post.ts:50–72` + `designHandoffs.ts:276–297` | Designer authoring is reported **only for an already `structured` draft** (and campaign/native conditions). A fresh template draft has no design document, so lookup returns `draft: null` and `available: false`. |
| First open | `designHandoffs.ts:299–395` (`start`) | Initializes the template design atomically (schema-0 snapshot, then conversion via `composerToDesignDraft` and `saveTemplateDesignDraft`), then opens the handoff. **Designer mode already allows zero editable fields.** Only content mode throws `NO_EDITABLE_CONTENT` (line 391). Designer role is required (fresh authority) at each step. |
| Builder | `EdmFlyhubBuilder.client.vue:851–860` (`figflowSourceUnsupported`), `:1724–1731` (`openDesign=1`), `:968` (open) | Defers to `designerAuthoring.available`. Otherwise it requires the content capability. If unsupported, it shows "Continue editing this source in the composer". |
| Designer ops | `shared/emailRendering/designDesigner.ts` | For the blank: root `canInsert: true`, operations include `add-section`. Each added section gets deterministic ids, lineage and content grants. Apply is one canonical revision and one composer Undo. |
| Native | `…/engine/src/cmd/edm.rs:222,316` | Accepts a root with no children: the only emptiness check is on the whole block map, which always contains the root. **Not yet proven in actual WASM.** |

Probe (`blank-document.json`, 1/1): `createEmptyDocument()` is valid canonical content with 0 editable fields, so the browser capability is "Composer editing only". Designer operations include `add-section` with root `canInsert`; one Heading adds one grant; it renders 2,150 bytes.

**Gap, precisely:** the server can already start and open a blank draft in designer mode, but nothing reaches that path. The browser's content gate rejects a 0-field document. Lookup never reports designer availability for a draft that has not been opened yet. So the builder falls back to the composer.

## 2. Smallest real change (no dummy content, no weakened gate, no new store or renderer)

1. **Browser entry.** Add one "Blank email" tile at the start of the Starters tab in `FigflowTemplateBrowser`. It is a distinct row kind, not a fake starter.
   - Tile: icon + text, **no preview image asset**. Copy: "Design from an empty canvas in FigFlow. Needs FigFlow designer access for the chosen client; without it the draft opens in the composer."
   - Selecting it uses the existing name + client dialog and the existing `createDraft` POST. The body is `createEmptyDocument()` with `template_kind: 'draft'`, `subject`/`preview_text` null and no folder. Uncertain-create recovery is unchanged.
   - The content capability check is skipped **only for this row kind**. Authority is decided by the server after creation (step 2). `figflowTemplateCapability` itself is unchanged.
   - The form edits must follow the project form rules: invoke the frontend-design skill, use `UFormField` labels and the existing dialog.
2. **Server lookup (existing owner).** In `designHandoffs.ts`, the template lookup reads the template row it already authorises (add `template_kind` and `body_source`). It returns a derived `blankStart` flag: the template is a draft, there is no design document yet (or only an unchanged schema-0 legacy snapshot), and `composerToDesignDraft(body_source)` is exactly the root with no children and no other blocks.
   - `roundtrip.post.ts` then reports `designerAuthoring.available` for that case, using the same flag (`FIGFLOW_EDM_DESIGNER_ENABLED`) and `assertFreshDesignAccess(…, 'write') === 'designer'` for the template's client scope.
   - `capabilities` are computed from that converted blank design.
   - Every other unstructured draft stays unavailable, as now. The flag is derived from persisted state only, never from a client hint.
3. **Builder: no gating change.** With availability true, `figflowSourceUnsupported` is false. `openDesign=1` calls `beginFigflow`, then `designFlow.open(templateId, clientId, true)` (no saved baseline, so `start` on the designer endpoint). The existing server path initializes, converts and opens, all in one transaction.
   - Later opens follow the existing structured path: exact head, CAS, propose, review, Apply, Undo.
   - Optional copy only: when the blank draft lands in the composer for a non-designer, show "This blank draft needs FigFlow designer access for its client…" instead of the generic text.

Not in scope:
- brand-kit defaults (existing `applyDesignBrand` already handles an empty root, optional later);
- publication preflight, which stays with E07;
- campaign owners;
- a blank *module* entry;
- marketing-page sync, which happens at release time per the project rules.

## 3. Invariants to keep

- **Create:** write access, authorised client or shared scope (shared only when `canUseSharedTemplates`), name required ≤ 200, one draft per confirmed create, no blind retry after an uncertain create.
- **Open:** designer role checked fresh at lookup, start, propose and Apply. The flag must be on. Content-only staff never get designer mode and keep the composer. `NO_EDITABLE_CONTENT` for content mode is unchanged.
- **Save and reopen:**
  - First start writes the conversion revision.
  - Each reviewed Apply is one canonical revision and one composer Undo.
  - Reopen opens the exact head, refusing stale or forged heads.
  - Unsaved composer edits save first (the existing open path).
- **Publish:** separate and authorised (E07). A blank draft cannot publish until preflight passes (footer, links, etc.). Nothing implies otherwise.
- **No dummy content:** no placeholder editable field to satisfy a gate, and no invented preview image.

## 4. Tests (red first, then green)

1. **Browser** (component test, existing harness style):
   - the Blank tile renders with no `<img>`/preview request;
   - Create is disabled without a name or destination;
   - POST body equals `createEmptyDocument()` with `template_kind: 'draft'` and the chosen scope;
   - navigates to `figflowComposerQuery(id)`;
   - uncertain create shows recovery and no retry;
   - existing starter/template rows unchanged.
2. **Lookup** (route + owner unit tests):
   - `available: true` with capabilities for an exact-blank never-opened template draft for a designer;
   - `false` for a non-blank legacy draft, an edited blank (changed snapshot), a published template, a campaign, a non-designer (403 → false), a read-only user, and the flag off;
   - the flag ignores client input.
3. **Real designer start on the blank** (persistence harness with the real `executeDesignerRoundtrip`, writer and renderer):
   - `start` gives one conversion revision and an open handoff;
   - content-mode `start` on the same draft gives `NO_EDITABLE_CONTENT`, with full state rolled back;
   - a revoked designer at start gives `DESIGNER_REQUIRED`, with no snapshot stranded.
4. **Authoring round trip:**
   - propose `add-section` (Heading, Text, Button, Image with a registered asset) gives a preview, then Apply gives one revision, then readback;
   - reopen opens the exact head; stale-head propose is refused;
   - exact replay and authority-after-await behave as in the existing suites.
5. **Builder:**
   - `openDesign=1` on a blank draft with availability opens designer mode once;
   - without availability, the composer alert shows and FigFlow does not open;
   - reload does not duplicate the draft (`openDesign` is consumed).
6. **Neighbours:**
   - existing starter, capability, roundtrip-route and composable suites;
   - the god-mode gate/isolation inventories (`roundtrip.post.ts` changes, so check counts/digests and update only if the ratchet requires it, with justification);
   - broad email regression; touched-file lint.
7. **Runtime gates (later stages, not claimed by implementation):**
   - actual-WASM import of the empty root with native add-section;
   - Undo in the mounted composer;
   - hosted designer: create blank, design, save, reopen; non-designer fallback;
   - Linux CI on the reconciled checkpoint.

## 5. Acceptance criteria for E01 (blank path)

1. From the email page, a designer can choose **Blank email** in FigFlow's browser, name it, pick an authorised client or shared scope, and land in FigFlow designer mode on the new draft. No HTML import, starter or composer template comes first.
2. The draft is a normal client-scoped template draft (library Drafts tab). Its first FigFlow edit is reviewed and applied as one revision; it reopens on the exact saved head with the added sections.
3. A non-designer creating a blank gets an honest composer fallback; no FigFlow designer access is granted.
4. All refusals leave state unchanged. No dummy fields or assets exist anywhere.
5. Hosted evidence covers create → design → save → reopen for a designer, and the fallback for a non-designer. The starter path stays as today.

## 6. Blockers and risks

- **Sequencing:** A0 review disposition, then main reconciliation (`18911ef0c` or newer, which adds UI-primitive dependencies), then implementation.
- **Security-sensitive broadening:** lookup availability for a not-yet-structured draft. It is limited to the exact server-derived blank. Independent review must check that the blank detection cannot be satisfied by crafted bodies, e.g. extra top-level keys or Html in props.
- **Shared/agency scope (`client_id` null):** designer role semantics must be confirmed with `assertFreshDesignAccess(…, null, 'write')` before offering shared blank designs; otherwise limit blank to client scope.
- **Native:** empty-root import and add-section are unproven in the actual (edm3) WASM; edm3 is not yet built on Linux. The live app still loads edm1.
- **Flags:** `FIGFLOW_EDM_DESIGNER_ENABLED` must be enabled in the hosted environment for the designer path; no flag change is proposed here.
- **Owner acceptance** of the blank path is a hosted gate; this plan claims nothing beyond source design.
