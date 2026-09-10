# Website setup workflow verification — 10 September 2026

## Setup workflow live; launch fact review correction — 11 September 2026

This section supersedes earlier release and Docker-pending statuses below.
PR 524 merged as `b2659103b85d9821ac52ce12cbb2251573d2fb43`; CI run
`34473220609` passed on source `e79f6cd870fff709fc3d7fc223a28d4e6f72b055`.
Guarded production deployment `3c3ff5d4-1d76-4190-a360-3fbe6fb3268b` on
`agency-dashboard` succeeded at `2026-09-10T15:39:39.566151Z` and was independently
read back. The signed-in Fantasy Limo management page displays Website setup.
An initial failed build resolved Nuxt imports through shared worktree dependencies;
a local frozen-lockfile install corrected this, and the full release then passed.

The real brief foundation was saved through the signed-in management form as
proposal `e6f832eb-5430-49b0-9a07-3fb05efbe985`, revision 1, status `proposed`,
for site `c34f6347-cc63-4ed7-9a5a-da165ebefed2`. Independent database readback
confirmed the 1,421-character brief and no reviewer. It explicitly retains the
full later brief and unconfirmed client facts. No approval, provisioning job,
public release, domain, charge or client notification was created.

Saving it exposed a production planner bug: mentioning phone, email, availability
and rates as *unconfirmed* cleared every launch confirmation topic. The focused
correction removes keyword-based fact confirmation and retains module-relevant
review topics regardless of free text. Two regression cases failed before the fix;
93 related tests and changed-file lint pass afterward. Structured fact approval
remains open; this correction does not implement it. Revision 1 is preserved;
a normal revision must be saved after the correction is deployed. At this entry,
the correction is local and not yet published.

Docker recovered through supported force-stop/start after ordinary restart failed;
engine 29.2.0 responds. No reset or prune was performed. Full private staging
container deployment succeeded: sandbox Worker version
`3304649d-bd1b-4bd5-914d-73e043a8e486`, image digest
`sha256:4f4d41901efbcd932dbe070480d267b9422697238ed7cb0c8259a2b3bf634ff4`.
Independent container API readback confirms that image. This is rollout evidence,
not a successful editor/container runtime acceptance test. Generation-2 producer,
production coordinator binding, retained-job acceptance and actual Fantasy Limo
site content remain unfinished. Approved contact details, recipient, fleet/photos,
rates, operating rules and domain/mail ownership still require client facts.

Evidence: `/private/tmp/page-studio-setup-production-readback.json`,
`/private/tmp/page-studio-setup-production-browser.json`,
`/private/tmp/page-studio-generation2-container-readback.json`, and Dashboard
`docs/reports/page-studio-setup-workflow-verification-2026-09-10.md`.

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
