# Cloud execution control prerequisite

27 October 2026. Implements the remote durable execution portion of [the accepted Cloudflare qualification contract](CLOUDFLARE-ENGINE-QUALIFICATION.md). The controller is executable with Cloudflare Durable Object storage and private Workers RPC, but remains disabled and connected to an adapter that rejects every execution. No infrastructure, production activation, deployment, purchase, secret access, root dependency change, full build, or commit was performed.

## Owned implementation

All implementation is new under `workers/banner-engine/cloud/`; tests are new `test/banner/engineCloudControl.test.ts` and `test/banner/engineCloudWorkerd.test.ts`. Existing ARM64 service/runtime code, AMD64 pins, shared contracts, application APIs, and release candidates were not changed. The shared checkout was preserved. Inspection observed branch `adme-dev/banner-editable-artwork`, HEAD `47ec30c3522f6ab660d730776709770c8a22d7c8`, one ahead/four behind cached `origin/main` `d45326265f0dec387bd6ae3deb465b616a8f2b68`; this worker did not fetch or reconcile it. Root owns current-main reconciliation and all hosted integration.

| File | Responsibility |
| --- | --- |
| `contracts.ts` | Strict identity, evidence, durable storage, and trusted adapter interfaces; fixed aggregate name |
| `validation.ts` | Bounded identifiers, exact keys, canonical comparisons, immutable SHA-256 digests, positive cleanup fields |
| `controller.ts` | Transactional generation, slot, attempt consumption, immutable settlement and replay |
| `worker.ts` | Durable Object, named private control RPC, rejecting adapter, HTTP 404 handler |
| `wrangler.jsonc` | SQLite DO migration, disabled admission, no public preview route, local rejecting adapter binding |
| `worker-configuration.d.ts` | Wrangler-generated binding types |
| `tsconfig.json` | Isolated strict typecheck; no root configuration changes |

## Narrow integration contract

Bind only the trusted control-plane Worker to the named `CloudExecutionControl` entrypoint. The default HTTP handler always returns 404. Do not publish the named RPC behind a generic public method dispatcher. The controller exposes:

| RPC | Effect |
| --- | --- |
| `registerGeneration(generation, priorTermination?)` | Independently verifies a boot; transactionally registers it only when no attempt holds the slot and the prior generation has verified positive termination |
| `execute(identity)` | Returns an existing exact record, or authorizes and permanently consumes a new identity before one transport forward |
| `recordEvidence(evidence)` | Independently verifies all four facts, then atomically persists immutable settlement and releases that exact slot |
| `readAttempt(jobId, attemptId)` | Returns the recorded attempt without execution |
| `readSlot()` | Returns the registered generation and held attempt without mutation |

Every call uses the fixed object name `banner-craft-aggregate-v1`. The Durable Object constructor also rejects alternate object IDs, so caller-selected names cannot create parallel capacity. Both engines share that object. Deployment integration must retain one namespace and this fixed identity; duplicating the namespace, deleting its storage, or restoring an old snapshot could defeat the consumption ledger and is not a supported recovery operation.

`BANNER_ENGINE_CLOUD_ENABLED` must be the literal string `true` in deployed bindings for new admission. The checked-in value is `false`; there is no `process.env` fallback. Even enabling it cannot execute with the shipped `UnconfiguredCloudAdapter`. Reads, exact replay and independently verified recovery settlement remain available when admission is disabled.

### Identity and trust

The exact immutable execution identity is:

```ts
{
  jobId, attemptId, capabilityId, capabilityDigest, payloadDigest,
  outerImageDigest, innerImageDigest, generationId, bootId, innerContainerId
}
```

Digests use `sha256:<64 lowercase hex>`. Identifiers are at most 128 characters and exclude path separators. Unknown keys, tags, arbitrary executable fields and token fields are rejected. The controller stores identity and receipt digests, never payloads, credentials or engine logs. Digest syntax is not proof that an image or capability is accepted: the trusted adapter must establish that independently.

Root must supply the `TrustedAdapter` service implementation and regenerate binding types when changing the adapter binding. Its methods are explicit:

