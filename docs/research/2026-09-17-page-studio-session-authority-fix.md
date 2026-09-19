# Page Studio current session authority

17 September 2026. Paired implementation in Dashboard and Page Studio; deployed and verified in staging. See the [release record](./2026-09-17-page-studio-session-authority-staging.md). Production rollout remains open.

Previously, revoking a session in Dashboard only changed PostgreSQL. Studio's
independent Durable Object ledger could continue admitting a signed session until
expiry. An established preview image request also survived membership downgrade
or entitlement suspension. Disposable actual-source tests reproduced all three.

## Change

The private `POST /internal/page-studio/sessions/authorize` endpoint requires
machine authentication and the signed editor token in `x-page-studio-session`.
Its strict body accepts only an existing capability. Identity/scope comes from the
verified JWT, not request-supplied user, tenant or site IDs.

`assertPageStudioSessionAuthority` uses `queryOneFresh` to match the exact retained
session claims and check revocation, expiry, active client/user/site, current
editor membership or agency `PAGE_STUDIO_EDIT`, effective entitlement and current
model allowance. It preserves the existing explicit editor-membership contract
for portal users. Agency authority follows the existing global staff-role model;
the signed/stored site scope constrains the tenant. No new tenant-membership model
is claimed.

The private gateway forwards the editor token only for the exact authority and
AI-acceptance POST routes. The Studio client matches the response nonce/capability,
checks every authenticated request and fails closed on unavailable or malformed
authority. The Studio ledger continues handling replay and usage limits.

## Release order and remaining work

Deploy Dashboard and its control gateway before the Studio Sandbox Worker. Verify
the endpoint through the private binding first, then launch/revoke synthetic
sessions after the Worker update. Studio has no bypass when the endpoint is absent.
No database migration, new secret or new service binding is needed.

This implements request admission only. Logout-to-nonce linkage, open WebSocket
closure, in-flight cancellation, commit-time authority fencing, untrusted preview
origins and runtime CPU containment remain separate work. Fresh staging browser launch now passes; the full browser revocation/expiry matrix
and per-request latency/capacity measurements remain required. No customer session
was revoked during the local or staging tests. The release record identifies the staging deployments.

## Verification evidence

Evidence under the root checkout's `.verification/page-studio-builder-rnd-20260917/`:

- `session-authority-postgres.log`: 52 new real-PostgreSQL authority cases plus
  34 existing provisioning-authority cases passed.
- `session-authority-fixed-integration.log` and `session-authority-fixed-result.json`:
  15 cross-repository actual-source scenarios passed using real JWT signing,
  disposable PostgreSQL and local DO/R2. All three prior access-loss cases now
  deny the image request. The local harness seeds DO sessions through a test-only
  wrapper; it does not exercise the browser launch form or deployed gateway.
- `session-authority-dashboard-test.log`: Dashboard Page Studio suite, 985 passed;
  306 opt-in cases skipped in this default run. The 52 new PG cases above were
  executed separately, not counted as verified from the skipped suite.
- Studio full build, test, typecheck and lint commands passed. Dashboard production
  build (including Worker size guard) and lint on all changed files passed.
  Dashboard-wide typecheck fails with 913 diagnostics, exactly matching an untouched
  archive of current main; zero added/removed diagnostics. See
  `session-authority-typecheck-comparison.json`.
- Independent security/correctness review found no Important or Critical issues.

Reproduction tests failed before implementation. The first broad Dashboard suite
hit a sandbox loopback restriction; its authorized rerun passed. Disposable
clusters and local Worker runtimes were stopped after the tests.

## Review and publication state

Both branches were refreshed against current main and had zero divergence before
commit. Changes remain in local commits: the Dashboard repository is public, so
the undeployed security finding and reproduction details were not published in a
public PR. Studio is private. The root working checkout and its unrelated changes
were preserved. Paired staging deployment, 13 live admission checks and fresh browser launch passed. Production rollout and the remaining lifecycle checks stay open.
