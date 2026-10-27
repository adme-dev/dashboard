# Hosted Craft engine readiness

27 October 2026. Read-only discovery plus an implementation contract; **no hosted engine was deployed or activated**. The coordinator owns source changes, release, credentials, provisioning and host operations. This worker changed only this report.

## Target decision

**No suitable existing Linux ARM64 execution host or engine-private durable volume was established.** The only discovered remote host is reachable Linux **x86_64**, running an existing ServerPilot web stack on Ubuntu 16.04.7. It lacks the checked Docker/Node installation, engine directories and usable noninteractive administration rights. Do not treat it as an immediately deployable Craft host or install an engine alongside those workloads without the coordinator's host-administration/isolation decision.

The concrete access gap is an identified Linux ARM64 host with administrative/runtime access, an operator-owned persistent filesystem, and an approved capacity allocation; alternatively, qualify an amd64 runtime and obtain an isolated deployment allocation with administration rights on existing infrastructure. No purchase, new hostname or remote endpoint is assumed. Spare resources on the known VPS do not establish isolation or ownership of those resources.

Independent work can proceed now: daemon lifecycle, global admission, durable container identity, operator reconciliation/retention, portable proof packaging and deployment/readiness tests. The amd64 release assets also exist, so qualifying that architecture is possible without changing engine versions; it is a separate acceptance exercise, not an ARM64 manifest edit.

## Discovery evidence and boundaries

Source inspected: branch `adme-dev/banner-editable-artwork`, HEAD `47ec30c3522f6ab660d730776709770c8a22d7c8`, a shared dirty checkout with no configured upstream. The local `origin/main` ref was `faad3ba572770f2cfb7cd1f2f705ebaf2497f06a`, with HEAD one ahead/three behind. This worker did not fetch, merge, commit, stash or deploy. The coordinator must freshly reconcile source before release; these refs are an observation, not a current-main assertion.

| Discovery | Observed result | What it establishes |
| --- | --- | --- |
| `orca host list --json` | Local Darwin machine and SSH target `45.63.26.219`, ID `ssh-1792837657267-u34bog`, shown disconnected | Inventory has no other listed ARM64 remote host; Orca disconnected status alone is not an SSH reachability result |
| `orca environment list --json` | Empty list | No saved paired Orca runtime discovered |
| Existing SSH alias, batch mode, strict existing host-key checks | Login succeeds as `serverpilot` | Existing host access works without a password prompt; no host key changes or new credentials were made |
| SSH `uname`, OS metadata | Linux x86_64, Ubuntu 16.04.7 LTS | Existing accepted ARM64 image is not a native fit |
| CPU/memory snapshot | 8 CPUs; 32,174 MiB total, 29,143 MiB available; load 0.85/1.27/1.24 | Point-in-time headroom only, not reserved engine capacity |
| Running workload names only | `nginx-sp`, `apache-sp`, MySQL, PHP-FPM versions 5.4 through 8.2, Postfix, ServerPilot agent/monitor/stats | Existing shared web/database workloads would be affected by host/runtime changes; customer content and command arguments were not inspected |
| `sudo -n true` | Exit 1, `sudo: a password is required` | This session has no demonstrated noninteractive administrative path |
| Docker/Node checks | Not found in login PATH or `/usr/bin` and `/usr/local/bin`; `/var/run/docker.sock` absent | Required service tools are unavailable through the checked execution environment; not an exhaustive filesystem search |
| `df -PT`, `findmnt`, directory metadata | `/dev/vda1`, ext4, about 191 GiB available; `/srv` and `/var/lib` mode 0755 root-owned; `/srv` not writable | Persistent-looking host root filesystem exists, but lifecycle durability, private allocation, quota and backup are unverified |
| Engine private directories | `/srv/banner-engine` and `/var/lib/banner-engine` absent | No ready engine-owned volume/path discovered |
| Local Docker context/info | `desktop-linux`, local Unix socket, Docker Desktop Linux aarch64, 12 CPUs, 8,217,034,752 bytes RAM | Linux containers run locally on the Mac's Docker Desktop VM, not an independent hosted service |
| Local immutable image inspection | `sha256:1fbdad626b0f743bfcd4fd308342b7feeb877473579da2ca52d0e97cda9597f8`, linux/arm64, 117,600,608 bytes | Accepted local image is present; no registry distribution or remote image availability proven |
| Local container listing | No containers carrying `io.xeroflow.banner-engine` | No residual labeled proof container at inspection time; not hosted cleanup evidence |

