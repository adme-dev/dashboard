# Independent service and AMD64 review

27 October 2026. Review completed under Node **v24.18.0**, against the shared dirty checkout at HEAD `47ec30c3522f6ab660d730776709770c8a22d7c8`. No actionable severity findings were identified within the stated local service and qualification scope. This verdict does **not** authorize hosted engine activation or qualify Cloudflare execution.

The reviewer read these files end-to-end: `workers/banner-engine/service/admission.ts`, `workers/banner-engine/service/index.ts`, `scripts/banner-studio/engine-service.ts`, all three `scripts/banner-studio/prove-engine-amd64*.mjs` scripts, `workers/banner-engine/runtime/amd64/{Dockerfile,pins.mjs}`, both `test/banner/engineService*.test.ts` files, and `test/banner/engineAmd64.test.ts`. Both [ENGINE-SERVICE.md](ENGINE-SERVICE.md) and [CLOUDFLARE-ENGINE-QUALIFICATION.md](CLOUDFLARE-ENGINE-QUALIFICATION.md) were read in full. The unchanged one-shot transport, HTTP transport, and Linux container runner were also read to trace the service's settlement and isolation assumptions.

## Executed verification

```sh
node --version
pnpm exec vitest run test/banner/engineService.test.ts test/banner/engineServiceProcess.test.ts test/banner/engineAmd64.test.ts
```

Result: **39 tests passed across three files**, in 3.21 seconds. Expected Python assertion tracebacks corresponded to the four successful negative extraction tests; they were not suite failures. The existing Vite `__dirname` configuration advisory was present.

The service tests exercised actual private temporary directories and the real one-shot transport/runner with synthetic authority and adapters. Independent child processes established competing-process exclusion, a retained active gate after SIGKILL, blocked restart without another claim, and actual SIGTERM with confirmed versus unconfirmed cleanup. Other exercised cases included lost claim acknowledgement, invalid configuration, private storage and inode checks, corrupt/empty/stopped gates, journal write failure, late settlement after shutdown watchdog expiry, bounded idle backoff, and sequential execution across both engines with peak active adapter count one.

An additional inline Node/tsx check exercised the **cycle watchdog without an external shutdown signal**, independently of the existing shutdown-watchdog test. It used a real temporary private root, the real service/transport, a valid synthetic request, a controlled noncooperative adapter, `cycleBudgetMs: 1000`, `shutdownGraceMs: 1000`, and `abortGraceMs: 10000`. Assertions checked the held outcome, elapsed time below five seconds, exactly one claim, blocked restart, subsequent adapter settlement and terminal acknowledgement, unchanged held journal, and another blocked restart. Result:

```json
{"test":"cycle-watchdog-without-external-shutdown","node":"v24.18.0","elapsedMs":2127,"outcome":{"status":"held","reason":"cycle-unconfirmed"},"claims":1,"lateSettlementRetainsGate":true,"restartsBlockedBeforeAndAfterSettlement":true}
```

This check used no native executable, Docker operation or real authority. Its temporary directory was removed after the late settlement completed. It was run inline to preserve source/test ownership.

## Admission and extraction conclusions

`service/admission.ts` creates the exclusive gate, syncs its parent, and persists the initial private journal before initialization can claim work. `service/index.ts:128` persists active state before invoking the worker. Existing admission is never interpreted as recoverable from PID, age or journal phase. The cycle race at `service/index.ts:137–170` retains the gate on expiry; late worker resolution has no path to release it. Clean release follows settlement and archives the admission directory, preserving attempts. These conclusions are supported by the process and supplemental watchdog results above.

The extraction tests verified exact published-checksum selection, rejection of missing/mismatched/duplicate checksum entries, CLI/notices-only extraction, exclusion of desktop binaries, and exact rejection reasons for selected traversal, links, duplicate members and byte-budget violations. These malformed fixtures were rejected before CLI extraction. The preparer's first archive pass validates selected members before writing; the download path pins both compressed size and SHA-256, and the build rechecks retained archive, executable, notice, font and Dockerfile hashes. This review did not perform a download or rebuild.

## Independently checked retained native evidence

Evidence directory: `output/editable-artwork-engine-amd64/proof-2026-10-27T07-57-06.250Z/`.

