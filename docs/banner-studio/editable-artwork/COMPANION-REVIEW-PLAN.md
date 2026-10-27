# Companion wording review implementation plan

> Workers use the existing supervised Orca workflow and independent review. Paul has already authorised continued implementation; no new design approval or deployment is requested.

**Goal:** Complete a usable manual Banner → Linux companion → Banner selected-wording workflow with platform-served exact fonts, explicit preview/apply, one undo and saved provenance.

**Architecture:** Browser owns a transient request and full canonical project snapshot. A typed local CLI consumes the exported request and runs the proven Linux bridge. Its small returned JSON is untrusted proposed wording; the browser independently checks request/source/selection binding, protected copy, exact font bytes and current text fit before review and apply. It never accepts an imported canvas, arbitrary style, executable command or claimed native metrics as authority. This manual flow does not pretend to be hosted automation.

**Tech stack:** Existing Vue/Nuxt UI, Banner store/fonts/exporter, Zod/shared copy guards and isolated Linux PhotoCraft bridge.

**Spec:** ONLINE-ENGINE-DESIGN.md; LINUX-NATIVE-ROUNDTRIP.md; existing native review/undo requirements.

## Current source and constraints

Fresh fetch on 27 October: origin/main4469d6a2fb873c2d7b90ece9a359dd571def0ba2 is included in HEAD47ec30c3522f6ab660d730776709770c8a22d7c8, one ahead/zero behind. Preserve all dirty files and the parent. No commit, merge, deployment, provider/DB mutation or purchase. Keep OpenUI documented separately. No new database schema is needed: optional descriptive layer provenance uses existing canvas storage and is not an authorization or authenticated audit claim.

## Contracts

The UI/contract worker defines shared/bannerCompanion.ts with strict versioned request and proposal schemas and sends exact exports to root promptly. Request contains a random UUID, complete canonical project snapshot plus its hash, board key, selected layer ID and revision. Maximum serialized request64MiB; returned proposal64KiB; selected wording4000chars. Proposal contains matching request/source/board/layer identity, new wording, the fixed supported font hash and declared engine identity. It contains no imported canvas, measurements, URLs, raw archives or scripts. Unknown fields reject. Unauthenticated engine declarations are descriptive only.

Browser retains its original request object in memory and invalidates it on project/epoch, selection, canvas or saved-revision change; no imported request may establish authority. Closing, unmounting or starting a new request cancels in-flight reads/measurement. Recheck after every await and immediately before one atomic store update. Human preview approval is mandatory. Only text and descriptive companion provenance may change on the selected layer; all other layers and managed QR stay exact. Provenance itself must not prevent later supported exports and remains untrusted user metadata.

Font worker exposes a shared pinned-face declaration and browser loader/measurement interface. Exact Source Sans3 Bold3.052 bytes and OFL are checked into content-addressed public assets, with hash verification before FontFace loading. Reuse existing font catalog/loading/export interfaces; avoid duplicate/custom family collisions and retain other families/weights. Native renderer and browser font hashes must match. Missing/tampered/loading-failed font prevents review/apply. Browser measurement uses actual bounds without changing the layer box or style. No unsupported original heading is silently converted.

## Tasks and ownership

1. Font worker: new shared/bannerPinnedFont.ts; public/fonts/banner/ pinned TTF/license; new app/utils/banner-pinned-font.ts; app/composables/useBannerFonts.ts; existing client/server HTML builders only if needed for consistent pinned exports; focused font tests; COMPANION-FONTS.md. Provide exact API early. No UI/store/native CLI edits.
2. UI/contract worker: shared/bannerCompanion.ts; app/composables/useBannerCompanion.ts; new inspector/Companion.vue and its inspector entry; optional Layer.companionEdit type and metadata allowlist in shared/bannerDocumentBridge.ts; focused contract/store/UI tests; COMPANION-UI.md. Read required frontend-design skill before form edits. Reuse Nuxt UI upload/control components. No font module, CLI or root proof edits.
3. Coordinator: typed scripts/banner-studio/companion-wording.ts adapter consuming contract and proven native helpers; real Linux-to-actual-Nuxt browser proof with fixture persistence, no intercepted font bytes; docs/marketing accuracy, source/cleanup/card reconciliation. Bind all CLI inputs and output paths under owned output and use fresh operation directories. No arbitrary native commands or remote paths.
4. Independent reviewer: COMPANION-REVIEW.md only. Review contracts, authorization boundaries, races/replay, raw-file bounds, missing/tampered fonts, rendering, native CLI evidence, provenance honesty and saved project/undo. Send fixes to owners; no runtime mutations while owners execute.

## Verification and review focus

- Contract tests reject unknown fields, mismatched request/source/board/selection, unsafe/protected copy, malformed Unicode/control text, arbitrary styles/canvas/metrics and over-limit files.
- Store tests reject stale project/epoch/revision, selection changes during reads/font load, late proposals, altered reviewed data, repeated apply and failed measurements; one undo restores exact original, redo/save/reopen keeps native wording and descriptive provenance.
- Font tests exercise actual pinned bytes, family/weight collision, load error and hash mismatch; existing export paths use correct URL and font weight.
- Root proof obtains a real request from the actual editor, produces a proposal via the Linux CLI, imports and previews in Nuxt, applies and saves/reloads with fixture API, verifies source styles/other layers/QR, one undo/redo and exact platform-served font through Chrome's rendered-font report. Also prove stale return rejection and unsupported-heading guidance. Retain screenshots, native receipts, source hashes and explicit local/hosted limits.
- Independent review closes concrete findings and all workers settle/release. No full artwork/print/live provider or hosted-engine claim.

Status: local implementation and actual Nuxt/Linux integration passed. See COMPANION-WORDING.md for the exact artifact, 273-test regression, failed attempts, scope and remaining hosted gates. Independent final review is recorded in COMPANION-REVIEW.md.
