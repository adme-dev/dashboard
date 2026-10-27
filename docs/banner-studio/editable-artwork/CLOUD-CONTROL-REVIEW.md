# Independent cloud execution control review

Reviewed 27 October 2026 under dispatched task `task_f111ca8aaa8f`, dispatch `ctx_5ddb307fb6cb`.

**Result: no actionable finding in the reviewed, disabled controller prerequisite.** All 41 focused tests passed under Node 24.18.0, as did scoped TypeScript and ESLint checks. Four additional in-memory adversarial probes passed. This verdict does not qualify hosted native execution or authorize activation.

## Scope and source identity

Read all seven files under `workers/banner-engine/cloud/`, both `test/banner/engineCloud*.test.ts` files, and `CLOUD-EXECUTION-CONTROL.md` end to end. Only this review report was written; no implementation, test, candidate, dependency, secret, deployment or provisioning configuration was changed. No application build, deployment, provisioning, secret access or commit was performed. The existing workerd tests bundle their test harness and actual Worker entrypoint in memory.

Repository: `https://github.com/adme-dev/dashboard.git`; branch `adme-dev/banner-editable-artwork`; HEAD `47ec30c3522f6ab660d730776709770c8a22d7c8`. No upstream is configured. At review, cached `origin/main` was `704fb5caf86312f7003190f1fd210feb76746731`, with HEAD one ahead/nine behind. No fetch or reconciliation was performed in this read-only source review. The implementation document's older cached-main observation is historical, not current release evidence. The coordinator retains release reconciliation ownership.

## Review conclusions

| Property | Evidence and conclusion |
| --- | --- |
| Consumption before transport | `controller.ts:58–81` atomically writes the attempt, inner-container tombstone and aggregate slot, then awaits `storage.sync()` before forwarding. No adapter call occurs inside a transaction callback. Rollback cannot spend partial permission or start transport. |
| Transaction callback replay | The callback returns its own `{ forward, record }` decision; no external flag survives an aborted invocation. A synthetic retry that first decided to forward, then observed a competing committed record, returned the existing record with zero forwards. Retrying a rolled-back consume with no competitor forwarded exactly once. |
| One aggregate | `contracts.ts:2` fixes the name, `worker.ts:33` always selects it, and `worker.ts:11` rejects other object IDs. The manifest defines one namespace. Both engine identities compete for the same slot. Namespace duplication, deletion or snapshot rollback remain forbidden integration operations, rather than protections this class could enforce across deployments. |
| Permanent identities | Attempt records are keyed by job and attempt; generation and boot tombstones are separately retained; inner-container tombstones are generation scoped. No deletion, TTL, alarm, lease or unlock exists. An independent probe confirmed an old boot is rejected even with a fresh generation ID. |
| Generation changes | `controller.ts:25–39` checks the current generation, held attempt, prior termination identity and permanent tombstones inside the transaction. A held attempt cannot be replaced merely by presenting termination. `execute()` rechecks generation after potentially slow authorization. |
| Settlement and late completion | `controller.ts:103–118` records all four facts and releases the exact slot atomically. Rollback retains the hold. Exact evidence replay returns before touching a newer slot. `controller.ts:85–92` cannot regress a settled attempt on a late transport acknowledgement or exception. |
| Positive receipt trust | Parsers require exact keys, bounded identifiers, immutable digest syntax and literal positive cleanup flags. Verifiers must return literal `true`. Actual authenticity, retained evidence retrieval, contradictory-receipt rejection and source/cancel authority are delegated to the private trusted adapter, as expressly documented. The shipped adapter rejects everything. |
| Fail-closed defaults | The controller defaults to disabled; the Worker accepts only binding value `'true'`; there is no process-environment fallback. The manifest sets `'false'` and binds the rejecting adapter. Reads, exact replay and independently verified settlement remain possible with admission disabled. |
| Public access and configuration | Actual shipped Worker HTTP requests return 404. Named RPC is explicitly private. The manifest disables workers.dev and preview URLs, uses a SQLite migration, enables observability and contains no credentials. Generated binding declarations agree with the shipped self-service adapter and DO class. |

### Delayed forwarding is an external fencing obligation

An additional probe paused `execute()` after its consumption transaction, inside the pre-forward `sync()` boundary. While paused, it settled the old attempt, registered a replacement generation using positive prior termination, and admitted a new attempt. Resuming the old call **did invoke `adapter.forward(oldIdentity)`**. A synthetic receiver with the required permanent closed-attempt fence rejected that delivery; the old call returned its settled record and the newer aggregate slot remained held.

This is consistent with `contracts.ts:70–74` and the implementation document. There is no claim that the controller retracts an in-flight delivery or prevents every delayed adapter invocation. Positive settlement and termination verification must establish that an old delivery can never start native work again, even if it arrives after settlement or a generation change. Checking a `deliveryFenced: true` field or observing process exit is not sufficient. The actual receiver and verifier are absent from this prerequisite, so their safety remains unverified. A future adapter must reject this sequence before activation; a simple echoing verifier or transport would violate the documented contract.

## Executed evidence

Environment observed directly: Node `24.18.0`, Vitest `4.1.10`, Miniflare `4.20260708.1`, workerd `1.20260708.1`, Wrangler package `4.110.0`, installed Workers types `4.20260625.1`.

