# CRM Search Implementation Review

## Decision

**The historical local candidate was verified, and the release-safety correction tree now passes its bounded local gates. It is not externally verified or release ready. Production remains halted.**

- Historical candidate SHA: `efd177a7d12d95190b37c8a301d1166d8022858d`
- Current correction base SHA: `ee653429570239eaa783f941a0f11a3d0ec0417f`
- Current corrected candidate SHA: assigned by the pending release-correction commit; never self-attested in this file
- Same-machine comparison base: `f46d1e7793ba558e374c380e47d610a65d42756a`
- Review date: 2026-08-11
- External preview execution: not performed
- Guarded external preview/cleanup adapter path: implemented locally; not externally executed
- Production schema, resources, code, indexing, shadow, and assist: unchanged

No Cloudflare, Neon, database, provider, Queue, Vectorize, R2, Pages, Worker, secret, deployment, or production resource was created, changed, queried, uploaded, or deleted during Task 19 or the current correction pass.

Build sizes and static digests below are historical evidence for `efd177a7`; they do not verify the current corrected bytes. The current code contains injected, fail-closed preview execution and cleanup adapters, provider-backed Neon schema-only/absence readbacks, phase-specific deployment approval checks, exact Worker version activation, and durable 90% admission. Those paths have only been exercised with deterministic local adapters. A new clean build, signed frozen artifact, external preview ceremony, and final independent review remain pending.

The correction tree passed two bounded local gates on 2026-08-11: the affected approval/migration slice passed 59 tests with one opt-in isolated-local-Postgres test skipped, and the nine-file release slice passed 56 tests with one guarded external-database test skipped. Focused ESLint, Worker generated types plus strict TypeScript, diff validation, JSON parsing, and secret-pattern scanning also passed. These results verify local code paths only; they are not external-resource, deployment, provider, or production evidence.

## Requirement Audit

| Approved contract | Local evidence | External evidence | Disposition |
|---|---|---|---|
| Fresh server-owned organisation, client, actor, owner, assignment, and `CLIENTS` authorization with indistinguishable denial | Real agency, portal, and direct-tool route harnesses cover owner visibility, fresh assignment, cross-tenant denial, and post-retrieval reauthorization | Isolated preview not executed | Local pass; external pending |
| POST-only normalized privacy-safe query handling and portal view semantics | Route harness proves portal keyword-only behavior and zero semantic-provider calls; privacy assertions reject raw query/source/error telemetry | Isolated preview not executed | Local pass; external pending |
| Durable expand, validate, activate, revision, move, teardown, replay, and DLQ behavior | Provider-lifecycle harness covers publish, confirmation, replay, delete, client move, teardown, reconciliation, and DLQ outcomes | Neon schema-only preview dry-run only; no branch was created | Local pass; external pending |
| Dedicated Queue, Worker, Vectorize, signed identifier-only protocol | Task 18 compatibility, generated types, strict Worker typecheck, signed resource-manifest tests, and both Worker bundle dry-runs pass | No Queue, Worker, or Vectorize preview resource was created | Local pass; external pending |
| Keyword-first visible ranking with semantic assist restricted to `agency_ai` | Real route harness proves off, shadow, and assist; agency-global shadow preserves keyword order; only agency-AI assist exposes fused results | Isolated preview not executed | Local pass; external pending |
| Threshold abstention, deadlines, kill-switch re-read, stepwise provider admission, and settlement | Harness covers abstention, timeout fallback settlement, control flips, and per-surface provider eligibility | Isolated preview not executed | Local pass; external pending |
| Active-schema canonical namespace, indexed non-tombstone ledger join-back, current-revision validation, RRF fusion, and deterministic limits | Focused CRM tests and Task 13 corrective review cover join-back, revision recheck, RRF, deduplication, and deterministic tie-breaks | Isolated preview not executed | Local pass; external pending |
| Evaluation, retention, sealed holdout, and independently keyed privacy evidence | Task 15/18 contracts remain fail closed; checked-in sealed manifest is `productionReady: false` | Approved envelope import, R2 readback, key provisioning, decryption, and judgement verification were not performed | Blocked pending ceremony |
| Signed immutable approvals and exact-resource release boundaries | Task 18 artifact, approval, resource inventory, deployment, and Neon lifecycle dry-runs report `mutationCount=0` | No signed resource/readiness evidence or external readback exists | Blocked pending approvals |

## Verification Evidence

### End-to-end harness

The two Task 19 harness files were written RED-first and committed independently as `f45fa96f86c1feb9fbb5f819ca024813d887a5a6`. They exercise real route handlers and injected deterministic repositories/providers. External-resource cases skip only behind explicit Task 18 attestations and never fall back to `DATABASE_URL`.

### Historical final compatibility candidate

The exact 12 CRM/release files that had failed before the compatibility corrections passed together at the final candidate: 12 files, 87 tests, zero failures. The corrective commits were `68b0e2fc` and `17764238`.

The final full `pnpm test` candidate completed in 36.18 seconds:

```text
Test files: 1651 passed, 4 failed, 5 skipped (1660 total)
Tests:     10762 passed, 5 failed, 30 skipped (10797 total)
Errors:    2 unhandled environment errors
```

The only failing files were environment or missing-artifact failures, not CRM-search behavior regressions:

