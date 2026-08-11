# Task 19 Report — Enterprise CRM Search Readiness Evidence

## Result

Task 19 completed its local, mutation-free implementation verification but did not establish full external preview or production readiness. The guarded E2E harness is committed, the final compatibility candidate closes the known CRM/release regressions, and the full suite leaves only four environment or missing-artifact failing files. After `efd177a7` aligned the release guard with the current Workers Paid raw and gzip limits plus immutable safety margins, a clean detached build passed end to end. At the original report boundary, external preview execution was not authorized or performed; the later successful Neon-only slice is recorded below. Production remains halted and unchanged.

Candidate: `efd177a7d12d95190b37c8a301d1166d8022858d`

Comparison base: `f46d1e7793ba558e374c380e47d610a65d42756a`

## Post-Task 19 Neon Preview Proof — 2026-08-11

The guarded schema-only Neon slice subsequently passed at source Git SHA `d76f10f4fe5df85b485b4b930e4b072534d60050`. One TTL-bound preview branch was created from the production parent schema contract, the exact prerequisite migrations 134 and 135 plus CRM-search migrations 350–352 were applied, and `crm_people`, `crm_companies`, and `crm_opportunities` each read back with zero rows. The signed attestation digest is `f1511e0fdba87faa84680654bf66826ece1c04d0986486fad15303884fd81cfb`.

The lifecycle's outer cleanup reported the temporary branch absent, and an independent Neon branch listing confirmed only the original production and archived development branches remained. Production mutation count and provider call count were both zero. This closes only the Neon schema/migration/cleanup slice; Cloudflare Pages, Worker, Queue/DLQ, Vectorize, R2, secrets, sealed holdout, and the complete external preview E2E remain pending, so production stays halted.

## TDD and Atomic Harness Evidence

The guarded authorization and Postgres/provider E2E harnesses were written before implementation evidence was finalized. Their initial RED pinned route-level authorization, portal keyword-only semantics, off/shadow/assist behavior, abstention, settlement, control flips, publication/provider lifecycle, move/teardown/replay/DLQ, and external-attestation guards. They were committed independently as:

```text
f45fa96f86c1feb9fbb5f819ca024813d887a5a6
test(crm-search): add isolated end-to-end harness
```

The harness uses real route handlers with injected deterministic dependencies. It never uses `DATABASE_URL` as a fallback, and external cases require explicit verified Task 18 evidence.

## Final Local Verification

### Focused compatibility

The exact 12 files that failed before the final compatibility corrections passed together: 12 files and 87 tests, zero failures. The correction commits were `68b0e2fc` and `17764238`. After the release-size remediation, the Task 19 E2E files, those 12 compatibility files, four focused Task 18 release suites, and the size-guard suite passed together: 19 files, 150 tests passed, one guarded skip.

### Full suite

One final candidate `pnpm test` completed in 36.18 seconds:

```text
1651 files passed, 4 failed, 5 skipped
10762 tests passed, 5 failed, 30 skipped
2 unhandled environment errors
```

The four failing files were classified from their exact output:

- two browser suites failed because Chromium aborted in the sandbox;
- the MCP runtime compatibility suite hit a hook timeout and sandbox-denied localhost listening;
- the Nitro binding boundary expected a shared-checkout artifact that was absent after an earlier cache-contended build.

No final full-suite failure represented a plausible net-new CRM-search logic regression.

### Typecheck

Nuxt typecheck ran once under Node 24 with the inherited 16 GiB heap ceiling. It completed without OOM and reproduced the known application baseline (approximately 2,150 diagnostics). No returned diagnostic named Task 19 or a `crm/search*` file. A displayed `catalogFeed.ts` diagnostic is on bytes unchanged from the recorded base. This is evidence of no observed Task 19 net-new diagnostic, not a repository typecheck pass.

### Clean detached build

One explicit detached worktree was created under `/private/tmp` at the exact final candidate, linked only to the existing repository `node_modules`, built with the checked-in command under pinned Node 24.18.0, and removed through exact worktree cleanup. The successful command produced output throughout its 253-second run.

