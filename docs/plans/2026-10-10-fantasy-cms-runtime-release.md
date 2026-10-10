# Fantasy Limo CMS runtime and activation receipt

10 October 2026. The owner approved a production runtime opt-in for Fantasy
Limo's original agency-managed scope. That bounded rollout is installed and its
guarded CMS activation is complete. This is not a full native customer launch.

## Source and verification

- Native repository: `adme-dev/xeroflow-page-studio`.
- Fresh base: `c333ca7699476d1eb83823047874b4824d864b89`.
- Reviewed candidate: `2c9791287311dbc0dca56de20ec4c930a6ba64e0`.
- [PR 122](https://github.com/adme-dev/xeroflow-page-studio/pull/122) merged at
  11:05:54 UTC as `4401438d6766baef4adde0c76741ebc30ab1781c`.
- Release worktree was clean, detached at that merge, and equal to fresh main.
- Local build, typecheck, full tests, formatting and dependency audits passed;
  independent source/migration review and 36 exact-artifact RPC checks passed.
- [Final CI](https://github.com/adme-dev/xeroflow-page-studio/actions/runs/38044971266)
  passed Linux (32m48s), Windows (37m20s), policy and secret checks.

CI first exposed an existing five-second PowerShell process-inspection timeout.
One failed-job-only retry repeated it. A reviewed test-only inspection budget
fixed that case without changing the production initialization deadline or real
process discovery/termination assertions. The next Windows run exposed nine
five-second timeouts in an unchanged workspace suite. Its 94 isolated cases
passed locally in 2.26 seconds. Sandbox Vitest lacked the existing CMS suite's
CI/Windows worker bound; matching that policy retained all assertion deadlines,
in-test race checks and production behavior. The bounded local sandbox run
passed 72 files/941 cases, and final Windows CI passed. Runner contention was the
supported inference; the precise CPU/crypto bottleneck was not proven.

Three source pushes and one failed-job-only retry were used. Normal automatic
policy/secret checks also ran. No manual compiler publication or local container
rebuild was performed. Completed feature branches are retired locally/remotely.

## Artifact and private services

Approved runtime: `6cb34fd939e71028567270190fb6d02c59011b2cdc1c4b0497effb3f702367f5`,
911,081 bytes, compatibility date `2026-08-18`. Its immutable R2 object was
uploaded and downloaded; readback matched the exact reviewed digest and size.
Previous `2dd87c86b6d909889e4fa2dc60dbca45b660144d5169d054e8a1fcd8b737ce83`
bytes and prior service settings/versions are retained privately.

| Existing private target | Version | Deployment |
|---|---|---|
| `xeroflow-provisioning-executor-production` | `cd0aa33b-bc2e-4822-a4ba-3fa80fac3972` | `111cf7ba-ae5d-48ca-8f15-43a40e7d9818` |
| `xeroflow-provisioning-production` | `23ef0df2-424c-4e26-815b-683a0e04e166` | `7044e59f-3f2b-46aa-a999-3e9de8c3ca8f` |
| `xeroflow-content-router-production` | `47da7327-e2f7-49de-b3d7-c2c185ee171c` | `c0839552-fac7-4bb8-a3fd-38fc4e28e5d7` |

Provider annotations identify the merged source above. Readback confirms original
bindings, secret names, compatibility dates and default runtime pins. The only
new variable is the executor's strict one-scope legacy CMS configuration. All
targets remain private. The editor image/container and public website were not
deployed by this increment.

## Storage and activation

Existing platform migrations 9–13 were applied sequentially with migration
tracking through the working authenticated Cloudflare D1 API. Wrangler D1 had
returned provider7403 despite reporting D1 write scopes; no credential was
created or privilege expanded to work around it.

Post-migration readback preserves original database/worker/route rows. Effective
worker identities match routed originals; an existing unrouted acceptance worker
is retained but excluded by the routing view. New operation/capability tables were
empty before guarded setup. Local SQLite compatibility tests also covered active
and disabled routes.

The original authenticated agency setup was resumed. The reviewed runtime
generation uses the original customer database; original resource rows remain
retained. Installed operations:

- Collections: `30438b60-eace-4da4-9a0c-fe8ab4ef07a6`.
- Content tools: `d275f7f1-d641-4bc9-9fa3-18c1c23b257f`.
- CMS storage: `0719c361-7686-424f-a5a7-d487cf7436a9`.

Guarded activation started once, froze the saved checkpoint, acknowledged one
business-content item, then completed. The agency page shows **Ready** and all
five preparation steps checked. Fresh read-only status was used before advancing
and uncertain setup writes were not replayed.

## Hosted acceptance and limits

The [Fantasy Limo dashboard](https://xeroflowpages.com/studio/sites/c34f6347-cc63-4ed7-9a5a-da165ebefed2)
retains 75 saved pages, 109 media assets and eight form placements after reload.
It remains in light mode. A fresh **Open Page Studio** handoff from the existing
invited sign-in loads the same 75-page saved site, waiting for changes.

Business/custom collection reads succeed. The existing `pgiurin@gmail.com` account
still has its original editor permissions; its preparation panel shows an admin
permission warning even after agency setup is complete. That is a remaining
presentation issue, not evidence of an uninstalled runtime. No account, role or
membership was elevated.

Indefinite active/no-expiry access from the earlier audited entitlement change is
preserved. Production Form-drafts operation/runtime/capability tables remain
empty. Native customer production admission, full Forms activation, hosted custom
record save/field-picker acceptance and AI/email delivery remain separate gates.
No content edit, model call, email send or publication was performed here. The
existing public preview remains separate from publishing a customer domain.

An executor rollback can restore retained service versions/settings. It does not
reverse a completed CMS data/runtime transition by itself; preserve compatible
routing and adoption evidence before any rollback. No destructive rollback test
was attempted.

## Evidence and local handoff

Private native receipts are in
`/private/tmp/page-studio-native-integration-20261008/.verification/fantasy-cms-runtime-20261010/`:
artifact approval, service baselines/release receipt, ordered platform migration
receipt, hosted preparation receipt, exact scope configuration and verification
logs. Private account scopes remain there rather than in public examples.

Browser proof in the owned Dashboard worktree:

- `.verification/resume-20261008/fantasy-cms-ready-20261010.png`.
- `.verification/resume-20261008/fantasy-hosted-overview-after-cms-20261010.png`.
- `.verification/resume-20261008/fantasy-editor-after-cms-20261010.png`.

Both selected local worktrees/servers and their existing data are preserved.
The native worktree is detached at merged main. Dashboard product source and its
production deployment were not changed by this increment. This documentation is
retained locally without an additional Actions-triggering documentation push.
