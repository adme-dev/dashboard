# Bounded engine service: local implementation

27 October 2026. This implements the supervisor/admission slice accepted by the
coordinator against [hosted readiness](HOSTED-ENGINE-READINESS.md). It does **not**
activate a hosted engine. Existing transport, runner, runtime, server contracts,
release candidate and public product pages remain unchanged.

## Delivered contract

New files are `workers/banner-engine/service/{index,admission}.ts`,
`scripts/banner-studio/engine-service.ts`, the two `engineService*.test.ts` files,
and this report. There are no new dependencies, migrations or service-manager
installations. `runEngineService()` calls the existing `runEngineWorkerOnce()`;
no transport or runner extension was necessary.

- Default off. The library requires literal `enabled: 'true'`. The CLI requires
  both `BANNER_ENGINE_SERVICE_ENABLED=true` and `BANNER_ENGINE_ENABLED=true`.
- One aggregate slot for PhotoCraft and VectorCraft. Both capabilities are
  validated before the first claim; calls alternate, never overlap. The CLI
  loads both existing trusted adapters only after acquiring admission.
- Empty queues sleep for 1, 2, 4, 8, 16, then at most 30 seconds by default.
  A settled non-idle outcome resets the delay to one second. Every cycle sleeps;
  neither an empty queue nor a known job failure causes busy polling.
- Library timing overrides must be safe integers: idle minimum 1–60 seconds,
  maximum between the minimum and 60 seconds; shutdown grace 1–60 seconds;
  per-cycle budget 1–180 seconds. The CLI uses the defaults, including a
  180-second cycle budget and 30-second shutdown grace.
- SIGINT/SIGTERM stop new pulls and abort the current worker through its existing
  signal contract. Confirmed termination and authority acknowledgement permit
  a clean exit. A lost claim, lost acknowledgement, uncertain cleanup, thrown
  worker, or exhausted shutdown grace stops the service and retains admission.
  Late resolution after a watchdog hold never releases admission.
- Worker configuration failures (`invalid-request`, `unsupported-capability`,
  `duplicate-attempt`, `workspace-failed`, `receipt-failed`, or unexpected
  transport-failed/absent failure code) hold the service. Ordinary known job
  failures can continue only because the existing transport's `failed` outcome
  requires confirmed termination and an accepted terminal authority response.
- There is no execution retry, resubmission, replay, requeue, claim-token
  persistence, attempt cleanup, or automatic stale-lock recovery.

## Storage and admission

One operator-qualified root contains existing `staging/` and `attempts/`
directories, plus service-owned `admission/` and `history/` entries. The root and
both pre-provisioned child directories must have mode 0700, belong to the service
UID, use canonical absolute paths without symlink components, and reside on the
same device. The operator supplies the root's previously recorded device and
inode; missing or changed identity rejects startup before any claim. The service
never creates the root, staging, or attempts directories.

Device/inode matching detects replacement or absent expected storage; it does
**not** establish persistent mount durability, sufficient disk reserve, filesystem
crash guarantees, reboot identity stability, or host qualification. Record these
separately on the actual host. Do not compute a fresh device/inode in a startup
wrapper to conceal a missing volume. Filesystem and runtime preflight operations
assume a responsive, trusted local host; timers cannot bound a stalled kernel or
a blocked Node event loop.

Admission is an atomic exclusive `mkdir(root/admission)`, followed by parent
fsync and a durable content-free journal before any HTTP claim. All cooperating
service processes use the **same qualified root**. Competing processes stop
without loading native adapters or claiming work. PID is diagnostic only:
absence, reuse, timestamps, an empty directory, malformed state and even a
`stopped` journal are never grounds for automatic recovery.

`admission/state.json` contains only version, random session ID, PID,
`automaticRetry:false`, phase, cycle count, optional engine ID, and a fixed hold
reason. Writes use private exclusive temporary files, file fsync, atomic rename
and directory fsync. No source content, URLs, paths, exception strings, service
tokens or claim tokens are recorded. The service writes one current snapshot per
cycle; it does not append an unbounded event log per poll.

A clean stop writes the final journal, then archives the complete admission
directory at `history/<session UUID>/admission` and syncs both parent directories.
Attempts and transport receipts remain intact. A crash before the archive rename
retains the gate; a crash after the rename can only follow confirmed worker
settlement. Failure during final archive fsync may report a journal error after
the gate was already renamed: no native execution is outstanding at that point,
but the operator must inspect filesystem evidence before restarting. History
retention and disk quotas are separate work; no historical records are deleted.

This is cooperative host admission, not protection against the operator or other
processes running under the same UID. Retire unattended one-shot invocations and
other native launch paths before enabling this service. Existing one-shot code
intentionally remains read-only and does not acquire this gate. Before first use,
reconcile any pre-existing staging/attempt files and native execution; this slice
does not infer their safety merely because the new service gate is absent. A
second root, a different mount namespace, or an unmanaged native launcher would
bypass the host-wide deployment convention and is not an accepted topology.

## CLI and readiness

`pnpm exec tsx scripts/banner-studio/engine-service.ts --help` is safe and does
not load manifests, read a token, or contact a service. With enablement absent,
the CLI emits `{"status":"disabled"}` and exits 0 without storage access.

After host qualification, the invocation shape is:

