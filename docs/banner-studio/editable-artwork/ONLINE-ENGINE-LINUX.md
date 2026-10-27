# Online engine Linux runtime proof

27 October 2026. **PhotoCraft 0.16.0 and VectorCraft 0.17.0 both render native documents headlessly in isolated Linux ARM64 containers.** This implements the Linux lane of [ONLINE-ENGINE-IMPLEMENTATION.md](ONLINE-ENGINE-IMPLEMENTATION.md). The adapter supplies PNG previews to the separate runner; it does not import native files into Banner Studio or establish print acceptance.

Read alongside [DOCUMENT-BRIDGE.md](DOCUMENT-BRIDGE.md), [PHOTOCRAFT-INSTALLED-RND.md](PHOTOCRAFT-INSTALLED-RND.md) and [VECTORCRAFT-INSTALLED-RND.md](VECTORCRAFT-INSTALLED-RND.md). Their small synthetic native fixtures supplied inputs. All execution, save/reopen, edit, pixel comparisons and resource observations below were performed again on Linux; macOS success was not counted as Linux proof.

## Exact official runtime

| Engine | Official source commit | Linux aarch64 archive bytes | Published and observed archive SHA-256 |
|---|---|---:|---|
| PhotoCraft 0.16.0 | `b1794c6e0608ccfc887213dcf58398977c5cb75e` | 83,104,781 | `9b998376a4876a620842f0456f79695b147950d6f173930ee4d5da751303e10b` |
| VectorCraft 0.17.0 | `43313f9451de7ab5b909801006b8881458f2bf04` | 123,813,544 | `28cbc71ced0b4349b2d4208f0f2f922c13ec099627a323b0eb3d5e1b1372dca3` |

