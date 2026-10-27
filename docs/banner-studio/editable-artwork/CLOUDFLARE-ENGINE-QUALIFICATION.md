# Cloudflare Craft engine qualification

27 October 2026. The official AMD64 binaries execute successfully in the bounded Linux container runtime, with exact pinned font resolution and cleanup. **This is local emulated AMD64 proof, not hosted native acceptance.** No infrastructure was provisioned, deployment performed, credential read, account setting changed, or production capability enabled by this worker.

## Decision and exact boundary

Cloudflare Containers is a supported candidate on the existing Cloudflare account; an unrelated VPS is not a prerequisite. The coordinator reports freshly verified account access and existing Container applications. This worker did not independently query that account, reuse those applications, or treat their capacity as an allocation for Banner Studio.

The earlier [host readiness report](HOSTED-ENGINE-READINESS.md) correctly describes the accepted ARM64 runtime and a persistent-host service option. Its missing-ARM64-host finding does not rule out an independently qualified AMD64 Container executor. The scripts here establish that the same official engine versions have usable x86-64 binaries. They do not turn ephemeral container storage into the persistent mount required by the current filesystem-journal service.

Use this cloud execution contract, under coordinator ownership:

1. **Keep remote job authority unchanged.** Pages handles user/authenticated worker requests, Neon retains exclusive claims and immutable terminal/uncertain states, and dedicated private R2 retains immutable input/output bytes. The executor receives neither database credentials nor R2 credentials. Existing payload/source/current-access checks and result fencing remain authoritative.
2. **Allocate a dedicated Container application and durable controller.** Do not mutate or share the existing audio-render or Page Studio application. Initially reserve one aggregate execution slot across both engines. The Durable Object owns durable generation/slot/attempt-consumption records; alternatively implement those records transactionally alongside the existing Neon authority. An in-memory mutex, `max_instances`, filesystem lock, R2 FUSE mount or snapshot alone is insufficient.
3. **Consume an execution permission remotely before delivery.** Bind the durable record to job ID, attempt ID, exact capability/payload digest, image identity, outer boot/generation ID and intended inner-container identity. Commit an execution-consumed marker before forwarding the one-shot command. A duplicate/replayed request returns the recorded state and must not invoke the engine again. Lost acknowledgement after recording or forwarding consumes the permission even if execution cannot be established. Conservatively holding an unstarted attempt is safer than duplicate execution; no automatic replay or reassignment of that attempt is allowed.
4. **Fence each outer process generation.** A fresh VM gets a fresh boot identity and must register it with remote durable authority before work. A restarted process must not use restored/copied attempt credentials to execute an already-consumed attempt. The remote slot remains held through uncertain contact loss and startup. Before starting another attempt, require positive old-generation process/VM termination and inner cleanup evidence. If that cannot be established, retain an operational hold and the existing uncertain authority state. A timeout or missing local journal is not proof of termination.
5. **Treat local files as attempt scratch only.** Stage a verified immutable input inside the outer VM and bind only that file into the inner render container. Outer scratch and nested Docker image cache may disappear between boots. Do not run `engine-service initialize` on every boot or silently recreate its purported durable host journal; the current persistent-host service requires a different adapter/control boundary for Cloudflare. Keep token values out of durable journals and diagnostics. Private output uploads complete through existing result verification; lost completion acknowledgements query authority rather than rerun the render.
6. **Retain native isolation inside Docker-in-Docker.** Load the pinned inner image before enabling claims; never pull from a job. The outer supervisor/daemon may need Cloudflare-prescribed setup privileges, but the inner Craft container keeps UID 65532, no network, read-only root, no capabilities, `no-new-privileges`, a single read-only input mount, bounded tmpfs, CPU/memory/process/file/log/output limits and deadlines. Never mount the Docker socket, service credential, host workspace or journal into the inner container. Capture actual hosted Docker readback and termination receipts rather than inferring enforcement from flags.
7. **Persist the outcome before releasing capacity.** Keep distinct durable facts for authority status, actual native outcome, output transport receipt and positive cleanup. Lost control-plane replies retain the hold. Terminal output remains subject to the original source/cancellation checks; remote consumption does not authorize publication. Crash-recovery/retention must not delete an uncertain attempt record in a way that enables replay.

This is a design contract, not a claim that the current service has a remote durable journal adapter. The existing loader hard-pins ARM64 executables. Root must add an explicit trusted AMD64 runtime/capability selection or dedicated cloud adapter, preserving ARM64 pins and proof chains. No public job field should select arbitrary image, architecture, command, font, URL or executable hash. The new proof harness uses the existing trusted internal `executeLinuxContainer()` hook read-only; it never claims application jobs.

## Current official platform evidence

Official documentation retrieved on 27 October 2026:

