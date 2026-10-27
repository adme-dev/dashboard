# Local lifestyle letter pilot

This is a curated native reconstruction of the revised **local lifestyle letter back**, not an automatic reconstruction service. Output lives in ignored `output/editable-artwork-pilot/`; reference assets remain unchanged. No hosted project, client publication or deployment is implied.

## Reproduce

1. Install with `pnpm install --frozen-lockfile`.
2. Keep the reference pack and inspected `output/editable-artwork-pilot/clean-background.png` in this worktree.
3. Run `pnpm exec tsx scripts/banner-studio/build-editable-letter.ts`. This validates the current lifestyle reference hash and builds `manifest.json`, `project.json` and `inventory.json`. All images are embedded in this local package; no upload or provider request occurs.
4. Run `RUN_REAL_BROWSER_TESTS=true pnpm exec vitest run test/banner/editableArtworkRealBrowser.test.ts`. Uses local Chrome (override with `CHROME_BIN`) and the real editor store, save payload and both HTML exporters. The file adapter and copy response are explicitly test fixtures.
5. For the full UI proof, start `pnpm dev --port 3137` in a persistent terminal, then `node scripts/banner-studio/prove-editable-letter.mjs`. It opens the actual Banner Studio page in headless Chrome. Only localhost requests receive test authentication/API responses. It previews/applies/undoes/redoes a heading, saves the changed canvas to disk, reloads and checks the changed heading. This is not an authenticated production session.

`project.json` is the original approved-copy native document; `saved-project.json` and `ui-saved-project.json` are persistence proof artifacts and may contain the demonstration rewrite. The package uses the existing BannerProject/canvasData/Layer contract. Stage 2 must add an owned-asset import boundary and an operator upload workflow; this JSON is not a public untrusted-upload format.

## Acceptance evidence and limits

- Physical metadata: 210 × 297 mm; canvas/export: 2480 × 3508 px.
- 124 stable layer IDs: 31 live text blocks, 91 native rectangles including road segments, two independent image assets.
- Exact commercial/legal/letter copy comes from the supplied reverse prompt, preserved in `test/fixtures/banner/lifestyle-letter-copy.json`. Generated concept OCR errors are not copied over.
- Clean plate is distinct from source; heading and offer hide checks inspect revealed pixels. Logo can move independently without revealing the old raster logo.
- Original approved blocks are explicitly copy-locked. Generic screening is conservative, not a semantic claim checker. Text-bound feeds are excluded from creative rewrites. Human review is required.
- Scope tests cover selection changes, away-and-back selection, deleted layers, project reload, document edits and undo while a request is pending. Changes reject stale proposals. Existing effects and unselected layers are preserved.
- Provider/account readiness is recorded in [PROVIDER-READINESS.md](PROVIDER-READINESS.md). The deterministic copy response proves editor behavior only.
- Arial is an approximate font match. Original supplied logo and generated masthead retain their low-resolution limitations. The map uses supplied route geometry, so differs intentionally from the model-invented schematic. No invented dealership frontage or coastal setting.
- RGB digital proof only. Font signoff, two human fidelity reviews, all-four-side acceptance, production asset storage, durable jobs/tenancy tests and CMYK/print preflight remain future gates.

## Background repair provenance

Built-in image_gen edit, not a deployed application adapter. Output hash: `7a525834251e567ff259b9c150d6d4ed03411baa73d840fcfdfb53c7dc68e5b0`. Model/version/request ID and billed usage were not exposed.

Prompt used:

> Edit target: supplied Eastern Subaru A4 letter reverse. Produce ONLY a clean background plate for rebuilding all editable lettering/graphics separately. Preserve the top leafy suburban Melbourne park photograph, eucalyptus framing, grass, distant picnic table, blue sky and its soft curved transition into white at precisely the same layout. Remove the Eastern Subaru logo and all lettering from the sky, repairing sky and foliage naturally. Remove EVERY word, number, logo, icon, line, yellow strip, map, voucher, and graphic from the remainder of the entire page, leaving pure white (#ffffff) below the existing curved photo boundary. No text whatsoever anywhere. No replacement typography. No invented dealership, coast, beach, water, people or cars. Full A4 portrait composition at original aspect ratio. Keep the top photograph around the top 20 percent and preserve original framing. This is a background-only separation, not a new design.