```text
pnpm exec tsx scripts/banner-studio/engine-service.ts \
  --root /operator/qualified/private/engine \
  --root-device RECORDED_DEVICE --root-inode RECORDED_INODE \
  --origin https://approved-application-origin \
  --manifest /operator/verified/runtime.json
```

These are documentation placeholders, not an installed target. The matching
service token belongs in the private service environment, never argv. Keep it
within the application's shared 32–512 printable-character range. Existing TLS
origin/redirect restrictions apply; `--allow-loopback-http` exists only for owned
local proofs. The CLI passes fixed root children to the transport, so capability
selection cannot allocate independent native slots.

`--status --root ... --root-device ... --root-inode ...` performs only local
read-only admission inspection. It emits `available`, `held`, or `unavailable`,
always with `ready:false`. It does not claim work, load adapters, parse arbitrary
journal contents into output, or validate credentials, Docker, native image,
executable/proof pins, authority availability, disk reserve or host readiness.
Enablement and an available gate must never be reported as hosted readiness.

Exit 0 means disabled or confirmed stopped; status-only exit 0 means admission
available, still `ready:false`. Exit 2 means held and requires reconciliation.
Exit 64 means invalid CLI configuration or unavailable storage. The executable
exits explicitly on 2 so noncooperative local handles cannot turn a watchdog
hold into a hanging supervisor. That process exit does not prove a native
container stopped; the durable gate remains the execution fence. Configure a
service manager to stop/review exit 2/64; do not wrap this in an ignoring retry loop.

## Operator reconciliation boundary

There is deliberately no force-unlock or reconciliation mutation command.
For any hold, stop automatic startup and retain admission, staging, attempts,
private objects and authority state. Establish all of the following separately:

1. Exact supervisor identity and positive exit evidence, not a missing PID alone.
2. Exact owned container inventory and confirmed termination/cleanup, without
   touching unrelated workloads. The existing runtime still lacks the durable
   attempt-to-container correlation identified in the hosted readiness report.
3. Authority-side claim/terminal state, including unknown identity after a lost
   claim response; existing ephemeral claim tokens cannot recover this inventory.
4. Storage/mount identity, receipt integrity and private object ownership.

Only a separately reviewed, audited operator action after those facts are proven
may archive a held gate to admit **new** work. Preserve attempt tombstones and
immutable uncertain authority outcomes; gate reconciliation does not authorize
rerunning an attempt. This implementation never makes that decision on behalf
of the operator, and cannot positively reconcile these missing host facts.

## Local verification

Initial behavioral RED: 17 service tests failed against a non-implementing
service stub. The explicit CLI's help/disabled process tests then failed before
that executable existed. The adapter-initialization test also demonstrated a
failure before initialization was moved behind admission. Final GREEN:
**194 tests across eight files**, including **32 service tests across two files**.

Service tests use real temporary private directories and the real one-shot
transport/runner with a controlled HTTP authority and controlled adapters.
Coverage includes both engines completing sequentially (peak active adapter 1),
concurrent service admission, idle delays/cap, missing/mismatched/symlink/private
storage, configuration holds, corrupt/empty/stopped-gate restart holds, lost claim
acknowledgement, journal write failure, active cancellation, late settlement
following watchdog expiry and preservation of attempts/content-free state.
Independent Node child processes prove competition, SIGKILL followed by blocked
restart, and actual SIGTERM with confirmed versus unconfirmed cleanup. CLI
process tests cover help, default-off, read-only status and held invalid config.

```sh
pnpm exec vitest run test/banner/engineService.test.ts test/banner/engineServiceProcess.test.ts test/banner/engineTransport.test.ts test/banner/engineRunner.test.ts test/banner/engineTermination.test.ts test/banner/engineContract.test.ts test/banner/engineJobsContract.test.ts test/server/utils/bannerEngineResult.test.ts
pnpm exec eslint workers/banner-engine/service scripts/banner-studio/engine-service.ts test/banner/engineService*.test.ts
pnpm exec tsc --noEmit --strict --skipLibCheck --allowJs --module esnext --moduleResolution bundler --target es2022 workers/banner-engine/service/index.ts scripts/banner-studio/engine-service.ts test/banner/engineService*.test.ts
```

Scoped lint and strict TypeScript checks pass. The existing Vite `__dirname`
configuration warning remains. Review covered every new source/test file,
configuration-before-claim ordering, crash boundaries, signal cleanup, late
promise settlement, secret-free diagnostics and ownership. No full repository
suite or production build was run under the coordinator's scoped local contract.

These tests do not exercise Docker/native Craft binaries, actual power loss or
mount persistence, hosted Pages/Neon/R2, provider acceptance or artwork fidelity.
The separate accepted native proof is not rerun or expanded by this work. Host
selection, immutable runtime packaging/qualification, transactional application
admission budgets, durable container correlation, privileged reconciliation,
retention and live release acceptance remain outstanding before activation.

Source observation: shared branch `adme-dev/banner-editable-artwork`, HEAD
`47ec30c3522f6ab660d730776709770c8a22d7c8`; observed local `origin/main`
`d45326265f0dec387bd6ae3deb465b616a8f2b68`, one ahead/four behind at task entry.
This lane did not fetch, switch, merge, commit or edit the coordinator's isolated
release candidate. Current-main reconciliation remains coordinator-owned. No
live host change, purchase, deployment, real secret read, database migration or
full build occurred.
