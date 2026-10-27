# Dedicated native Cloudflare canary — blocked on build budget

27 October 2026. **Do not deploy this package yet.** The dedicated Worker and
synthetic receiver are reviewable and locally tested, and the exact accepted inner
image is packaged. The guarded outer-image build was cancelled on disk use, then a Wrangler
dry-run unexpectedly completed the local image from cached layers. The local
image exists, but the requested cumulative build budget was not met; no hosted
registry publication, native execution, provider termination receipt or
production acceptance exists. Root owns further
build placement, independent review, infrastructure allocation and deployment.

## Concrete build blocker

The requested budget was below 1 GiB with 3 GiB free reserve. Preparation used a
900 MiB admission ceiling and exported the accepted inner image to a 121,223,680-byte
archive. A first context was retained when source review required a new context;
total retained artifacts before the build were 242,605,865 bytes.

The local Docker build was cancelled with exit 130 after its free-space watcher
tripped. Available space changed from 10,087,772,160 to 9,062,072,320 bytes during
the build: 1,025,699,840 additional observed bytes, excluding the existing package
artifacts. Shared-machine activity may contribute to that difference. More than
3 GiB reserve remained, but **the below-1-GiB bound was not established**. Docker
in-flight layer extraction outpaced the 128 MiB cancellation margin. A free-space
watchdog is not a Docker storage quota.

`workers/banner-engine/canary/build.mjs` now fails immediately, without invoking
Docker. A separately reviewed builder with a real storage quota or a smaller
proven build strategy is required. Do not rerun the historical helper or clear
unrelated caches to make this pass. No owned or unrelated image/cache was pruned.
The cancelled build's downloaded layers remain in Docker's shared cache;
their exact attribution and cleanup are left to root. No Container was launched
by either image-build attempt.

A subsequent `wrangler deploy --dry-run` compiled the Worker **and built the
Container image**, despite not uploading it. This was not a harmless Worker-only
check and it bypassed the disabled local helper. It completed local tag
`banner-engine-native-canary:worker`, with AMD64 manifest/inspect ID
`sha256:12158e33bb5a22ed0ff01b0f9d1cde28e24d44904f3c1819e4ef379fe4f47472`
and config digest
`sha256:e7bfa3ca18487c5c231229ca24164de533eff36934f1a78c29b96b57f1301805`.
Docker reports 313,936,196 image bytes; that is not total cache/expanded-disk use.
No image was pushed, deployed or executed. Both attempts are included in the
failed budget assessment. Use esbuild-only validation to avoid another image
build during review; do not run Wrangler deployment dry-run on this config.

Retained local evidence, all under the owned canary directory:

- `.artifacts/build.json`, `build.log`, `build-attempt.mjs`: failed build receipt,
  bounded diagnostic log and historical helper; the latter is evidence only.
- `.artifacts/preparation.json`, `context/`: current checked package.
- `.artifacts/preparation-initial-retained.json`, `context-initial-retained/`:
  earlier context preserved as evidence; not the current package.
- `.artifacts/worker-bundle/`: Wrangler's local Worker dry-run output.
- `.artifacts/outer-image.json`: completed local image facts from that dry-run;
  explicitly records that the disk budget is not accepted.

## Narrow contract

All changes are new files under `workers/banner-engine/canary/`, the new
`scripts/banner-studio/prepare-engine-cloud-canary.mjs`, new
`test/banner/engineCloudCanary*.test.ts`, and this report. Existing runtime,
service, cloud controller, candidate and application code are unchanged.

This is a standalone one-invocation synthetic canary, not the production adapter
for [Cloud execution control](CLOUD-EXECUTION-CONTROL.md). It preserves the
[qualification contract](CLOUDFLARE-ENGINE-QUALIFICATION.md), but does not claim to
exercise the full Pages/Neon/R2 authority or production generation lifecycle.

- Dedicated Worker/application: `banner-engine-native-canary`.
- Dedicated SQLite DO class/binding: `NativeCanary` / `NATIVE_CANARY`.
- Fixed DO name: `banner-native-canary-once-v1`; constructor rejects another ID.
- Private named service entrypoint: `NativeCanaryControl`, exposing only `run()`
  and `status()`. `run` accepts no arguments. HTTP always returns 404.
- Default admission: `BANNER_NATIVE_CANARY_ENABLED=false`; no workers.dev,
  preview URL, route, schedule, queue, Pages engine activation or production
  credentials. No R2, database or secret binding is needed.
