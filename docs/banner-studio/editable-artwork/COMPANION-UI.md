# Companion wording review: UI and transient authority

Implemented task 2 of `COMPANION-REVIEW-PLAN.md` on 27 October 2026 in the existing dirty `adme-dev/banner-editable-artwork` worktree. No commit, deployment, provider or database operation was performed. Existing work was preserved; the only changes to previously modified inspector/type files are the companion entry and optional metadata type.

## Operator workflow

1. Select an existing supported native heading and open **Companion wording** in Properties.
2. Download the request. It contains the complete current project snapshot, including unsaved canvas changes and the saved `updatedAt` revision, plus a canonical SHA-256 and a random session request ID.
3. Keep this review open, with the same document and selection, while running the local Linux companion. The typed CLI and its native execution evidence are coordinator-owned.
4. Import the returned wording JSON. The browser checks the contract, original request identity, source and selected layer, then loads/verifies the pinned font and measures the proposed wording independently.
5. Compare **Before** and **After**, including the exact words below the scaled heading previews. Check the review box, then apply. Apply rechecks the source and performs a fresh font/fit measurement.
6. Save the artwork through the existing editor. One Undo restores the exact original layer and removes introduced provenance; Redo restores the wording and metadata.

This is a manual local companion workflow. It does not imply hosted engine automation, authenticated engine provenance, production release or commercial print acceptance.

## Supported heading and design choices

The panel uses the existing inspector typography, semantic theme colors and Nuxt UI controls (`UButton`, `UFormField`, `UFileUpload`, `UCheckbox`, `UAlert`). It uses a single column appropriate to the narrow inspector, plain guidance and no extra modal or motion. Before/after heading boxes preserve font, weight, size, line height, spacing, color and opacity, scaled together to the available panel width; readable exact wording accompanies both boxes. These are heading previews, not a full artwork proof.

The selected heading must already be plain Source Sans 3 Bold 700 in the proven bridge subset, with font size at most 512 px. It must be a supported single line with bounded Latin/punctuation glyph coverage and no rich text, effects, transform, animation or live text binding. The existing bridge resource budget also applies. Explicit `animOut: 'none'` is required for static saved fixtures: editor migration fills an omitted exit animation with `fadeOut`.

Unsupported font/style, locked or approved copy, detected factual copy, feed binding, managed QR/logo and unsupported mask relationships are rejected with guidance. No font, geometry, style or text is converted to make an unsupported heading eligible. Missing or tampered font bytes, decoding/loading errors, fallback/collision and overflow prevent review/apply through the font worker's `measureBannerPinnedText` API. Automated copy screening is conservative; the human still reviews meaning and unfamiliar claims.

## Shared file contract

`shared/bannerCompanion.ts` exports:

- `COMPANION_VERSION = 'banner-companion-wording/v1'`.
- `COMPANION_REQUEST_MAX_BYTES = 67108864`, `COMPANION_PROPOSAL_MAX_BYTES = 65536`, `COMPANION_TEXT_MAX_CHARS = 4000`.
- `companionRequestSchema`, `companionProposalSchema`, `companionEngineSchema` and inferred `CompanionRequest` / `CompanionProposal` types.
- `parseCompanionRequest(raw)`, `parseCompanionProposal(raw)`, `validateCompanionProposal(value, originalRequest)`, `companionBlockReason(layer, layers)`, `isCompanionWording(text)`.
- `CompanionEditMetadata` for existing layer storage.

Request root keys are exactly `version`, `requestId`, `sourceHash`, `boardKey`, `layerId`, `revision`, `fontHash`, `snapshot`. The full snapshot preserves project/canvas fields; it is not treated as an imported mutation. The CLI must independently verify `hashBridgeValue(request.snapshot) === request.sourceHash`.

Proposal root keys are exactly `version`, `requestId`, `sourceHash`, `boardKey`, `layerId`, `revision`, `fontHash`, `text`, `engine`. Engine keys and values are exactly `{ name: 'PhotoCraft', version: '0.16.0', platform: 'linux' }`. Font hash must match `BANNER_PINNED_FONT.sha256`. The proposal carries no canvas, style, metrics, URL, archive or command. Unknown keys reject, including explicit own `__proto__`, `constructor` and `prototype` keys at request/proposal/engine boundaries; an own-key precheck avoids Zod silently dropping `__proto__`.

