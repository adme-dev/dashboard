# Claude release check — worker startup repair (27 October 2026)

> **Status update:** F1–F4 are repaired in the original worktree's guard files and
> verified against the exact candidate artifact (digest `b5cc4ed2…`). Section 6
> describes the repairs. Sections 1–5 are the original review, kept unchanged.

Reviewer: Claude (replacement for Grok, which had no authenticated session; the
coordinator renamed this report from `GROK-RELEASE-CHECK.md`). Review only. This
reviewer did not build, deploy, commit, call providers or databases, access secrets,
or modify the candidate `banner-artwork-release-20261027`. Every probe ran in
`/tmp/claude-release-probe.Te3O`, outside both repositories.

Inputs reviewed, read end to end in the candidate:
`scripts/check-worker-imports.mjs` (sha256 `49769b97…`),
`test/workers/builtWorkerStartup.test.ts` (`d2700157…`),
`test/config/workerImportClosure.test.ts` (`333024ba…`), `nuxt.config.ts` (`69854506…`),
`package.json` (`879a9c71…`, which includes the root's `pnpm check:worker-startup`),
`WORKER-STARTUP-REPAIR.md`, `scripts/wrap-worker.mjs`,
`scripts/compact-worker-module.mjs` (dispatcher), `scripts/deploy-pages.mjs`,
`.github/workflows/ci.yml`, `vitest.config.ts`, `test/setup.ts`,
`server/middleware/auth.ts`, plus the installed `wrangler@4.110.0` and
`nitropack@2.13.4` Cloudflare preset sources. Kimi's PNG/Stream interop patch was not
available yet, so it was not reviewed.

## 1. Why the build passed but live startup failed

1. `pngjs` has been a Rollup external since `8d3bdf678` (2 March 2026, "externalize
   puppeteer/gifenc"). At base `704fb5caf` the server used pngjs only through dynamic
   `import('pngjs' as string)` calls: `export-gif.post.ts:48` and
   `bannerDissector.ts:336/790/836`. A bare dynamic import fails only when that code
   runs, so the Worker still started.
2. `865aa313d` added static `import { PNG } from 'pngjs'` in
   `server/utils/banner/engineResult.ts:2` and `artworkValidation.ts:4`. Because pngjs
   was external, Rollup kept it as a bare import and hoisted it into the shared
   `_nitro.js` graph. The repair doc counted 2,752 static and 5 dynamic references.
3. None of the existing checks resolves the final module graph:
   - `nuxt build`, `wrap-worker.mjs` and `check-worker-size.mjs` never resolve it.
   - `cloudflareNitroBindingBoundary.test.ts` rebundles the code with a PNG stub.
   - CI therefore stayed green.
4. The upload also passed. Wrangler esbuilds only `index.js` and passes every other
   `**/*.js`/`**/*.mjs` file through unchanged as an external module
   (`produceWorkerBundleForWorkerJSDirectory`, with bundling on by default:
   `enableBundling = args.bundle ?? !(args.noBundle ?? config.no_bundle)`). It does not
   resolve bare imports inside those modules.
5. The dispatcher loads Nitro lazily (`await import('./_nitro.js')`,
   `compact-worker-module.mjs:166`). Cloudflare's upload-time startup check only
   evaluates the static graph of `index.js`, so it never linked `_nitro.js`. The first
   ordinary request linked `_nitro.js` and failed with `No such module "pngjs"`, which
   is error 1101.

**Inference, not checked on the hosted site:** restored production `4431aa2e` (source
`704fb5caf`) still has pngjs external. Its GIF export and dissector PNG decode paths
should therefore fail whenever they are called. GIF export also stays broken after
this repair, because `gifenc` is only listed as a deferred optional dependency.

## 2. Do the new gates prevent this from happening again?

**The exact failure is covered.** Any static or dynamic bare ESM import, in any emitted
module, is rejected whether or not a request reaches it:
- The scan runs after `wrap-worker.mjs`, so it sees the final filenames and bytes.
- Its module set (`.js`/`.mjs`) matches what Wrangler uploads.
- `deploy-pages.mjs` runs `pnpm build`, so the gate runs on every deploy. The only
  later writes are `flattenRedirectedPagesConfig` (it changes `wrangler.json`, not
  modules) and Wrangler's rebundle of the tiny entry file.
- CI runs `pnpm run build` before the full suite, so CI applies the gate too.
- The focused suite passed: `pnpm exec vitest run test/config/workerImportClosure.test.ts`
  ran 17/17 on Node 24.18.0 in this worktree; that file is byte-identical to the
  candidate's.
- A missing artifact fails the test instead of skipping it (confirmed with ENOENT on
  `wrangler.json`).

**Adjacent failures that still get through** are listed in section 3, in order of
importance.

## 3. Findings

### F1 — High: the startup proof never reaches the route chunk or the PNG codec

The test comment says the request "forces … full application initialization"
(`builtWorkerStartup.test.ts:42`). In practice, the global `server/middleware/auth.ts`
throws the 401 before any route runs (lines 210–219: no token means
`createError({ statusCode: 401 })`). Nitro never loads the lazy handler chunk for
`/api/agency/banner-studio/projects`.

The proof therefore covers only:
- the `_nitro.js` static graph,
- plugins, and
- middleware up to the auth check.

It never imports or runs a lazily loaded chunk, and it never decodes a PNG.

**Why this matters now.** After inlining, pngjs becomes CommonJS wrapped by Rollup. That
module can be evaluated lazily, only when PNG decoding is first needed. The failure
class blocking the build today (a CJS `Stream` constructor interop error, currently in
Node prerender) could therefore pass both new gates in workerd and still fail every
artwork validation or engine-result check in production.

**Probe a3 reproduces this in workerd** (Miniflare 4.20260708.1):
- A chunk with `import { PNG } from 'pngjs'`, loaded only by `/png`, still produces a
  clean `401` on the probed route.
- `/png` then returns 500 with `No such module "pngjs" imported from "lazy.js"`.
- In this case the lexical gate does catch it. An evaluation-time interop error would
  not be caught by either gate.

**Fix.** Add an execution assertion against the same unchanged bytes. Use an extra
test-only Miniflare entry module, kept outside the artifact and its digest, that does
the following:
1. Dynamically imports the emitted module containing the codec. Find it by a stable
   marker, or better, give Kimi's adapter a stable chunk name (for example via
   `manualChunks`) and a stable export.
2. Runs both `PNG.sync.read` and the streaming `new PNG().parse` path on a 1×1 fixture
   inside workerd.
3. Asserts the decoded width, height and RGBA.

This is the only check that proves the real codec works in the Worker runtime.

### F2 — Medium: the import gate only sees ESM, so CJS `require` residue passes

`es-module-lexer` reports only `import`/`export` forms. Probes a1/a2 show that both of
these pass `checkWorkerImports` with zero errors:
- `require("pngjs")`
- `createRequire(...)('pngjs')` (`node:` imports are allowed at line 46)

This is directly relevant because `require`/`createRequire` is a common way to fix
Node-side CJS interop.

In workerd:
- A `createRequire(...)('pngjs')` inside a function gives a `401` at startup but
  `No such module "bundle/pngjs"` on the decode path (probe a1).
- A top-level `createRequire(import.meta.url)` crashes startup, because
  `import.meta.url` is undefined there.

**Fix.**
- In final modules, reject `require(`, `createRequire(`, `__require(` and
  `commonjsRequire(` calls whose literal specifier is not a `node:` built-in.
- Also reject any non-literal `require` call.
- Pair this with F1.

### F3 — Low: relative targets are checked for existence, not for upload

Lines 54–58 accept any existing regular file. Wrangler uploads only `**/*.js` and
`**/*.mjs` as `ESModule` (via `findAdditionalModules`). Probe a4 shows
`import "./data.wasm"` passes the gate even though that file would never be uploaded
as a module.

**Fix:** require relative targets to match `/\.(?:js|mjs)$/`, or mirror Wrangler's
module rules exactly.

### F4 — Low: the build gate inherits an ambient `WORKER_ARTIFACT_DIR`

`pnpm check:worker-startup` uses `process.env.WORKER_ARTIFACT_DIR` when it is set. The
repair doc's acceptance commands use that variable. If it is exported in the shell
(or in CI), `pnpm build` validates a different artifact than the one it just built,
while `check-worker-imports.mjs` checks `dist/_worker.js`. The test logs its digest,
but nothing compares it.

**Fix:** pin it inside `scripts.build`
(`WORKER_ARTIFACT_DIR="$PWD/dist/_worker.js" pnpm check:worker-startup`), or have the
test refuse an override when it runs under `npm_lifecycle_event=build`.

### F5 — Info

- **Late outbound calls are missed.** `outboundCalls` is read as soon as the response
  arrives, so `waitUntil` fetches that start after the response are not counted.
- **Local runs fail without a build.** `test/workers/builtWorkerStartup.test.ts`
  matches the repo-wide `test/**/*.test.ts` include, so a local `pnpm test:run` with no
  `dist` fails by design. CI builds first, so CI is unaffected.

## 4. Limits for the hosted environment

| Property | Proven locally | Not proven |
| --- | --- | --- |
| Module bytes | Every `.js`/`.mjs` byte in `dist/_worker.js` | The uploaded entry module: Wrangler re-esbuilds `index.js` at deploy time. The other modules are uploaded as-is. |
| Runtime | Local workerd from Miniflare 4.20260708.1, with `compatibility_date`/`flags` taken from the generated `wrangler.json`. These match `wrangler.toml`; no env override was found. | The Cloudflare production runtime version |
| Environment | `APP_URL` only, outbound fetch blocked | Hyperdrive, KV, Durable Objects, Queues, AI, about 150 text bindings, secrets, and any initialization that branches on bindings |
| Request path | Unauthenticated 401 from global middleware | Authenticated sessions, the database, route chunks, PNG decode, engine/dissector/QR paths |
| Optional modules | Bounded, non-static references to `@react-email/render` (1), `@cloudflare/puppeteer` (3), `puppeteer` (2), `gifenc` (1) | That those features work. GIF export depends on `gifenc`, which is not available. |
| Cloudflare upload check | — | Only evaluates the entry's static graph, so it cannot catch failures inside `_nitro.js` or later. The first real request after deploy is still required (current-source check, authenticated project API 200, QR/navigation). |

## 5. Gate-inventory patch (`godModeIsolationInventory.test.ts`, `GATE-INVENTORY-REVIEW.md`)

**Verdict: no actionable finding.** I recomputed the inventory independently from
`git ls-tree`/`git show` with the test's own regexes:
- Base `704fb5caf`: [2283, 1245, 410, 49].
- Candidate HEAD `865aa313d`: [2294, 1254, 422, 50].
- There are no untracked `server/api` files.

Exactly 20 files changed classification. Each vector in the review doc matches:
- 11 new routes, 9 of them mutations.
- +12 inline gates: 9 existing mutations plus 3 new ones.
- +1 guarded transaction: `dissect/[jobId]/import.post.ts`.

The six new mutations without an inline match are protected elsewhere:
- `generate`, `lettering` and `repair-lettering` go through `proposeArtwork` /
  `proposeLetteringRepair`, which call `requireWriteAccess`.
- `qr.post` goes through `insertBannerPlatformQr` (`platformQr.ts:187`, which calls
  `requireWriteAccess`).
- The cron route checks `CRON_SECRET` with `timingSafeEqual`.
- The internal engine route calls `assertEngineServiceAuth`.

The diff from `704fb5caf` to `eb294e860` touches only
`shared/pageStudio/formOutcomes.ts` and its test, so it has no effect on the
inventory. I did not run that vitest file inside the candidate, to avoid writing a
Vitest cache into the read-only tree.

## 6. Repairs (F1–F4) and verification

Scope: I edited only the original worktree's `scripts/check-worker-imports.mjs`,
`test/config/workerImportClosure.test.ts`, `test/workers/builtWorkerStartup.test.ts`
and this report. No changes were made to the candidate, `package.json`,
`nuxt.config.ts`, or Kimi's runtime files. I did not run a full build, deploy, commit,
call providers or access secrets.

To verify, I copied the candidate's finished `dist/_worker.js` into this worktree's
ignored `dist/`. Its file-tree digest matched the candidate's before and after the
mutation checks (`ae21dfa5…`), and the startup test logged
`sha256=b5cc4ed2c27c3b68276f698e92917be2602a28ba906966073fa17dcdf7f7e627`
for all 3,013 modules.

Final file hashes:

| File | sha256 |
| --- | --- |
| `scripts/check-worker-imports.mjs` | `3b0efcf7…` |
| `test/config/workerImportClosure.test.ts` | `095cc5fd…` |
| `test/workers/builtWorkerStartup.test.ts` | `32098c52…` |

### F1 — repaired: a separate probe runs the real emitted codec in workerd

The primary `index.js` → 401 startup proof is unchanged. A second Miniflare instance
loads the same unchanged module bytes plus one test-only entry module. That entry is
never written to disk and is excluded from the digest. The probe works as follows:

1. **Finds every Banner route in Nitro's emitted handler table.** It parses the
   handler table with acorn and finds every `route: "/api/agency/banner-studio/…"`
   entry. It resolves each handler to its exact compacted chunk. It handles these
   handler forms:
   - `() => import("./x.js")`
   - esbuild's `s(() => import(…), "handler")` keep-names wrapper
   - `.then(e => e.d)` namespace picks

   Any handler it cannot resolve fails the test.
2. **Loads the real application.** It imports `./_nitro.js` and every route chunk. It
   then resolves each handler the same way h3's `lazyEventHandler` does (the picked
   export, then `.default`) and asserts that each handler is a function.
