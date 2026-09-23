# Native Astro release reservations — 24 September 2026

Migration 430 preserves historical build IDs, artifact locations and release foreign
keys while allowing a separate Astro build of the same approved version. It adds a
legacy-only version uniqueness index, full Astro identity pins and a retained
compiler descriptor. Astro identity updates/deletion and renderer conversion are
rejected; operational state and release metadata remain writable.

The SQL-only reservation helper derives identity through the shared Studio export,
checks approved checkpoint/version equality, retains the first selected toolchain,
recomputes retained pins, and admits quota once inside the caller transaction.
Entitlement is rechecked on retry. Reusing a key with changed input, or a new key for an existing identity,
conflicts before another admission. Checkpoint staging does not create an extra
release row. Both legacy persistence queries now filter by renderer.

## Verification

- 17 actual PostgreSQL tests apply migrations 402/413/414/428, create and activate a
  historical release, then apply 430. Coverage includes coexistence, reapplication,
  concurrent retries, reconnect/rollout recovery, revoked entitlement, all foreign
  scope axes, original accounting month, direct insert consistency, immutable pins,
  persistence-failure admission rollback, legacy failure/success separation, denied
  Astro activation and historical rollback with metadata restoration.
- Review found a missing checkpoint digest comparison and deletion protection.
  Both new regressions failed before the fixes and pass afterward. Independent
  re-review found no remaining blockers for reservation-only scope.
- Native focused suite: 43 passed. Wider Page Studio suite: 2,157 passed across
  176 files; 764 tests in 22 files skipped because their separate database
  environment variables were not configured. CMS and grant/history PostgreSQL
  suites were enabled against disposable localhost databases.
- Changed native source/tests/scripts pass ESLint and git diff whitespace checks.
- Focused native TypeScript check reports only three existing errors in unchanged
  server/utils/db.ts (375, 380, 382: overloaded Neon Pool.connect return typing).
  New reservation and integration test files have no reported type errors. This
  does not establish a clean whole-dashboard typecheck.
- Native npm run build passed, including Cloudflare wrapping and worker-size
  checks: raw 25,298,084 / 25,468,928 bytes; gzip 6,787,497 / 9,750,000 bytes.
  Evidence: /private/tmp/resume-astro-native-build.log. No deployment was run.
- Studio shared export has seven new tests plus 30 identity contract tests. The
  deterministic paired generator --check passes at source digest
  8c0e42eb14b3b0c33ac9a43fd802c3f9162f057039294dc5b2d381b533570def.
  Native golden vectors, local integrity and the unchanged 190 KB minified bundle
  allowance pass. The unminified generated module is 318,496 bytes.
- Studio build: 24 tasks passed; types: 38 tasks plus security types passed;
  lint: 1,234 files checked with no fixes. Security: 20 passed; action runtime:
  48 passed. Package coverage: 4,748 tests passed across the original passing
  packages (3,904 tests) and the serial CMS rerun (844 tests, 69 files, 252s).
  Two default parallel runs failed with EADDRNOTAVAIL connecting to local workerd
  in different CMS cases; the unchanged suite passes with --maxWorkers=1. No
  assertions, deadlines, dependency versions or checked-in concurrency were changed.
  Evidence: /private/tmp/resume-astro-cms-serial.log plus the full package logs.

Local evidence: /private/tmp/resume-astro-native-{pg-green,suite,lint,types}.log,
/private/tmp/resume-astro-review-red.log and
/private/tmp/resume-astro-native-export-{build,types,lint,security,runtime}.log.
The first broad native run exposed an older release-feature fixture missing 430;
its migration chain was corrected. The first invocation also supplied database
names rejected by two existing safety guards; the successful run used their
required disposable targets. No guards were relaxed.

## Release order and remaining work

1. Apply migration 430 before deploying renderer-aware legacy readers. It was
   automatically executed against isolated local PostgreSQL schemas; it has not
   been applied to production. This worktree has no .env connection configuration.
2. Deploy the readers and retire old native instances before permitting Astro rows;
   old instances still perform an unqualified version-digest fallback query.
3. The new helper has no HTTP endpoint or dispatch caller. A future integration
   must supply current actor authority, verified materialization pins, its own SQL
   transaction and a trusted registered toolchain selector. A recovery hash alone
   is not proof of approved-source derivation.
4. Complete hosted toolchain provenance, dispatch/recovery, independently verified
   versioned artifacts, executable/import/CSS graph and CSP, then guarded activation
   and old/new rollback before enabling Astro publishing.

No provider was called, no active release pointer changed outside disposable tests,
and the existing Fantasy preview has not been replaced. These reservations are
not proof of hosted compiler execution or completed Astro publication.

## CI follow-up

Run 35923882904 at f3b14682a passed the production build and all named database
gates; the full suite reported 14,681 passed, one failed and 1,343 skipped. The
sole failure was the exact God mode route inventory: the existing agency/portal
initial-staging ensure POSTs raised routes 2,158→2,160 and mutations 1,182→1,184.
Both routes retain the trusted actor and scoped staging service boundary and
introduce no God mode registration. Updated the reviewed counts; guarded counts
and all no-bypass assertions remain unchanged. Local reproduction failed before
the correction; inventory, staging endpoint and initial-staging tests then passed
(32 tests). Independent review found no weakening.

CI now has a dedicated disposable Astro database gate so reservation and release
compatibility tests cannot silently skip in the broad suite. The step runs the
new PostgreSQL tests, historical feature release tests and shared verifier checks.
The workflow YAML parses; deployment conditions and targets are unchanged.
