# Online engine runner boundary

27 October 2026. Implemented in `workers/banner-engine/runner/index.ts` against the shared `shared/bannerEngine.ts` contract. This is a reusable Node execution boundary with local durable attempt receipts. It creates no public HTTP server, hosted queue, database, application endpoint or deployment.

## Invocation and ownership

```ts
import {
  bannerEngineOutputArtifactId,
  runEngineAttempt
} from './workers/banner-engine/runner/index'
import { createLinuxEngineAdapter } from './workers/banner-engine/runtime/index'

// All configuration and paths below come from the trusted worker integration.
// Reserve this ID from the authoritative request BEFORE receiving any result.
const reservedOutputAssetId = bannerEngineOutputArtifactId(request.attemptId)
const adapter = await createLinuxEngineAdapter('photocraft')
const outcome = await runEngineAttempt({
  request,
  inputPath: absoluteStagedInputPath,
  signal: cancellationSignal
}, {
  stagingRoot: absolutePrivateStagingRoot,
  workspaceRoot: absoluteDurableAttemptRoot,
  adapter,
  abortGraceMs: 5000
})
```

`request` is parsed strictly, copied and deeply frozen. Unknown fields, commands, scripts, arbitrary output paths and remote URLs are rejected by the shared contract. Exact engine/version/operation/MIME and capability hashes come from the trusted configured adapter. The adapter is executable trusted code; it must never be loaded from a job payload. The runner does not fetch URLs, interpolate a shell command or dynamically load job code.

The integration supplies absolute paths independently of request data. Staging roots and workspace roots are operator-owned directories. Their leaf may not be a symlink; system aliases in their parent path are resolved once. Supply input paths under the resulting canonical staging root, for example by resolving the configured root before staging. Every descendant component is checked for symlinks and containment. Files are opened with `O_NOFOLLOW` and `O_NONBLOCK`, must be regular files with one hard link, and are bounded before allocation. Inode/device/size/time checks surround reads; actual byte count and SHA-256 must match the request. The private copy is revalidated after execution. These checks assume trusted ownership of parent directories; they are not protection from a hostile process with the same host account changing configuration roots.

The runner creates `SHA256(lowercaseAttemptId)/work/input/document.native`, `work/output/preview.png`, and `work/scratch` beneath the durable root. The input starts read-only. The Linux adapter may adjust permissions on that owned copy for its unprivileged container, while mounting it read-only. It owns native filename mapping, pinned executable verification, resource enforcement, no-network execution, owned process/container cleanup and permitted output mounts. See [ONLINE-ENGINE-LINUX.md](ONLINE-ENGINE-LINUX.md) for actual container evidence and runtime limits.

`EngineAdapter.run()` receives only `{request,inputPath,outputPath,workspacePath,signal,onOutput}` and returns `Promise<void>`. It must account for every stdout/stderr byte through `onOutput`, honor the request's CPU/memory/process limits at or below trusted runtime caps, and settle only after cleaning up owned resources. `EngineAdapterError('resource-limit' | 'engine-failed', termination)` provides content-free classification and explicit cleanup evidence. Termination defaults to `unconfirmed`; only a trusted adapter that has positively completed cleanup may declare `adapter-settled`. Other exceptions are sanitized and cannot certify process absence. No diagnostics, exception messages, native source bytes or original source paths are written to receipts.

## Attempt and cancellation semantics

An exclusive directory creation claims the attempt before the adapter can run. The parent directory and initial `running` receipt are fsynced. An existing claim always yields `duplicate-attempt`, including UUID case variants, concurrent delivery, previous success, previous failure, a different job reusing that attempt ID, or a crash before a final receipt. The runner never deletes claims, automatically retries, or turns an old result into a new success response. A missing/partial receipt is an ambiguous hold, not permission to rerun.

The caller must keep this private root durable and shared by every worker that could receive the same attempt. Separate roots, ephemeral filesystems, manual claim deletion or filesystems lacking reliable exclusive creation/fsync cannot provide this deduplication guarantee. Cross-host delivery ownership remains the future existing-platform integration's responsibility. Workspace retention and reconciliation must preserve the attempt tombstone even when sensitive staged inputs are later removed. Do not remove a workspace until owned execution is proven stopped and the authority has retained its replay hold.

