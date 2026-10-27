# Managed QR artwork integration

26 October 2026. Local implementation; no live QR record created, no destination changed and no scan traffic generated.

## Source correction

The supplied updated-map-artwork verification records six successful decodes to a direct Google Maps directions URL. Its export script places an independently rendered QR SVG over the generated map panel. This establishes a valid standalone QR, not a registered platform record. The original artwork and exports remain untouched; reference-manifest.json now records the updated files and hashes.

## User flow

Assign the Banner Studio project to its client, choose **Add QR**, select an existing active record, review its destination and insert it. If no suitable record exists, use the established QR Codes module to create/review it. The insertion endpoint does not create another QR system or invent a destination.

The new layer uses an owned signed SVG, generated deterministically by the existing QR renderer and encoding `https://app.xeroflow.io/q/{code}`. Its platformQr metadata retains the record/client/asset identities, source/render hashes and timestamps. The inspector links to the existing QR record. Changing that record’s destination does not require regenerating the encoded short URL; style changes require a new insertion. Normal movement and contain-fit sizing remain available. The renderer adds a minimum four-module quiet zone without modifying saved QR settings, and rejects unsupported SVG centre logos and low-contrast styles. These rules do not replace final scan testing.

Insertion adds a layer; it does not erase a code baked into a flattened poster. Default placement can overlap existing content, so move the code into a reserved area and inspect the final export. Automated layout and old-QR background repair are not implemented. No final print-ready replacement of the supplied front/back is claimed.

## Protection boundaries

- The server requires project write/client permission and the QR module’s permission for the same active client record, checks a fresh project revision, stores only a deterministic derived SVG and rechecks after storage.
- Generation prompts leave QR areas blank. Selected AI lettering/image editing, decomposition and merging refuse managed QR layers. The whole-canvas design assistant refuses QR edits/removals even with unlocked-layer permission.
- Inspector/store/realtime and whole-canvas transitions preserve source/metadata/rendering. Brand-kit logo substitution skips QR layers. Dissector import cannot overwrite a managed QR artboard and uses a revision predicate for the project update.
- The save validator checks structural constraints, current QR/client identity, exact registered SVG asset URL/client and a server HMAC attestation binding asset, client, QR code and image hash. Editable asset tags alone are not trusted. Deleting a QR layer explicitly is allowed; retaining it while stripping metadata or changing client is rejected.
- Live permission/database/storage acceptance remains unverified. No-QR legacy canvas flows retain their existing behavior. QR records may later be deactivated or deleted; the saved image is not a guarantee of future redirect availability.

## Evidence

`node scripts/banner-studio/prove-managed-qr.mjs` drives the actual local Nuxt editor with intercepted auth/API/file-storage fixtures. Evidence is in `output/editable-artwork-v2/managed-qr/`.

The browser proof passes existing-client selection, separate layer insertion, single undo/redo, save/reload, management link and preservation of all 124 original layers. Deterministically rendered fixture code decodes at 120 px and 240 px to the canonical platform short URL. There were zero AI requests, zero scan HTTP requests and no browser page/console errors. The fixture URL is not a claim of a live registered Eastern Subaru code. Backend access, stale revision, malformed style, forged metadata and provenance checks are covered by focused unit/API tests; fixture browser persistence does not exercise a hosted database.

A live authorised client QR selection and actual final-layout/export scan are still required before using this in client production. Do not manufacture scan analytics to prove it works.

## Final local verification and remaining limits

Final bounded regression: **725 passed, 5 skipped across 93 passing and 4 skipped files**. This includes the full banner and QR suites plus changed server/API and editor-state cases. The shared QR invariant helper passes standalone TypeScript, five touched Vue components/pages compile and scoped lint/whitespace checks pass. No clean whole-application typecheck or production-build claim is made.

Create, duplicate and version-restore routes also reuse the managed-QR save validator. Source/target client access is enforced and version restore retains a revision predicate. Ordinary asset-tag editing preserves server attestation tags and cannot create or replace a proof. Unsigned legacy QR assets or a rotated signing secret require reinsertion. QR/asset lifecycle checks are fresh reads rather than cross-table locks; pre-existing version snapshots remain nontransactional. Hosted credentials, real QR registration, final print placement and scan acceptance remain separate gates.