SSH inspection used `BatchMode=yes`, `StrictHostKeyChecking=yes`, `UpdateHostKeys=no`, an eight-second connect timeout and the existing alias/key. Only OS, resource, tool, directory and workload-name metadata was read. No install, restart, package update, remote file write, container launch or database operation occurred.

### Credential and deployment configuration presence only

No credential values were printed or copied. Discovery was restricted to known environment names, conventional config locations and the configured SSH identity; no broad secret search was performed.

| Location/name | Presence evidence | Limit |
| --- | --- | --- |
| `~/.ssh/config` alias `45.63.26.219` | Present; uses `serverpilot` and `~/.ssh/serverpilot_guest_transmit_20260807` | Identity file present and SSH authentication works; not administrator access |
| Conventional Wrangler configs `~/.wrangler/config/default.toml` and `~/Library/Preferences/.wrangler/config/default.toml` | Present; keys `oauth_token`, `refresh_token`, `expiration_time`, `scopes` exist | Token validity, account selection, permissions and hosted configuration were not queried |
| Checkout `.env`, `.env.local`, `.dev.vars` | Absent | Does not establish absence from other worktrees, deployment secrets or a secret manager |
| Process environment allowlist | No `BANNER_ENGINE_ENABLED`, `BANNER_ENGINE_SERVICE_TOKEN`, `BANNER_ENGINE_CAPABILITIES`, `BANNER_ENGINE_BUCKET`, `DATABASE_URL`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CF_API_TOKEN`, `FLY_API_TOKEN`, `HCLOUD_TOKEN`, `VULTR_API_KEY`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Names checked only; no provider account inventory or provisioning authority established |
| `wrangler.toml` | Pages project `agency-dashboard`, existing storage bindings including `MEDIA_BUCKET`; no `BANNER_ENGINE_*` entry | Dedicated private engine bucket is not configured in this source; dashboard-managed bindings/secrets remain unverified |
| Application origin | `https://app.xeroflow.io` exists in repository configuration; `APP_URL` is documented as dashboard-managed | Candidate existing application origin only; this inspection did not verify the deployed engine routes or release ID |

`BANNER_RENDER_QUEUE`, `BANNER_ROOMS` and general media storage are existing unrelated facilities. None establishes a Craft execution service or substitutes for the dedicated private `BANNER_ENGINE_BUCKET` required by `engineJobStorage.ts`. Do not infer production engine activation from ordinary Pages/Cloudflare authentication.

## Existing artifact and amd64 alternative

The current implementation pins PhotoCraft 0.16.0 and VectorCraft 0.17.0. `prove-online-engine-prepare.mjs` selects `linux-aarch64` archives; `prove-online-engine-build.mjs` builds `linux/arm64`; `runtime/render-preview.mjs` hard-codes their ARM64 executable digests. Merely setting Docker's platform to amd64 does not produce a valid runtime.

Official release API metadata and live `SHA256SUMS.txt` were checked read-only on 27 October. Both matched the retained local checksum files:

