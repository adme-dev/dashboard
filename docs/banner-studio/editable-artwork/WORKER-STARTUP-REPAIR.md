# Worker startup repair — 27 October 2026

Status: source repair and regression gates implemented; repaired full-build artifact
acceptance remains with the release coordinator. This worker did not build, modify
the retained release candidate, commit, deploy, or contact a provider/database.

Coordinator integration additionally makes `pnpm check:worker-startup` mandatory at the end of `scripts.build`, after import closure and the unchanged size guard. The guarded deployment therefore exercises its exact rebuilt artifact before upload, without stubs or outbound network calls. The contract regression pins this command. Full-build and hosted results remain separate acceptance records.

## Failure and reproduction

Coordinator incident context: production artifact `22eed643`, source `865aa313d`,
failed with error 1101 (`No such module pngjs imported from _nitro.js`). The
coordinator restored artifact `4431aa2e`, source `704fb5caf`, and reported the
authenticated project API recovered to HTTP 200. Those hosted observations were
provided by the coordinator, not independently repeated by this worker.

Read-only retained candidate:
`/Users/paulgiurin/orca/workspaces/dashboard/banner-artwork-release-20261027/dist/_worker.js`.
The exact module startup test loaded 3,013 unchanged emitted JavaScript modules
and reproduced HTTP 500, `No such module "pngjs"`, imported from `_nitro.js`.
The aggregate module SHA-256 was
`eb9ce088ddb4bb01f42554d6dbba05bfe5783e75e1c211a47646e92a3aff8247`.
The digest covers ordered relative filenames, NUL delimiters and exact module
contents, with `index.js` first and the remaining names sorted. It is not a source
commit or a deployment ID.

The static parser found 2,752 static `pngjs` imports and five dynamic `pngjs`
imports. The new CLI rejected all 2,757 unresolved references with exit code 1.
The config regression also failed before the config change. This establishes
RED against the actual failed artifact rather than a synthetic replacement.

`nuxt.config.ts` explicitly externalized `pngjs`. PNG decoding is required by
artwork validation and engine result verification, so this package cannot be an
unavailable optional dependency. The existing broad
`cloudflareNitroBindingBoundary.test.ts` rebundles and substitutes a PNG stub;
its success does not establish deployable-artifact startup. It was left untouched.

## Changes and boundaries

- `nuxt.config.ts`: remove only `pngjs` from Rollup externals and add `pngjs` to
  Nitro inline dependencies, preserving the real codec and validation behavior.
- `scripts/check-worker-imports.mjs`: parse every emitted `.js`/`.mjs` with
  `es-module-lexer`; reject unresolved static imports/reexports, unknown dynamic
  packages, computed dynamic imports and missing/escaping relative targets.
  Relative paths must name an existing regular file; no extension guessing or
  local `node_modules` resolution is used. `node:` and `cloudflare:` imports are
  delegated to the platform and subsequently exercised by workerd.
- The only deferred bare-package exceptions are the existing optional dynamic
  imports: `@react-email/render` (maximum 1), `@cloudflare/puppeteer` (3),
  `puppeteer` (2) and `gifenc` (1). Static imports of these packages fail. These
  allowances do not supply modules or establish that those feature paths work;
  no `pngjs` exception exists.
- `package.json`: the only owned delta inserts
  `node scripts/check-worker-imports.mjs` immediately after `wrap-worker.mjs` and
  before `check-worker-size.mjs` in `scripts.build`.
- `test/config/workerImportClosure.test.ts`: 17 cases cover imports/reexports,
  comment/string false positives, cycles, relative resolution, explicit optional
  bounds, computed/unknown dependencies and the build/config contract.
- `test/workers/builtWorkerStartup.test.ts`: explicit Miniflare module definitions
  contain the unchanged final artifact bytes and use its generated compatibility
  date/flags. There is no bundler, module fallback or fake PNG implementation.
  A request to the real project API forces the lazy Nitro import and must receive
  the application's HTTP 401 auth rejection. All outbound fetches are denied and
  counted; the test requires zero. Missing artifacts fail instead of skipping.

Miniflare configuration follows the [Cloudflare modules documentation](https://developers.cloudflare.com/workers/testing/miniflare/core/modules/)
and installed Miniflare `ModuleDefinition` types. `worker.ready` alone is not
sufficient: the wrapper imports Nitro lazily on the first ordinary request.

The immutable size budgets and existing compaction logic were not changed.
The coordinator reported only 65,074 bytes of raw margin before this correction;
the real bundled codec's final cost must pass the unchanged size gate. Pre-existing
dirty changes in `nuxt.config.ts` (the engine guard) and `package.json` (OpenAI
dependency) belong to the broader release and were preserved.

## Historical validation performed

```sh
WORKER_ARTIFACT_DIR=/Users/paulgiurin/orca/workspaces/dashboard/banner-artwork-release-20261027/dist/_worker.js \
  pnpm exec vitest run test/workers/builtWorkerStartup.test.ts
node scripts/check-worker-imports.mjs /Users/paulgiurin/orca/workspaces/dashboard/banner-artwork-release-20261027/dist/_worker.js
```

Both intentionally failed against the retained broken artifact as described above.

```sh
pnpm exec vitest run test/config/workerImportClosure.test.ts \
  test/server/utils/bannerArtwork.test.ts \
  test/server/utils/bannerArtworkPngBounds.test.ts \
  test/server/utils/bannerEngineResult.test.ts
pnpm exec eslint scripts/check-worker-imports.mjs \
  test/config/workerImportClosure.test.ts test/workers/builtWorkerStartup.test.ts nuxt.config.ts
git diff --check -- nuxt.config.ts package.json
```

All 57 tests across four files passed; scoped ESLint and diff whitespace checks
passed. Existing real-codec PNG validation/bounds/result checks remain intact.
The Vite `configLoader: native`/`__dirname` deprecation warning is pre-existing.

## Current coordinator acceptance commands

Integrate only the owned deltas into the current release base, run the sole full
build, and retain its exact source and artifact digest. The build now includes
the import gate before the unchanged size gate. Then run:

```sh
# Run in the release candidate after its own pnpm build.
node scripts/check-worker-imports.mjs
pnpm check:worker-startup
```

Both must pass against the actual final artifact. The current runtime test is pinned to the repository dist/_worker.js and rejects an alternate WORKER_ARTIFACT_DIR. The earlier override command above is historical reproduction evidence, not a current supported command. See [Claude release check](CLAUDE-RELEASE-CHECK.md), section 6, for the strengthened lazy-route/real-codec and CommonJS gates. The repaired artifact has not
yet been built or proven by this worker, and no claim is made about final size,
hosted startup, authenticated/database access, providers, or deferred optional
features. Preserve the current-source/deployment checks and QR/navigation release
verification in the coordinator's release process.

## Source hashes at handoff

| File | SHA-256 |
| --- | --- |
| `nuxt.config.ts` | `69854506ddfb8f5d3e8157915a35704b1978d860c719386d4a8550cb8572d008` |
| `package.json` | `0c88ab66373092343e425a61d1284d874fe76508df9aa6f220bdc8d6c8499cde` |
| `scripts/check-worker-imports.mjs` | `49769b9724313ab7bac3ebbe168caf5edc6a750ed55a39510528bc4cab3004d9` |
| `test/config/workerImportClosure.test.ts` | `ef6d5e81eaf58876214a06282c8d59cbafe3b7c8a528d08d3984e844e6a25e7b` |
| `test/workers/builtWorkerStartup.test.ts` | `d2700157527754255ab0249c683b703b4852819453204f102c90ac5820a1c6f2` |