File byte bounds are checked before JSON parsing. The browser checks `File.size` before calling `File.text()` and checks the decoded UTF-8 byte size afterwards. Download uses the same compact JSON serialization that passed the 64 MiB limit. Wording rejects control/C1/bidi characters, malformed surrogate text, line breaks, unproven scripts/emoji, overlength text and detected unsafe rewrites. Unchanged wording is rejected as a no-op.

## Authority, cancellation and application

`useBannerCompanion` keeps its original frozen request and reviewed proposal in component-local memory. No imported request, persisted `companionEdit`, proposed revision or returned hash can establish that authority. A fresh UUID distinguishes sessions even when local revision counters start at the same value.

A synchronous deep watcher invalidates authority on project identity or content, canvas, active board, selection or saved revision changes. Away-and-back changes and edit/undo cycles still invalidate the request. Closing the panel, unmounting/disposal and starting a new request cancel pending operations; a new file import or discard cancels pending reads/measurements and resets human approval. There is no persisted authority recovery.

Each hash, `File.text()`, font/measurement await is followed by checks of operation generation, retained authority identity, revision, selection, whole canonical source and current eligibility. Download also checks after awaiting request creation. Apply verifies the original frozen proposal and human approval again after each await. It builds the exact two-field proposed canvas and runs `assertManagedQrTransition` before consuming authority and making one synchronous `studio.updateLayer` call. Only selected-layer `text` and `companionEdit` may change. A repeated apply cannot reuse consumed authority.

Saved metadata contains `kind: 'manual-companion-wording'`, `engineVerified: false`, the fixed declared engine, request ID, source hash and font hash. This is descriptive, unverified user metadata, not an authenticated audit or authorization claim. `shared/bannerDocumentBridge.ts` permits that metadata on text layers solely in the Banner sidecar, so a completed edit remains eligible for subsequent supported exports.

## Verification

Focused command:

```sh
pnpm exec vitest run test/banner/companionContract.test.ts test/banner/companionProposal.test.ts test/components/bannerCompanionUi.test.ts test/banner/documentBridge.test.ts test/banner/documentBridgeEditor.test.ts test/banner/artworkUndo.test.ts --maxWorkers=1
```

Result: **129 passed, 1 existing optional test skipped** across six files. The three new suites cover contract strictness and byte/glyph/copy limits; original-request-only authority; full source export; selection/project/revision/close/dispose/new-request invalidation; suspended file/hash/font reads; newer-file precedence; review revocation; font failure and fresh-fit overflow; exact two-field mutation; managed QR preservation; one undo/redo; in-memory saved-canvas reload; and inspector guidance/review controls.

The store suite uses explicit deterministic measurement fixtures; it does not claim actual font rendering. Component tests stub Nuxt UI components to exercise bindings. The coordinator owns actual Nuxt + platform-font + Linux CLI proof, fixture API save/reload, screenshots and rendered-font evidence. That integrated browser proof was still being rerun at this task's checkpoint. Separate font-worker tests cover the real font bytes and browser font loader boundaries.

All six new source/test files pass focused ESLint. Existing dirty inspector, layer types and bridge files were not globally reformatted. No new database schema or server endpoint is required.

## Integration selectors and ownership

Stable UI selectors: `companion-open`, `companion-download`, `companion-file`, `companion-preview`, `companion-before`, `companion-after`, `companion-before-wording`, `companion-after-wording`, `companion-reviewed`, `companion-apply`, `companion-applied`, `companion-error`, `companion-unsupported`, `companion-missing-request`, `companion-close`, `companion-discard`.

Owned files are the shared contract, composable, new inspector component/entry, optional layer type, bridge metadata allowlist, these three test files and this document. Font files, native CLI, browser proof, public marketing updates and final independent review remain with their assigned owners. All work remains uncommitted in the supplied worktree.

## Coordinator integration follow-up

Actual Nuxt/Linux proof now passes at `output/editable-artwork-companion/ui-2026-10-27T04-32-30-268Z/`. Root added a contrasting preview surface using existing color helpers, without changing artwork color, plus deferred/coalesced stable panel-width observation to remove reproduced ResizeObserver feedback. Both page and window error lists are empty in the final complete rerun. All three component cases and the full 273-test selected regression pass after these changes. See COMPANION-WORDING.md and independent final review for exact scope.