| Requirement | Official source and consequence |
| --- | --- |
| Image architecture | [Containers get started](https://developers.cloudflare.com/containers/get-started/) requires `linux/amd64`; the retained ARM64 image cannot simply be relabelled. |
| Filesystem lifetime | [Container lifecycle](https://developers.cloudflare.com/containers/concepts/architecture/) says disk is ephemeral by default and starts fresh after sleep. Snapshots preserve only a point in time; they do not replace remote attempt consumption. |
| Durable control | [Durable Object Container API](https://developers.cloudflare.com/containers/api/durable-object-container/) exposes persistent Durable Object storage independently of the VM process. Use that boundary for generation and execution permission. |
| Nested Docker | [Containers FAQ](https://developers.cloudflare.com/containers/faq/) documents `docker:dind-rootless` and disabled iptables. [Sandbox 0.x Docker guide](https://developers.cloudflare.com/sandbox/sdk/guides/docker-in-docker/) instead provides a `docker:dind` integration with `--iptables=false --ip6tables=false --ip-forward=false --exec-opt native.cgroupdriver=cgroupfs` and a bounded daemon readiness wait. Root must select and pin one supported outer topology and verify it on the actual host. |
| Network | Those examples use inner `--network=host` to demonstrate networked workloads. Craft needs no network; retain `--network=none`. Disabled iptables does not justify giving renders the supervisor's network stack. |
| Capacity candidate | [Instance types](https://developers.cloudflare.com/containers/platform/limits/) currently lists `standard-3` as 2 vCPU, 8 GiB RAM, 16 GB disk. That is a candidate allocation for the existing 2-CPU/2-GiB render cap plus supervisor/nested-daemon overhead, not a measured throughput guarantee or permission to provision. |

Local Docker Desktop does not validate Cloudflare rootless/nested-cgroup behavior, instance admission or platform termination. The Sandbox guide explicitly does not support nested Docker under `wrangler dev`; do not treat a local Wrangler result as the hosted canary.

## Verified official artifacts

The preparer fetched each live official `SHA256SUMS.txt`, required one exact matching entry, streamed the archive with an exact byte ceiling, checked the archive digest, and extracted only the CLI and bundled `share/doc/<engine>/` notices. ELF headers are 64-bit little-endian x86-64. Selected extraction rejects traversal, links/devices, duplicate members, missing CLI/notices, excess selected bytes and excess member counts before writing files. There is no whole-archive extraction.

| Engine | Archive bytes / SHA-256 | Extracted CLI bytes / SHA-256 |
| --- | --- | --- |
| [PhotoCraft 0.16.0](https://github.com/storytold/photocraft/releases/tag/v0.16.0) | 87,847,296 / `7c17f3633ebf7dabf27628e2d2637d918c7c2a5b163b8b90347a78acddf63608` | 70,901,168 / `bc5ce108f01aed2965f3c067c4828d7bcaa33b83cd523e7e466f0e43bb47c21d` |
| [VectorCraft 0.17.0](https://github.com/storytold/vectorcraft/releases/tag/v0.17.0) | 129,314,923 / `66c289d0bd354b71e4cd787193ea0481e3a1cd239f2a18068110ea36852fc026` | 102,223,752 / `b0c02b7f82617cad91fef89c455694b4fbf2ad349ab576714e8a38e15b158862` |

Exact font: Source Sans 3 Bold 3.052, upstream commit `ed1808970eb3c7301c9a523bee26473ba0bb62fa`, TTF SHA-256 `9214b9d95e4231c609802815c2646c98174e2102d0d37f88978a7f8e71006e6a`. The independently verified upstream OFL licence hash is `89ad2c4f66dd29127527493e729c31e731f111cf10faf5774c3db9275ed0c22c`. The image retains the font licence, both engines' MIT/Apache notices and all bundled selected third-party notices, including VectorCraft's NOTICE and PDF backend licences. These are licence retention facts, not a legal review.

Base: `debian:bookworm-slim@sha256:7ff6ba31527b9e336162fa061746c366c4b2032f4d2cff2078bea43f78efe3f8`, built explicitly for `linux/amd64`. Successful local image ID: `sha256:390a78bbbf9a49c84f09dcdc200709e8fce56d3e15d6bdd5dd09a256a6653dca`, tag `xeroflow-banner-engine:amd64-qualification-1793087505626`. Docker reports 121,207,630 bytes for the image object; this is not total expanded cache/disk consumption. No registry upload or hosted availability is established.

## Measured local proof

Final evidence: `output/editable-artwork-engine-amd64/proof-2026-10-27T07-57-06.250Z/qualification.json` and `receipts.json`; `latest.json` points to that immutable proof and hashes it. The daemon is Linux **aarch64**, Docker 29.2.0; all receipts explicitly classify this as `emulated-linux-amd64` with `hostedAcceptance: false`. The final run also explicitly stages reopened synthetic outputs as mode 0444 inside the private proof directory so a real Linux UID 65532 can read the mounted input.

Nine grouped acceptance checks passed:

- Both pinned official engine versions execute with their in-container executable hashes checked before launch.
- PhotoCraft resolves exact Source Sans 3 Bold/PostScript face with no synthetic bold/italic; text and native metrics survive save/reopen unchanged.
- Actual `H` advance/ascent/descent match the pinned font's own tables.
- VectorCraft reports exact Bold face, no missing font and zero missing glyphs for the fixture heading.
- Both produce fully decoded transparent/antialiased PNGs; independent repeated native renders have identical decoded pixel hashes.
- Wrong executable and font pins both reject before engine output, followed by verified cleanup.
- Original synthetic inputs retain their original digests.
- All seven implementation/runtime source hashes remain unchanged during the proof.
- Every proof-owned container is positively absent after execution or rejection.

| PNG | Dimensions / bytes | Transparency evidence | SHA-256 |
| --- | --- | --- | --- |
| PhotoCraft | 800×256 / 6,242 | 200,229 transparent, 1,837 partial-alpha pixels | `6b6672f7cc41fc9003d739eea84d77d5c4927999984ee4b95886fb7ba4845d07` |
| VectorCraft | 640×360 / 7,868 | 206,169 transparent, 11,425 partial-alpha pixels | `2d1a974952c83eb1e5ec04b030c54a4c36ff6308b8e70e5a6bd3d5baf1d9912b` |

Successful receipts assert actual Docker settings: no network, nonroot, read-only root, dropped capabilities, no-new-privileges, one exact read-only input mount, 2 CPUs, 2 GiB memory/equal swap ceiling, 32 processes, 90-second deadline, 8 MiB output limit and noexec/nosuid/nodev tmpfs. They retain actual engine logs, command arguments, output digests, execution timing and exact container identities.

Seven focused regression tests pass, covering published checksum selection/rejection, honest architecture classification, selected CLI/licence extraction, and exact traversal/link/duplicate/size rejection reasons. Report: `output/editable-artwork-engine-amd64/regression-final-v2.json`. Scoped ESLint passes for all new scripts/config JavaScript/tests, and `git diff --check` passes. Both PNGs were visually inspected. Existing Vite `__dirname` advisory remains; no full dashboard build or global typecheck was run.

The first development image failed the pre-execution font check because a recursive `COPY --chmod=0444` also made font/notices directories non-traversable. That failed image and evidence were retained; the new Dockerfile was corrected and the full proof rerun. Do not use failed image `e16091ac7fa4b2ead41fa7093f852c00e34e0938645b4672a285ae605c161bdd` as accepted evidence. The successful build retains Docker's advisory about a fixed FROM platform, which is intentional for this architecture-specific lane.

The two archives total 217,162,219 bytes. The complete retained evidence/build context occupies about 373 MiB; initial host free space was 9.3 GiB and post-proof free space 8.2 GiB. The difference includes shared-machine/cache activity and is not exclusively attributable to this task. Preparation requires 1.5 GiB artifact headroom plus 3 GiB free reserve; the build rechecks reserve. No image archive, full desktop package, unrelated output, prior evidence or user file was deleted. No image export was needed.

## Reproduce and promote separately

New owned sources:

```sh
node scripts/banner-studio/prove-engine-amd64-prepare.mjs
node scripts/banner-studio/prove-engine-amd64-build.mjs
node scripts/banner-studio/prove-engine-amd64.mjs
pnpm exec vitest run test/banner/engineAmd64.test.ts
```

Preparation intentionally refuses an existing/partial `build/` context. It never silently replaces retained evidence. A repeat proof makes a new timestamped directory; the existing prepared artifacts can be rebuilt with the build script after their checks. The harness requires the prior synthetic fixtures in `output/editable-artwork-online-engine/linux/fixtures/`; it copies them before use. Root may package these tiny fixture copies with the native cloud canary. Do not copy Mac absolute paths from retained receipts into service configuration.

The preparer/build/proof manifests are qualification records. They deliberately are **not** `status: accepted` runtime manifests and cannot be passed to the accepted ARM64 loader. Same-version AMD64 executable pins require independently registered capability proof hashes. An image tag alone is not immutable capability authority; retain the platform image/config digest as well as the actual binary/font and proof hashes when packaging for cloud.

Before production activation, root must establish: a current reconciled source candidate; dedicated Cloudflare allocation with an immutable outer/inner image reference; native AMD64 hosted render/font/isolation/cleanup; actual nested resource enforcement; remote durable consumption/generation fencing and restart/lost-ack tests; existing authenticated Pages/Neon/private-R2 transport; application tenant/source/cancel boundaries; and reviewed capability registration. Run the cloud canary against a dedicated synthetic authority record, never a fabricated customer enquiry or artwork job. An uncertain old execution remains held until termination is proven.

This lane does not qualify arbitrary fonts, all glyphs, other Craft engines, editable imports, full flyer reconstruction, print fidelity, client scale or customer malformation budgets. It does establish a small pinned AMD64 execution artifact and repeatable proof for the coordinator's supported existing-cloud path.

Source observation: branch `adme-dev/banner-editable-artwork`, HEAD `47ec30c3522f6ab660d730776709770c8a22d7c8`, one ahead/four behind the locally cached `origin/main` at inspection. This worker preserved the shared dirty checkout and did not fetch/merge/release; root owns current-main reconciliation.
