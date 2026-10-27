# Banner Studio governing architecture review

26 October 2026, finalized approximately 08:06 UTC. Scope: editable-artwork direction and the local, uncommitted managed-QR increment. Review owner: dispatched architecture reviewer; implementation remains with the coordinator and existing team.

**Decision: accept the managed-QR implementation within the reviewed local scope; complete feature and release acceptance remain open.** The insertion path uses an existing client QR record and the platform redirect renderer. Initial review found bypasses in whole-canvas AI edits, bulk brand-kit application, realtime updates and server persistence; the implementation owners repaired them, and the final reviewer run passed **189 tests across ten files**. No unresolved blocking source finding remains in those reviewed paths. Browser/hosted evidence and future pizza/drinks/test-drive flyer editing remain separate acceptance gates.

## Source and evidence boundary

- Reviewed `README.md`, `HANDOFF.md`, `V2-IMPLEMENTATION.md`, `PRD.md`, `LETTERING-WORKFLOW.md`, the copy fixture, QR insertion implementation, affected editor mutation paths and focused tests.
- Repository HEAD: `4111fb9b42b1463b42411a2ba5e4a1acaaf8a197`, branch `adme-dev/banner-editable-artwork`. Local `origin/main` is `21b162c19eb1956c80dc2ab2ab4731ead7968bfd`; read-only ancestry check passed. No fetch or Git mutation was performed in this review. These revisions identify the committed base, not the concurrently changing uncommitted patch.
- Only this report is owned by the reviewer. Product source, parent checkout and other workers' files were not changed. No deployments, provider calls, public QR requests/scans, external messages, large typechecks or builds were performed.
- Findings below distinguish observed source behavior, local deterministic tests, existing browser fixtures and missing live proof. The coordinator confirmed the server owner had settled before finalization. This is not approval of later unreviewed edits. Coordinator-reported checks are attributed separately below.

## Accepted direction and observed implementation

| Requirement | Source evidence | Acceptance limit |
| --- | --- | --- |
| Platform record owns QR identity and destination | `server/utils/banner/platformQr.ts` selects `qr_codes`; request accepts only `qrCodeId` and saved revision; SVG encodes `shortUrl(qr.code)` through existing QR renderer | No standalone Codex-generated QR, new QR registry or caller-supplied destination is needed. Actual selected client/record/destination still requires authorized operator verification. |
| Project and QR access are separate checks | `projectScope`, `requireWriteAccess`, `requireSocialClientAccess`, `requireQrCodeAccess`, `requireQrClientAccess`, same-client comparison and active-record checks | Verified through mocked boundary tests, not a hosted authenticated session. |
| Generated asset retains ownership and provenance | New signed `banner_assets` SVG carries client/owner and QR tags; layer `platformQr` records QR ID, canonical URL, asset ID, hash and render/source dates; server HMAC attestation is validated at persistence boundaries | Same-client record/asset validation now covers the identified write paths; see B2. Hosted ownership and storage behavior still need authorized verification. |
| Deterministic code pixels remain separate | `useBannerQr.ts` inserts an image with contain fit, no animation/filter, normal blend and recorded QR metadata; `shared/bannerQr.ts` checks canonical URL and returned asset identity | Framed SVG ratio is preserved on insertion. This does not prove real scan reliability or final print sizing. |
| Saved style is rendered with bounded safety checks | PNG center-logo validation, contrast screen, minimum four-module quiet zone, frame renderer and SVG size limits in `platformQr.ts` | Quiet-zone adjustment is recorded without mutating the QR record. Source quiet-zone warnings are returned but not explicitly shown in the current picker. |
| Stale/cancelled local requests cannot insert into a changed document | `useBannerQr.ts` binds project/client/artboard/selection/document, verifies saved revision/canvas, validates response, and uses one canvas undo | Tests cover pending changes, duplicate clicks, undo/redo/reload and failed final save. Server asset allocation can outlive a discarded response; see C1. |
| Direct image editing protects managed codes | Guards in `useAiLayerEdit`, `useDecompose`, `useMergeLayers`, `useBannerLettering`, `useBannerStudio.updateLayer`, and server lettering handler | These guards alone did not cover whole-canvas and bulk mutations; see B1/B3. |
| Generation does not intentionally manufacture a QR | `server/utils/banner/artwork.ts` instructs generation to leave a blank QR area and never draw/copy QR/barcodes | This is a provider instruction, not a pixel-level guarantee. Review generated concepts for accidental QR-like graphics before inserting the platform asset. |

The existing QR module continues to own destination changes and scan tracking. Banner Studio stores a rendered snapshot of that code, not a second destination setting. Changes to the redirect destination should take effect through the existing short URL; changes to QR styling require a new rendered asset. The stored `qrUpdatedAt` alone does not implement a refresh or stale-state workflow.

## Findings and resolution

