# Online engine contract v1

27 October 2026. Contract lane of [ONLINE-ENGINE-IMPLEMENTATION.md](ONLINE-ENGINE-IMPLEMENTATION.md), following [ONLINE-ENGINE-DESIGN.md](ONLINE-ENGINE-DESIGN.md) and [DOCUMENT-BRIDGE.md](DOCUMENT-BRIDGE.md).

The implemented operation is `render-preview`: an immutable engine-native input asset produces one PNG. A successful receipt is runtime preview evidence, never editable Banner layers, an authorised project mutation, full document fidelity, or print acceptance. No capabilities are enabled by the shared module. No endpoint, queue, database migration, storage write, provider call or deployment was added by this lane.

## Request and success receipt

`shared/bannerEngine.ts` exports strict Zod schemas and their inferred types: `bannerEngineRequestSchema` / `BannerEngineRequest`, `bannerEngineResultSchema` / `BannerEngineResult`, `bannerEngineCapabilitySchema` / `BannerEngineCapability`, and `bannerEngineSourceSchema` / `BannerEngineSource`. All wire objects reject unknown keys, including nested objects. Inputs are parsed into owned snapshots without coercion or defaulting missing identities.

```ts
type Request = {
  version: 1
  jobId: string // UUID
  attemptId: string // UUID, separately allocated by the authority
  projectId: string // UUID
  clientId: string | null // UUID or explicit null; never omitted
  sourceRevision: string // opaque, bounded safe token; e.g. saved timestamp
  sourceHash: string // lowercase SHA-256 of the authoritative source snapshot
  engine: { id: EngineId, version: string } // exact pinned version
  operation: 'render-preview'
  input: { id: string, sha256: string, bytes: number, mimeType: string }
  output: { mimeType: 'image/png', width: number, height: number }
  limits: {
    maxInputBytes: number, maxOutputBytes: number, maxPixels: number,
    timeoutMs: number, memoryMb: number, cpuCount: number,
    maxProcesses: number, maxLogBytes: number
  }
  deadlineAt: string // UTC ISO timestamp, checked against trusted current time
}
```

The input ID is an asset UUID, not a filename or storage key. MIME is a bounded `application/...` string registered with the trusted adapter, such as `application/x-photocraft`. A MIME declaration alone does not inspect the native format. No job supplies a script, command, URL, path, executable location, output location, credentials or arbitrary configuration.

The successful result repeats `version`, job/attempt/project/client/source identity, engine, operation and the entire input descriptor. It has `status: 'succeeded'`, replaces the request's output descriptor with `{id, sha256, bytes, mimeType: 'image/png', width, height}`, and includes:

```ts
evidence: {
  kind: 'runtime-preview',
  editableImport: false,
  executableSha256: string,
  capabilityProofSha256: string
}
```

Request limits and deadline are retained by trusted job authority rather than echoed by the result. Arbitrary logs, proposed layer changes and editable-import claims are forbidden in this success receipt. Failure, cancellation, timeout and uncertain termination are runner/job lifecycle outcomes, not successful artifact receipts; the runner owns those types and reconciliation.

## Capability gate and resource ceilings

`EngineId` recognizes `photocraft`, `vectorcraft`, `effectcraft`, `filmcraft`, `figcraft` and `soundcraft`. Recognition never grants execution. `assertExecutableBannerEngineRequest(request, {capabilities, now})` requires exactly one matching trusted registration and returns its parsed snapshot:

```ts
{ engine: { id, version }, operation: 'render-preview', inputMimeType,
  executableSha256, capabilityProofSha256 }
```

An empty configuration, wrong engine/version/MIME, malformed pin, duplicate matching registration, expired deadline or deadline more than 15 minutes ahead rejects. There is no environment auto-discovery or fallback to a different version. A proof digest in trusted configuration identifies evidence; the schema cannot establish its truth. The operator must retain and verify the corresponding actual runtime proof, and the runner must verify its executable against the configured digest. Synthetic unit fixtures are not usable production capability evidence.

`BANNER_ENGINE_BOUNDS` supplies absolute ceilings. Every job also supplies explicit positive integer limits, which may be lower:

| Resource | Hard ceiling |
|---|---:|
| Native input | 256 MiB |
| PNG output | 64 MiB |
| Each dimension | 4096 pixels |
| Pixel count | 16,777,216 |
| Execution timeout | 300,000 ms |
| Memory | 8192 MiB |
| CPUs | 8 |
| Processes | 64 |
| Process log bytes | 1 MiB |
| Deadline horizon from validation time | 900,000 ms |

