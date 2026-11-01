# FigFlow design mutation request gate

Base/head supplied and confirmed locally: `2db9cc6f3`.

## Implementation

Owned files only:

- Modified `server/utils/email-marketing/designRequest.ts`.
- Added `test/unit/emailDesignRequest.test.ts`.

Added synchronous exported `assertDesignMutationRequest(event, appOrigin?)`:

- Requires `application/json` with case-insensitive media type and an optional UTF-8 charset. Missing, non-JSON, non-UTF-8 charset, and unexpected media-type parameters fail with `415 json_required`.
- Uses only the explicit configured application origin, defaulting to `https://app.xeroflow.io` only when configuration is `undefined`. It never derives trust from Host, forwarded headers, or request URL.
- Requires a supplied Origin to exactly equal the validated configured origin. Cross-origin, `null`, malformed, trailing-slash, and path-bearing Origin values fail with `403 design_origin_denied`.
- Allows server callers without Origin, except when `Sec-Fetch-Site: cross-site` (case-insensitive) is present; that metadata is rejected even without Origin.
- Accepts HTTPS configured origins and HTTP only for an explicitly configured `localhost` origin.
- Fails closed with `503 design_origin_unavailable` for malformed/non-string configuration, credentials (including empty user-info), non-root paths, queries/fragments (including empty markers), and insecure non-localhost origins.

`readBoundedJson` remains unchanged. Existing streaming behavior is covered for fatal incremental UTF-8 decoding, one-byte chunk boundaries, exact byte limits, multibyte byte accounting, accumulated chunk overflow, immediate stream cancellation, reader-lock release, malformed JSON/UTF-8, and absent bodies.

## RED / GREEN evidence

Initial RED run: 29 tests were discovered; 25 failed, including every request-gate case because `assertDesignMutationRequest` did not exist. Four substantive streaming cases passed against the existing reader. The absent-body test fixture was corrected to use a non-payload H3 method before implementation.

After the initial gate implementation, all 29 passed. A follow-up URL-normalization review added three RED cases for empty user-info, empty query, and empty fragment; those failed before the validation fix.

Final commands:

```sh
pnpm exec vitest run test/unit/emailDesignRequest.test.ts
pnpm exec eslint server/utils/email-marketing/designRequest.ts test/unit/emailDesignRequest.test.ts
```

Final results: **32/32 tests passed** and ESLint passed for both owned files. Vitest emitted the repository's existing Vite `configLoader: native` / `__dirname` warning.

## Limits / parent ownership

- These are unit-level H3 events with real Web Streams, not browser/CORS or deployed HTTP acceptance.
- Parent-owned route integration tests were not changed or run as part of this bounded task.
- No other source, route, documentation, migration, shared file, dependency, database, commit, or deployment was touched.
