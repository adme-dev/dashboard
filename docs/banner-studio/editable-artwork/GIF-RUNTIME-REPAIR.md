# GIF encoder / Nitro runtime repair

## Scope

This repair bundles the real `gifenc` encoder into the Cloudflare Pages server artifact so `POST /api/agency/banner-studio/export-gif` can load it under workerd. It touches only the `gifenc` entries in `nuxt.config.ts`. It does not change the route, its API semantics or encoding options, the PNG codec plugin/adapters, codecs, existing tests or gates, or any size budget.

It was made in the original worktree (`banner-editable-artwork`) only. The isolated PNG release candidate `e58188d4e` (`banner-artwork-release-20261027`) was not modified.

## Diagnosis

`export-gif.post.ts` loads the encoder with `await import('gifenc' as string)`. esbuild erases the `as string`, leaving a statically analysable `import('gifenc')`. `nuxt.config.ts` listed `gifenc` in `nitro.rollupConfig.external`, so Rollup never bundled it. The final module graph kept a bare dynamic import that `scripts/check-worker-imports.mjs` accepts only as a reviewed deferred optional import (`['gifenc', 1]`).

- **Node / dev / prerender:** the bare import resolves from `node_modules`, which hides the failure.
- **workerd (deployed Pages):** no `node_modules`. In the minimal Pages fixture below the route fails with `H3Error: No such module "chunks/_/gifenc"` → HTTP 500. That happens after browser launch and before any frame is encoded, so every GIF export fails at runtime.

`gifenc` 1.0.3 is pure JavaScript with no dependencies (`module` → `dist/gifenc.esm.js`, 9,098 bytes). It has no Node built-ins, so inlining it needs no interop plugin (unlike `pngjs`).

## Change (`nuxt.config.ts`)

- Added `'gifenc'` to `nitro.externals.inline`, next to `'pngjs'`, with an updated comment.
- Removed `'gifenc'` from `nitro.rollupConfig.external`. `@react-email/render`, `@cloudflare/puppeteer`, `puppeteer` and `pg-native` remain external and unchanged.

Diff of the `gifenc` lines only (the `pngjs` / plugin lines in the same hunks are the pre-existing uncommitted PNG work, left untouched):

```diff
-      inline: ['pngjs', /[/\\]shared[/\\]pageStudio[/\\]generated[/\\]/]
+      inline: ['pngjs', 'gifenc', /[/\\]shared[/\\]pageStudio[/\\]generated[/\\]/]
-      external: ['@react-email/render', '@cloudflare/puppeteer', 'puppeteer', 'gifenc', 'pg-native'],
+      external: ['@react-email/render', '@cloudflare/puppeteer', 'puppeteer', 'pg-native'],
```

## Regression proof — `test/config/gifRuntime.test.ts` (new)

1. **Config assertion.** The `nitro.externals.inline` line contains `'gifenc'` and the `rollupConfig.external` line does not. The remaining optional externals are still present. This test failed before the config change (observed) and passes after it.
2. **Red fixture (pre-repair config: `rollupConfig.external: ['gifenc']`).** The test builds an actual installed Nitro 2.13.4 `cloudflare_pages` project. Its route mirrors the export route's exact import and encoding calls. Then:
   - `checkWorkerImports` reports `gifenc` as the sole deferred optional import.
   - The emitted modules run in Miniflare/workerd. `GET /gif` returns 500, and workerd's runtime output matches `No such module "…gifenc"`. A mutation check (deliberately changing that regex) made the test fail, so this assertion is not vacuous.
3. **Green fixture (repaired config: `externals.inline: ['gifenc']`).**
   - `checkWorkerImports` reports no errors and no deferred imports.
   - No bare `import("gifenc")` remains. The emitted bundle contains gifenc's `NETSCAPE2.0` encoder code; it is real code, not a stub.
   - The emitted Worker encodes a 3-frame, 4 × 2 synthetic animation. It uses the same calls and options as the route: `quantize(pixels, 256)`, `applyPalette`, `writeFrame(index, w, h, { palette, delay: Math.round(1000 / fps) })` at fps 10, then `finish()` and `bytes()`.
   - **Structural check with an independent in-test parser (no gifenc):** `GIF89a`, 4 × 2 logical screen, 3 image descriptors, 3 graphic-control extensions with 100 ms delay and the transparency flag off (the route does not request transparency), `NETSCAPE2.0` loop = 0 (infinite), and a trailer.
   - **Decode check with an independent decoder:** sharp/libvips 0.35.3 reads `format: gif`, 3 pages, delays `[100,100,100]` and loop 0. Every decoded RGBA pixel of all 3 frames matches the input byte for byte.
   - **Transparency path:** a supplementary probe frame with `transparent: true, transparentIndex: 0` (not used by the route) decodes in sharp with alpha `[0,255,0,255,0,255,0,255]`. This shows the emitted encoder's transparency code works.
   - **No network:** Miniflare's `outboundService` records and rejects every outbound request. Both fixtures assert zero outbound requests.