3. **Finds the codec.** It computes the static-import closure of the route chunks and
   keeps only modules that contain the upstream pngjs decoder marker
   `bad png - invalid inflate data response` (from `parser-sync.js`). It then scans
   those modules' exports for exactly one constructor whose own `sync.read` and
   `sync.write` are functions. It checks the export itself, or a namespace's own
   `PNG` data property, and reads only data descriptors, never getters. These modules
   were already evaluated by the route imports, so the scan evaluates nothing new.
4. **Runs the codec on fixtures.** The fixtures are built with `node:zlib`, not pngjs,
   and passed as `Buffer`s, as the real call sites do. The probe checks:
   - **Exact decode:** a 3×3 RGBA image decodes to the expected pixels.
   - **Round trip:** a `new PNG({ width: 2, height: 1 })` encode/decode returns the
     same pixels.
   - **CRC check:** a single flipped IDAT CRC byte is rejected with `checkCRC: true`
     and accepted with `checkCRC: false`. This shows the rejection is caused by the
     CRC check.
   - **Inflate bound:** a CRC-valid IDAT that inflates to 64 KB past the image size
     is rejected with workerd's `Memory limit exceeded`.
   - **No outbound calls:** zero outbound calls are made.

**Exact-artifact result:**
- 133 Banner routes resolve to 133 handlers in 132 chunks, all of them functions.
- The static closure has 134 modules. The codec module is `chunks/m/0.js` and the
  codec is its export `I_`.