The input descriptor must fit its job byte limit and output dimensions must fit its job pixel limit. Resource schema validation does not enforce OS limits; the runner must apply them, run for at most the lesser of timeout and remaining deadline, bound subprocess output, isolate inputs/output, and reconcile unknown termination before any retry.

## Result acceptance and trusted context

`assertBannerEngineResultBinding(result, trustedRequest)` validates the receipt schema and exact job/attempt/project/client/source/engine/operation/input identity, requested output dimensions and output resource limits. It is a synchronous metadata fence, not authentication or byte verification.

The Node-only pure utility `server/utils/banner/engineResult.ts` additionally exports:

```ts
validateBannerEngineResult({
  result, request,
  currentSource: { projectId, clientId, sourceRevision, sourceHash },
  inputAsset: { id, sha256, bytes, mimeType, projectId, clientId },
  inputBytes, outputAssetId, outputBytes,
  capabilities, now
}) // => { result: BannerEngineResult, outputBytes: Buffer }
```

The caller must resolve the request from its existing authenticated job authority, load the current project source, resolve owned input metadata, reserve the output asset identity, and supply a trusted clock and configuration. None of that authority can be taken from the untrusted receipt. Null-client projects are supported only when both source and asset context also have exactly null client ownership. Project identity still matches exactly.

The validator checks all metadata bindings, current source freshness, input project/client ownership, reserved output ID and exact execution/proof pins. It checks lengths before allocating copies, verifies SHA-256 of actual input and output bytes, and returns detached output bytes and a detached receipt for persistence. It never reads files or fetches URLs. Input-native format, archive traversal, external native-document references, fonts and unsupported document features remain the configured adapter's responsibility.

`validateBannerEnginePng(bytes: Buffer, request: BannerEngineRequest): void` is exported for the runner to reuse the same encoding policy. It revalidates request limits, checks the PNG signature and IHDR dimensions before decoding, rejects oversized output, interlace, non-8-bit encoding, APNG chunks, malformed/truncated chunks, duplicate headers, noncontiguous image data, missing IEND and trailing data, checks every chunk CRC, and performs a complete `pngjs` decode. The first version supports noninterlaced 8-bit grayscale, grayscale-alpha, RGB, RGBA and indexed PNGs. No editable-import or identity guarantee follows from this PNG-only function.

The validator performs no asynchronous work, but is not a transaction or durable replay ledger. The caller must check the active attempt and cancellation/terminal state, then compare-and-swap the fresh source revision/hash and claim the attempt exactly once in the same authority boundary as persistence. Revalidating an identical receipt twice is deliberately not a durable deduplication mechanism. A future editable import must use its own proven document adapter and the existing review/undo protections; a PNG cannot bypass them.

## Verification and handoff

Final focused verification: **54 tests passed across two files**; scoped ESLint and standalone strict TypeScript checks passed. Vitest emits the existing repository Vite `__dirname` configuration warning; it does not fail these checks.

Focused contract tests cover missing and malformed identities, strict unknown-field rejection, all six recognized-but-disabled names, exact version/MIME registration, conflicting registrations, deadline bounds, resource limits, and runtime-only evidence. Result tests cover wrong job/attempt/project/client/source, unowned/altered input metadata, actual input/output tampering, wrong output reservation, false execution pins, nullable clients, dimensions, CRC/encoding/trailer failures, excessive decompressed image data, and detached validated snapshots.

```sh
pnpm exec vitest run test/banner/engineContract.test.ts test/server/utils/bannerEngineResult.test.ts
pnpm exec eslint shared/bannerEngine.ts server/utils/banner/engineResult.ts test/banner/engineContract.test.ts test/server/utils/bannerEngineResult.test.ts
pnpm exec tsc --noEmit --target es2022 --module esnext --moduleResolution bundler --skipLibCheck --esModuleInterop --strict --types node,vitest/globals shared/bannerEngine.ts server/utils/banner/engineResult.ts test/banner/engineContract.test.ts test/server/utils/bannerEngineResult.test.ts
```

These are local contract checks, not actual engine execution, production authentication, hosted import or commercial print acceptance. Runtime and runner evidence are owned by their separate lanes. The workspace remained `adme-dev/banner-editable-artwork` at `6c9d2cff5e3eb2210598a0ac35ff4398dd312dd5`; observed local `origin/main` had advanced to `4469d6a2fb873c2d7b90ece9a359dd571def0ba2` (two commits behind / one ahead). The coordinator was notified and owns reconciliation. Only the five assigned new files were changed by this lane; no existing artwork files, commits, deployments, database state or provider configuration were changed.