- One aggregate Container, `standard-3`, `max_instances=1`. The DO consumption
  record, not this capacity setting, prevents replay.

The transaction permanently writes consumption and a five-minute stop alarm
before any VM start. It awaits durable synchronization. Concurrent calls, lost
replies, VM/process/runtime restart, disabled admission after consumption, and
later calls return the stored record. Nothing deletes, leases, resets or replaces
the record; a failure before startup still spends the invocation. Keep the same
namespace and storage; duplicating/deleting/restoring it defeats the guarantee.

The outer process creates a fresh random boot ID and runs no Docker/native work
on boot or readiness requests. The DO records the exact boot before sending one
empty POST directly to its already-started Container port. It never retries that
POST, cold-starts a replacement, or forwards a prior boot permission. The receiver
rejects nonempty/framed payloads, wrong boots and repeated requests before any
asynchronous work. A private local Symbol also fences the DO execution helper
against RPC bypass. No supplied URL, command, image, document or font is accepted.

DO alarm and outer PID 1 each have a five-minute stop deadline; inactivity timeout
is another stop mechanism. The DO explicitly destroys the VM after completion or
uncertain transport. An alarm retries termination only, never execution. These
are implemented bounds, not proof of hosted scheduler punctuality or termination.

## Pinned artifacts and intended receipts

The inner image is exactly
`sha256:390a78bbbf9a49c84f09dcdc200709e8fce56d3e15d6bdd5dd09a256a6653dca`.
Its archive SHA-256 is
`86cecd78b2054c7167d703548cca6e6977087dd276c69be37acee074c82af1c4`.
Current package manifest SHA-256 is
`60d764cfd1fefc45e5437fe87e9cf424b2ddd5318aba53244f5b5cb9a876d339`.
Preparation verifies the accepted qualification hash and exact synthetic fixture
hashes. It packages the accepted heading and vector-font documents, not customer
artwork, along with the whole immutable inner image containing official engine
MIT/Apache/third-party notices and the pinned Source Sans 3 Bold font/OFL licence.
The manifest records every selected notice hash, checked inside the inner image.

The outer Dockerfile pins AMD64 Docker 29.2.0-dind manifest
`sha256:99aa88f75d8d401c30e395db1d2e679a89ff0be9b415f020b8e2383c517e1fda`
and Node 24.18.0-alpine manifest
`sha256:4ba75f835bb8802193e4c114572113d4b26f95f6f094f4b5229d2a77773e0afc`.
It adds the Node executable/libraries/licence, inner archive, small supervisor and
fixed fixtures. No package installation or job-time image pull is configured.
These are source image manifest pins. The completed outer local manifest and
config digests above are distinct from any future hosted registry publication.

The rootful outer daemon uses Cloudflare's supported iptables/IP-forward-disabled
setup and cgroupfs. Before either native CLI launches, the receiver checks actual
Docker readback and inner cgroup v2 files for 2 CPUs, 2 GiB RAM, zero extra swap,
and 32 processes. It retains UID 65532, no network, read-only root, no capabilities,
no-new-privileges, one read-only input mount, 64 MiB tmpfs, 9 MiB output tmpfs,
8 MiB file/output bound, 128 FDs, 64 KiB command logs, no Docker logs, and a
90-second inner lifetime. A missing controller or ignored resource flag rejects
before rendering. Runtime disk preflight retains 3 GiB reserve plus 900 MiB headroom;
this also does not impose a hard filesystem quota.

Expected returned receipts include runtime architecture/Docker/cgroup versions,
inner ID and actual container ID, executable/version/font/notice hashes, exact
font-resolution output, Docker and effective cgroup isolation, bounded native
logs, exact PNG hash/bytes/dimensions and positive owned-container removal plus
scratch deletion. PNGs must match the previously accepted complete byte hashes;
they are not published or returned as customer data. Outer-image correlation is
the configured registry reference plus root's deployment record, not a digest the
container can independently attest. `finished` requires a valid successful
receipt and successful explicit outer destruction; uncertain states stay spent.

## Local verification and remaining acceptance

Initial policy stubs failed four meaningful safety assertions. **All 15 final
focused tests pass**, along with the isolated strict TypeScript check and scoped
ESLint. The tests cover receiver replay/body rejection, command byte/deadline bounds, disk
preflight, resource-policy rejection, actual private RPC and DO SQLite persistence
through local workerd restarts, concurrent consumption, pre-start failure, lost
acknowledgement, alarm fencing, RPC helper bypass and production HTTP 404s.