- `I_` is Rollup's frozen `{ PNG }` namespace for Kimi's adapter. It is exported only
  because the dynamic `import('pngjs')` consumers (GIF export and dissector) cross the
  chunk boundary.
- `validateArtworkPng` (`aS`) and the adapter class (`wp`) are internal.
  `cropLetteringRepairReference` is inlined into `proposeLetteringRepair`. That is why
  name- or marker-alias discovery of validation exports was dropped.

**Mutation checks** (each made on my local copy, then restored byte-identical to the
candidate):

| Mutation | Result |
| --- | --- |
| `maxOutputLength` mapping removed | Fails: pngjs falls back to its post-inflate `unrecognised content at end of stream`. |
| CRC check disabled | Fails |
| Namespace `PNG` replaced with `void 0` | Fails: `codecs: []` |

The harness tests also cover these cases on synthetic artifacts:
- compacted chunks, keep-names and `.then` handlers, and aliased exports;
- a missing codec export (fails);
- a decoder marker outside the Banner closure (fails);
- a codec chunk that throws `Class extends value [object Module]` during evaluation.
  The probe returns 500 even though the auth startup path still returns 401. This is
  the exact class of failure F1 described.

**Correction to my original F1 text:** the streaming `new PNG().parse` path does not
exist any more. Kimi's adapter is sync-only, so the probe uses `PNG.sync.*`.

