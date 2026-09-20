# Social account handler deduplication — 21 September 2026

## Purpose and boundaries

The Dashboard Worker exceeded its immutable raw size budget by 21,789 bytes after the CMS integration. Share four existing handler bodies across exactly 26 routes: eight map-client endpoints (Google, Meta and the six providers below), plus accounts, account-spend and account-campaigns for LinkedIn, Microsoft Ads, Pinterest, Snapchat, TikTok and Twitter.

One shared module, `server/utils/social/accountHandlers.ts`, contains the original implementations. Read wrappers select a hardcoded, runtime-allowlisted provider. Google/Meta read, OAuth and disconnect endpoints are unchanged. Mapping behavior is preserved, including its existing connection-ID lookup without a URL-platform filter. This is a build-size refactor with no new feature, authority or validation contract.

## Compatibility evidence

- Before extraction, normalized/minified source comparisons confirmed every selected route family differed only in provider literals/comments.
- Original snapshots remain outside the repository at `/private/tmp/social-account-handler-originals-20260921/`, including the exact 26-path inventory.
- `/private/tmp/verify-social-handler-traces.mjs` compared originals with current wrappers/helper: **234 exact comparisons passed** (26 routes × nine scenarios). Comparisons include ordered auth/input/cache/SQL calls, SQL bytes, parameters, results and errors. Scenarios cover normal/default/invalid periods, denied auth, missing body/connection, existing mapping, database failure and cache hits.
- The new focused suite first passed 51 behavior tests against original routes; its new factory allowlist test failed before extraction. The completed suite passes all 52 tests.
- Combined focused validation: **62 tests across four files passed**, including existing account-spend, campaign-daily-spend and spend-summary endpoint suites.
- ESLint passed for all 26 wrappers, shared helper and focused tests. `git diff --check` passed.
- Final full TypeScript comparison retained exactly the same 913 unrelated diagnostics, with no additions or removals. No new helper or consumer type error was introduced; the repository-wide typecheck remains failing on that existing backlog.

## Size evidence and remaining integration gate

The earlier virtual minified/keepNames comparison estimated 29,412 bytes of source-bundle savings. The final full production build measures **25,466,202 raw bytes**, down from 25,490,717: **24,515 bytes saved**, and **2,726 bytes below** the unchanged 25,468,928-byte guard. Gzip is 6,623,109 bytes, below its 9,750,000-byte guard. Nuxt compilation and all 169 prerendered routes succeed. No budget or minification settings changed. No deployment or database mutation was performed.

Changed production files are the 26 wrappers listed above and the single helper. Tests are in `test/server/api/socialSharedAccountHandlers.test.ts`. Independent review compared all 26 executable callback bodies against the originals and found no behavioral or authority difference. The final integration build passes. After an unrelated browser timeout during concurrent execution, the full suite ran separately from the build: **14,208 tests passed, 832 skipped**, with no test/deadline change for that timeout.