| Record | Independently calculated SHA-256 |
| --- | --- |
| `qualification.json` | `93ff068d8a96561e6e7b0c1c2e20116577e423def49a1439997fc207dcbecb84` |
| `receipts.json` | `2d901ce9ae69510a19de1ec755e62635ef036425f7f8a0c6b41feab037ef671f` |
| PhotoCraft PNG | `6b6672f7cc41fc9003d739eea84d77d5c4927999984ee4b95886fb7ba4845d07` |
| VectorCraft PNG | `2d1a974952c83eb1e5ec04b030c54a4c36ff6308b8e70e5a6bd3d5baf1d9912b` |

The inline read-only audit recomputed the latest-pointer qualification hash, build-to-preparation hash, **all seven qualification source hashes**, both original fixture hashes, both retained archive hashes and published checksum selections, **all 31 selected extracted file hashes**, font and font-licence hashes, and every recorded output hash. All matched. Both PNGs were decoded independently; their decoded RGBA hashes matched the qualification record and their respective repeat renders.

All **12 retained receipts** assert cleanup, including the two wrong-pin rejection receipts. The ten successful execution receipts passed independent assertions for UID/GID 65532, no network, read-only root, dropped capabilities, no-new-privileges, a single read-only mount, 2 CPU, 2 GiB memory and equal swap limit, 32-process limit, and bounded noexec/nosuid/nodev tmpfs. The receipts contain native logs and executable hashes; they are materially stronger evidence than a command-line flag list alone. This was an audit of retained evidence, not a fresh native execution or present-time container inventory check.

The retained image is `sha256:390a78bbbf9a49c84f09dcdc200709e8fce56d3e15d6bdd5dd09a256a6653dca`. The recorded daemon architecture is `aarch64`, execution classification is `emulated-linux-amd64`, and `hostedAcceptance` is explicitly `false`. The regression tests also establish that an x86-64 local daemon cannot imply hosted acceptance. Neither qualification records nor the two reviewed documents imply that local emulation qualifies Cloudflare.

## Reviewed service/test identity

These additional hashes identify source not included in the retained native qualification's seven-file source set:

| File | SHA-256 |
| --- | --- |
| `workers/banner-engine/service/admission.ts` | `cc4a5282bf7671c78a17d2a735ed42be7a0be31d0669df9bbd9b14b70aae31f4` |
| `workers/banner-engine/service/index.ts` | `3ffc3dd86185fa72860ba6451ddd0bb5af53cf938590f2be34a1f14272993709` |
| `scripts/banner-studio/engine-service.ts` | `378f1fe5c5ff4020a47b95d50f0464e4699522cec562f29fef885c507ffeef4f` |
| `test/banner/engineService.test.ts` | `48bf47c0ac25bec8df960f8a818054cda5458e653795545ae7479bf9d2f579d1` |
| `test/banner/engineServiceProcess.test.ts` | `034c016fc110aced25dbb53f64f7d3acfaff122494c7e97c833cdb017d42c034` |
| `test/banner/engineAmd64.test.ts` | `792e78961649c0c1011a4c5b0baad509f587541b67a6bead9cc90a13a7b43c9e` |

## Limits and remaining ownership

The filesystem gate is cooperative admission on one operator-qualified persistent root. It does not prove power-loss durability, protect against another launcher/root, or recover uncertain authority/container identity. The documented Cloudflare design requires a separate durable remote consumption/generation boundary; ephemeral container scratch cannot satisfy this service's persistent-root contract. Existing accepted runtime loading still pins ARM64, so these AMD64 qualification files alone do not register a production capability.

No hosted native isolation/resource enforcement, Cloudflare restart fencing, Pages/Neon/private-R2 round trip, production capability registration, customer artwork fidelity, or editor deployment was independently verified here. Those remain coordinator-owned acceptance work described in the reviewed documents, not newly discovered defects in this local slice. Official platform documentation was not refreshed during this code/evidence review; no current Cloudflare platform claim is inferred from those documents.

Only this review document was added. No existing source, cloud configuration, release candidate or retained evidence was changed; no credential access, migration, commit, deployment, native download, full proof, image build or dashboard build was performed. The shared checkout remained on its existing branch. The local `origin/main` reference observed at final inspection was `16355e941b4c46a1b6aae2386cb6077a636183a8`; the reviewer did not fetch, reconcile or certify the coordinator's release candidate.