- `authorize(identity)` independently resolves Pages/Neon job authority and the accepted capability registry, then returns the exact trusted identity. It must verify current tenant/source/cancel/claim eligibility, payload digest, engine capability proof chain and both immutable images. Do not echo caller fields as authorization. PhotoCraft and VectorCraft do not receive different capacity namespaces.
- `verifyGeneration(generation)` proves the outer process/VM's fresh boot registration and exact images. Restarted processes must not inherit a reusable execution permission from scratch or copied credentials.
- `verifyTermination(termination)` retrieves independently retained positive process/VM termination evidence for the exact prior generation, boot and images. Its receipt must also prove scratch cleanup and permanent fencing of delayed deliveries. Contact loss, timeout, missing files, and absence in a list are insufficient.
- `verifyEvidence(evidence)` retrieves and checks the authority, native outcome, output transport and cleanup receipt digests against the complete exact identity. Caller-supplied `true` fields are assertions to verify, not proof. Receipts must be independently retained and retrievable; a digest with no evidence behind it is insufficient.
- `forward(identity)` makes one delivery to that already-registered live boot, with no retry, redirect, cold start, restart or generation reassignment. The receiver verifies the consumed authority and payload bytes before execution and never converts duplicate receipt of a consumed identity into another native run. No job may select arbitrary URLs, commands, images or fonts.

The receiver's permanent late-delivery fence is essential: positive cleanup must mean the old command can never start later, including a request already in flight. A process-exit observation without such a fence cannot authorize capacity reuse. Neither the controller nor its tests implement the actual Container transport or prove this external fence.

## Durable state and recovery rules

All state is held in SQLite-backed Durable Object transactional KV. The `v1/slot` key is the single aggregate admission record. Permanent attempt records use `(jobId, attemptId)`; separate permanent generation, boot and generation-scoped inner-container tombstones prevent reuse. Old termination receipts remain recorded. There is no TTL, alarm, lease expiry, retry loop, record deletion or force-unlock method.

The consumption transaction writes the attempt's `consumed` state, inner identity tombstone and slot together. It commits and awaits `storage.sync()` before external transport. Transport never runs inside a transaction callback. A transaction replay can only return its own decision; it does not set an external forwarding flag.

| Recorded state | Meaning and recovery |
| --- | --- |
| `consumed` | Permission is spent, including a crash before forward or before acknowledgement persistence; keep the slot and query evidence |
| `delivered` | Transport returned; this does not establish native success, output publication or cleanup |
| `uncertain` | Delivery raised an error; keep the slot, do not rerun or reassign the attempt |
| `settled` | All verified evidence is durably retained; exact replay returns it without forwarding |

Settlement retains four separate facts: authority (`succeeded`, `failed`, `cancelled`, `uncertain`), native outcome (`succeeded`, `failed`, `not-observed`), output transport (`accepted`, `rejected`, `not-produced`, `unknown`) and positive cleanup (`innerTerminated`, `scratchRemoved`, `deliveryFenced`). Each has its own receipt digest. `settled` means controller capacity is safely closed; it does not turn an uncertain authority fact into successful publication. The trusted verifier must reject contradictory receipts and enforce the existing application terminal-state rules.

All four verified facts and slot release commit atomically. A failed settlement transaction retains the hold. A lost settlement reply is resolved by reading the durable record: if settlement committed, positive cleanup and outcome already justify release; if no durable settlement is present, the hold remains. Late acknowledgements or repeated old evidence cannot regress a settled record or clear a newer attempt's slot.

Replacing an idle generation still requires verified positive prior termination. A held attempt additionally needs its verified settlement before replacement. A new boot requires both a new generation ID and new boot ID; prior IDs cannot be recycled. No timeout authorizes replacement. Remote execution consumption does not authorize publication; existing Pages/Neon/source/cancellation fences remain authoritative.

## Local evidence and reproducibility

