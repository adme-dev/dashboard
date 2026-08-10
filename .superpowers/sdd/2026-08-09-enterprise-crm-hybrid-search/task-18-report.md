# Task 18 Report — Preview Isolation and Guarded Release Operations

## Result

Task 18 is complete. CRM search release tooling now defaults to non-mutating preview plans, pins Node 24.18.0, rejects dirty or non-detached build inputs, verifies content-addressed Pages/Worker artifacts, and requires a distinct signed `production_deploy` approval before an injected release executor can run. Production CI no longer rebuilds or calls Wrangler directly from a main-branch push; it is a protected manual job that consumes separately downloaded frozen bytes and approval evidence.

No Cloudflare or Neon resource was created, changed, uploaded, deployed, or deleted. No provider binding or database connection was used.

## Threat Model and Fail-Closed Boundaries

- Preview CRM identities are exact and distinct: Pages branch `preview`, Worker `agency-crm-search-consumer-preview`, Vectorize `agency-crm-search-preview`, Queue `agency-crm-search-index-preview`, and DLQ `agency-crm-search-index-preview-dlq`.
- The Pages inventory is derived from the checked-in Wrangler configuration and includes KV, every Queue producer, R2, AI, every Vectorize index, Browser, both Hyperdrive bindings, services, variables, and the Pages project/branch categories. A CRM preview identity may not alias any inventoried production resource, including non-CRM queues or indexes.
- Queue and DLQ retention are pinned to 1,209,600 seconds. Missing readback, an unsupported plan, a target alias, or any signed-manifest mismatch fails before message forwarding.
- The Worker consumes only a bounded, versioned Ed25519 resource envelope. It verifies the active key, canonical payload digest/signature, exact preview/production identity, 31-day maximum envelope lifetime, Pages origin, Worker, Vectorize, Queue, and DLQ before health or processing calls.
- Frozen builds require the exact committed SHA, a clean detached checkout, exact Node 24.18.0, and exactly one Pages plus one consumer build. Manifests bind artifact, lockfile, build-command, tool, Pages config, Worker config, and binding-manifest digests.
- Release wrappers verify the frozen bytes, target, clean SHA, independently versioned active Ed25519 release keyring, exact environment, and immutable approval evidence before invoking an injected executor.
- The bootstrap import route accepts only a signed `resource_provision` envelope from `CRM_SEARCH_RESOURCE_APPROVAL_VERIFICATION_KEYRING`. The server recomputes `importedProvenanceHash`; a module-private proof prevents a caller or cloned object from bypassing verification before database lookup.
- Neon lifecycle tooling pins the expected project, schema-only initialization, six-hour RFC 3339 TTL, migrations 350–352, empty CRM source-table proof, operation polling, and one outer `try/finally` that deletes only the exact created branch. The executable path is test-injected; ordinary use is dry-run only.

## Strict TDD Evidence

The initial Task 18 RED was captured before tooling edits. Three suites failed on missing modules, three runbook contracts were absent, and the Pages guard still permitted a rebuild and `--commit-dirty=true`; four pre-existing target assertions passed.

The authorized Worker/environment-manifest and bootstrap-import correction RED then produced 91 passing assertions, four failures, and one import-failed suite. It proved that the endpoint trusted caller provenance, command helpers accepted raw approval objects, the consumer trusted production literals, and preview config lacked a signed environment/keyring contract.

Deep review added two bounded RED-to-GREEN slices:

1. A valid approval under an unversioned/wrong-version release keyring was accepted. The verifier now requires exact bootstrap-versus-release keyring versions, exact fields, active-key selection, bounded keys, exact timestamps, and a bounded key identifier.
2. A preview CRM Queue could alias the existing production `agency-jobs` Queue because only CRM-to-CRM names were compared. The inventory now derives all checked-in production resource identities and rejects cross-feature aliases.

Final affected evidence:

```text
Task 18 release/worker/import suites: 121 passed (10 files)
Task 8–15 compatibility slice:        79 passed (6 files)
Deep-review release-key slice:         5 passed
Deep-review inventory slice:           4 passed
Worker generated types + strict TSC:   passed
Strict release-manifest TypeScript:    passed
Node 24 targeted ESLint:               0 diagnostics
git diff --check:                      clean
```

The repository server TypeScript project was run once and exited on its existing application baseline. No diagnostic referenced the Task 18 bootstrap verifier, import endpoint, or operations command changes.

## Mutation-Free Operational Evidence

The following local checks completed without external mutation:

```text
Frozen artifact verification plan:     mutationCount=0
Preview binding/readback plan:          mutationCount=0
Neon schema-only TTL lifecycle plan:    mutationCount=0
Preview E2E plan:                       mutationCount=0
Pages immutable project/branch check:   passed
Worker production versions dry-run:     bundle passed
Worker preview versions dry-run:        bundle passed
```

The first generated-types and preview-bundle invocations attempted Wrangler's default log directory under `~/Library/Preferences`, which the sandbox denied. Both commands still performed no external mutation; they were rerun with `WRANGLER_LOG_PATH` under `/private/tmp` and passed cleanly. No command exceeded five minutes.

## Source-Driven Contracts

Official Cloudflare documentation was consulted read-only for Pages Direct Upload branch selection, `wrangler versions upload` (upload without deployment), Worker environment binding inheritance, and Queue retention/DLQ configuration. Official Neon documentation was consulted read-only for `init_source: schema-only`, RFC 3339 `expires_at`/`--expires-at`, branch operation responses, and terminal operation polling. The implemented guards pin the documented limits: Queue retention is within the supported 60-second to 14-day range, and the Worker path uses versions upload rather than an immediate deployment.

## Runbooks and Task 15 Handoff