The deadline is the earlier of `deadlineAt` and invocation time plus `timeoutMs`; staging counts toward that deadline. Cancellation, deadline expiry and log overflow abort the adapter and permanently fence its result. The runner waits up to trusted `abortGraceMs` (default 5 seconds, capped at 10 seconds) for adapter settlement. A failure receipt records `termination` as `not-started`, `adapter-settled` or `unconfirmed`. `adapter-settled` requires a fulfilled adapter cleanup contract or a typed rejection explicitly confirming cleanup; ordinary rejected promise settlement is insufficient. Linux cleanup removal/readback failure remains `unconfirmed`, including during cancellation grace. The runner trusts this typed adapter evidence; the native adapter owns OS process/container verification. `unconfirmed` explicitly allows that a noncooperative adapter may still be running. Its late result cannot replace the failed receipt or be accepted, and replay stays disabled.

The runner cannot preempt blocking JavaScript inside a trusted adapter or itself impose OS resource limits. Use the runtime adapter's isolated process/container enforcement. The bounded abort grace may extend response latency beyond the request deadline, but never extends the window for accepting results. Receipt I/O failure returns `receipt-failed`; preserve the claim and reconcile rather than inferring safe retry.

## Output validation and publication

The runner caps actual output bytes before reading, then reuses `validateBannerEnginePng` from the pure Node result-boundary utility. It verifies the real PNG signature, dimensions, requested pixel bounds, chunk CRCs and complete decode. Version 1 accepts bounded noninterlaced 8-bit PNG; invalid/trailing/APNG content rejects. Byte count and SHA-256 are computed from the checked bytes, not adapter claims.

Verified bytes are copied to a read-only `preview.png` outside the adapter workspace. A late write to the adapter output cannot change the published artifact. Success binds the original job, attempt, project, client, source revision/hash, input identity/hash/size, engine and operation, with deterministic reserved output ID and configured executable/proof hashes. The terminal receipt is written exclusively to a temporary file, fsynced, renamed and directory-fsynced. Cancellation/deadline is checked again before returning success. Any artifact left by an interrupted publication is not acceptable without authoritative reconciliation.

`status: 'succeeded'` means a local PNG preview passed this execution boundary. `evidence.editableImport` remains `false`. The receipt does not authenticate the caller, establish input ownership, prove capability authenticity, or authorize import. Before persisting/importing, the caller must use the separate result validator with independently loaded source/tenant/input metadata, the reserved output ID and actual bytes, then atomically fence the active attempt and current source revision. Native editable round trip, managed QR preservation, exact copy/font fidelity, hosted storage/authentication and print acceptance remain separate gates.

## Verification and handoff

The runner suite exercises successful PNG/hash/identity binding, concurrent and subsequent duplicates, an ambiguous pre-existing claim, staged hash/size/oversize tampering, direct and ancestor symlinks, path escapes, hard links, unknown job command/URL/path fields, unsupported version pins, expired deadlines, oversized/non-PNG/dimension-mismatched/corrupt/trailing/symlink output, cancellation before execution, cooperative cleanup, noncooperative late completion, timeout, resource/engine failures, log caps, post-run input tampering, secret-free receipts and immutable published bytes.

Local validation at this checkpoint:

```sh
pnpm exec vitest run test/banner/engineRunner.test.ts test/banner/engineContract.test.ts test/server/utils/bannerEngineResult.test.ts
pnpm exec tsc --noEmit --strict --skipLibCheck --module esnext --moduleResolution bundler --target es2022 workers/banner-engine/runner/index.ts test/banner/engineRunner.test.ts
pnpm exec eslint workers/banner-engine/runner/index.ts test/banner/engineRunner.test.ts
```

All three commands passed; the combined suite contained 86 tests at this checkpoint. The runner tests use controlled adapters and real temporary files, not a hosted service. Actual Docker rendering and coordinator-owned runner-to-runtime-to-result validation are documented separately; no production acceptance follows from the unit suite.

Owned changes are only the runner directory, `test/banner/engineRunner.test.ts`, and this report. Work remains uncommitted in `adme-dev/banner-editable-artwork`; unrelated shared-worktree modifications were preserved. The coordinator owns source reconciliation and end-to-end proof. No live API/DB action, deployment or commit was performed by this lane.
