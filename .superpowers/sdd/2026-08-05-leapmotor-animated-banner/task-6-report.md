# Task 6 Report — Cloudflare Binding and Private Banner Asset Architecture

## Outcome

Approved Option A is implemented and verified without deploying or mutating production.

- Nitro's Cloudflare platform object is promoted from `_platform.cloudflare` to the supported `event.context.cloudflare` contract before application consumers run. The exact object is retained, including native binding identity.
- Banner Studio uploads use the request-scoped native `MEDIA_BUCKET` directly in Workers. They no longer enter generic AWS SDK upload or presigned-URL generation.
- Uploaded source assets remain in the private R2 bucket and receive a stable first-party capability URL backed by a live `banner_assets` row.
- Local and non-Cloudflare storage still use the existing generic storage path, preserving local filesystem and S3-compatible behavior outside Workers.
- The fresh production build and immutable Worker-size guard pass.

## Commits

- `72239315 fix(cloudflare): preserve Nitro request bindings`
- `9534b747 fix(banner): serve private assets through capabilities`
- `846acb66 build(cloudflare): compact default API route modules`
- `8bff3e8c fix(banner): bound upload error logs`

## Cloudflare Boundary Repair

`server/utils/cfBindings.ts` now promotes the adapter's exact `_platform.cloudflare` object onto `event.context.cloudflare`. `server/middleware/cfEnv.ts` invokes that promotion and refreshes the existing process-local binding cache from the promoted environment.

The regression uses the production `buildWorkerDispatcherModule()` output, bundles a contract-faithful Nitro adapter fixture, starts real local workerd, injects `SENTINEL=worker-runtime-sentinel`, and proves both:

- `eventContext.cloudflare.env === env`
- `eventContext.cloudflare.env.SENTINEL === 'worker-runtime-sentinel'`

This covers the generated dispatcher call `nitro.fetch(request, env, ctx)` and the adapter/platform-context handoff rather than only mocking a route event.

## Private Banner Asset Delivery

### Upload

The upload route now preallocates the asset UUID, reads only the request's promoted Cloudflare environment, and fails with HTTP 503 when either `MEDIA_BUCKET` or a minimum-32-byte `RENDER_LINK_SECRET` is absent. In Workers it calls native `bucket.put` and `bucket.head` directly and persists the first-party URL. The generic `uploadFile` AWS path is not invoked.

Outside Cloudflare, the existing generic Banner Studio storage path is unchanged.

### Capability

The stable URL format is:

```text
/api/public/banner-assets/v1.<base64url-asset-uuid>.<hmac-sha256>
```

Properties:

- Versioned `v1` format.
- HMAC domain separation with `xeroflow:banner-asset:v1:`.
- Web Crypto only; no Node crypto or AWS SDK requirement.
- Minimum 32-byte secret and fail-closed verification.
- Constant-time, length-safe signature comparison.
- Strict UUID, token-part, token-length, URL-shape, uploader, object-key, filename, traversal, and control-character validation.
- Token contains only the asset UUID, never the R2 key.

### Public Handler Security

The public route requires the request-scoped `RENDER_LINK_SECRET` and `MEDIA_BUCKET`, verifies the HMAC before database access, resolves the UUID through the live `banner_assets` row, validates the uploader-scoped canonical key, and only then accesses R2. Deleting the database row therefore revokes future origin fetches.

The auth bypass is path- and token-shape-bound to exactly:

```text
/api/public/banner-assets/v1.<part>.<part>
```

Nested sibling routes remain session-protected. A token-shaped but tampered capability reaches the inline verifier and is rejected before database or R2 access.

The handler supports:

- `GET` streaming with native R2 metadata.
- `HEAD` metadata without reading a body.
- Single byte ranges with HTTP 206 and correct `Content-Range`/`Content-Length`.
- Malformed and multi-range rejection with HTTP 416 before object access.
- Conditional R2 responses with HTTP 304/412.
- Bounded private caching: `private, max-age=300, must-revalidate`.
- ETag, `Accept-Ranges`, CORS for editor/render canvas use, cross-origin resource policy, `nosniff`, and no-referrer headers.

Private keys and token internals are not logged. Native persistence failures use a bounded error that does not disclose the R2 key.

## Worker Size Gate

The first complete build generated 24,753,622 deployed bytes, 3,622 bytes over the immutable 24,750,000-byte budget. The limit was not changed.

Generated contributor analysis found internal function-name metadata retained across default-only API route modules. Postbuild compaction now drops internal names only when both conditions hold:

1. The module is under `chunks/routes/api/**`.
2. `es-module-lexer` proves its only export is `default`.

Named-export modules and non-API modules continue using `keepNames: true`. A runtime/idempotency regression proves the compacted default handler remains importable and callable.

The fresh from-scratch build finished with:

```text
24,731,353 / 24,750,000 deployed bytes
18,647 bytes remaining
161 routes prerendered
```

## TDD Evidence

Representative RED failures captured before implementation or hardening:

- Cloudflare middleware left `event.context.cloudflare` undefined when only `_platform.cloudflare` existed.
- Capability helpers and the public route were absent.
- Worker-native Banner Studio upload still forwarded into generic AWS-backed storage.
- Missing Worker bindings could fall into the generic path instead of failing closed.
- The capability URL initially remained behind session authentication.
- A nested sibling path initially inherited the public bypass.
- Native persistence errors initially disclosed the private object key.
- The upload route initially logged an unbounded exception that could echo the private object key.
- Malformed database identity fields initially caused an unbounded `TypeError`.
- Default-only API route compaction initially retained verbose internal names.

Each regression was then observed GREEN after its bounded implementation.

## Final Verification

- Focused plus broader Banner/Cloudflare/config slice: **29 files, 210 tests passed**.
- Real local workerd dispatcher/adapter sentinel regression: **1 file, 1 test passed**.
- Postbuild compaction, dispatcher, and immutable size-guard tests are included in the 210-test slice.
- Focused ESLint passed for every modified/new source and test; the dynamic public route also passed with `--no-ignore`.
- `git diff --check` passed.
- Fresh `pnpm run build` passed, including wrapping and the immutable Worker-size guard.
- Full Nuxt typecheck still reports the repository's pre-existing baseline. A filtered rerun produced no diagnostics for any changed source or test file.

No migration was required. No deployment, production request, production storage write, database mutation, render, publish, email, or advertising-platform action was performed.
