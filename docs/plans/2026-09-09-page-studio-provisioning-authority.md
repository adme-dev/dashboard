# Authenticated provisioning authority — 9 September 2026

ONB-04: the compatible private coordinator now retains immutable initiating actors.
Connect the authenticated Dashboard producer and a fresh execution-time authority
read before enabling privileged resource execution.

Delivery is split into two independently reviewable increments:

- [x] Derive the producer actor from portal authentication; preserve it across
  exact retries, a competing first request and a lost create acknowledgement.
- [x] Validate the complete returned job and expose a stable owner-reconciliation
  error for historical jobs. Keep status reads compatible with historical data.
- [x] Verify the real adapter against the private staging coordinator:
  `coordinator_63697b6881a445099691ae8894e80afd`, 18 seconds. A second editor's
  retry preserves the first actor. All three synthetic jobs are retired; D1
  readback reports `failed / total 3 / consistent 3`, with no claims or resources.
- [x] Publish producer 7b1c4f55e through guarded preview 34345442685. Cloudflare
  deployment 418d031d-8aaf-4296-87c3-96736151c9e6 is confirmed. Deployed portal
  acceptance passes (13 seconds): two authenticated editors, original-owner
  replay, owner spoofing and foreign-site denials, durable status readback and
  both sessions revoked. Synthetic site 201 is separate from checkpoint fixtures
  101/102. Its entitlement is now disabled/expired and its D1 job retired with
  original actor intact; readbacks confirm zero sessions and failed/1/1.
- [x] Implement the machine-authenticated live authority endpoint and fresh SQL
  checks; 79 focused tests pass, including 21 real PostgreSQL cases.
- [ ] Publish and verify live authority on the private Cloudflare control path.
- [ ] Connect authority and seed readback to the resource executor. No customer
  executor or cron is enabled.

The producer derives the initiating UUID from requireClientAuth, never the body.
It reads an existing scoped request before dispatch and preserves its original
actor. Exact retries, concurrent first requests and a lost create response may
recover only a fully validated matching stored job. Changed plans, snapshots,
scope or missing historical actors fail closed. A retry does not transfer ownership.

The machine-authenticated internal authorization endpoint accepts a request key
and full scope, then reads the job through the trusted coordinator binding. It checks
the original portal user's current status/role, exact editor membership, latest
accepted proposal, site status and active entitlement through queryOneFresh.
The accepted plan/setup must still match the stored job and current page/module
allowances. Return the verified job and actor, not a reusable access token.
The executor must compare that job with its own retained state and independently
check its lease before every side effect. No executor or scheduler is enabled here.

Verification: producer identity/replay/concurrency/lost-response tests; malicious
body and mismatched response cases; authority denial after user/membership/plan/
entitlement changes; authentication before body/DB/service access; real database
query and private staging acceptance. Preserve all legacy jobs as readable data.

Deploy the compatible coordinator before this producer (already satisfied by
3ec3aee / 32266296-fb57-4d01-8153-db2e7aeb361f). Publish Dashboard through the
guarded agency-dashboard preview workflow. Update the Foundation ledger and Wiki.

Producer verification: 38 focused tests and the full built-artifact suite pass
(13,195 passed, 27 skipped). Modified-file lint and deploy target guard pass.
Build size: raw 25,063,869 / 25,468,928; gzip 6,584,409 bytes. Repository-wide
typecheck exits 2 with 927 errors outside the modified files; this is not a clean
whole-repository typecheck result. No migration or executor activation is included.

Live authority implementation: `/internal/page-studio/provisioning/authorize`
uses machine authentication before body/service/database access and marks all
responses no-store. It accepts only staging scope with Dashboard UUIDs and
businessId equal to clientId. The stored job must have the producer-derived key,
original actor, accepted setup and a nonterminal phase. Fresh SQL checks active
client/user, manager/admin role, exact editor membership, site state, latest
proposal (including newer unaccepted revisions), entitlement dates/status/site
creation, nonarchived site count, page allowance and explicit module allowances.
Missing allowedModules retains the existing legacy unrestricted policy; malformed
explicit metadata fails closed. Changed plans/setup and terminal/ownerless jobs
are denied. Database failures return a sanitized 503.

Foundation DashboardControlClient.authorizeProvisioning reads this endpoint and
compares the full returned job with the executor's retained copy, rejecting any
changed phase, resource, timestamp or actor. It is a fresh check, not a token or
lease; every executor effect still requires its own immediate lease fence.
No migration is needed. Private staging acceptance remains to be recorded.

Final local authority validation: 13,236 tests pass (27 skipped), including all
21 PostgreSQL authority cases. Build and deploy target guard pass; raw Worker
25,068,370 / 25,468,928 bytes, gzip 6,585,726. Targeted lint passes. Final global
typecheck reports the prior 927 errors outside modified files; no clean global
typecheck is claimed. These checks do not yet establish deployed authority.
