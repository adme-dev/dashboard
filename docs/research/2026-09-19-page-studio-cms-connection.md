# CMS connection — staging acceptance, 19 September 2026

## Outcome

The synthetic staging website now has a working CMS connection. An authenticated
agency user added a collection and draft entry, saved revision 2, reopened the page
and read the saved record. Reload warned about an unsaved edit; Keep editing
preserved it, and an explicit Reload saved content restored revision 2. No publish
was requested. The clearly labelled acceptance collection remains on the synthetic
website.

Fantasy Limo (`c34f6347-cc63-4ed7-9a5a-da165ebefed2`) is in the production account,
not the staging portfolio. It has not been reimported or connected by this staging
release. Production target confirmation is pending; the earlier rollout targeted
staging. Do not report Fantasy CMS as connected.

## Reviewed implementation

- [Dashboard PR575](https://github.com/adme-dev/dashboard/pull/575): explicit agency
  and eligible portal Connect CMS/status actions, native intent and completion,
  unchanged editor instance on connection, and staging gateway routing correction.
- [Studio PR88](https://github.com/adme-dev/xeroflow-page-studio/pull/88): ordered
  existing-site attachment, owned D1/Worker setup, empty content revision, prepared
  route proof and native-completion-gated resolution. Includes earlier staged
  session/checkpoint/provisioning authority fixes.
- Setup never calls ordinary empty-head page generation. Original checkpoint,
  imported pages and history stay separate from CMS records.
- Read-only native admission uses a fresh, uncached SQL snapshot; logout committed
  before that snapshot denies admission. A concurrent later logout can race the
  response. Native completion retains ordered locks and post-write expiry checks.
  Provider guards remain before/after effects; authority is never cached.
- The gateway's staging-only `global_fetch_strictly_public` flag fixed a 522 that
  prevented Pages callbacks. Repeated locking queries then exhausted a 300-second
  setup lease; one-query preflight and consolidated local lease reads resolved
  live setup. No lease extension or ownership bypass was introduced.

## Release record

| Component | Exact source | Deployment/version |
| --- | --- | --- |
| Dashboard preview | `b916537580bf82c49c2518d7db023986d823e848` | `f7d9a415-9f30-4eef-824a-9f27275ad168` |
| Staging executor | `62e39127f6222e6231e941ae3cbc7db3eadce336` | `1737b017-caad-4537-b6a5-276e68b21c81` |
| Staging coordinator | `248b9ee60e060dd8f06e70b2a86411df86816a84` | `1b7454eb-6b33-4e4c-af84-6f99e7831191` |
| Staging control gateway | `32277b01f` | `a993910f-135a-45a9-b7ef-c7dc56bbb804` |

Both candidates include freshly fetched main. Dashboard used guarded
`pnpm deploy:preview`; deployment metadata confirms a clean source tree.
D1 migrations 0005/0006 were applied to the staging provisioning database.
Provider readback confirms unchanged production deployment
`8798c363-6e9c-472a-a78f-47d8ce780ef4`, bindings, schedules and sandbox container.
The intentional gateway flag is the only Worker settings change.

Synthetic site: `a27135dc-1374-475c-a56d-7e60310425bb`.
Retained operation: `5ae2cce3-a88d-4158-99c4-aa68384ece97`.
Owned database: `d4436741-bc35-443f-a236-3c929e88c1a4`.
Owned Worker: `ps-content-b93dbb15eb3d4e55b9c286ed02df9116`.
Active route: `65262533-922d-4601-9228-99d62cb119f6`.
The original operation was resumed after failures; no replacement resources were
created. Its lease is released.

## Verification

- Dashboard: **14,182 tests pass**, 544 configured skips. Includes **109 actual
  disposable PostgreSQL CMS intent/authority/completion cases**. Changed-file lint
  passes. Typecheck reproduces exactly **913 existing diagnostics**, with no additions.
- Studio: **3,416 tests pass** (unchanged Turbo tasks use caches), 23/23 build tasks,
  37/37 typecheck tasks plus security typecheck, and lint across 882 files pass.
- Full setup plus route preparation passes real D1/R2 regression with simulated
  500 ms latency for every native check. This is a measured test envelope, not a
  general latency guarantee.
- Guarded preview build: raw Worker **25,463,122 / 25,468,928 bytes**; 5,806 remain.
- Exact implementation heads pass Dashboard CI and Studio Linux/Windows CI, branch
  guard and secret scanning. Deploy jobs are intentionally skipped on draft PRs.
- Browser: connection, save, full reopen, unsaved edit warning/cancel/restore pass.
  Overview navigation renders. QR page renders but data is permission-denied for
  this login; QR data access is not claimed. Portal/viewer and concurrent-content
  conflict browser acceptance remain open; local permission/conflict cases pass.
- Exact SHA256 comparisons preserve the page document, **13 drafts**, **5 versions**,
  current checkpoint and current version pointer. Launch-state response changes
  with CMS availability; no unchanged launch-state fingerprint is claimed.

## Remaining work

CMS-ATTACH-3 ordered integration and CMS-ATTACH-4/5 activation/API/UI are implemented.
CMS-ATTACH-6 has synthetic agency staging acceptance; Fantasy production connection,
portal/viewer browser matrix and concurrent-editor browser acceptance remain open.
This does not close all 26 builder delivery tasks or the partial R06 security work.
Generated customer backend execution remains disabled.

Before a Fantasy release: confirm production target, reconcile current main again,
verify production coordinator configuration/artifacts and native schema, apply only
required additive provisioning migrations, deploy consumers before producers, and
verify Fantasy's 75 pages, 109 assets, 8 forms and history before/after connection.
The staging-only gateway correction must be assessed for the production custom
origin. No production deployment or native customer change has been made here.

Owned unmerged branches/worktrees remain for PR575/88; do not delete them or merge
old stacked branches independently. Root and mirror contain unrelated work and
were not used to build or deploy this release.