### B1 — Whole-canvas AI edits bypassed QR protection

**Priority: P0 for claiming protected QR editing. Specific reproduced bypass repaired and covered by passing local regressions; broader release proof remains separate.**

Initial source: `server/utils/banner/designAssistant.ts:183–200` only guarded `locked`, then applied allowed `src`, `fit`, opacity, mask, animation and removal operations. `app/components/banner/DesignAssistant.client.vue:239–242` applied the response through `useBannerStudio.applyAssistantCanvas`; that function restored the whole canvas without invoking `updateLayer`.

A local `pnpm exec tsx -e` check imported the actual `applyDesignProposal` function with a synthetic managed image and two allowed asset URLs. Updating its source to the other authorized image, setting `fit: 'cover'` and opacity `0.2` succeeded while retaining `platformQr`. Output was `{"acceptedUnsafeQrChange":true,"staleManagedMetadataRetained":true,"originalUnchanged":true}`. This is deterministic source behavior, not a provider call or proof of a production incident.

The coordinator subsequently added `shared/bannerQrProtection.ts`, an explicit managed-layer rejection in `applyDesignProposal`, and an invariant check in `applyAssistantCanvas`. The reviewer reran the added regression cases: source replacement, metadata stripping and removal are rejected before canvas mutation, and server AI edits/removals fail even with `allowLocked: true`. The shared validator also rejects indirect masks and rendering violations by source inspection. Retain coverage of permitted unrelated edits and one-step undo. Preserve legitimate manual movement and explicit removal; AI must not infer permission to remove a protected QR from a general creative instruction.

### B2 — Project persistence lacked QR provenance and same-client ownership checks

**Priority: P0 for managed-record integrity and client separation. Resolved in the reviewed write paths with passing focused regressions.**

Initial `server/api/agency/banner-studio/projects/[id].patch.ts` validated project access/revision but serialized arbitrary `canvasData`. It did not resolve a `platformQr` record, check its registered asset/hash/source, or validate that the effective project client matched the QR client. A user authorized for clients A and B could reassign an A project to B while retaining A's QR artwork; an authorized editor could also submit altered source/metadata directly. The insertion endpoint's same-client guarantee was therefore not a lasting saved-document invariant. This finding does not assert an unauthenticated exploit.

The server owner added `server/utils/banner/platformQrCanvas.ts` and called it from PATCH before snapshots. It resolves QR and asset rows, checks the effective project client, QR access/activity/canonical code and asset URL, and validates a domain-separated HMAC attestation over the server-rendered asset identity/hash. Insertion now stores that attestation. `projects/index.post.ts` validates input and coordinator replay, `projects/[id]/duplicate.post.ts` checks source authority and managed linkage, and `versions/restore.post.ts` checks current authority, candidate linkage and revision CAS. Ordinary asset tag edits in `assets/[id].patch.ts` preserve existing server-reserved attestations and reject their introduction/replacement. These changed entry points were read end-to-end and their focused tests passed.

The coordinator also repaired target-artboard replacement in `dissect/[jobId]/import.post.ts`: it clones the saved canvas before mutation, rejects transitions removing/altering a managed QR, and uses a fresh revision CAS with monotonic millisecond timestamp. Tests cover blocked QR removal before writes and a concurrent-write conflict. Manual removal remains explicit: persistence permits removal of a managed layer, but retaining its ID while stripping metadata or swapping pixels is rejected. Destination changes remain supported because validation checks canonical record/code identity rather than requiring unchanged destination or style timestamps. These checks prove local enforcement with mocked storage/database boundaries, not transaction-level hosted behavior or live redirect delivery.

### B3 — Bulk and collaboration mutations bypassed the ordinary property guard

**Priority: P0 for preservation claims. Resolved with source review and passing brand-kit/realtime-message regressions.**

`useBannerStudio.applyBrandKit` originally directly replaced `src` when `app/utils/banner-brand-kit.ts:isLogoLayer` matched an image name containing `logo`, `brand`, `wordmark` or `mark`. A managed record named “Brand campaign”, inserted as “QR: Brand campaign”, could match without a malicious request. The coordinator added an explicit `platformQr` skip to that loop; the new test confirms a managed QR named “Logo” remains unchanged.

`useBannerRealtime.ts:196–212` originally assigned received properties and added layers directly. Shared invariant checks now guard received updates/additions. A dedicated test drives the real message handler through a fake WebSocket: remote source replacement, metadata stripping and an incoming mask targeting the QR are rejected, while valid movement succeeds. Other malformed effect/mask/identity cases exercise the shared validator. This is runtime fixture proof, not a live two-session collaboration test. Explicit collaborator deletion remains a separate permitted action.

### B4 — Scoped retail revision acceptance is still outstanding

**Priority: P1 for the next requested creative increment; blocks claiming that increment delivered.**