Downloads came from the official [PhotoCraft release](https://github.com/storytold/photocraft/releases/tag/v0.16.0) and [VectorCraft release](https://github.com/storytold/vectorcraft/releases/tag/v0.17.0). Their `SHA256SUMS.txt` files matched before extraction. Pinned [PhotoCraft CLI implementation](https://github.com/storytold/photocraft/blob/b1794c6e0608ccfc887213dcf58398977c5cb75e/apps/photocraft-cli/src/document.rs) and [VectorCraft CLI implementation](https://github.com/storytold/vectorcraft/blob/43313f9451de7ab5b909801006b8881458f2bf04/apps/vectorcraft-cli/src/main.rs) confirm direct `convert INPUT OUTPUT` headless paths. The pinned MCP documentation was also inspected, but this implementation registers no MCP server and needs no desktop/control server.

Executable SHA-256:

- `photocraft-cli`: `486d0d83d6cdacec3ec76ff6e30e47d5d2c207ad15084631a61902df157e8c8d`
- `vectorcraft-cli`: `e4cd5c92613be1e0982346b2d2c3e0d5f7f249034c22da3cd61ae57201c0cd1e`

The build compares the extracted CLI against its exact member inside the verified archive. Runtime loading checks the accepted capability proof digest, acceptance artifact digest, engine/version and immutable image identity. **Each execution hashes the actual CLI inside that container before invoking it.** A mismatched executable capability fails closed, with independently verified container removal.

The 117,600,608-byte image contains Debian bookworm-slim, the two CLIs and release notices, with no GPU/desktop packages. Base digest: `sha256:7ff6ba31527b9e336162fa061746c366c4b2032f4d2cff2078bea43f78efe3f8`. Accepted local image ID: `sha256:1fbdad626b0f743bfcd4fd308342b7feeb877473579da2ca52d0e97cda9597f8`. This identifies the measured artifact; byte-reproducible image builds are not claimed. Both CLIs link only libc, libm and libgcc on this image. Bundled MIT/Apache/OFL and other notices remain in `/usr/share/doc/banner-engine/` and owned downloaded output; engine names/branding are not newly licensed by this inventory.

## Adapter and isolation

`workers/banner-engine/runtime/index.ts` exports:

```ts
const adapter = await createLinuxEngineAdapter('photocraft')
// or 'vectorcraft'; optional second argument is a trusted operator manifest path
```

It implements the runner's `EngineAdapter`, parses the shared capability schema, accepts the runner's fixed staged input/output paths and AbortSignal, and accounts engine stdout/stderr through `onOutput`. MIME identifiers are `application/x-photocraft` and `application/x-vectorcraft`. The staged filename may be `document.native`; the single-file container mount uses the correct native extension. Only the runner's staged copy receives mode 0444. Original/customer files are never modified by this adapter.

The production-facing job adapter accepts only render-preview. It cannot receive a command, script, mount, image, network destination or arbitrary container output path from a job. Research commands used by the proof are a separate trusted harness API, unavailable through the job contract and preview CLI.

Every process uses the minimum of the requested limit and these caps:

- 4 CPUs, 2,048 MiB memory and equal memory+swap ceiling, 64 processes, 90 seconds.
- 64 KiB engine logs, 64 MiB output, 128 file descriptors, per-file output size limit.
- UID/GID 65532, all capabilities dropped, `no-new-privileges`, read-only root and network `none`.
- One explicit read-only native input file bind; no workspace, credential, Docker socket, home, display or user-profile mount.
- 64 MiB `/tmp` tmpfs; `/output` tmpfs capped at the output byte allowance plus 1 MiB. Both are noexec/nosuid/nodev. Configuration/cache paths are inside `/tmp`.

A container-local timeout and host deadline both bound execution. Output streams from the live tmpfs through a byte-limited pipe into a new exclusive host file. `docker cp` could not read the tmpfs mount in the first probe, so it is not used. The runner subsequently performs complete PNG/hash/dimension and source/result checks. Collection failure leaves only an attempt-owned partial file; there is no automatic engine retry or success receipt.

Cancellation removes only the UUID-named owned container. The adapter does not settle until exact-name Docker readback proves it absent; cleanup uncertainty has its own `cleanup-failed` runtime error and cannot count as a successful cancellation proof. Separate control/cleanup operations have bounded 15-second calls, so cleanup may extend wall time after the engine's deadline. Abrupt host death or SIGKILL is outside cooperative cancellation; the container-local timeout still bounds the process, while a future supervisor must reconcile an exited residual container.

## Measured native acceptance

Final evidence: `output/editable-artwork-online-engine/linux/proof-2026-10-27T02-21-08.831Z/`. `latest.json` points to it. **13 acceptance checks pass.** Each command has logs, executable digest, elapsed time, actual Docker isolation readback, output digest and cleanup evidence in `receipts.json`.

| Check | Actual Linux result |
|---|---|
| PhotoCraft native save/reopen | Native layer records exactly equal, including text, raster, pixel mask and vector mask |
| PhotoCraft text edit | `LINUX NATIVE TYPE` remains native text after save/reopen; unselected raster and both masks exact; rendered pixels change |
| PhotoCraft undo and native reopen | Both render exactly equal decoded RGBA pixels to the Linux baseline |
| PhotoCraft independent masks/alpha | `(60,160)` = `[240,80,40,128]`; vector hole `(130,160)` alpha 0, becomes 128 with only vector mask disabled; pixel-mask edge `(40,160)` alpha 80, becomes 128 with only pixel mask disabled |
| PhotoCraft feather | Alpha at x=25/40/43/50, y=160: 28/80/96/121; transparent outside `(0,0)` |
| VectorCraft native save/reopen | Native layer records exactly equal; Linux reopen PNG has identical decoded pixels |
| VectorCraft text edit | Exact new wording remains native text; affine transform and unselected clip/mask objects unchanged |
| VectorCraft clipping/mask | Outside clip `(60,170)` alpha 0, inside `(100,170)` alpha 255; masked `(400,170)` alpha 128; outside mask `(510,170)` alpha 0 |
| Original protection and cleanup | Earlier synthetic originals retain their SHA-256 values; every proof container is removed |

PhotoCraft preview: 256 × 256, 5,760 bytes, SHA-256 `a1e86a122e3df7ab73e665d424af42362cbe0bea361c4f00b307e32d249370cd`, measured 444 ms. VectorCraft preview: 640 × 360, 6,609 bytes, SHA-256 `ba8da4b6d289aa5974af1095f2bd50359177f3f3b2854483fd77785ba0272607`, measured 503 ms. Command receipts span 438–586 ms, measured through collection before final removal; these are small local fixture timings, not service capacity or latency guarantees. Both PNGs were visually inspected.

**Typography limits remain explicit.** PhotoCraft reports Arial missing: its original native text raster cache is preserved, while the actual Linux wording edit renders through fallback. VectorCraft reports requested Inter Bold drawn with Inter SemiBold. Equal Linux reopen pixels establish consistency, not exact requested font fidelity. PNG export deliberately flattens editable structure; the native preservation checks examine separate saved native documents.

## Failure/resource acceptance

`output/editable-artwork-online-engine/linux/safety-2026-10-27T02-21-16.736Z/safety.json` records **7 passing actual Docker checks**: wrong executable digest rejection, active cancellation, deadline, engine log overflow, output file-size limit, refusal to overwrite an existing output, and smaller requested resource limits. Each rejected attempt captures its exact container identity and independently lists it afterward to prove absence; cleanup failures are explicitly rejected by the proof.

The lower-limit probe reads back 1 CPU, 256 MiB memory/equal swap ceiling, 16 processes, no network, nonroot UID, read-only root and exactly the expected read-only file mount. Unit tests additionally simulate refused removal, a residual container after removal, and a disconnected Docker daemon; all reject cleanup. `test/banner/engineLinux.test.ts`: **8/8 passing**. Scoped ESLint passes. The coordinator separately owns full runner/result-boundary integration evidence and release decisions.

## Reproduction and retained artifacts

Requires the existing repository dependencies, Python 3 with tarfile's data extraction filter, and a Linux ARM64 Docker daemon. Preparation may download official release assets/base image; execution never pulls or accesses a network. From the workspace root:

```sh
node scripts/banner-studio/prove-online-engine-prepare.mjs
node scripts/banner-studio/prove-online-engine-build.mjs
node scripts/banner-studio/prove-online-engine-linux.mjs
node scripts/banner-studio/prove-online-engine-safety.mjs
pnpm exec vitest run test/banner/engineLinux.test.ts
```

The build produces `runtime-prepared.json`, which ordinary adapters reject. Only successful native acceptance writes `runtime.json` with accepted capability proofs. The native proof requires the earlier small synthetic originals at the paths recorded in its script; it copies them into a new proof directory. The retained convenience copies for the coordinator are `linux/fixtures/photocraft.pcraft` and `linux/fixtures/vectorcraft.vectorcraft`. To render another explicitly staged file after acceptance:

```sh
node workers/banner-engine/runtime/render-preview.mjs \
  --engine photocraft \
  --input output/editable-artwork-online-engine/linux/fixtures/photocraft.pcraft \
  --output output/editable-artwork-online-engine/linux/new-preview.png
```

The output must not already exist. The JSON receipt reports the exact capability, PNG hash/size/dimensions, timing and warnings. Use the runner for tenant/source identity fencing and full output decoding; this local CLI alone is not that authority boundary.

Ignored owned evidence includes official release API metadata/checksums/tarballs, selected pinned sources, extracted packages/notices, build context/log/provenance, accepted manifests, native proof artifacts, safety receipts and final source hashes. Local images remain cached for reproducibility and coordinator integration; no containers remain from these proofs. No unrelated Docker workload was stopped or changed. No hosted compute, purchase, provider, runtime network, user computer/GUI, database, global installation, MCP registration, commit or deployment occurred.

Remaining gates are hosted isolation/transport and authentication, production font availability, customer-scale/malformed-document budgets, a multi-tenant supervisor and crash recovery, Banner native import mapping, browser fidelity and commercial print acceptance. No other Craft engine or ArtCraft hub generation capability is enabled by this work.
