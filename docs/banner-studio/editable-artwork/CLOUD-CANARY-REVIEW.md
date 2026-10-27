# Independent retained native canary review

27 October 2026. Review of the retained package, not hosted acceptance. **Retain the existing image; another image build is not required merely to qualify it. Do not enable the current package unchanged for its irreversible invocation until the startup-order finding below is addressed.** The exceeded build budget remains a failed requirement, irrespective of current free space. Root owns any exception, launch changes, registry publication, deployment and execution.

Only this report was changed. No Docker build, image/container launch, prune, Wrangler dry-run/deploy, push, infrastructure mutation, secret read, application repair or source change was performed. Docker access was limited to existing-image inspect/history. Archive inspection streamed existing files without extracting them to disk or executing their contents.

## Findings

### 1. High: scratch creation races the pinned dind wrapper's `/tmp` mount

`workers/banner-engine/canary/supervisor.mjs:142–149` spawns `dockerd-entrypoint.sh` and immediately creates scratch using `mkdtemp(tmpdir())`, before the daemon-readiness loop. With the current image environment, scratch defaults to `/tmp`. The Dockerfile does not mount `/tmp` first. The pinned image metadata identifies `DIND_COMMIT=8d9e3502aba39127e4d12196dae16d306f76993d`; that exact [upstream wrapper](https://raw.githubusercontent.com/moby/moby/8d9e3502aba39127e4d12196dae16d306f76993d/hack/dind) mounts tmpfs over `/tmp` if it is not already a mountpoint. Cloudflare's [Docker-in-Docker guide](https://developers.cloudflare.com/sandbox/sdk/guides/docker-in-docker/) explicitly describes this overmount hazard.

If scratch creation wins the race and the wrapper subsequently mounts `/tmp`, `render()` cannot copy into the now-hidden scratch directory. The HTTP receiver fails, and the permanently consumed invocation cannot be retried. The current tests never execute this startup sequence. This is a source-ordering defect with an environment-dependent trigger, not evidence that Cloudflare cannot run nested Docker; this review did not launch a VM to reproduce the trigger.

For reuse without another image build, root can review a trusted launch adjustment that mounts `/tmp` before starting the existing Node entrypoint, or establishes and verifies a scratch location outside the wrapper's mount. The Container API supports trusted startup `entrypoint`/`env` options. Such an adjustment must be recorded as part of the launch contract and tested before consuming the hosted permission; it is not present in the reviewed Worker. Moving scratch creation after daemon readiness would instead change the packaged supervisor and require a different image, which is outside the present no-build instruction. Do not silently change package files while claiming the retained image contains them.

### 2. Medium: outer-image provenance is consistent but not a complete content attestation

All current source hashes in `.artifacts/local-validation.json` match. Current Dockerfile and packaged `.mjs` files match the retained context byte for byte; all six manifest file hashes match. Existing Docker inspect/history confirms the recorded final image identity, architecture, size, entrypoint and expected COPY/chmod steps. However, `.artifacts/outer-image.json` is a local receipt associating that image with the package hash, not a cryptographic attestation of its filesystem. There is no retained successful-build log or independently inspected outer-layer payload in the reviewed evidence. The original `build.log` documents the cancelled attempt, not the later successful Wrangler build.

Also, `.artifacts/worker-bundle/` currently contains **only a 128-byte README**, not a compiled Worker or source map. The report's description of retained Worker dry-run output should not be read as an auditable deployed bundle. Fresh focused tests did compile the Worker with esbuild in memory; the source hash is recorded below. Root must preserve the actual release bundle/config/deployment identity separately.

This is an evidence limitation, not a discovered image mismatch. Rebuilding would neither erase the budget violation nor establish hosted execution. Root can correlate/verify the existing image, then publish that exact artifact and record the resulting registry digest without another build. Do not assume the local manifest, config digest and future registry digest are interchangeable.

### 3. Medium: local tests do not exercise the production execution/termination path

`engineCloudCanaryWorkerd.test.ts` subclasses the production DO and replaces both `executeContainer()` and `destroyContainer()`. Its success result is deliberately `{ syntheticTransportOnly: true }`, bypassing production readiness, boot persistence, port delivery, receipt validation and destruction. The real Node HTTP test also substitutes `execute`. These are useful tests of durable consumption and HTTP gates, but passing them cannot prove the retained image starts, enforces cgroups, renders, terminates or cleans up. The resource validator test checks an empty invalid inspection object, not every individual isolation-field mutation.

No hosted scheduler/termination receipt, nested-daemon receipt, native output from this outer image, or runtime cleanup proof exists. These are runtime qualification gaps, distinct from finding 1. The existing inner-image proof is explicitly **emulated Linux AMD64 on an aarch64 daemon**, not native Cloudflare acceptance.

### 4. Low: the release generator inherits admission instead of forcing it off

`prepare-engine-cloud-canary.mjs:122–131` copies the source config and returns `enabled: false`, but never assigns `config.vars.BANNER_NATIVE_CANARY_ENABLED = 'false'`. The reviewed template is false, so its current output would be disabled. A future template edited to true would produce an enabled release while the helper reports false. Root should check the actual generated config before deployment; a helper hardening change is outside this report's ownership and would not require an outer-image rebuild.

## Exact provenance checked

Artifact paths below are relative to `workers/banner-engine/canary/` unless stated otherwise.

| Object | Verified identity and scope |
| --- | --- |
| Current package manifest | `.artifacts/context/package.json`, SHA-256 `60d764cfd1fefc45e5437fe87e9cf424b2ddd5318aba53244f5b5cb9a876d339`; recomputed and equal to `preparation.json` and `outer-image.json` |
| Current Dockerfile | SHA-256 `fd61a1abf97d1751ea56d1ea662ca3487ebc35eacad3f0d9dc3d753ad5bc11bd`; current and packaged copies equal |
| Supervisor | SHA-256 `e83fd08577bdeb20d9d59c1e6699149976d851e374af1e46cc18c48a875533dd`; current, manifest and packaged copy equal |
| Worker source | SHA-256 `8a911cce84d02065e145265e1b295d6326a9accad5cf691c21265ddc6f8fc7c7`; equals retained validation receipt; not part of the outer image |
| Preparation script | SHA-256 `9ac86b192c00ac398384c8590fcfde8d4aa2150c984d6a83968b6606f0dc2a7e`; equals retained validation receipt |
| Inner archive | 121,223,680 bytes; SHA-256 `86cecd78b2054c7167d703548cca6e6977087dd276c69be37acee074c82af1c4`; recomputed |
| Inner OCI index / local inspect ID | `sha256:390a78bbbf9a49c84f09dcdc200709e8fce56d3e15d6bdd5dd09a256a6653dca`; verified archive descriptor and Docker metadata |
| Inner AMD64 manifest | `sha256:d352c7529937e0b82a377ecc965c4d7de2fcdd1a03bb8b90a9c0fc39c710c6b7`; verified from archive |
| Inner config | `sha256:1f59895add798123377a3ac8de78171119502cdb6db9bb88ea1d323ca7bcf25e`; verified from archive; Linux AMD64 |
| Inner layers and files | All five compressed layer digests and uncompressed diff IDs verified; streamed image-layer contents match both CLI hashes, the pinned TTF, and all 30 notice/license hashes |
| Qualification receipt | `output/editable-artwork-engine-amd64/proof-2026-10-27T07-57-06.250Z/qualification.json`, SHA-256 `93ff068d8a96561e6e7b0c1c2e20116577e423def49a1439997fc207dcbecb84`; recomputed and matches package pin |
| Retained outer local manifest / inspect ID | `sha256:12158e33bb5a22ed0ff01b0f9d1cde28e24d44904f3c1819e4ef379fe4f47472`; directly inspected; tag `banner-engine-native-canary:worker`; Linux AMD64, 313,936,196 reported image bytes |
| Outer config digest | Receipt records `sha256:e7bfa3ca18487c5c231229ca24164de533eff36934f1a78c29b96b57f1301805`; not independently recovered from outer manifest bytes in this review |
| Outer configuration | Inspected `User=root`, entrypoint `node /opt/canary/supervisor.mjs`, Unix Docker host, empty TLS directory, `/var/lib/docker` volume; image creation `2026-10-27T08:48:52.288094625Z` |

The Docker and Node base manifest pins match the Dockerfile and package: Docker `99aa88f75d8d401c30e395db1d2e679a89ff0be9b415f020b8e2383c517e1fda`, Node `4ba75f835bb8802193e4c114572113d4b26f95f6f094f4b5229d2a77773e0afc`. No base was pulled during review. The earlier `.artifacts/context-initial-retained/` is superseded evidence, not the reviewed package.

The inner archive is an OCI index containing the AMD64 image and an attestation descriptor. Its index ID is not its AMD64 manifest or config digest. Each was distinguished above. The canary insists that nested Docker reports `image.Id` equal to the pinned index ID after load; whether the hosted daemon's image store preserves that representation remains a runtime check. A mismatch fails before native execution; it is not authorization to substitute a tag or relax the pin.

## Consumption, replay and termination assessment

The intended one-shot contract is coherent for this dedicated synthetic application:

- Admission requires the literal enable value plus syntactically pinned package/image values. HTTP returns 404, callers cannot submit work arguments, and the constructor rejects alternate DO identities. Configuration supplies no public route, workers.dev/preview exposure, schedule, queue, database, R2 or secret binding. A service binding is still privileged invocation authority and must remain confined to the trusted caller.
- The SQLite transaction writes the permanent consumption record and alarm before VM startup, followed by storage synchronization. Concurrent callers, runtime restart, failure before start and lost acknowledgement cannot recover a new execution permission. Later disabling admission does not erase the consumed record. The local private Symbol fences the execution helper against forged RPC calls. Preserve the namespace, fixed name and storage; deletion/restoration/cloning can defeat this application-level guarantee.
- Readiness does not invoke Docker. The Worker persists the observed boot ID before its single POST. The receiver rejects nonzero/missing Content-Length, transfer encoding, wrong boot IDs and replay before awaiting execution. Invalid requests do not spend the receiver gate; its first valid request does, even if execution fails. A new boot cannot accept the previous boot ID. One consumed invocation intentionally contains two sequential synthetic engine renders, not one render per caller.
- No automatic POST retry or restart path is present. The receiver does not carry a separate remote-deadline check: a delayed first request to the same live boot relies on DO destruction/alarm and the outer lifetime timer, unlike an old-boot request, which is rejected directly. Strict cancellation-at-the-authority-deadline is not locally proved.
- Normal success requires positive named-inner removal, an empty follow-up listing, scratch deletion with ENOENT confirmation, a passing receipt, and awaited outer `destroy()` with `running === false`. Failure cannot become `finished` through a timeout alone. Alarm handling fences state before attempting destruction and never executes work; a destruction failure can retry termination through alarm semantics.
- `daemon.kill('SIGTERM')` is not awaited and is not a daemon-exit receipt. The outer five-minute `process.exit(0)` is also not proof of inner cleanup. Failure midway through cleanup can leave no successful cleanup receipt, correctly retaining uncertainty. The platform destroy result and root's deployment/VM correlation are required. A provider exit code of zero alone must not be reported as a successful canary.

The [Container API](https://developers.cloudflare.com/containers/api/durable-object-container/) documents explicit startup, awaited destruction and inactivity timeout. Inactivity is not a fixed execution deadline and is reset by DO instance lifecycle; the durable alarm and process timer provide separate intended bounds. Actual scheduling punctuality, delayed delivery, runtime kill and failed-destroy behavior need hosted evidence. No termination was attempted or inferred in this review.

## Resource and build-budget assessment

The inner launch retains UID 65532, no network, read-only root, no capabilities, no-new-privileges, 2 CPUs, 2 GiB RAM with no additional swap, 32 processes, one read-only input bind, 64 MiB `/tmp`, 9 MiB output tmpfs, 8 MiB file/output bound, 128 file descriptors, no Docker logs, and a 90-second inner lifetime. Actual Docker inspection plus effective cgroup v2 CPU/memory/swap/PID files must pass before either engine binary runs. Executable/font/license checks precede native conversion. Shell-free fixed argv accepts no client document, URL or command. Command time/output and receipt size are bounded. Killing a Docker CLI on timeout alone does not kill its remote exec; inner lifetime and outer destruction remain essential.

Outer `standard-3` and one instance are consistent with the [documented 2-vCPU/8-GiB/16-GB instance](https://developers.cloudflare.com/containers/platform/limits/). They do not enforce a cumulative host build-storage budget. The runtime free-space preflight is likewise admission, not a quota. Current local free space is not evidence that the original sub-GiB build requirement passed.

The failed build receipt reports 242,605,865 retained artifact bytes plus 1,025,699,840 observed additional bytes, or **1,268,305,705 bytes** together, against a 943,718,400-byte ceiling. The observed change may include shared-machine activity, but the required bound was not established. The subsequent Wrangler build adds an unaccounted interval; the 313,936,196-byte final image size is not total extracted/cache use. The disabled `build.mjs` now throws before any Docker command. Retain both failed and successful-image receipts; neither pruning nor rebuilding is a corrective proof. Root must separately accept or resolve the historical budget breach.

## Verification performed and root decision

On Node **24.18.0**:

- `pnpm exec vitest run test/banner/engineCloudCanary.test.ts test/banner/engineCloudCanaryWorkerd.test.ts`: **15 tests / 2 files passed**, 1.35 seconds. Existing Vite native-config `__dirname` advisory only.
- `pnpm exec tsc -p workers/banner-engine/canary/tsconfig.json`: passed.
- Scoped ESLint for canary `.mjs`/`.ts`, preparation script and focused tests: passed.
- Recomputed all 13 validation-receipt source hashes; six package file hashes; Dockerfile/context correspondence; qualification hash; 30 notice-source hashes; archive descriptor/config/layer hashes and 33 selected in-image file hashes. All matched.
- Read all canary source/config, preparation code, both focused test files, current/initial preparation metadata, historical build helper/log/receipt, outer-image/validation receipts and qualification receipt. Docker metadata/history inspection confirmed the retained outer and inner identities. No native canary workload was launched.

Installed tooling is Wrangler 4.110.0, Miniflare 4.20260708.1 and Workers types 4.20260625.1. Local workerd tests use compatibility date `2026-07-01`; deployment specifies `2026-10-27`. Current official platform docs were consulted, but typecheck against installed types is not hosted compatibility proof.

Review checkout: `adme-dev/banner-editable-artwork`, HEAD `47ec30c3522f6ab660d730776709770c8a22d7c8`, no configured upstream. Cached `origin/main` is `704fb5caf86312f7003190f1fd210feb76746731`; divergence was **1 ahead / 9 behind**. No fetch/reconciliation was performed in this review, so this is not a freshly verified release base. The shared dirty checkout and separately owned startup repair were preserved.

**Root-controlled qualification can reuse the exact retained image without another build**, subject to the startup remedy/preflight and explicit handling of the budget breach. Root should first correlate the image/package and reviewed launch options, then preserve the immutable registry digest, actual release config/Worker bundle, source revision and deployment ID. Keep admission disabled until that record and a dedicated trusted caller exist. A successful run must return both expected PNG hashes and isolation/cleanup receipts, with positive outer termination, and leave the permanent consumption tombstone intact. Any uncertain run stays spent.

This review does not accept hosted readiness or production activation. It does not qualify Pages/Neon/R2 integration, production generations, arbitrary fonts/customer artwork, or the independently owned core application startup repair.
