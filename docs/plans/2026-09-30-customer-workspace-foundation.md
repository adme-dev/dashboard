# Customer workspace foundation implementation plan

Goal: persist customer workspace ownership independently of agency staff and verify scoped access before standalone signup is connected.

Spec: [canonical PRD, sections 2.1, 3.1 and RND-17](https://github.com/adme-dev/dashboard/blob/docs/component-workspace-rnd-20260930/docs/prd/page-studio-customer-cms-prd.md). The user approved proceeding with this foundation on 30 September 2026.

## Architecture and decisions

Additive control-plane tables retain verified identity references (issuer + stable subject, no credentials), workspaces, explicit memberships, legacy client mappings and separately revocable agency grants. Existing client/site/database IDs and authorization remain unchanged. Customer data stays in existing scoped stores; this slice does not provision or move content.

Only trusted authentication code may create verified identity references. Workspace creation accepts a server-authenticated identity ID and checks its persisted status/verification. It is not an HTTP signup endpoint. Issuer/subject and portal-user links must never be inferred from an email match. New signup will reuse the magic-link mechanism with a customer identity adapter, rather than call agency registration.

An existing portal identity remains tied to its exact client user. Fresh access checks also reject inactive portal users or agency clients. A legacy workspace binding requires that exact client's active admin/manager identity and an existing scoped entitlement; it confers no new site rights. The first migration does not backfill clients or infer owners.

Agency grants are per staff actor and tenant, limited to read/design for this slice; they cannot grant ownership or billing. Billing is deliberately absent from access resolution: current subscriptions/AI credits remain bound to their existing client account. A payer transition is separate future work, not a side effect of workspace creation.

## Review focus

1. Duplicate/concurrent creation and lost acknowledgements: same operation returns one workspace; changed terms conflict.
2. Wrong customer, inactive identity or revoked membership: no scope returned.
3. Legacy mapping ambiguity: never infer a shared/default tenant or map a foreign client.
4. Agency grants: actor + tenant + workspace must match; expired/revoked grants and inactive staff fail; no ownership/billing grant.
5. Partial creation: membership failure rolls back workspace; no production credentials or database are needed for tests.

## Tasks

- [x] Add failing PostgreSQL integration tests in `test/server/utils/pageStudioCustomerWorkspacesPostgres.test.ts` for all five failure classes and two isolated customer fixtures.
- [x] Add migration `442_page_studio_customer_workspaces.sql`. Apply it automatically to a disposable local database via this worktree's ignored `.env`; repeat application to prove idempotence. Tables have unique/FK/check constraints; no legacy data updates.
- [x] Implement `server/utils/pageStudio/customerWorkspaces.ts`: `createCustomerWorkspace`, `resolveCustomerWorkspaceAccess`, `bindLegacyCustomerWorkspace`, `resolveAgencyWorkspaceAccess`. Parameterized queries and transactions; unavailable/denied access fails closed.
- [x] Run integration tests, existing client/site/setup/entitlement tests and focused lint. Read every changed file and obtain a fresh review before commit.
- [x] Document identity/storage mapping, cutover/rollback and exact verification.
- [x] Push a reviewable PR and update canonical RND-17 evidence without calling the broader identity/storage audit complete.

## Completion boundary

This is the persistent ownership/access foundation. No signup page, public creation endpoint, existing-route cutover, provider connection, payment, live database migration or deployment is enabled. New verified identities in tests are fixtures, not an implemented authentication flow. Before routes consume the new model, complete identity adapters and preserve the existing site/environment authorization checks.

## Execution evidence

23 new PostgreSQL cases pass; the six-file regression run passed 79 tests. Migration applied twice to the isolated local database. Independent review replay-isolation finding was reproduced then fixed. The competing-binding test now uses different portal identities so identity locking cannot hide a uniqueness race. Focused lint passes; server typecheck diagnostics match the unchanged baseline. CI includes the dedicated database suite.

Delivery: [draft PR #602](https://github.com/adme-dev/dashboard/pull/602). Canonical PRD evidence updated on its owning documentation branch/PR #601. No merge or deployment.