Client and server compilation, 162-route prerender, Nitro Pages bundling, Worker wrapping, and the final dual size guard succeeded:

```text
raw:  25,578,485 / 63,750,000 bytes (38,171,515 remaining)
gzip:  6,570,472 /  9,750,000 bytes ( 3,179,528 remaining)
```

Commit `efd177a7` corrected the obsolete raw-only guard to apply a 250,000-byte safety margin below both documented Workers Paid limits: 64,000,000 raw bytes and 10,000,000 gzip bytes. The earlier shared-cache artifact failure is therefore classified conclusively, and the local build gate is green. The local dispatcher SHA-256 is `1e4154e92931461dc14b29bfa0f17334234f535ee2f01d446c4c12a4538746da`; it is not a signed Task 18 frozen manifest. The build also emitted BigInt-versus-`es2019` target warnings in `server/utils/crm/searchIndex/usage.ts`. Read-only bundle analysis confirmed esbuild rewrote those literals to `BigInt(...)` constructor calls with no `n` literals remaining, and the focused usage suite passed 15/15. The messages remain visible here as verified warning-only.

### Task 18 guard compatibility

The immutable Pages target guard, Worker generated types, strict Worker TypeScript, production/preview Worker bundle dry-runs, artifact-verification plan, binding/readback plan, Neon schema-only TTL plan, preview-E2E plan, and cleanup plan passed locally. Every plan reported zero mutations. These checks neither create preview resources nor prove their external identity.

## Threat Model and Fail-Closed Boundaries

- External E2E cannot silently use a developer database or unverified resource.
- Portal remains keyword-only and produces zero provider calls in the route harness.
- Agency-global shadow may exercise semantic providers but cannot reorder visible keyword results.
- Only the controlled `agency_ai` assist surface may return authorized fused results.
- Fresh authorization and current revision are rechecked before exposing a result.
- Query, CRM source, provider error, secret, holdout label, and judgement content are absent from evidence.
- Missing resource approvals, signed evidence, key readback, or sealed-holdout readiness keeps execution and production promotion closed.

## Coverage Audit

Local deterministic coverage exists for all approved behavior families: authorization and indistinguishability; portal and agency surface semantics; expand/index/confirm/delete lifecycle; move, teardown, replay, DLQ, reconciliation; stepwise provider admission and timeout settlement; active-schema canonical join-back; keyword/RRF ranking; controls and promotion isolation; privacy evidence; and signed release/resource boundaries.

The coverage audit intentionally distinguishes local behavior from external proof. Migrations 134/135/350–352 and Neon cleanup were exercised on one isolated remote schema-only branch. It does not claim that Queue/DLQ, Worker, Vectorize, R2 holdout, Pages preview, secret bindings, or the complete Cloudflare cleanup path were exercised against isolated remote resources.

## External Readiness Blockers

1. Supply and verify the immutable signed Task 18 resource-provisioning and release-evidence envelopes.
2. Replace the synthetic sealed envelope, provision only `CRM_SEARCH_SEALED_HOLDOUT_KEYRING`, import the exact approved opaque bytes, and verify object SHA, authenticated decryption, 360-query canonical/privacy shape, and judgement SHA.
3. Create only approved isolated preview resources, execute the final-SHA external E2E, and verify cleanup readback.
4. Repeat the artifact/evidence cycle after any code, configuration, or dependency change.

## Deep Review

The two harness files, implementation review, preview evidence JSON, this report, and the Task 19 plan evidence were reread end-to-end. The review checked the candidate/base SHAs, exact counts, test-failure classification, production-state language, external-execution language, raw-sensitive-data absence, digest consistency, sealed-holdout status, size arithmetic, and the distinction between plan-only dry-runs and signed external proof.

The original Task 19 evidence commit performed no external mutation, provider call, deployment, database access, preview-resource operation, or production operation. The later bounded Neon proof created and deleted one TTL-bound preview branch, with zero production mutations and zero provider calls. The evidence update remains limited to review, JSON evidence, report, and runbook files.
