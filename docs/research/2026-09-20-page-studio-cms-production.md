# Fantasy Limo CMS — production acceptance, 20 September 2026

## Outcome

Fantasy Limo's CMS is connected in the production client website admin:
[open Business content](https://app.xeroflow.io/agency/page-studio/c34f6347-cc63-4ed7-9a5a-da165ebefed2/content).
The authenticated agency workspace reopens with saved revision 1, zero collections
and editing enabled. No synthetic business records were added. Existing page
content has not been automatically converted into collection entries.

The user authorized production rollout and connection, then explicitly requested
an active goal for autonomous completion. This report supersedes the production
pending statements in the [staging acceptance](./2026-09-19-page-studio-cms-connection.md).

## Preserved customer content

Before/after SHA256 comparisons match exactly for the page document, asset list,
draft history and version history: **75 pages, 109 assets, six drafts and zero
named versions**. The unchanged page document includes **eight form references**.
The current checkpoint remains
`checkpoint_fantasy_import_e9b38b08-bc10-4f83-9adc-dc1b9c66b81a`.
The approved-version pointer remains null and the active release list remains
empty. No public website was published and no enquiry or notification was sent.
Launch-state timestamps and CMS availability can change, so a whole-response
launch-state hash is not used as a preservation claim.

## Production release

All releases used clean isolated checkouts including freshly fetched main.
Dashboard PR575 and Studio PR88 were merged before deployment. Dashboard used
the guarded `pnpm deploy:production` command targeting only `agency-dashboard`.

| Component | Source commit | Deployment / Worker version |
| --- | --- | --- |
| Dashboard production | `4eea0ce71703431b837ffe9f4f9e4e883ab9db60` | `f10d8124-02ce-4e07-a943-45d6bd2a6530` |
| CMS executor | `c648186d1e6b86df48c9fd270a4a6972167cdb45` | `fef05e1b-f53e-454a-ab45-3929ee29f5f4` |
| Provisioning coordinator | `c648186d1e6b86df48c9fd270a4a6972167cdb45` | `97a567f2-140d-419c-9f98-3cc03f75727f` |
| Content router | `c648186d1e6b86df48c9fd270a4a6972167cdb45` | `b4dd85a4-29f1-4b34-aa56-423b87e40284` |
| Editor sandbox Worker | `c648186d1e6b86df48c9fd270a4a6972167cdb45` | `7702dd58-06ac-4526-b8a3-2f240c5181fc` |
| Control gateway, final | `e90513149709e44bff5959cfa65b9eb7e1ac6e4f` | `cca10693-a6f9-441b-956b-77900641545d` |

Native migration 420 was applied only after matching the local database host and
database name to production Hyperdrive and finding the exact Fantasy site. D1
migrations 0005/0006 were applied to the verified production provisioning database
`8b8a10ea-8a40-4112-addb-3bd2fef248a7`; baseline 0001–0004 was already present.
The pre-existing production scheduler remains disabled. Both old failed jobs
remain unclaimed and unchanged. Runtime R2 bytes match configured SHA256
`2dd87c86b6d909889e4fa2dc60dbca45b660144d5169d054e8a1fcd8b737ce83`.

Provider readback verifies unchanged bindings, schedules and container
configuration/image. The sandbox deployment used `--containers-rollout=none`.
The only intentional Worker settings change is the production gateway's
`global_fetch_strictly_public` compatibility flag.

### Production callback repair

The first connection paused before any D1 reservation or customer resource
allocation. A controlled retry of the original request captured gateway HTTP 522
and a hung executor authorization call. PR576 applied the previously validated
staging public-origin routing flag to production. Origin allowlisting, gateway
credentials, header filtering and redirect rejection are unchanged. Only the
gateway was redeployed. The same retained request then completed successfully.

Cloudflare documents this routing distinction in its
[compatibility flag reference](https://developers.cloudflare.com/workers/configuration/compatibility-flags/#global-fetch-strictly-public).

## Connected resource evidence

- Site: `c34f6347-cc63-4ed7-9a5a-da165ebefed2`.
- Original operation: `7330af28-155d-49f0-b268-0f7ed2409490`; lease released.
- Owned D1: `768ffe48-b02d-42d3-b2aa-73c4227209b9`, ready.
- Owned Worker: `ps-content-6d4686f642d24b4a8054d5f175c2fc90`, ready.
- Active route: `4ed988c0-2ee3-49aa-ac81-7284b38c45a7`.
- Fresh authenticated connection GET: 200, connected. Content GET: 200, revision 1,
  zero collections, canEdit true. Full browser reopen displays the same state.

## Verification

- Dashboard: 14,182 tests passed; 544 configured skips. The reviewed implementation
  includes 109 actual disposable PostgreSQL CMS cases. Typecheck retains the exact
  existing 913-diagnostic baseline, with no additions.
- Final Studio suite: **3,416 tests passed**, 32/32 Turbo tasks successful (29
  unchanged tasks cached), including the real D1/R2 attachment runtime tests and
  19 security tests. The first final rerun was blocked by sandbox `listen EPERM`;
  rerunning with local networking allowed passed.
- Production coordinator configuration: 29 focused tests passed and deployment
  rehearsal passed. Final gateway correction: 10 tests, changed-file lint,
  deployment rehearsal and independent review passed.
- Guarded production build passed: raw Worker 25,463,122 / 25,468,928 bytes.
- Dashboard main CI passed at both production application and gateway-fix commits.
  Studio's earlier implementation passed Linux/Windows CI. The final production
  configuration/main CI and secret-scan jobs **did not start because GitHub's
  Actions budget was exhausted** (runs 35438281567 and 35438281556). Local passing
  tests are not reported as a replacement Windows or remote secret-scan run.
- Live: CMS connect/read/reopen, fresh Fantasy editor launch, existing pages and
  redirects visible, overview navigation, and QR Codes with its existing data pass.
  No editor save was made during preservation checks. Synthetic staging already
  proved CMS save/reopen and unsaved-edit warning/cancel/restore.

## Remaining work and branch ownership

CMS-ATTACH-3/4/5 are implemented, and CMS-ATTACH-6 now includes synthetic agency
staging and Fantasy production connection acceptance. Portal/viewer and concurrent
editor browser acceptance remain open. Creating Fantasy's actual business
collections and wiring page components to them requires a separate content/schema
slice using reviewed customer information. This release does not complete the
26 builder delivery tasks, R06 isolation research, or enable generated customer
backend execution. Ordinary production provisioning cron remains disabled.

Integrated release branches are Dashboard `feat/cms-connection`,
`fix/cms-production-callback-routing`, and Studio `feat/cms-connection`.
Only the two isolated CMS release worktrees and those completed branches are
eligible for this cleanup. Older research/stacked worktrees and the dirty root
and mirror remain preserved; do not treat them as current deployment sources.

Sanitized verification evidence is stored in
`.verification/page-studio-builder-rnd-20260917/cms-connection-production-20260920.json`.
Provider snapshots and browser proof files are retained under `/private/tmp/cms-*`.