The indexing, operations, evaluation, preview-E2E, and staged-rollout runbooks define six separate approvals in order: resource provisioning, production migration, dormant deployment, per-client indexing, per-client shadow, and per-client assist. They preserve keyword-first visible search, portal semantic-off behavior, confirmed-index freshness, alert thresholds at 60/80/90 percent, sentinel-before-backfill ordering, and reconciliation/evaluation-before-promotion.

The Task 15 sealed-holdout handoff is explicit: replace the synthetic envelope; provision only `CRM_SEARCH_SEALED_HOLDOUT_KEYRING`; import exact opaque bytes to `crm-search/evaluation/holdouts/holdout-v1.json`; read them back; verify object SHA-256, key/envelope version, authenticated decryption, 360-query canonical/privacy shape, and decrypted judgement SHA-256. The checked-in contract remains `productionReady: false`; no plaintext labels, production key, object import, or secret provisioning occurred.

## Authorized Scope Corrections

Two narrowly coordinated changes beyond the original Task 18 file list were required for the release boundary to be real:

- The dedicated consumer health/runtime/config and tests now derive exact preview/production identities from the same signed resource-manifest bytes instead of trusting production literals.
- The bootstrap approval import endpoint, operation helper, and tests now verify the trusted Ed25519 envelope and recompute provenance rather than accepting caller-authored `importedProvenanceHash`.

These changes do not add provider access, resource creation, deployment, or a generic queue/Worker fallback.

## Deep Review

Every Task 18-owned source, script, config, endpoint, Worker, test, environment-documentation, and runbook diff was reread. The review checked server aliases, exact targets, key separation, canonical bytes, timestamp/key bounds, clean-tree behavior, symlink rejection, artifact/directory hashing, executor ordering, queue disposition, privacy-safe logging, one-outer-finally cleanup, CI rebuild/direct-Wrangler regressions, sealed-holdout handoff, and whitespace.

Task 17's residual rendered-test, marketing-smoke, and report changes were committed separately as `6c9bb632` before Task 18 staging. No accepted Task 1–17 file outside the planned or explicitly authorized Task 18 modifications was edited or staged.

## Review 1 — Frozen Preview Release Evidence

The bounded acceptance review identified five release-safety gaps and this review corrected exactly those boundaries:

1. Pages production and preview now repeat every checked-in non-inheritable binding category. The normalized readback parser rejects missing environments, inheritance, unknown categories, duplicate bindings, incomplete production/preview keysets, production-equal stateful targets, and secret name/digest drift. Frozen artifact production and verification consume this readback against the exact recorded Pages config before any build or deploy spawn.
2. Release CI now creates one controlled exact-file Pages/Worker/config artifact, rejects symlinks and special files, pins the clean detached SHA, Node, lockfile, exact build command, installed Wrangler entry bytes/version, Pages/Worker configs and binding readback, signs canonical bytes with Ed25519, and uploads those bytes once. Deployment only downloads and verifies them. Pages receives the recorded directory; the consumer uses `versions upload <frozen-entry> --no-bundle` with the recorded config and cwd. The verifier has no build path.
3. Both production mutation wrappers require the complete signed `production_deploy` approval and compare its approval/revision, Pages and Worker bundle digests, artifact/binding/evidence hashes, rate card, control revision, actors, scope, cost, expiry and SHA. Each performs a fresh direct-Neon current-approval, approval/rate-card revocation, rate-validity, dormant-consumption and halted-control readback immediately before its own spawn.
4. The guarded Neon lifecycle emits the Task 5-compatible Ed25519 target attestation only after a schema-only six-hour branch, returned-operation polling, exact project/source/branch/direct-endpoint checks, a configured denyset, empty-source proof, and application of the exact current bytes of migrations 350–352. One outer `finally` explicitly deletes the created branch and polls deletion; lifecycle and cleanup failures are both preserved. Ordinary CLI use remains plan-only and the mutation seam requires an exact preview-bound `production_migration` authorization plus injected API/database adapters.
5. Release evidence is an exact bounded allowlist with recursive credential/source/query/label/judgement rejection and an independent Ed25519 keyring. Production deployment verifies its canonical hash against the approval and exact SHA/artifact/resource/approval/Neon/sealed-readback/cleanup fields, requires the sealed handoff to be `productionReady: true`, and requires zero remaining mutable targets. CI downloads the same signed evidence and passes it to both production mutation wrappers.

Strict consolidated RED before implementation recorded 7 failures and 16 passes across the four focused Task 18 suites. The final focused GREEN is 23/23 across those four files. The full Task 18 compatibility run completed at 127/127 across ten files; the bounded Task 5/8–15 compatibility slice completed at 101 passes with one guarded database skip. Worker generated types and strict typecheck passed, and production plus preview Worker bundle dry-runs completed under Node 24.18.0. The final targeted ESLint run reported zero diagnostics; standalone strict TypeScript for the Pages inventory, CI YAML parsing, `git diff --check`, and the bounded privacy scan passed.

All local Task 18 plans and dry-runs remained non-mutating. No Cloudflare/Neon/provider/database/deployment call occurred. The checked-in Task 15 handoff remains deliberately `productionReady: false`; the production wrappers now reject it until the separately authorized external import/readback ceremony produces signed ready evidence. Task 19's two E2E harness files were committed independently at `f45fa96f86c1feb9fbb5f819ca024813d887a5a6` and were neither edited nor staged by this review.

Official Cloudflare documentation was consulted read-only for Pages environment binding non-inheritance and the current `versions upload` config/cwd/no-bundle syntax. Official Neon documentation was consulted read-only for schema-only branch creation, RFC 3339 expiry, returned operation polling, and exact branch deletion. No external resource or provider action was taken.