- `test/app/aiGovernanceControlPlane.test.ts`: two Chromium `SIGABRT`/sandbox launch failures.
- `test/app/portalPdfExport.test.ts`: three Chromium `SIGABRT`/sandbox launch failures.
- `test/workers/mcpRequestClaimRuntimeCompatibility.test.ts`: hook timeout plus two sandbox-denied `listen EPERM 127.0.0.1` errors.
- `test/workers/cloudflareNitroBindingBoundary.test.ts`: the shared checkout had no `dist/_worker.js/index.js` after an earlier shared Nuxt cache build failure.

All plausible CRM-search and release-tooling regressions from the earlier candidate run were closed before this final full-suite run.

### Type diagnostics

Nuxt typecheck ran once at the final candidate under Node 24 with the inherited 16 GiB heap ceiling. It completed without OOM and exited 2 after about 89 seconds with approximately 2,150 known application-baseline diagnostic lines, consistent with the documented baseline. No returned diagnostic named a Task 19 harness or `crm/search*` file. One displayed diagnostic in `server/utils/crm/catalogFeed.ts` is on a file byte-identical to the recorded base SHA. Typecheck is therefore recorded as baseline-non-green, not as a pass.

### Historical clean detached build

One detached worktree at the exact candidate SHA was created under `/private/tmp`, linked only to the repository's existing `node_modules`, built once with the existing `pnpm build`, and removed by exact worktree cleanup. There was no install, network access, deployment, or release mutation.

An initial clean build exposed that the repository's old 23.60 MiB raw-only ceiling did not model the current Workers Paid raw and compressed limits. Commit `efd177a7` replaced it with the documented 64,000,000-byte raw and 10,000,000-byte gzip limits, retaining an immutable 250,000-byte safety margin on each measurement. Its tests fail independently on either dimension and ignore source maps and Wrangler metadata that are not deployed.

The final clean Node 24.18.0 build at `efd177a7` exited 0 in 253 seconds. The client build, SSR build, 162-route prerender, Nitro Cloudflare Pages bundle, Worker wrapping, and both release-size checks passed:

```text
[worker-size] raw 25578485 / 63750000 bytes (38171515 remaining); gzip 6570472 / 9750000 bytes (3179528 remaining)
```

This conclusively classifies the earlier shared-cache failure as incidental and closes the obsolete local size-guard blocker. The locally generated dispatcher was 1,225 bytes with SHA-256 `1e4154e92931461dc14b29bfa0f17334234f535ee2f01d446c4c12a4538746da`; it is not a signed Task 18 frozen-artifact manifest and is not external release evidence. The build continued to emit BigInt-versus-`es2019` compatibility warnings in `server/utils/crm/searchIndex/usage.ts`. Read-only bundle analysis verified that esbuild rewrites the unsupported literal syntax to `BigInt(...)` constructor calls, the final bundle contains no `n` literals, and the focused usage suite passes 15/15 including large exact-cost and 80-percent boundary arithmetic. The messages are therefore recorded as verified warning-only; they are not silently described as absent.

### Historical mutation-free release gates

- Pages immutable project/branch guard: passed for `agency-dashboard` / `main`.
- Worker generated types and strict TypeScript: passed.
- Production Worker bundle dry-run: passed, 591.57 KiB upload / 89.08 KiB gzip.
- Preview Worker bundle dry-run: passed.
- Frozen artifact verification plan: `mutationCount=0`.
- Preview binding/readback plan: `mutationCount=0`.
- Neon schema-only TTL lifecycle plan: `mutationCount=0`.
- Preview E2E plan: `mutationCount=0`.
- Cleanup plan: `mutationCount=0`.

These are local plan and dry-run results only. They are not substitutes for signed external readback or preview execution.

## Adversarial Review Disposition

| Review boundary | Finding disposition | Corrective evidence |
|---|---|---|
| Task 13 authorization and timeout privacy | Closed in code | `a3e9dbfd`, `f7888767` |
| Task 18 immutable resource/release evidence | Closed in code | `00c59e60`, `9e6b392b` |
| Task 19 repository-wide compatibility | Closed in code | `68b0e2fc`, `17764238`; final 87/87 slice |
| Worker raw/compressed release-size guard | Closed in code | `efd177a7`; final clean build exit 0 |

The table above records the historical review state at `efd177a7`. It is superseded by the current release-safety correction pass and must not be read as external or final acceptance evidence for the corrected bytes. Final independent HIGH/MEDIUM review convergence remains pending after commit.

## Release Blockers

1. No Task 18 signed resource-provisioning approval, immutable release evidence, or external resource readback was supplied.
2. No isolated Neon branch, preview Pages/Worker, Queue/DLQ, Vectorize index, R2 object, or preview secret was created.
3. External Task 19 preview E2E was not executed.
4. The sealed holdout remains synthetic and `productionReady: false`; the approved envelope replacement, independent key provisioning, exact R2 import/readback, authenticated decryption, and judgement-digest verification remain pending.
5. No production migration, deployment, client indexing, shadow, or assist approval was granted.
6. The current corrected bytes do not yet have a fresh clean build, signed frozen artifact, full-suite comparison, external preview readback, or final independent acceptance review.

The next release step must complete the signed Task 18 preview-resource and sealed-holdout ceremonies before external E2E. Any code, configuration, or dependency change invalidates this evidence and requires a fresh artifact and review cycle.
