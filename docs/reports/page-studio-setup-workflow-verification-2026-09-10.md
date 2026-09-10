# Website setup workflow verification — 10 September 2026

## Production prerequisites published; setup workflow under verification — 10 September 2026

This section supersedes the earlier prerequisite build/deployment status below.
Production deployment `4b8f5ec0-a50a-4640-9de1-eeb3193c9b48` on `agency-dashboard`
succeeded at `2026-09-10T10:55:14.520553Z`, source
`32a97c3fae57731849729275fc3c19dd871845e0`. PR 523 is merged into
`release/send-scan-foundation` as `3ea86929eafdb7efa1e243552cc8d31d57798c97`.
The source worktree was clean; the deployment script reports `commit_dirty:true`.
Do not interpret that metadata as a byte-for-byte source attestation.

A temporary Cloudflare remote Worker verified both normal and fresh Hyperdrive
bindings against the expected production database and Fantasy Limo tenant/client/site,
using fixed SELECTs inside read-only transactions. Both succeeded; the probe was
stopped. Independent configuration inspection establishes that the fresh binding
has caching disabled. The connection probe does not test cache invalidation.
Signed-in production browser inspection still shows Fantasy Limo as a draft with
no release or domain. This deployment supplies permissions and authoritative reads;
it does not complete the client website.

The next integration is isolated in Dashboard worktree
`.worktrees/page-studio-production-setup`, branch `release/page-studio-setup-workflow`.
It includes setup proposal creation/revision, current-revision approval, staff-owned
provisioning dispatch and private authority, with an explicit server-owned staging
or production environment. Missing environment/binding disables provisioning.
No production coordinator binding or generation-version-2 producer is activated.
Migration 415 was applied idempotently to the verified production database; no
customer proposal, job or content row was created by the migration.

Verification so far:

- Real PostgreSQL authority/approval checks: 39 passed, including a reproduced
  stale-approval bug and its regression fix. Concurrent revision/approval permits
  one winner and returns 409 to the conflicting request.
- Full suite: 6,917 passed, 39 existing failures, 26 skipped, 3 existing unhandled
  errors. Exact failing labels add none against the prerequisite release.
- Final typecheck: the same 798 diagnostics, none added. Functional/new-file lint
  passes; all marketing diagnostics match the unchanged file baselines.
- Final environment/dispatch/authority subset: 55 passed after the explicit type fix.
- Real Nuxt UI component in local synthetic browser fixtures: 320px and 1024px
  document widths match their viewports; the management scroll pane moves by
  1074px and 210px respectively. Approval and setup dialogs fit, successful
  confirmations close their overlays, and disconnected setup is disabled.
  This is component/scroll-container evidence, not a production end-to-end test.

Next: finish release review, CI and guarded deployment of this integration; connect
scoped Cloudflare provisioning and verify generation-2 container/producer replay,
then create the actual Fantasy Limo content, Studio session and booking acceptance.
Docker restart permission and approved client phone, booking email, fleet/assets,
rates and operating rules remain pending. Do not fabricate them or activate public
booking/payment/email flows on assumptions. The current brief planner is keyword
based; inferred missing facts are prompts for review, not validation of client facts.
A complete self-service AI conversation and structured fact approval remain open.

Evidence: Dashboard `docs/reports/page-studio-setup-workflow-verification-2026-09-10.md`.

## Local evidence files

- `/private/tmp/page-studio-prerequisites-production-readback.json`
- `/private/tmp/page-studio-hyperdrive-probe-result.json`
- `/private/tmp/page-studio-prerequisites-browser-snapshot.json`
- `/private/tmp/page-studio-setup-production-migration.json`
- `/private/tmp/page-studio-setup-approval-red-postgres.log`
- `/private/tmp/page-studio-setup-approval-green-postgres.log`
- `/private/tmp/page-studio-production-setup-full-tests.log`
- `/private/tmp/page-studio-production-setup-final-typecheck.log`
- `/private/tmp/page-studio-production-setup-lint.json`
- `/private/tmp/page-studio-setup-final-environment-tests.log`
- `/private/tmp/production-setup-browser-result.json`
- `/private/tmp/production-setup-unavailable-browser.json`

Browser screenshot capture returned no image; no screenshot evidence is claimed.
Database fixture schema readback was empty after tests. The local test cluster and
browser fixture are owned verification processes and are stopped after checking.

## Review scope

Server routes derive tenant, client, site and actor from authenticated context and
saved records. Strict bodies reject supplied identity. Approval shares the creator's
site lock and checks the latest revision. Transactions contain only database effects;
they do not rely on the existing retrying transactionWithoutRetry alias. Provisioning
rechecks persisted permissions, entitlement and accepted plan through uncached reads.
RPC results must match the retained identity and context. The executor still needs
its own authority recheck and lease fencing immediately before each external effect.

The Dashboard component remains a management surface; visual authoring stays in
the canonical standalone Studio repository. The parent keys setup state by site ID.
Public feature descriptions distinguish plan approval from website publication.
No dependency or lockfile changed. New CI uses disposable local PostgreSQL 14 and
runs the database tests explicitly; its password is a disposable CI fixture only.
