# Page Studio originating-login logout

17 September 2026. **Implementation and local verification complete. Staging deployment blocked by the clean build size guard; no upload occurred.**

## Behavior

Studio grants now reference a SHA-256 digest of the Dashboard or portal login that
issued them. Signing out revokes that login and its Studio grants in one database
transaction, with one `session.revoked` audit event per newly revoked grant and
`login_logout` as its reason. Independent logins for the same person stay usable.
Agency credentials now include a random login identifier, including when two
logins happen in the same millisecond. Both agency auth cookies are revoked when
both are present. Legacy equivalent encodings normalize to the verified canonical
credential during logout; new Studio issuance requires the canonical encoding.

Issuance and logout serialize on the parent login row. Agency logout before the
first launch retains a tombstone; portal issuance locks the native session before
the parent row, matching logout's lock order. A revoked login cannot mint another
Studio grant. Every fresh admission checks parent expiry/revocation, and portal
native-session validity or agency global session invalidation. AI proposal
acceptance uses that same fresh check. This is request admission, not an atomic
write-commit fence.

Logout database failures return 503 without clearing cookies or client identity.
The UI displays retry feedback. Existing Studio grants with no recorded login
origin fail closed after rollout; users must launch Studio again.

## Source and schema

- Dashboard local commit: `39409c974e179af0636116ea39d9472b213eaaaf`.
- Fresh Dashboard main: `a917386dde67f06921843fd6e3a1ed1b4b984c6f`, included in candidate.
- Studio and control gateway use their previous staging versions; no source change required.
- Migration `420_page_studio_login_sessions.sql` applied and read back on isolated
  staging Neon branch `br-long-mountain-a4f73v10`, project `square-tooth-23821574`,
  at `2026-09-17T11:25:00.192Z`. Production schema untouched.
- Migration is additive and re-runnable. No raw login credentials are retained.
  Tombstone retention cleanup remains future operations work; never remove one
  while its original credential could still be accepted.

## Verification

- 1,067 Page Studio/auth/logout regression tests passed; 345 opt-in tests skipped.
- Separately, 125 PostgreSQL tests passed (74 fresh-authority, 17 login helpers,
  34 provisioning). Real concurrent connections inspect PostgreSQL lock waits.
  The actual migration applies twice in helper tests.
- 17 cross-repository scenarios passed using actual Dashboard issuance/SQL and
  Studio DO/R2 preview paths, including already-established preview denial after
  logout and preservation of another login for the same user.
- New/affected-file lint passed; 106 existing diagnostics in three legacy files
  match untouched main exactly. Whole-repository typecheck remains red with the
  same 913 diagnostics as main, no additions or removals.
- Production build passed: 25,467,972 raw bytes / 25,468,928 limit (956 remaining).
  The size guard was not changed. The clean release build below supersedes this local build as release evidence.
- Independent review found and verified repairs for legacy alias logout,
  dual-cookie revocation and AI acceptance authority. Final review found no
  remaining major findings in this scope.
- An initial concurrent build/typecheck run conflicted in generated `.nuxt`
  files, and the sandbox denied the Worker test's loopback listener. Final checks
  ran sequentially with the required local runtime access and passed as above.

## Staging release attempt — blocked

The clean detached checkout of `39409c974e179af0636116ea39d9472b213eaaaf`
passed `pnpm deploy:check`, then ran the approved `pnpm deploy:preview` wrapper.
Its build produced **25,470,136 raw bytes**, **1,208 over** the unchanged
25,468,928-byte safety budget. Gzip was 6,628,278 / 9,750,000 bytes. The wrapper
stopped before Wrangler upload. The clean build, not the smaller working-checkout
build, determines release readiness.

Staging still serves Dashboard `bd2d700c53eb7b2fb4c2b30061177eb44fc2de3e`,
Pages deployment `0f373740-b48f-4376-b976-a66278ee1a42`. Production remains
`8798c363-6e9c-472a-a78f-47d8ce780ef4`. Control gateway, Studio Worker bindings
and container version 15 remain unchanged. Migration 420 is additive and safe
with the old staging application; it does not activate logout linkage by itself.

The existing signed-in browser still renders the staging website list. **New
logout behavior has not been verified live.** The prepared
`logout-staging-acceptance.mjs` script was not run because the candidate was not
deployed. Its planned synthetic accounts were therefore never created.

Next release task: regain stable clean-build headroom through reviewed bundle
reduction or server functionality extraction, preserve the immutable size guard,
then rerun the guarded preview deploy and the prepared live logout/browser/QR
acceptance. Do not claim staging logout completion from local test evidence.
The temporary DB credential and clean deployment worktree are removed; keep the
implementation branch, since its source is unmerged and still needed.

## Remaining work

R06d.3 is only partly complete. Open WebSocket reauthorization/closure, in-flight
jobs and authority at write commit remain open. CPU containment, generated-script
origin isolation, the full two-customer browser/expiry/cache matrix and production
promotion remain open. Generated customer execution stays disabled.

This is a security/lifecycle correction to existing functionality, not a new
marketed feature. Public feature counts/navigation are unchanged. Source and
security reproduction remain local pending production remediation; the public
Dashboard repository has not received a PR exposing the reproduction.

## Evidence

Root `.verification/page-studio-builder-rnd-20260917/` contains
`logout-regression-final.log`, `logout-helpers-postgres.log`,
`logout-cross-repository-result.json`, `logout-build-final.log`,
`logout-typecheck-comparison.json`, `logout-lint-baseline.json`,
`logout-staging-migration.json`, `logout-staging-deploy.log`,
`logout-staging-before.json`, `logout-staging-after.json` and the retained failing
regression evidence. Metadata readback after the blocked attempt verifies the
previous source and unchanged production/Worker/container state.
