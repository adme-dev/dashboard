# Online engine foundation review

27 October 2026. Independent review of the shared dirty worktree against `ONLINE-ENGINE-IMPLEMENTATION.md` and `ONLINE-ENGINE-CONTRACT.md`. Reviewer owns only this report. No implementation edits, commits, fetch/rebase, deployment, database changes, purchases or Docker/runtime mutations were performed by this reviewer.

## Verdict

The bounded **local render-preview foundation** passes this review after three findings were corrected by the runtime owner and independently rechecked. No unresolved P1/P2 finding remains in this reviewed slice. This is not approval of a hosted service, native Banner import, production authorization, general document fidelity or print output.

Review source was branch `adme-dev/banner-editable-artwork`, HEAD `6c9d2cff5e3eb2210598a0ac35ff4398dd312dd5`, with uncommitted shared implementation. Local `origin/main` was `4469d6a2fb873c2d7b90ece9a359dd571def0ba2`; observed divergence was two behind/one ahead. No remote refresh was authorized for this lane. Coordinator owns subsequent reconciliation and any checks required by that changed source.

## Findings and independent closure

### R1 — P1: receipt could attest an executable that was never verified

Original location: `workers/banner-engine/runtime/render-preview.mjs`, `loadLinuxRuntime()` and `executeLinuxContainer()`. The original loader checked digest syntax, then ran the chosen image without hashing the executable inside it. A valid-looking manifest could pair one image with a different executable hash; the runner would echo the configured hash in a successful receipt. The contract explicitly requires executable verification.

Reproduction condition: pair a valid image with an incorrect executable digest, then render an otherwise valid fixture. Before correction there was no runtime comparison preventing a successful result carrying that digest.

**Addressed.** The loader now requires accepted proof, validates proof bytes/image/version/acceptance digest and known binary pins. Execution runs `sha256sum` inside the selected container before the engine CLI and rejects a mismatch. The final safety proof records `wrongImageExecutableHashFailsClosed`, message `Image executable checksum mismatch`, with the exact owned container independently confirmed absent. Reviewer also verified all 14 final native proof receipts contain the actual expected executable hash, and both final integration results match their retained capability proofs.

### R2 — P2: cleanup safety proof could count cleanup failure as success

Original location: `scripts/banner-studio/prove-online-engine-safety.mjs`, `rejected()`. Any exception satisfied the cancellation/deadline rejection check, including an exception from failed `ps`/`rm` or a remaining container. The final labelled-container list was recorded without establishing absence of each rejected attempt's container.

Reproduction condition: make final removal fail, leave the named container present, or fail the daemon readback. Previously the rejection wrapper could still set a `*CleansUp` check to true.

**Addressed.** `cleanupOwnedContainer()` now reports `cleanup-failed`; the proof rejects that classification, captures the attempt's exact container name and separately confirms its absence before recording success. Reviewer independently invoked the helper with simulated refused removal, residual container and disconnected daemon; each rejected with `cleanup-failed`. A successful removal required positive readback. Final safety evidence records `cleanupAbsenceVerified: true` for all six rejected executions. This check does not remove or require absence of another worker's concurrent container.

### R3 — P2: verified archive provenance was not bound to the packaged executable

Original location: `scripts/banner-studio/prove-online-engine-build.mjs`. The script verified a release tarball, then copied a binary from an independently existing extraction directory. The copied bytes were not compared with the checked archive member.

Reproduction condition: alter the extracted CLI while retaining the checksum-valid archive, then rerun preparation. Previously the new image could package those altered bytes while its provenance cited the official archive.

**Addressed.** Preparation now reads the exact CLI member from the verified archive and compares its hash to the extracted binary before copying/building. Reviewer separately read both archive members with Python `tarfile` and confirmed their hashes match recorded provenance; final runtime execution also verifies the in-image bytes. No adversarial modification of shared extraction/runtime files was performed by the reviewer. The archive-member negative branch was inspected; it was not exercised by modifying the active build inputs.

## Verification performed

Reviewer executed:

```sh
pnpm exec vitest run test/banner/engineContract.test.ts test/banner/engineRunner.test.ts test/banner/engineLinux.test.ts test/server/utils/bannerEngineResult.test.ts
pnpm exec tsc --noEmit --target es2022 --module esnext --moduleResolution bundler --skipLibCheck --esModuleInterop --strict --allowJs --types node,vitest/globals shared/bannerEngine.ts server/utils/banner/engineResult.ts workers/banner-engine/runner/index.ts workers/banner-engine/runtime/index.ts scripts/banner-studio/prove-engine-job.ts
```

