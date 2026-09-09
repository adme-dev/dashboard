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
- [ ] Publish the authenticated producer to guarded Dashboard preview and record
  deployed acceptance separately from the local-adapter/private-service probe.
- [ ] Add and verify execution-time live authority, seed readback and executor
  integration. No new internal authority endpoint is implemented in this increment.

The producer derives the initiating UUID from requireClientAuth, never the body.
It reads an existing scoped request before dispatch and preserves its original
actor. Exact retries, concurrent first requests and a lost create response may
recover only a fully validated matching stored job. Changed plans, snapshots,
scope or missing historical actors fail closed. A retry does not transfer ownership.

Next increment: a machine-authenticated internal authorization endpoint will accept a request key and
full scope, then reads the job through the trusted coordinator binding. It checks
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
