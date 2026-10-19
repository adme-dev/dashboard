# Managed transfer rollout — 20 October 2026

This receipt distinguishes the deployed private backend from the remaining
customer acceptance and Pages release. No customer transfer, publication, DNS
change or Pi activation occurred during this rollout.

## Source and CI

- Dashboard PR #664 merged as `24f555f62b39891ff019efdffe2de03b30d4477e`.
  Its tree is identical to tested head `897e78bbc6d84960a1472170335ec2429c78da4b`.
  [PR CI39239053099](https://github.com/adme-dev/dashboard/actions/runs/39239053099)
  and [main CI39311044524](https://github.com/adme-dev/dashboard/actions/runs/39311044524)
  passed, including the full suite, dedicated PostgreSQL tests and production build.
- Studio PR #129 merged as `0fe8df57cdbae26b81945c8f573af7931ceec8f9`.
  Its tree is identical to tested head `747dffc94851f45ea096a1fb250d2fc759fbec76`.
  [CI39240667812](https://github.com/adme-dev/xeroflow-page-studio/actions/runs/39240667812)
  passed verification and transfer stress on both Linux and Windows. The merge
  commit's [CI39310945578](https://github.com/adme-dev/xeroflow-page-studio/actions/runs/39310945578)
  subsequently passed all four jobs as well.

Both repositories were freshly fetched and matched current main before release.
Existing settings omitted by checked-in executor configs were preserved in
reviewed deployment configs; no raw stale config was substituted.

## Provider readback

All versions below serve 100% of their service traffic. Private Workers retain
disabled workers.dev and preview URLs, unchanged schedules and existing bindings.
Only the reviewed production transfer bindings and policies were added.

| Service | Environment | Version | Deployment |
| --- | --- | --- | --- |
| Provisioning executor | staging | `2461fd8c-708d-43ae-bf35-cacf7ddc7af2` | `4c60541f-9ad5-462d-82e7-ca9edc513300` |
| Provisioning coordinator | staging | `d451cef5-8aab-4f43-9673-d8c0644e71d0` | `0032397e-c24a-4126-8982-bfff35de1b60` |
| Content router | staging | `f4d484a1-5bdf-4dd5-994c-969721f18690` | `52bf69b3-5ec1-4656-bba0-7b78dfdf29dd` |
| Provisioning executor | production | `b624b1b7-e05e-47b6-957b-f70fe14df139` | `a050a0ea-054d-4d7b-b9c9-0d0c2bada65c` |
| Provisioning coordinator | production | `ed28581b-0e5a-408c-8bcc-2c04598b7092` | `b84ab807-1836-4b07-af10-6118a07b2243` |
| Content router | production | `3b33d4d0-31a0-48b0-a053-75c9292221aa` | `f7bc7f99-da0f-45c0-97fa-41adadfec5c1` |
| Dashboard management | production | `397e2f49-1ccd-4230-9c17-2fc1dcc126c6` | `17434d5f-8071-4ad8-9a7f-730da8fde40c` |

The management deployment used its guarded production command and passed a
fresh exact-main check. Its existing nine bindings, including the API-token
secret name, were preserved. Eleven reviewed bindings/variables were added.
No secret values were read or retained in these receipts.

## Storage and runtime

Staging and production registries now have migrations 0001–0018. The production
operation applied only 0014–0018. Before/after fingerprints prove preservation
of each original table, row and schema definition, effective Worker ownership
and route-state counts. All six new tables are empty. Original row counts:
104 across 13 staging tables and 13 across 13 production tables.

Runtime SHA256 `40aa0efe85f87918c569b8388a3403af51ee8c33d741c56eeb956a702ab7105d`
is 1,101,341 bytes, compatibility date 2026-08-18. The production private key
`content-runtime/<digest>/worker.js` was absent before upload. Independent remote
readback matches its full digest and byte count. Old objects and tenant pins were
not changed. The private publication review does not approve customer activation.

## Browser verification and remaining release

The signed-in legacy customer dashboard lists all four sites. Fantasea management
still shows 5 pages, 15 assets and its existing saved preview. A normal Chrome button
click opens the editor and renders the saved Fantasea design and Pages controls.
The automation-only click was rejected by the browser's popup restriction; the
native click succeeded. No content was edited during this check.

The guarded ordinary Pages release was dispatched on exact main as
[CI39318355504](https://github.com/adme-dev/dashboard/actions/runs/39318355504).
Both attempts passed production build and database stages, then failed the same
Miniflare service-proxy request with `write ECONNRESET` at destination-authoring
runtime test line 39. Each attempt passed the other 16,578 tests. The original test
passes locally; a single failed-job-only rerun reproduced the CI failure. Neither
attempt reached Pages upload.

The test now exercises the management Worker's HTTP ingress with
`Miniflare.dispatchFetch`, preserving the POST method, complete request payload
and required 404. It also checks the response body, unchanged RPC count and zero
outbound calls. RPC authorization checks still use the actual service binding.
This follows the existing runtime-test pattern and avoids using Miniflare's
service-binding proxy to test HTTP ingress. Two focused runtime files (five tests)
and scoped lint pass locally. The Linux CI result is required before calling the
transport failure resolved; its precise socket-level cause is not proven locally.
Release completion, provider source/deployment readback and post-release checks
remain required. Signed-in agency QR navigation and all four customer previews
render before the Pages release. The preceding Pages
production deployment is `630ec0a3-4db8-4b4c-98a8-bcd635314be1`.

Production Pi remains version `e70edf12-e793-47dd-926d-a7d419ca8c92`, deployment
`55bbb328-8f3b-42a2-b087-521e39eae5dd`, with admission disabled and no canary sites.
Next: authenticated operator consent handoff, explicit owned synthetic transfer,
hosted limits/recovery/final-selection/retained-live verification, second real
customer-account acceptance, then scoped Pi activation. Existing legacy-account
browser access does not complete that native two-account matrix.

## Evidence and rollback

Studio private receipts are under the owned worktree's
`.superpowers/sdd/2026-10-15-managed-production-transfer/release-preflight/`:
staging/production deployment receipts, schema snapshots, immutable runtime
publication receipt and deployment logs. Dashboard receipts are under
`.verification/release-20261020/`, including management before/after settings,
Pages baseline and Pi readback. Keep these with the archived preflight manifest.

Rollback uses the recorded prior service versions and compatible code. Preserve
all additive tables, immutable preparations and native transfer history; do not
delete receipts or rewrite pending admissions. Never restore an old runtime object
over another digest or globally repin tenants as part of rollback.