### F2 — repaired: CommonJS `require` residue is caught with an AST and real lexical scopes

`findUnbundledRequires` parses with acorn, which is a direct dependency. It models
scopes as follows:
- `var` hoists to the enclosing function or module.
- `let`, `const`, `class` and strict-mode function declarations are block-scoped,
  including inside `for` loops and `switch` statements.
- Catch parameters and function parameters bind only in their own scope.

It flags calls to any of the following:
- a free `require`;
- a binding derived from `createRequire`, whether imported from `node:module`/`module`,
  called through a namespace (`m.createRequire`), or called inline
  (`createRequire(…)(…)`);
- bindings initialised from esbuild's `__require` helper or Rollup's `commonjsRequire`
  helper (recognised by their `Dynamic require of "` and
  `Could not dynamically require` strings, because their names are minified).

Literal `node:` and `cloudflare:` specifiers are allowed. Any other literal, and any
non-literal argument, is an error. Bundled wrappers do not trigger it, for example:
- `requireX()` functions;
- the helpers' own `require.apply` / `typeof require`;
- webpack-style `require` parameters;
- shadowed locals;
- the string `"require(…)"`.

The root's red case (`if (false) { const require = x => x } require("pngjs")`) is now
flagged. It is a regression test, along with the for-of, catch, switch, block-function
and method-parameter variants.

**Reviewed exception.** The real artifact surfaced exactly one hit: node-postgres'
`try { t = require("pg-native") } catch (l) { throw l }` in `chunks/m/0.js`, inside the
lazy `pg.native` getter.
- `pg-native` has been an intentional Rollup external since `92d483216`.
- Nothing in `server/` or `lib/` reads `pg.native`.
- It is now a separate deferred-require list (`pg-native`: 1), bounded by count like
  the deferred optional imports. A second occurrence fails the gate.