Node `24.18.0`; Vitest `4.1.10`; installed Miniflare `4.20260708.1` and workerd `1.20260708.1`; Wrangler `4.110.0`. No new dependencies were installed in the repository. The initial implementation stub produced 22 expected failing tests before implementation. Review subsequently caught a real Worker startup failure from exporting a primitive constant; the production entrypoint was corrected and its actual bundle is now tested separately from the harness.

Final focused suite: **41 tests: 31 disk-backed SQLite model tests and 10 local workerd tests**. Coverage includes:

- Default-off and unconfigured-adapter rejection; production HTTP cannot invoke RPC; alternate aggregate IDs reject.
- Pre-forward durable consumption; duplicate and competing-job concurrency; both engines share capacity.
- Transaction rollback with no partial slot/tombstone; post-commit/pre-forward interruption; forwarded work whose acknowledgement write fails; lost acknowledgements; actual local runtime restart with retained DO SQLite storage.
- Every identity field, untrusted authority mismatch, malformed or extra fields, forged/missing cleanup, wrong-boot evidence, old-generation termination mismatch and reused generation/boot/inner identity.
- Atomic evidence/slot-release rollback, durable replay after settlement and lost settlement replies, late transport completion without regression, generation recheck after delayed authorization, and recovery while admission is disabled.

The model tests use real local SQLite files with WAL/FULL synchronization and serial transactions, with synthetic adapters and injected failures. They do not model workerd input/output gates. The workerd tests use real Durable Object storage transactions, output gates, RPC and separate runtime instances sharing a temporary persistent SQLite directory. Their adapter/receipt evidence is synthetic. Fault cases inject exceptions at known boundaries and then dispose/recreate local workerd; they are not provider VM kills or hosted network-partition tests. Temporary proof stores are removed after each test.

The installed workerd proof uses compatibility date `2026-07-01`, supported by that binary; the checked-in deployment configuration uses `2026-10-27`. Local evidence therefore does not qualify the exact current hosted runtime. Root must run its dedicated synthetic canary on the deployment runtime before activation.

From the repository root, with Node 24.18.0:

```sh
pnpm exec vitest run test/banner/engineCloudControl.test.ts test/banner/engineCloudWorkerd.test.ts
pnpm exec tsc -p workers/banner-engine/cloud/tsconfig.json
pnpm exec eslint workers/banner-engine/cloud/*.ts test/banner/engineCloud*.test.ts
```

Scoped strict typecheck and ESLint pass. Strict compilation also passed using the live-retrieved official `@cloudflare/workers-types@5.20261027.1` declarations unpacked outside the repository; the installed declarations are `4.20260625.1`. The existing root Vite `__dirname` advisory remains. No full dashboard build or global typecheck was run.

## Official platform references verified live

Retrieved 27 October 2026 using the Cloudflare, Durable Objects, Workers best practices and Wrangler skills:

- [SQLite-backed Durable Object storage](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/) documents atomic transactions, default output gating and `sync()`; the controller uses those primitives without `allowUnconfirmed`.
- [Durable Object method invocation](https://developers.cloudflare.com/durable-objects/best-practices/create-durable-object-stubs-and-send-requests/) and [Workers service-binding RPC](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/rpc/) support the named internal entrypoint and deterministic DO stub.
- [Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/) informed binding-only configuration, generated environment types, fail-closed defaults and awaited storage/transport operations. Latest published official Worker declarations were separately downloaded and checked as described above.

## Remaining hosted acceptance owned by root

Implement and review the independent authority/capability, generation/termination evidence and one-shot Container transport adapters; register the qualified immutable AMD64 capability; retain receipt evidence; reconcile the release source; provision only the dedicated authorized allocation; and run native hosted isolation/render/font/cleanup plus genuine restart/lost-ack/delayed-delivery fencing canaries. Verify private Pages/Neon/R2 integration and result/source/cancel authority separately. This prerequisite does not qualify hosted execution, native AMD64 performance, Docker-in-Docker limits, actual cleanup or termination, private data transport, creative fidelity, or production activation. Existing accepted ARM64 and local emulated AMD64 qualification remain separate evidence lanes.