The documented G1 flow generates a complete flattened concept, while G2 changes selected native or already isolated lettering. Neither proves that an arbitrary flat retail flyer can be revised to emphasize pizza, drinks and test drives while retaining every fact, map, QR and voucher. `shared/bannerCopyProtection.ts` is a conservative text screen, not semantic preservation of an entire poster; the existing whole-canvas design assistant also does not enforce all `copyLocked`/commercial-content semantics.

Before implementing that increment, bind the proposal to the exact source revision and selected editable IDs/region. Define a protected inventory covering approved commercial tokens, original brand/OEM assets, map geometry/labels, the managed QR record and asset, voucher/legal content and merge fields. Apply only the reviewed changes and any required clean-background repair atomically. An unchanged metadata string is not evidence that generated pixels retained the right words or map. If the source is still flat, use explicit reconstruction or a reviewed repair boundary; do not cover old words with new lettering or describe a whole-poster rerender as a scoped edit.

## Important nonblocking limitations

- **C1: asset lifecycle.** `platformQr.ts` allocates a UUID/object for each successful request and compensates failures during upload/insertion checks. Client cancellation or stale response rejection after a successful server return can leave an unused asset; retries are not server-idempotent. Record this in R12 work and add reuse/idempotency or bounded orphan cleanup before scale. Existing compensation deliberately affects only the newly allocated asset; do not delete shared QR records on cancellation.
- **C2: record freshness and physical output.** Existing insertions are snapshots, with no demonstrated revalidation of inactive/deleted/reassigned QR records on export. Establish review/refresh behavior without freezing the legitimate redirect-destination feature. Minimum module/physical size, quiet-zone visibility, overlap and final PDF/print behavior remain unverified. The UI appropriately requests final-size review; no scan was performed here.
- **C3: browser and permissions proof.** The picker is built with Nuxt UI and client-scoped listing, but there is no managed-QR browser walkthrough in the reviewed evidence. Exercise permission denial, missing-client state, inactive/missing code, displayed destination, manager navigation, insertion, save/reload and undo/redo with explicit fixtures first; then repeat the authorized hosted boundary without treating fixtures as live proof.
- **C4: docs and marketing.** The current PRD/README checkpoint predates the managed-QR requirement. Add explicit requirements and gates for managed record ownership and scoped retail revisions, link this review, and update capability claims only to the verified level. Historical “no new blocking findings” in `V2-IMPLEMENTATION.md` refers to its earlier G1/G2 review, not this QR increment.

## Test and artifact evidence

Reviewer run on 26 October 2026 at approximately 07:46 UTC:

```sh
pnpm exec vitest run \
  test/banner/managedQr.test.ts \
  test/banner/managedQrProtection.test.ts \
  test/banner/platformQrAiProtection.test.ts \
  test/server/api/bannerPlatformQr.test.ts \
  test/server/api/bannerProjectWriteAccess.test.ts \
  test/app/bannerStudioRevisions.test.ts \
  --maxWorkers=1
```

**Result: 45 tests passed, six files passed, exit 0, 2.47 seconds.** This ran before the coordinator's B1/B3 remediation and validates the initial insertion/direct-edit tests, not those new fixes. An initial invocation containing unsupported `--minWorkers` exited before tests; the command above is the successful corrected run. No tests were authored by the reviewer.

After B1/B3 changes, repeated those six files plus `test/banner/designAssistant.test.ts` and `test/components/bannerDesignAssistant.test.ts` with `--maxWorkers=1`: **108 tests passed, eight files passed, exit 0, 6.80 seconds**, approximately 07:55 UTC. This includes the added whole-canvas and brand-kit regressions and existing design-assistant compatibility tests. It is not the final broader suite or evidence for server tests still being added by the implementation owner.

**Final reviewer run, approximately 08:04 UTC: 189 tests passed, ten files passed, exit 0, 5.90 seconds.** Command: the six-file command above plus `test/banner/designAssistant.test.ts`, `test/components/bannerDesignAssistant.test.ts`, `test/server/api/bannerProjectManagedQr.test.ts`, and `test/server/api/bannerDissectionReadiness.test.ts`, using `--maxWorkers=1`. This includes the settled server persistence fixes, reserved-tag handling, new realtime/brand-kit/whole-canvas cases and Dissector QR/CAS protection. An intermediate three-file run during implementation had 16 failing new boundary tests and 64 passing tests; the final green run supersedes that incomplete implementation checkpoint.

**Coordinator-reported final combined regression, received 08:05 UTC:** 725 passed, five skipped; 93 passing and four skipped files; 24.19 seconds. The reported scope includes all banner/QR tests plus artwork, decomposition, dissection, managed-QR, access, server-coordinator and app-state suites. The coordinator also reports standalone shared-helper TypeScript validation and five touched Vue SFC compilations passing, with freshly fetched main unchanged at `21b162c19`. These are coordinator-provided results, not an additional reviewer run or a global typecheck/build pass. Skipped cases are not acceptance evidence.