```sh
pnpm exec vitest run test/banner/engineCloudCanary.test.ts test/banner/engineCloudCanaryWorkerd.test.ts
pnpm exec wrangler types workers/banner-engine/canary/worker-configuration.d.ts --config workers/banner-engine/canary/wrangler.jsonc --include-runtime false --strict-vars false
pnpm exec tsc -p workers/banner-engine/canary/tsconfig.json
pnpm exec eslint workers/banner-engine/canary/*.mjs workers/banner-engine/canary/*.ts scripts/banner-studio/prepare-engine-cloud-canary.mjs test/banner/engineCloudCanary*.test.ts
```

The tests use installed workerd's `2026-07-01` compatibility date; the deployment
configuration uses `2026-10-27`. Container transport/destruction in workerd tests
is synthetic. The receiver HTTP tests use real local Node HTTP. They do not prove
nested Docker startup, native hosting, actual hosted resource enforcement, binary
execution in the proposed outer image, complete font semantics, VM kill/delayed
delivery behavior or cleanup. No dashboard build was run. There are no hosted
receipts to return. Resolution of the build-budget failure and independent image
review are prerequisites to root's native canary, which in turn precedes any
production capability activation.

## Root-only deployment procedure after the blocker is resolved

These commands are a procedure, not authorization to deploy this unfinished
package. Use a separately reviewed bounded builder, preserve a build receipt with
the exact outer config/image ID and package hash, push only the dedicated
`registry.cloudflare.com/<account-id>/banner-engine-native-canary` repository,
and obtain its immutable registry manifest digest. Do not infer a registry digest
from a local Docker config/image ID.

Generate the disabled release configuration with the real dedicated digest:

```sh
node scripts/banner-studio/prepare-engine-cloud-canary.mjs --deployment-config 'registry.cloudflare.com/<32-hex-account-id>/banner-engine-native-canary@sha256:<64-hex-manifest-digest>'
pnpm exec wrangler deploy --config workers/banner-engine/canary/.artifacts/wrangler.release.json
```

The generator rejects placeholders, tags and another repository name. It makes no
network calls. Its generated file is exclusive and leaves admission false. Before
root's separately approved run, correlate that image with the build receipt,
reconcile source onto current main, independently review the complete package,
then explicitly enable `BANNER_NATIVE_CANARY_ENABLED` in that dedicated config
and redeploy it. Required nonsecret vars are the enable string, exact package
SHA-256, and exact outer registry image reference. The local SQLite migration
creates only this dedicated DO namespace.

A separately trusted root-owned caller requires a Worker service binding:

```json
{ "binding": "BANNER_NATIVE_CANARY", "service": "banner-engine-native-canary", "entrypoint": "NativeCanaryControl" }
```

Call `env.BANNER_NATIVE_CANARY.run()` once and retrieve records with `status()`;
never expose that binding through an unauthenticated HTTP dispatcher. No caller is
provisioned in this package. A failed or uncertain invocation is not retried. Root
must retain the permanent tombstone, disable admission, record deployment and VM
termination evidence, and decide dedicated infrastructure retirement separately.

## Official references retrieved live

- [Containers FAQ](https://developers.cloudflare.com/containers/faq/) and its
  current Markdown specify rootful `docker:dind`; rootless does not start. The
  indexed rootless search result was stale and was not followed.
- [Docker-in-Docker guide](https://developers.cloudflare.com/sandbox/sdk/guides/docker-in-docker/)
  specifies disabling iptables, ip6tables and IP forwarding and using cgroupfs;
  it warns nested Docker is not supported under `wrangler dev`.
- [Durable Object Container API](https://developers.cloudflare.com/containers/api/durable-object-container/)
  documents explicit startup, direct port access, destruction and inactivity
  timeout. This package uses the default scheduling policy supported by installed
  Wrangler 4.110.0 and the existing Worker types, without the Containers SDK.
- [Image management](https://developers.cloudflare.com/containers/guides/image-management/)
  documents immutable registry image references. The existing audio worker lists
  `@cloudflare/containers: *` without an installed package/lock provenance here;
  the native API avoids introducing an unpinned SDK or changing root dependencies.

Source observation: existing shared dirty branch `adme-dev/banner-editable-artwork`,
HEAD `47ec30c3522f6ab660d730776709770c8a22d7c8`, one ahead/four behind cached
`origin/main`. No fetch/reconciliation, commit, secret read, image push, deployment,
provisioning or existing-infrastructure mutation was performed by this worker.