| Official archive | Bytes from release metadata | Published SHA-256 |
| --- | ---: | --- |
| [PhotoCraft 0.16.0 Linux x86_64](https://github.com/storytold/photocraft/releases/tag/v0.16.0) | 87,847,296 | `7c17f3633ebf7dabf27628e2d2637d918c7c2a5b163b8b90347a78acddf63608` |
| [VectorCraft 0.17.0 Linux x86_64](https://github.com/storytold/vectorcraft/releases/tag/v0.17.0) | 129,314,923 | `66c289d0bd354b71e4cd787193ea0481e3a1cd239f2a18068110ea36852fc026` |

These are metadata/checksum observations. The amd64 archives were not downloaded, extracted or executed. Before selecting amd64, pin archive bytes and extracted executable digests, make architecture an explicit trusted runtime/build choice, verify the pinned Debian base supports that target, rebuild and repeat native/isolation/transport acceptance. The current Dockerfile copies verified CLIs/notices into Debian bookworm-slim and is structurally reusable, but current base-image target compatibility and amd64 binary linkage still require measurement. The container base does not solve host Docker/kernel/cgroup/administration prerequisites. Do not use unproven cross-architecture emulation as production acceptance.

The accepted local manifest is `output/editable-artwork-online-engine/linux/runtime.json`; adjacent engine capability proofs reference an absolute Mac `acceptancePath`. `loadLinuxRuntime()` freshly verified both proof/hash chains in this inspection. All **31/31** source hashes in the final retained SQL/native proof still matched current files. This is fresh integrity validation, not a rerun of native rendering or the prior test suites.

Retained prior evidence: `output/editable-artwork-engine-jobs/proof-2026-10-27T05-26-57-516Z/{postgres-proof.json,native-http-evidence.json}`. The SQL proof records success and owned-cluster cleanup; HTTP evidence explicitly uses fixture authentication/rate state and private storage. See [ENGINE-JOBS.md](ENGINE-JOBS.md) for the original test counts and scope.

Moving only `runtime.json` to `/srv` will fail: each adjacent capability-proof digest and its referenced acceptance artifact must agree. Provide a portable, verified artifact bundle, or generate host-local acceptance/proof files and matching capability registrations. If acceptance paths change inside hashed proofs, their digests change too. Copying an old proof is provenance retention, not hosted acceptance.

## Concrete service topology

Use the existing application and job authority; introduce one dedicated Linux execution service only after a host allocation is established:

1. **Pages `agency-dashboard`** serves authenticated user submission/status/cancel/private-output and the fixed TLS worker route `/api/internal/banner-engine`. Neon stores migration 483 job authority. A dedicated private R2 binding stores immutable inputs/outputs. The Linux service receives no database or R2 credentials.
2. **One host-side Node supervisor** uses the existing `runEngineWorkerOnce()` and `createLinuxEngineAdapter()` for both capabilities, alternating pulls with **one aggregate active slot** initially. Docker CLI and daemon are on that same host, because bind-mount paths must name files visible to the daemon. The supervisor authenticates outbound to the configured application origin; no public listener or new DNS endpoint is needed.
3. **An isolated native container per attempt** keeps existing no-network, nonroot, read-only filesystem, dropped capabilities, bounded tmpfs/process/log/output/time controls. Only the immutable input inode enters the container; credentials, runner directories and Docker socket never do. Application jobs currently request 2 CPUs, 2,048 MiB and 32 processes; runtime clamps execution to 90 seconds while authority/transport allow at most 120 seconds.
4. **Private persistent host storage** holds separate `staging` and `attempts` roots under one operator-owned durable mount, shared by all service processes. Proposed layout: `/srv/banner-engine/runtime/` for immutable artifacts, `/var/lib/banner-engine/staging/` and `/var/lib/banner-engine/attempts/` for journals/tombstones. These are installation design paths, not discovered directories. A mount identity and ownership check must fail startup if the volume is missing; do not silently recreate roots on an ephemeral fallback filesystem.
5. **Host service manager plus monitoring** manages the single supervisor, startup reconciliation, graceful drain and content-free health/metrics. Docker access is privileged host control; require a dedicated service identity and explicit isolation from existing workloads. Initial budget must include the 2 GiB native process plus Node's JSON/base64/PNG validation memory, operating-system reserve and retained disk bytes; measure rather than advertising a throughput guarantee.

An R2 object bucket is not a POSIX replacement for durable exclusive creation/fsync semantics. A disposable Orca workspace environment or the Mac's Docker Desktop VM also does not satisfy the autonomous hosted-service requirement.

## Minimum implementation before activation

| Work | Concrete contract | Meaningful acceptance |
| --- | --- | --- |
| Supervisor/daemon | Add a separate persistent entrypoint around the existing one-shot API. One global slot across both engines; fair polling; bounded jitter/backoff when idle; graceful signal drain; no attempt retry. Exit/hold on configuration failure or uncertain capacity until reconciliation proves safety. Prevent overlapping supervisor processes through a durable host lock. | Two engines and competing supervisors never exceed the slot; SIGTERM drains/aborts correctly; restart cannot rerun a claimed attempt; lost claim acknowledgement cannot free capacity by assumption |
| Startup/readiness | Check architecture, local immutable image ID, actual executable pins, proof chain, Node/Docker versions, mount identity/ownership/permissions, disk reserve and retained journals before claiming. Add an authenticated non-claim readiness/capability exchange if required; current wire schema has no health action. Emit only fixed status codes, pins and IDs. | Missing volume/image/proof/credential prevents claims; unsupported architecture rejects; readiness probe never consumes a queued job |
| Durable admission | Add transactional global and per-client queued/running/storage budgets before native input storage, with payload-bound reservations/idempotency and bounded expiry. Count uncertain executions against capacity until positively reconciled. Current per-user ten/minute limiter and per-attempt caps are insufficient global budgets. | Concurrent users cannot exceed slots/bytes; duplicate request does not double-reserve; lost object/DB acknowledgement retains recoverable ownership without leaking reservations |
| Container correlation | Persist attempt-to-container identity **before** native container creation, and add deployment/attempt ownership labels. Current runtime generates a random name and a generic `linux-proof` label; `onContainer` exists as a runtime hook but production adapter/runner does not durably bind it into recovery authority. | Crash at every creation/start/cleanup boundary can attribute only owned containers; unrelated workloads are never stopped; ambiguous Docker readback retains the hold |
| Reconciliation | Add a privileged, audited, bounded read-only inventory joining DB jobs, staging/runner receipts, exact owned containers and object metadata; add separately authorized cleanup decisions. Current service status requires an ephemeral claim token, intentionally not persisted, so it cannot reconcile post-restart state by itself. Lost claim response may leave no local job identity and requires authority-side inventory. | Lost claim/completion acknowledgements and host death are observable without resubmitting; malformed/missing receipt stays uncertain; proven container absence and authority state are recorded independently |
| Expiry/retention | Schedule bounded DB-clock expiry independently of future claims/status requests; current expiry is opportunistic. Define retention for private inputs/outputs/orphans and host files. Preserve durable attempt tombstones and immutable terminal authority even after sensitive bytes expire. | No traffic is needed to surface stale jobs; no live/uncertain workspace is deleted; dry-run deletion plan has exact owned identities and age/state predicates; deletion never enables replay |
| Artifact packaging | Bundle source/dependencies, accepted image, per-engine proof and acceptance files; remove Mac-specific path assumptions without weakening hash checks. Pin Node/dependencies and target architecture. An amd64 lane needs new trusted executable pins and independent native proofs. | Fresh host installs from recorded artifacts; bad/missing proof refuses startup; same engine/version with wrong executable/proof cannot claim successfully |
| Release and operations | Configure private bucket, 32–512-character printable service credential (common server/worker limit), exact capabilities and enable switch. Add content-free monitoring for readiness, age/backlog, uncertain jobs, failed cleanup, disk and memory. | Deployed auth/tenant boundaries, immutable R2 writes and Neon fencing pass against the exact release; failure holds are visible to an operator |

Do not add retry/requeue to make an unknown job appear healthy. Terminal uncertainty is immutable in the current authority; reconciliation evidence should be separate from any future explicit recovery authorization. Do not persist raw claim/service tokens in journals to shortcut that boundary. Do not run a shell `while true` loop that ignores exit 2/64 and claims more work without capacity accounting.

## Exact startup and readiness proof

The following is the coordinator's execution checklist, **not commands executed by this report**. It is intentionally staged so credentials and enablement do not precede host qualification.

1. **Select and record the actual target.** Identify host, architecture, administrator, service identity, filesystem device/mount, persistence/reboot policy and reserved resources. For the known VPS, obtain administrator access and an isolation decision first; do not upgrade or install on its live web stack as an incidental dependency fix. If ARM64 remains the target, request an existing ARM64 host/access record explicitly; none was found here.
2. **Prepare the current release.** Reconcile latest `origin/main`, review the full candidate, run focused tests plus full build and `pnpm deploy:check`. Apply migration 483 against the intended database under coordinator ownership. Release Pages only through the repository's `pnpm deploy:*` scripts; record source/main commits, `agency-dashboard` target and deployment ID. Verify established navigation including QR Codes. This worker did not exercise the release commands.
3. **Prepare native runtime artifacts.** Verify archive/executable/image/proof hashes on the selected architecture. On an approved ARM64 host, the existing prepare/build/native/safety scripts are starting points; they create artifacts and run containers and must only run in the coordinator-owned allocation. Ensure their fixture/dependency paths are available. On amd64, implement the separate pin/build lane first. Retain host-native output PNG hashes, isolation readback and exact container-absence receipts for both engines.
4. **Establish private durable roots.** Provision the recorded mount and ownership; test exclusive-create/fsync/rename behavior and restart persistence with owned probes. Verify symlink rejection and distinct roots. Fail readiness on a missing mount or changed owner. Inspect image availability without pulling during execution. Install the supervisor only after the daemon/reconciliation tests above pass.
5. **Wire actual application configuration.** Set the dedicated `BANNER_ENGINE_BUCKET` binding and matching private service secret in Pages and host secret storage, exact accepted capability JSON, and `BANNER_ENGINE_ENABLED=true` only in the intended gated rollout. Keep `BANNER_ENGINE_ALLOW_LOOPBACK` off remotely. The existing origin candidate is `https://app.xeroflow.io`; confirm it is the coordinator's deployed target before use. Public/customer admission needs an explicit gate while operator canaries run; the current enable switch alone is not a tenant allowlist.
6. **Exercise the existing one-shot worker before daemon activation.** From the installed release, with the matching secret supplied privately by the service manager, the current syntax is:

   ```sh
   pnpm exec tsx scripts/banner-studio/engine-worker.ts --once \
     --origin https://app.xeroflow.io --engine photocraft \
     --manifest /srv/banner-engine/runtime/runtime.json \
     --staging-root /var/lib/banner-engine/staging \
     --workspace-root /var/lib/banner-engine/attempts
   ```

   Repeat with `--engine vectorcraft` and its accepted registration. The origin is existing repository configuration; the `/srv` and `/var/lib` locations require the preceding installation. There is no implemented daemon command to substitute today. Exit 0 can mean **idle** or accepted success: inspect the structured outcome. Exit 1 is a known failure, 2 uncertainty and 64 unavailable configuration/runtime.
7. **Prove actual hosted success.** Submit one explicit operator-owned synthetic native fixture per engine through real hosted user auth/current-project authority. Observe DB admission/claim, one actual native execution, immutable private R2 input/output, accepted completion, user status and private PNG retrieval. Independently compare returned PNG dimensions/hash/alpha to recorded source/attempt/capability identities. Require `succeeded` acknowledgement; a local receipt, idle pull or HTTP reachability alone is insufficient.
8. **Prove fencing and restart behavior.** Exercise cross-client denial, stale source, cancellation during execution/upload, deadline, duplicate submission/claim, concurrency limit, disk admission, lost claim/completion response and service/host restart. Demonstrate exact owned-container cleanup or retained uncertainty, tombstones surviving restart and zero automatic reruns. Fault injection must use isolated operator fixtures; do not disturb existing host workloads.
9. **Enable the persistent service and observe.** Show supervised startup after host restart, bounded polling, separate liveness/readiness, alertable held jobs and no secret/content logging. Record source, target, image, capability pins, volume identity, deployment ID, fixture job/attempt IDs and proof timestamps together. Only then broaden admission. Resource/quality claims remain limited to measured fixtures and budgets.

## Completion and remaining owner actions

This inspection delivered the host/access decision and concrete independent implementation work. It did not establish hosted authentication, production Neon/R2 behavior, production engine execution, exact font fidelity, customer-document capacity, editable import, reconstruction quality or print acceptance. Existing local success is valuable evidence with those limits.

Coordinator next action: implement the missing supervisor/admission/reconciliation/artifact work while resolving either (a) the exact ARM64 host plus durable-volume/admin access gap, or (b) an explicitly approved isolated amd64 host allocation and architecture-specific acceptance. The discovered shared VPS is **not ready for activation**; root access and an architecture flag alone would not close its workload-isolation and runtime qualification gaps.