Result: **94 tests passed across four files**, and integrated strict TypeScript passed after the runtime adapter parsed its capability through the shared schema. Vitest emitted the repository's existing Vite `__dirname` warning. The deterministic output reservation helper, attempt claim/fsync behavior, frozen request, post-run input check, bounded PNG decode, copied published artifact, cancellation fencing and bounded adapter-settlement receipt were reviewed. `adapter-settled` is correctly documented as promise settlement, not independent proof of OS termination; every existing attempt claim remains a permanent no-replay hold.

Final evidence inspected read-only:

| Evidence | Result and scope |
|---|---|
| `output/editable-artwork-online-engine/linux/proof-2026-10-27T02-21-08.831Z/acceptance.json` and `receipts.json` | 13 checks; all 12 artifact hashes independently recomputed; all 14 receipts bind expected actual executable hashes and successful cleanup |
| `output/editable-artwork-online-engine/linux/safety-2026-10-27T02-21-16.736Z/safety.json` | Seven checks, including wrong executable pin, active cancellation, deadline, log overflow, output fsize, no overwrite and lower resource limits; rejected attempts have exact-container absence evidence |
| `output/editable-artwork-online-engine/integration-2026-10-27T02-22-57-080Z/` | Both actual Linux engines passed runner-to-result acceptance; reviewer recomputed output hashes/lengths and matched each receipt to copied `runtime.json` and capability-proof bytes |
| `output/editable-artwork-online-engine/creative-ui/evidence.json` | Fixture browser proof reports three studio routes plus public feature page, restricted-role redirect, no errors and no mutations; page source hash independently matched |

Final image: `sha256:1fbdad626b0f743bfcd4fd308342b7feeb877473579da2ca52d0e97cda9597f8`. PhotoCraft 0.16.0 binary SHA-256 is `486d0d83d6cdacec3ec76ff6e30e47d5d2c207ad15084631a61902df157e8c8d`; VectorCraft 0.17.0 is `e4cd5c92613be1e0982346b2d2c3e0d5f7f249034c22da3cd61ae57201c0cd1e`.

An intermediate integration's capability-proof hashes drifted after proof regeneration. Reviewer caught this mismatch; coordinator reran final integration and retained its exact manifest/proof snapshots. Use the final directory above, not an older integration together with a newer mutable `linux/runtime.json`.

Coordinator additionally reported 162 selected tests passing, including bridge/QR permission regressions and the optional actual saved PhotoCraft fixture case. That broader count is coordinator-reported, not the reviewer's independently executed 94-test suite. Real Linux containers and browser automation were run by their owners; this reviewer inspected their resulting bytes and evidence without taking runtime ownership.

## Remaining acceptance limits

- There is no hosted endpoint, authenticated queue/transport, deployed worker service, shared cross-host attempt ledger, storage ingestion or project mutation in this foundation. The integration uses synthetic project/client authority. Production must independently resolve tenancy/input ownership, persist active attempt/cancellation state, and atomically fence source revision plus attempt claim before accepting output.
- Native Linux resave/reopen, selected text edits and masks are fixture capability evidence inside PhotoCraft/VectorCraft. The operation exposed here returns one PNG with `editableImport: false`. It does not map those native documents back to editable Banner layers, preserve arbitrary unsupported native features, or prove a Banner-to-engine-to-Banner round trip.
- Managed QR/source-copy guards remain separate requirements for future editable import. Nothing in PNG validation proves QR scanability, layout occlusion safety, copy preservation, commercial print quality, CMYK/duplex behavior or production authorization.
- Linux evidence is ARM64 with the recorded pinned image. Arial is absent: PhotoCraft retains an original native text cache but edited text uses fallback. VectorCraft reports Inter Bold resolving to Inter SemiBold. Requested-font fidelity and cross-platform pixel parity are not accepted.
- Per-job isolation is evidenced: unprivileged UID, one read-only input mount, no network, read-only image, bounded tmpfs, CPU/memory/process/file/log/time limits. Global scheduling/admission, aggregate concurrency, retention cleanup and daemon-loss reconciliation remain operational integration work. Do not delete replay tombstones or infer safe retry from a rejected adapter promise.
- Creative Studio is navigation over established studios. The reviewed public feature source explicitly states local fixture preview and hosted availability pending; it does not claim hosted external engine service, new generation models or 3D capability. Browser fixture routing is not hosted access acceptance.

Only this report was added by the reviewer. All implementation fixes and final runtime/integration artifacts were produced by their assigned owners. No release approval is implied by this local review.