Read existing `output/editable-artwork-v2/ui-evidence.json`: lettering preview/apply/undo/redo/reload, first-use raster selection, concept import/save and custom-style reopening are true; provider is explicitly fixtures and persistence is file-backed. The artifact contains no managed-QR assertions. Its page-error list is empty but console errors include fixture WebSocket/SSE failures, so it does not prove realtime behavior.

Read existing `output/banner-provider-benchmarks/2026-10-26T07-10-28-456Z-b496bdc49cb9/evidence.json`: actual Qwen attempt failed, `layers: []`, `composite: null`, request ID/cost unknown. It provides no decomposition-fidelity evidence. The 457-pass aggregate in `V2-IMPLEMENTATION.md` is a historical reported run, not a fresh run by this reviewer. Live OpenAI quality, hosted storage/database behavior, complete reconstruction, QR destination delivery and print suitability remain unverified.

## Prioritized remaining job tree

```text
0. Completed local architecture and regression checkpoint
   Done: B1 whole-canvas AI/apply, B3 brand-kit/realtime, B2 persistence,
         provenance/client reassignment and Dissector protections reviewed;
         final focused reviewer run 189/189 passing;
         coordinator reports broader suite 725 passed, 5 skipped
   Preserve these gates if further implementation changes occur

1. Prove the actual managed-QR workflow
   1.1 UI owner: bounded real-editor fixture walkthrough and navigation proof
   1.2 Coordinator/operator: authorized record + destination + hosted ownership proof
   1.3 Product owner: agree freshness/export warnings and final-size checks
       Exit: exact project/client/QR/asset evidence, clearly separating local
       fixtures, hosted persistence, redirect behavior and physical scan evidence

2. Deliver scoped pizza/drinks/test-drive retail edits
   2.1 Coordinator: update PRD with selected region/IDs and protected inventory
   2.2 Implementation owner: reuse native layers; establish extraction/repair
       only where a flat source requires it, retaining original assets
   2.3 UI/API owners: preview affected area, enforce unchanged protected content,
       reject stale/unsafe proposals, apply one undoable transaction
   2.4 Reviewer/operator: compare facts/map/QR/voucher before and after,
       hide/move replacement, undo/redo, save/reopen and check final render
       Exit: only reviewed creative emphasis changes; no invented event facts

3. Complete broader editable-artwork gates independently
   3.1 R12 durable jobs, idempotency, cancellation, retry and orphan lifecycle
   3.2 Authorized live OpenAI evidence, enforced cost policy and provider comparison
   3.3 Remaining reference sides and held-out 20-creative evaluation
   3.4 Selected vector adapter and print/duplex/ICC/bleed/preflight gates
       Exit: measured evidence for each capability; never infer it from QR success

4. Integration and release, only under the coordinator's release workflow
   4.1 Reconcile then-current main, review all changes, preserve unrelated work
   4.2 Required checks, established-feature and QR navigation regression,
       synchronized public capability descriptions, deploy target guard
   4.3 Record source/main/deployment identity and verify the exact live artifact
       Exit: no fixture/local-pilot evidence presented as production acceptance
```

The supplied copy fixture already mentions pizza, drinks and test drives on the launch night, but labels itself brief-derived proof copy rather than final legal/client approval. Preserve its commercial dates, eligibility, addresses, phone, voucher and merge fields until explicitly approved changes are provided. Do not invent launch time, QR destination, customer code, headshot/signature, dealership frontage or coastal location. Promote the requested activities without importing new commercial claims such as “free” or changing offer eligibility.

## Coordinator evidence addendum after worker settlement

The review above records the reviewer's evidence boundary. The separate browser worker completed `scripts/banner-studio/prove-managed-qr.mjs`; its result is `output/editable-artwork-v2/managed-qr/ui-evidence.json`. The coordinator inspected that result: actual Nuxt UI with intercepted authentication, API and file persistence proved insertion, single undo/redo, save/reopen, manager link and preservation of all 124 original layers. Local jsQR decoded the canonical fixture URL at 120 and 240 pixels. There were zero AI calls, live scan requests, page errors or console errors. This closes the basic fixture walkthrough in task 1.1, not every negative permission UI case, hosted persistence, redirect delivery or physical print acceptance. Default placement overlaps the fixture footer and requires deliberate final layout placement.

PRD requirements R25/R26, acceptance A13/A14, README/HANDOFF links and relevant public feature descriptions have since been updated. C4's documentation request is therefore addressed at the local implementation level. Scoped retail edits remain pending. All three dispatched Orca workers have succeeded and been released; the coordinator retains integration ownership. The final lint correction changes only the WebSocket test harness instance capture, not product behavior.
