# Task 6 Report — Cloudflare Binding and Private Banner Asset Architecture

## Outcome

Approved Option A is implemented without deploying or mutating production.

- Nitro's exact request-owned Cloudflare platform object is promoted from `_platform.cloudflare` to `event.context.cloudflare` before application consumers run.
- Banner Studio uploads use the request-scoped native `MEDIA_BUCKET`; failed database persistence compensates through that same request-owned bucket even when S3 environment credentials are absent.
- Private source assets use a stable, revocable first-party capability URL backed by the live `banner_assets` row.
- The public handler implements bounded private caching, `HEAD`, single byte ranges, and R2 conditional semantics without native BigInt literals that warn under the production ES2019 compilation target.
- Function-name removal is restricted to 63 exact, default-only generated route modules audited from the 2026-08-06 production corpus. Unlisted API routes and named-export modules preserve names.
- A fresh Node 24 production build, wrapper, and immutable Worker-size guard pass at 24,745,798 deployed bytes, leaving 4,202 bytes.

## Commits

- `72239315 fix(cloudflare): preserve Nitro request bindings`
- `9534b747 fix(banner): serve private assets through capabilities`
- `846acb66 build(cloudflare): compact default API route modules`
- `8bff3e8c fix(banner): bound upload error logs`
- `333b12d2 fix(banner): bind rollback to request storage`
- `7d73bcba fix(banner): enforce private asset HTTP semantics`
- `63865e28 fix(cloudflare): verify production binding boundary`

## Cloudflare Boundary Repair

`server/utils/cfBindings.ts` promotes the adapter's exact `_platform.cloudflare` object onto `event.context.cloudflare`. `server/middleware/cfEnv.ts` invokes that promotion without relying on a module-global request binding for Banner Studio mutations.

The production-boundary regression now starts from the real wrapped `dist/_worker.js/index.js`, bundles that generated graph for Miniflare/workerd while stubbing only unavailable optional packages, and exercises the real dispatcher, Nitro local fetch, H3 middleware, auth path, upload route, KV, and R2 binding. It covers:

- a public capability request reaching the real route and rejecting a tampered token;
- an authenticated multipart upload whose forced database failure must leave the request-owned R2 bucket empty; and
- real local R2 range and failed-conditional behavior.

Every harness stage is bounded to 15 seconds, with bounded setup, test, and disposal hooks. The final sandbox execution terminated as designed with loopback `EPERM`; the attempted loopback-enabled rerun was rejected by the approval boundary before process creation. Therefore the fresh post-fix artifact has deterministic build/unit/compiler coverage, but a green post-fix workerd run remains an environment verification item rather than a claimed result.

## Private Banner Asset Delivery

### Upload and Compensation

The upload route preallocates the asset UUID, reads the request's promoted Cloudflare environment, and fails with HTTP 503 when either `MEDIA_BUCKET` or a minimum-32-byte `RENDER_LINK_SECRET` is absent. In Workers it calls native `bucket.put` and `bucket.head` directly and persists a first-party capability URL.

If persistence fails, rollback passes the original request bucket through `deleteBannerFile` to generic storage. `deleteFile` now checks that explicit native binding before deciding whether S3 is configured, so a request-owned R2 object is deleted even when process-level S3 credentials are absent. Local and non-Cloudflare fallback behavior remains unchanged.

### Capability and Public Handler

The stable URL format is:

```text
/api/public/banner-assets/v1.<base64url-asset-uuid>.<hmac-sha256>
```

The handler verifies the HMAC before database access, resolves the UUID through the live `banner_assets` row, validates the uploader-scoped canonical key, and only then accesses the request-owned R2 binding. Deleting the database row revokes future origin fetches. The auth bypass is limited to the exact token-shaped route; nested sibling routes remain session-protected.

Delivery supports:

- `GET` streaming and `HEAD` metadata-only responses;
- one byte range with HTTP 206 and correct `Content-Range`/`Content-Length`;
- malformed, multi-range, and unsatisfiable requests as HTTP 416;
- conditional R2 responses as HTTP 304/412;
- `private, max-age=300, must-revalidate`, ETag, `Accept-Ranges`, CORS, cross-origin resource policy, `nosniff`, and no-referrer headers.

## Worker Size Gate

The release ceiling remains the immutable 24,750,000 bytes. Review found that the earlier compactor removed internal names from every default-only API route module (1,929 generated routes), which was broader than justified.

The 2026-08-06 fresh corpus audit found 267 routes with a measurable `keepNames` delta. The compactor now permits name removal only for an explicit 63-route audited allowlist totaling 10,079 measured bytes. A regression proves an audited default-only handler loses its internal name while an otherwise-identical unlisted sibling preserves it and both remain callable.

Fresh production evidence:

```text
161 routes prerendered
2,498 split modules compacted; 1,086,525 bytes saved
24,745,798 / 24,750,000 deployed bytes
4,202 bytes remaining
```

## TDD Evidence

Representative RED failures observed before the final fixes:

- the real production artifact upload path left an R2 object behind after database persistence failed;
- `deleteFile` ignored an explicit request bucket when S3 environment credentials were absent;
- native BigInt literals produced four ES2019 build warnings in the public delivery route;
- an unlisted default-only API route lost its function name under the path-wide compaction rule;
- the raw fresh artifact exceeded the immutable release budget before the postbuild wrapper ran.

The targeted regressions were then observed GREEN after implementation. The wrapped fresh artifact also passed the immutable size guard.

## Final Verification

- Coordinator-focused fix slice: **4 files, 66 tests passed**.
- Current focused Banner/Cloudflare/config slice: **10 files, 105 tests passed**.
- Focused ESLint passed for every modified source and test, including the normally ignored dynamic public route.
- `git diff --check` passed before the implementation commit.
- Fresh Node 24 Nuxt production build passed; the new ES2019 compiler regression reports no warnings for the delivery route.
- Fresh wrapper and immutable size guard passed at **24,745,798 bytes**, **4,202 bytes remaining**.
- Workerd harness termination is bounded and teardown-safe. Sandbox execution produced the expected loopback `EPERM`; a loopback-enabled post-fix run could not be authorized in this sub-session and is not reported as green.

No migration was required. No deployment, production request, production storage write, database mutation, render, publish, email, or advertising-platform action was performed.
