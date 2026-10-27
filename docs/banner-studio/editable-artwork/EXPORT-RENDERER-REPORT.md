# Banner renderer worker handoff — 27 October 2026

## Outcome

Implemented the pure RPC contract and isolated private production/staging Browser Rendering Workers, with bounded PNG/JPEG/GIF execution, exact resource policy, fail-closed assets, verified font loading, explicit errors, bounded cleanup and package-local dependencies. Pages integration and release remain root-owned. No deployment, provider/browser service call, credentials operation, database operation, Docker operation, git mutation or full application build was performed.

The initial design is in `EXPORT-RENDERER-PLAN.md`. Root explicitly retained unsaved HTML compatibility: GIF scripts remain untrusted in an isolated browser; this implementation does not claim canonical script provenance. All results below are local evidence.

## Verified evidence

Command:

```sh
pnpm exec vitest run test/workers/bannerRendererContract.test.ts test/workers/bannerRendererPolicy.test.ts test/workers/bannerRendererLifecycle.test.ts test/workers/bannerRendererBrowser.test.ts test/workers/bannerRendererIsolation.test.ts
```

Result: **46 tests / 5 files passed**, including **11 actual local Chromium cases**. Browser cases independently decode PNG and JPEG at the correct 2× dimensions, prove static scripts disabled, reject forbidden resources/redirects, render a permitted PNG asset and verify its pixels, accept the real pinned font, reject malformed HTTP200 font bodies, disable non-HTTP transports/Worker APIs, reject CSP connection/frame attempts, and capture GIF via the explicit frame runtime with frame caps.

Lifecycle coverage proves malformed/environment-mismatched input does not launch a browser, failures return no partial bytes or error payloads, pages/browser close after capture and navigation failures, and a browser resolving after timeout is closed. Production retains late launch/page cleanup using `ctx.waitUntil`.

Meaningful red/green evidence:

- Initial protocol tests failed because the contract did not exist, then passed.
- Real Chromium exposed its automatic synthetic favicon as a blocked request; handling only that local favicon with 204 corrected valid static renders.
- Real workerd codec execution failed `inflateSync is not a function` despite startup success; explicit CJS/default interop fixed it.
- A malformed-font positive HTTP200 fixture initially exported fallback text; font-status checks fixed this.
- Independent review then caught native `FontFaceSet.forEach` callbacks failing under JavaScript-disabled static rendering; a real valid-font control reproduced that regression, and direct native iteration made **both valid and invalid font controls pass**.

Checks completed with exit 0:

```sh
pnpm exec eslint shared/bannerRenderContract.ts workers/banner-renderer/src workers/banner-renderer/proof workers/banner-renderer/*.mjs test/workers/bannerRenderer*.test.ts
pnpm exec tsc --noEmit -p workers/banner-renderer/tsconfig.json
node workers/banner-renderer/build.mjs
node workers/banner-renderer/prove-runtime.mjs
node workers/banner-renderer/deploy.mjs production --check-only
node workers/banner-renderer/deploy.mjs staging --check-only
```

Actual bundled workerd proof result:

```json
{"proof":"actual bundled Worker in workerd","defaultFetch":404,"namedFetch":404,"invalidInput":true,"environmentIsolation":true,"realPuppeteerBindingLaunches":1,"outboundRequests":0,"browserRenderProof":false,"actualWorkerdPngDecodeGifEncode":true}
```

The launch uses the real bundled `@cloudflare/puppeteer` against a local synthetic failing Browser binding. It proves adapter invocation and error handling, **not** hosted browser launch. A separate test-only workerd entrypoint executes the actual PNG decoder and GIF encoder from the same bundling configuration.

Independent reviewer `structworker_ff487734-dc91-47a3-8265-6b355c354df7` reported no outstanding blockers after 27 browser/lifecycle/policy tests and strict typecheck, including both font controls. Reviewer also exercised actual `buildBannerHTML` with a one-second keyframe GIF: 5 frames / 3186 bytes using offline installed GSAP. That is local builder compatibility evidence, not proof of the deployed pinned CDN version.

## Artifact and dependencies

- Worker artifact: `workers/banner-renderer/dist/index.js` (generated, ignored), **769119 bytes**.
- Artifact SHA-256: `ac353e821bc49bd39d6417b628059ec83bb7d7770942c1cd499d0a3254e911d2`.
- Package lock SHA-256: `31d33851c876b319fb5d9a131bebdc1077cbe666701f7322e56dddd010949e57`.
- Exact isolated dependencies: `@cloudflare/puppeteer@1.4.0`, `gifenc@1.0.3`, `pngjs@7.0.0`.
- Compatibility date: `2026-07-15`, matching the installed workerd ceiling. An attempted current-date local startup failed explicitly before the date was aligned.
- Root manifest and root lockfile were untouched. Worker `.gitignore` explicitly unignores its package lock because the repository ignores package locks by default.

For a clean candidate, install only the isolated package via `npm ci --prefix workers/banner-renderer --ignore-scripts --no-audit --no-fund`, then run the commands above. Root is adding CI wiring.

## Owned files

- `shared/bannerRenderContract.ts`
- `docs/banner-studio/editable-artwork/EXPORT-RENDERER-PLAN.md`
- `docs/banner-studio/editable-artwork/EXPORT-RENDERER-REPORT.md`
- `test/workers/bannerRendererContract.test.ts`
- `test/workers/bannerRendererPolicy.test.ts`
- `test/workers/bannerRendererLifecycle.test.ts`
- `test/workers/bannerRendererBrowser.test.ts`
- `test/workers/bannerRendererIsolation.test.ts`
- `workers/banner-renderer/.gitignore`
- `workers/banner-renderer/package.json`
- `workers/banner-renderer/package-lock.json`
- `workers/banner-renderer/build.mjs`
- `workers/banner-renderer/deploy.mjs`
- `workers/banner-renderer/generate-types.mjs`
- `workers/banner-renderer/prove-runtime.mjs`
- `workers/banner-renderer/proof/codec.ts`
- `workers/banner-renderer/src/index.ts`
- `workers/banner-renderer/src/render.ts`
- `workers/banner-renderer/src/resourcePolicy.ts`
- `workers/banner-renderer/src/codec.ts`
- `workers/banner-renderer/src/vendor.d.ts`
- `workers/banner-renderer/tsconfig.json`
- `workers/banner-renderer/worker-production.d.ts`
- `workers/banner-renderer/worker-staging.d.ts`
- `workers/banner-renderer/wrangler.production.jsonc`
- `workers/banner-renderer/wrangler.staging.jsonc`

## Remaining acceptance

Root must integrate the reviewed current candidate, deploy the private production Worker and matching Pages binding, verify live PNG/JPG/GIF output and assets, and record source/deployment IDs. Hosted launch, provider limits, cancellation when the remote browser refuses close, CDN asset availability and full creative fidelity remain unproven. Staging app/asset manifests intentionally stay empty until separately reviewed; no staging deployment is required by this task.
