# Native canary repair: startup scratch race and release admission

27 October 2026. This repair answers findings 1, 3 (in part) and 4 of
[CLOUD-CANARY-REVIEW.md](CLOUD-CANARY-REVIEW.md) for the package described in
[CLOUD-NATIVE-CANARY.md](CLOUD-NATIVE-CANARY.md). **It is not hosted acceptance.**
No Container, VM or native engine was launched. Nothing was deployed, provisioned
or pushed. The retained outer image is reused unchanged, and admission stays
disabled.

Changed files: `workers/banner-engine/canary/worker.ts`,
`scripts/banner-studio/prepare-engine-cloud-canary.mjs`, the new
`test/banner/engineCloudCanaryExecution.test.ts`, and this report. The packaged
supervisor, policy, pins, Dockerfile, `.artifacts/` (including the context and
receipts), the image, candidate code and every other file are untouched. No Docker
build/run/push/prune happened, and no Wrangler command ran at all (in particular,
no `deploy --dry-run`, which builds the image). Docker use was limited to
`docker image inspect` of the existing image. No secrets were read. No commit was
made.

## 1. Startup race fix: trusted launch contract

**The defect.** `supervisor.mjs:142–149` starts `dockerd-entrypoint.sh` and then
immediately calls `mkdtemp(tmpdir())`. The pinned wrapper
(`DIND_COMMIT=8d9e3502aba39127e4d12196dae16d306f76993d`,
[`hack/dind`](https://raw.githubusercontent.com/moby/moby/8d9e3502aba39127e4d12196dae16d306f76993d/hack/dind),
retrieved and read for this repair) runs this:

```sh
if ! mountpoint -q /tmp; then
	mount -t tmpfs none /tmp
fi
```

If scratch is created first, that mount can hide it.

**The fix, in the Worker only.** `NativeCanary.executeContainer()` now starts the
VM like this:

```ts
container.start({ enableInternet: false, entrypoint: [...LAUNCH_ENTRYPOINT] })
```

`LAUNCH_ENTRYPOINT` is a frozen module constant. It is a fixed literal and takes
no input from callers, env or storage:

```json
["/bin/sh", "-c", "set -eu; mountpoint -q /tmp || mount -t tmpfs none /tmp; mountpoint -q /tmp; export TMPDIR=/tmp; exec node /opt/canary/supervisor.mjs"]
```

What each step does:

1. **Pre-mounts `/tmp` with the wrapper's own command.** The command is the same
   `mount -t tmpfs none /tmp`, so the filesystem the daemon sees is the same one
   the wrapper would have created. Cloudflare's
   [Docker-in-Docker guide](https://developers.cloudflare.com/sandbox/sdk/guides/docker-in-docker/)
   prescribes this exact pre-mount ("Mount /tmp before the sandbox starts.
   Otherwise the docker:dind entrypoint mounts a new /tmp over …"). Later, the
   wrapper's `mountpoint -q /tmp` check succeeds, so it no longer mounts anything.
   No other process runs before this entrypoint, so nothing can race the pre-mount.
2. **Fails closed.** `set -e` together with the separate post-condition
   `mountpoint -q /tmp` means a failed mount, or `/tmp` still not being a
   mountpoint, exits the shell before Node starts. In that case no receiver
   listens. The Worker hits its 45-second readiness deadline and sends no POST.
   The record ends `uncertain` and stays spent, and the VM is destroyed. A test
   covers this path.
3. **Pins scratch to the verified mount.** `TMPDIR=/tmp` is the value Node and Go
   already use when `TMPDIR` is unset, and the image sets no `TMPDIR`. Exporting
   it means a `TMPDIR` injected by the platform cannot move scratch off the
   verified mountpoint. The env is set only inside the shell; the Worker passes
   no `env` start option (see the uncertainties below).
4. **Runs the image's unchanged entrypoint.** `exec` swaps the shell for
   `node /opt/canary/supervisor.mjs`, so Node is PID 1 again, as with the image
   `ENTRYPOINT`. The SIGTERM/SIGINT handlers and the 5-minute self-exit behave as
   before. `process.argv[1]` resolves to the packaged supervisor, so its main
   guard still holds.

**Retained image facts that the contract relies on**, from read-only
`docker image inspect`:

| Field | Value |
| --- | --- |
| Image ID / local manifest | `sha256:12158e33bb5a22ed0ff01b0f9d1cde28e24d44904f3c1819e4ef379fe4f47472` (tag `banner-engine-native-canary:worker`, created `2026-10-27T08:48:52.288094625Z`, linux/amd64, 313,936,196 bytes) |
| `Config.Entrypoint` | `["node","/opt/canary/supervisor.mjs"]`, the argv the launch literal `exec`s |
| `Config.Cmd` | `null`, so overriding the entrypoint drops no image arguments |
| `Config.Env` | includes `DIND_COMMIT=8d9e3502…`, `DOCKER_TLS_CERTDIR=` (empty) and `DOCKER_HOST=unix:///var/run/docker.sock`; no `TMPDIR` |
| `Config.User` / `WorkingDir` | `root` / `/` |

On the first try, an inspect by tag returned "No such image". Inspecting by ID
then worked and listed the tag. That looks like a lookup quirk, not an image
change.

`/bin/sh`, `mountpoint` and `mount` are the same tools the pinned wrapper itself
needs (it is a `#!/bin/sh` script that calls both), so the launch adds no new
image dependency. This repair did not open the image filesystem to confirm they
exist.

**Preserved package identity.** Recomputed: the current files are byte-identical
to `.artifacts/context/`, with the same hashes the review recorded:

| File | SHA-256 |
| --- | --- |
| `supervisor.mjs` | `e83fd08577bdeb20d9d59c1e6699149976d851e374af1e46cc18c48a875533dd` |
| `Dockerfile` | `fd61a1abf97d1751ea56d1ea662ca3487ebc35eacad3f0d9dc3d753ad5bc11bd` |
| `pins.mjs` | `b9a302470dd19b5abec86151260647bd319d5ea1eca26dcaa51f30aef0307830` |
| `policy.mjs` | `e6ffa729025ba4669df5ecb2f25303805d74777ea368306694b1dc4c8f6da3dc` |
| package manifest (`BANNER_NATIVE_CANARY_PACKAGE_SHA256`) | `60d764cfd1fefc45e5437fe87e9cf424b2ddd5318aba53244f5b5cb9a876d339` |

The Worker is not part of the outer image, so the image identity above is
unaffected.

**Source hashes that changed.** Root must re-record these. The retained
`.artifacts/local-validation.json` still has the pre-repair values, and was not
edited.

| File | Before | After |
| --- | --- | --- |
| `worker.ts` | `8a911cce84d02065e145265e1b295d6326a9accad5cf691c21265ddc6f8fc7c7` | `f03b5379f158f02e493db2233a065f837ad664cb2c0c0e7cd5d72f5f66d766c0` |
| `prepare-engine-cloud-canary.mjs` | `9ac86b192c00ac398384c8590fcfde8d4aa2150c984d6a83968b6606f0dc2a7e` | `1ff4f75893da87132578fdc9cf9f7f520d2ba5343a7a4c511da8406cceb91f96` |
| `engineCloudCanaryExecution.test.ts` | (new) | `c85d7905f2a5a8be25fefbb8fba023efe91e54dd75096ce40b6728c85b2523ea` |

## 2. Release admission forced off (finding 4)

`deploymentConfig()` now always writes
`vars.BANNER_NATIVE_CANARY_ENABLED = 'false'`, whatever the template says. It
re-parses its own serialized output and asserts the value is false before the
exclusive (`wx`) write, and it still returns `enabled: false`.

It also takes a new optional `{ directory }` argument, which defaults to
`canaryRoot`. Tests use it to run against a scratch copy, so the real
`.artifacts/` is never written. The CLI behavior and output paths are unchanged.
The existing rules still apply: placeholders, tags and other repositories are
rejected, and no network call is made. Root still enables admission by hand, in
the dedicated config, only for the approved run.

## 3. Tests of the real production path (finding 3)

`test/banner/engineCloudCanaryExecution.test.ts` compiles the **unmodified**
`worker.ts` with esbuild. Only the `cloudflare:workers` base classes are stubbed.
It drives the real `run()`, `executeContainer()`, `destroyContainer()` and
`alarm()` through a fake platform: Durable Object storage, a Container, and its
`getTcpPort(8080).fetch` transport. Nothing native launches.

Earlier, the workerd test replaced both helpers. Now these are asserted:

- **Launch order.** The exact event sequence is `put:consumed → setAlarm → sync →
  start → inactivity:300000 → port:8080 → ready → put:consumed:boot → sync → post →
  destroy → put:finished`. So consumption is durable before launch, and the boot
  is durable before the only POST.
- **Launch contract.** `start()` receives exactly
  `{ enableInternet: false, entrypoint: <the literal above> }`. The literal passes
  `sh -n`, a parse-only check that executes nothing, and the mount comes before
  the post-condition.
- **Delivery.** There is exactly one POST to `/run`, with `content-length: 0`, the
  persisted `x-canary-boot` header and no body. Readiness retries; the POST never
  does. The VM starts only once, and a second `run()` returns the stored record.
- **Deadlines.** The alarm is set to the consumption deadline (300 s). Readiness
  probes use 2 s signals. The POST signal is bounded at most 5 s inside the
  durable deadline. A VM that never becomes ready (for example, the entrypoint's
  mount fails) hits the 45 s readiness deadline under fake timers. Then no boot is
  stored, no POST is sent, it is destroyed, and the record is `uncertain`. If the
  durable deadline passes between consumption and startup, there is no `start()`,
  but the invocation is still spent and destroyed.
- **Receipt validation.** These cases are each `uncertain`, with no receipt, one
  POST, destroyed, and never retried: wrong boot, failed status, unverified
  scratch cleanup, missing cleanup, HTTP 409, a receipt over 128 KiB, and
  transport loss. Bad readiness (wrong boot, wrong package, over 1 KiB) is
  rejected before any boot is stored or POST sent.
- **Destruction.** If destroy leaves `running === true`, a passing run becomes
  `uncertain` (`outerDestroyed: false`, receipt retained). The alarm then marks it
  `stopped` and throws. A later alarm with a working destroy records
  `outerDestroyed: true` and never re-executes. An alarm that stops the record
  during readiness fences delivery: no boot and no POST. An already-running VM is
  never reused. A missing container binding stays spent.
- **Generated config.** A template with admission set to `true` still produces
  `false`. Package hash, image reference, `main`, the stripped build context and
  `$schema`, and `workers_dev`/`preview_urls` false are all checked. The exclusive
  write and the tag-reference rejection are also checked.

**Mutation checks (done, then reverted).** Removing `entrypoint` from `start()`,
or dropping the forced `'false'` and its assertion, made the ordering/contract
test and the config test fail. Removing the storage sync after persisting the boot
made the launch-order test fail. The restored files hash to the values listed
above.

## Verification (Node 24.18.0)

- `pnpm exec vitest run test/banner/engineCloudCanary.test.ts test/banner/engineCloudCanaryWorkerd.test.ts test/banner/engineCloudCanaryExecution.test.ts`:
  **35 passed / 3 files**: 20 new, plus the existing 15. The only output besides
  the results was the existing Vite `__dirname` advisory.
- `pnpm exec tsc -p workers/banner-engine/canary/tsconfig.json`: passed. The
  installed `ContainerStartupOptions` declares `entrypoint?: string[]`.
- `pnpm exec eslint workers/banner-engine/canary/*.mjs workers/banner-engine/canary/*.ts scripts/banner-studio/prepare-engine-cloud-canary.mjs test/banner/engineCloudCanary*.test.ts`:
  passed.

Official docs consulted live: the
[Durable Object Container API](https://developers.cloudflare.com/containers/api/durable-object-container/)
(Markdown). It says `start()` options are optional under the `default` scheduling
policy, `entrypoint` is "Command and arguments to run in the container",
`enableInternet` is required whenever options are passed, and `image`/`instance`
apply only to the `durable_object` policy, so they are not passed here. Also the
Docker-in-Docker guide cited above.

## Remaining hosted uncertainty (not resolved by this repair)

- **Entrypoint override is untested on the hosted runtime.** Nobody has observed
  how the hosted runtime applies `entrypoint` with this image and the `default`
  policy. The docs describe the option; behavior is not proven. The local workerd
  tests still replace the Container helpers, and the new tests use a fake
  platform.
- **The `/tmp` mount needs privileges.** It needs the same privilege the dind
  wrapper already needs for its own mounts. Unconfirmed on hosted runtime; if it
  is refused, the run fails closed and is spent.
- **No `env` option is passed.** The docs do not say whether `start({ env })`
  merges with or replaces the image env. Replacing it would drop
  `DOCKER_TLS_CERTDIR=`, so the repair avoids the option. A platform-injected env
  is only overridden for `TMPDIR`.
- **Tmpfs memory.** `/tmp` tmpfs pages count against outer VM memory, as they
  would have after the wrapper's own mount. Scratch holds only the two small
  fixtures.
- **Still not proven.** Nested daemon startup, cgroup enforcement, native
  rendering, PNG hashes, scheduler punctuality, delayed delivery, VM kill and
  failed-destroy behavior in hosted Cloudflare all remain unproven. Finding 2 (an
  outer-image content attestation, plus the real release bundle/config/deployment
  identity and registry digest) is unchanged and belongs to root.
- **The build budget was missed and that stays on record.** The retained build
  used 1,268,305,705 bytes against the 943,718,400-byte sub-GiB ceiling. Root
  accepts the retained artifacts for further review. This repair neither rebuilt
  nor re-measured anything, and it does not erase or rewrite that breach.

Before consuming the hosted permission, root should correlate the deployed Worker
source hash (`f03b5379…`) with the deployment, publish the exact retained image
and record its registry digest, and generate the release config. The repaired
generator forces admission off in that config. Root then enables admission by
hand only for the single approved run.

Review base: shared dirty checkout `adme-dev/banner-editable-artwork`, HEAD
`47ec30c3522f6ab660d730776709770c8a22d7c8`. No fetch or reconciliation was done.
The Kimi-owned PNG/config files and `CLAUDE-RELEASE-CHECK.md` were not touched.