## Validation (Node 24.18.0, nitropack 2.13.4, rollup 4.62.4, miniflare 4.20260708.1, sharp 0.35.3)

```text
pnpm exec vitest run test/config/gifRuntime.test.ts --maxWorkers=1
2 tests passed

pnpm exec vitest run test/config/gifRuntime.test.ts test/config/pngInterop.test.ts \
  test/config/workerImportClosure.test.ts test/workers/cloudflareNitroBindingBoundary.test.ts --maxWorkers=1
3 files passed | 1 skipped; 40 tests passed | 5 skipped

pnpm exec eslint nuxt.config.ts test/config/gifRuntime.test.ts
exit 0
```

The 5 skipped tests are the existing env-gated `cloudflareNitroBindingBoundary` suite. It was skipped both before and after this change.

## Bundle size estimate

- At fixture scale, inlining added 10,220 raw bytes to the emitted Worker (80,980 → 91,200). That is consistent with gifenc's 9,098-byte ESM build plus chunk wrapping.
- Against the reported full Pages raw spare budget of 82,191 bytes, the estimated headroom after this change is about 71,971 bytes.
- This is an estimate. The full app was not built (out of scope). The real artifact also passes through `wrap-worker` and the static-data compaction, which may change the figure slightly. The release owner's full-build size gate remains authoritative. No budget was changed.

## Limitations (honest)

- This proves module resolution and real encoding in the emitted Pages/workerd runtime for a synthetic fixture. It is **not** full GIF export acceptance. Not exercised: Cloudflare Browser Rendering / puppeteer frame capture, GSAP seeking, the `pngjs` screenshot decode, R2 upload, the `banner_exports` insert, auth, and the real dashboard bundle.
- The fixture does not apply the dashboard's other Rollup plugins (`compactPublicAssetsPlugin`, `workerProcessCompatibilityPlugin`, `bannerEnginePagesGuardPlugin`, `pngCodecInteropPlugin`) or the post-build wrap/compaction scripts. None of them targets `gifenc`. The full-build `check-worker-imports` / startup gates owned by release should confirm that the deployed artifact has 0 `gifenc` deferred imports.
- `scripts/check-worker-imports.mjs` still allows `['gifenc', 1]`. That is a maximum, so 0 passes. Tightening the entry is left to the gate owner, per the instruction not to alter existing gates.
- `test/workers/cloudflareNitroBindingBoundary.test.ts` still stubs `gifenc` in its own esbuild harness. That test is independent of `nuxt.config.ts` and was left unchanged.
- sharp is resolvable from the root `node_modules` (pnpm hoisted, transitive) but is not a direct `package.json` dependency. If it is ever pruned, the decoder half of the test will fail to import rather than pass silently.
- The export route still launches the browser before importing `gifenc`, and still uses the full 256-colour `quantize` without transparency. That is unchanged behaviour, retained by design.

## Source hashes (SHA-256, after change)

```text
859320876de2192835341a7be90164849e4a3c2b3e3f6949ff9c700eb7b09711  nuxt.config.ts
6550078644869b9e9d70927a57c1d9ebcb3069eb8413b75756b15d9b94729bf7  test/config/gifRuntime.test.ts
f6419e6dfda013cbdec29eb30834ef5c5e8eec39bca48f5efdb7641f87b8305f  server/api/agency/banner-studio/export-gif.post.ts (unchanged)
217761244379253ba5815510d3048a4fb1f4c4dbe9fb51a5cfbfe26f34eec093  node_modules/gifenc/dist/gifenc.esm.js (gifenc 1.0.3, unchanged)
3b0efcf7d38058823f5ee4e097f666d15ecdd4e517476746607af2184698546b  scripts/check-worker-imports.mjs (unchanged)
```

`nuxt.config.ts` before this change: `c68768458957814b7ed412a532e5b1ca40799c11405ed4aa56ba1ef61e54027e`.

## Coordinator integration

Root tightened the final import gate by removing the former gifenc allowance. The new gifenc unresolved-import regression failed before this change (expected one error, received none); the red runtime fixture now also asserts that the import gate rejects the unavailable codec. Candidate integration and the full artifact/deployment checks are recorded in the autonomous release ledger. The earlier worker-owned scope and hashes above remain historical handoff evidence.