On the real artifact, `node scripts/check-worker-imports.mjs` reports
`PASS: 3013 modules; 8 reviewed deferred optional imports` (7 imports plus the
`pg-native` require) in about 2.5 seconds.

**This gate does not prove the full CommonJS closure.** It does not detect:
- `module.require`, `process.mainModule.require` or `globalThis.require`;
- `require` reached through object properties or computed members;
- `eval` / `new Function`;
- `createRequire` obtained in any way other than an import from `node:module`/`module`.

### F3 — repaired

Relative import targets must now be `.js` or `.mjs`. Any other target is rejected with
`relative import target is not an uploaded .js/.mjs module`. Tests cover `.wasm`,
`.json` and `.cjs`.

### F4 — repaired

`builtWorkerStartup.test.ts` is now pinned to `<repo>/dist/_worker.js`. If
`WORKER_ARTIFACT_DIR` is set to any other path, the test throws instead of silently
checking a different artifact (verified). `workerImportClosure.test.ts` asserts both
the pin and that `check:worker-startup` contains no override.

**Follow-up for the root:** `WORKER-STARTUP-REPAIR.md` was read-only for me, and its
acceptance commands still use `WORKER_ARTIFACT_DIR`. They need updating. To validate
another artifact, copy it to `dist/_worker.js`.

### F5 — partly addressed

Both dispatches now wait 250 ms after the response before counting outbound calls.
`waitUntil` work that starts later is still not observed.

### Review of Kimi's PNG patch

Files reviewed:
- `scripts/png-codec-interop.mjs`
- `lib/pngjs-sync.ts`
- `lib/pngjs-sync-inflate.ts`
- `lib/pngjs-sync.d.ts`
- the `nuxt.config.ts` diff
- `PNG-INTEROP-REPAIR.md`

**No blocking finding.**
- The sync-only adapter matches every server call site.
- The plugin resolves only the bare `pngjs` import, the sync entry, and
  `parser-sync`'s `./sync-inflate`.
- The emitted inflater maps `maxLength` to `maxOutputLength`. A standalone check
  confirmed that workerd (with the same compatibility flags, including
  `no_nodejs_compat_v2`) enforces it: `Memory limit exceeded`. The probe confirms the
  same on the exact artifact.

**Low finding:** `pngInterop.test.ts` records only `excessInflationRejected = true`.
pngjs rejects excess inflated data even without the bound (`unrecognised content at end
of stream`), so that test cannot tell whether the bound fired. The exact-artifact
probe's error-message assertion now covers it.

**Not reachable from Banner validation:** the Adam7 (interlaced) path in pngjs calls an
unbounded `inflateSync`. Both `validateArtworkPng` and engine-result validation reject
interlaced images before decoding, so that path cannot be reached from them. The
dissector and GIF-export decode paths were not re-audited.

### CI interaction

`.github/workflows/ci.yml` runs `pnpm run build` (lines 245–252) before the full suite.
That means the fail-closed startup test has a real artifact in CI: it runs once in the
build gate and once more in the full suite. A local `pnpm test:run` without `dist`
still fails by design. No suite split was added, as agreed with the root.

### Focused runs (Node 24.18.0, this worktree)

| Command | Result |
| --- | --- |
| `vitest run test/config/workerImportClosure.test.ts test/workers/builtWorkerStartup.test.ts test/config/pngInterop.test.ts test/banner/enginePagesGuard.test.ts --maxWorkers=1` | 4 files, 78 tests passed |
| `pnpm check:worker-startup` | 6 tests passed in about 18 seconds |
| ESLint on the three guard files | Clean |

## 7. Still open

- **Root integration.** The root must copy the three guard files into the candidate and
  rerun `node scripts/check-worker-imports.mjs` and `pnpm check:worker-startup`
  against the exact artifact. The expected module digest is `b5cc4ed2…`.
- **The codec export depends on dynamic imports.** The proof relies on Rollup exporting
  the adapter namespace, which happens only because `export-gif` and
  `bannerDissector` dynamically import `pngjs`. If those become static imports, the
  probe fails closed with `codecs: []`. The fix would then be a dedicated codec chunk
  via `manualChunks`.
- **Hosted limits in section 4 still apply.** The probe proves the codec runs in local
  workerd from the exact bytes. It does not prove:
  - authenticated routes, the database, R2, or provider calls;
  - the JPEG (`jpeg-js`) path;
  - GIF export, because `gifenc` is still unavailable;
  - Cloudflare's production runtime version.

  The first live authenticated Banner request after deploy remains a required check.