```sh
node --version
pnpm exec vitest run test/banner/engineCloudControl.test.ts test/banner/engineCloudWorkerd.test.ts
pnpm exec tsc -p workers/banner-engine/cloud/tsconfig.json
pnpm exec eslint workers/banner-engine/cloud/*.ts test/banner/engineCloudControl.test.ts test/banner/engineCloudWorkerd.test.ts
```

- **41/41 tests passed in two files**, 31 disk-backed SQLite model tests and 10 local workerd cases; Vitest reported 1.58 seconds total.
- Strict scoped TypeScript passed, independently confirmed with an exit-zero run; scoped ESLint passed.
- Existing Vite advisory: root config uses `__dirname`, unsupported by the planned future native config loader. It did not fail this run.
- Tests cover consume-before-forward, duplicate and competing admissions, actual DO rollback, persisted restart replay, lost acknowledgements, post-commit interruption, acknowledgement-write failure, atomic settlement rollback, identity mismatch, untrusted evidence, disabled/unconfigured defaults and alternate aggregate rejection.

Four additional probes ran through `node --import tsx --input-type=module` from standard input, importing the unchanged controller. Their storage was an in-memory clone/commit model with injectable callback retry and a one-shot sync pause; they are supplemental logic evidence, not disk or workerd evidence. No probe source files were added.

1. Invoke and discard the first consume callback result, insert a competing consumed attempt and held slot, then reinvoke the callback. Assert replay returns `consumed` and transport count remains zero.
2. Invoke and discard the first consume callback result, retry against unchanged state and commit. Assert `delivered` and exactly one transport call.
3. Pause pre-forward sync; verify settlement with a permanent synthetic receiver fence; replace generation; admit a new attempt; resume old execution. Assert one rejected delayed old delivery, only the new attempt starts synthetic native work, old settlement remains immutable, and the new slot stays held.
4. Replace an idle generation with verified termination, then register a fresh generation using the old boot ID. Assert `generation-reused`.

All four assertions passed. Callback-retry behavior is deliberately injected; the existing tests do not force a real workerd transaction conflict. The delayed-forward probe uses synthetic receipts and a synthetic fence. The checked-in suite tests late completion, but does not itself test this full pre-forward pause/settle/replace sequence.

## Platform cross-check and limits

Live-retrieved [Cloudflare SQLite storage documentation](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/) confirms transaction rollback/commit semantics and `sync()` flushing pending writes. The controller uses transactional KV and does not opt into `allowUnconfirmed`. [Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/) were consulted for binding configuration and awaited operations. Latest published [Workers declarations, version 5.20261027.1](https://unpkg.com/@cloudflare/workers-types@5.20261027.1/index.d.ts), were retrieved in memory and the `get`, `put`, `transaction` and `sync` signatures checked; this reviewer compiled against the installed declarations, not the downloaded ones.

The workerd harness uses compatibility date `2026-07-01`, while the checked-in manifest uses `2026-10-27`. These tests establish local July-runtime behavior, not parity with the intended hosted runtime or deployment configuration. The production entrypoint test verifies startup and HTTP 404 behavior, while the RPC harness supplies its own bindings. No Wrangler deployment validation or hosted binding inspection was performed.

Remaining acceptance is owned by the coordinator: independent authority/capability and receipt adapters; actual permanent delayed-delivery fences; exact hosted runtime and namespace integration; genuine restart, termination and network-failure canaries; native AMD64 isolation/render/font/cleanup; private Pages/Neon/R2 transport; application source/cancel/publication fencing; release-source reconciliation. Neither this report nor synthetic passing tests establish actual Container termination, scratch deletion, native rendering, provider delivery, creative fidelity or production readiness.

## Reviewed file SHA-256 manifest

Captured after tests, 2026-10-27T08:32:12Z. Paths are repository relative.

```text
d02394f2876839e217162ecbfd85663e4f31db70b69db80b175a7f760c1b2624  workers/banner-engine/cloud/contracts.ts
77637187bc49c031e64835867746ff96e969023b167d7ae9b8436cd611c2dccf  workers/banner-engine/cloud/controller.ts
bbbb99b1a841724357fee74c36864e986b0c1cacca750811aa3b3fe6247f1513  workers/banner-engine/cloud/tsconfig.json
9edf9cdea443cc709f17665c37c0f3ef6eacc92ca606f02e64881883077deb4f  workers/banner-engine/cloud/validation.ts
30e2d5cec7c35d9d4c181ad592a96bf8eab0284a0c2581910dfd09cb55600282  workers/banner-engine/cloud/worker-configuration.d.ts
85ff8992246ed18dc01b0d56b6b28a667f063ca932dfa93b731aacf76b5e8594  workers/banner-engine/cloud/worker.ts
b8719364a018bc4722677ca858d553b9eac3ba0ccd7b51081d5316708b41ef4e  workers/banner-engine/cloud/wrangler.jsonc
852be6bfc1dc75c8155c0d8abc3a59817b2a2c30daf6238b2381ed72d111e24d  test/banner/engineCloudControl.test.ts
db6d1332aae46d20adab3f3a64cdc4fee5b1cfd91cf11be870ea3fa6c4fc7086  test/banner/engineCloudWorkerd.test.ts
eb5134715fd7721a7084eb28f109498a210ff34f030b307ab0ad62442c3fcbf1  docs/banner-studio/editable-artwork/CLOUD-EXECUTION-CONTROL.md
```
