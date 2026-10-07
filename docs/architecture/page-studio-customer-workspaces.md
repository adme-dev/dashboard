# Customer workspace ownership foundation

Status: internal foundation implemented; standalone signup and existing-route cutover are not enabled. Source baseline: Dashboard `a98b83a53c65fbb80da48e8a2348610d2c9d24bb`. Product requirements remain in the [canonical PRD](https://github.com/adme-dev/dashboard/blob/docs/component-workspace-rnd-20260930/docs/prd/page-studio-customer-cms-prd.md), especially RND-01 and RND-17.

## Identity and ownership mapping

| Authority | Existing source | Foundation / required adapter |
| --- | --- | --- |
| Agency staff | `team_members`, agency session and `requireAgencyPageStudioAccess` | No customer account created here. Agency assistance requires an explicit workspace/tenant/staff grant, intersected with existing RBAC. |
| Invited customer | `client_users`, `client_sessions`, `requireClientAuth` | An identity reference uses issuer `portal`, exact user ID as subject, and a foreign-key user reference. Fresh checks require active user and client. No matching/merging by email. |
| Standalone customer | No public owner signup exists | Issuer `studio` stores the stable verified identity subject. It contains no passwords or session secrets. Trusted signup/authentication must create this reference only after verification; fixture insertion is not an authentication implementation. |
| Workspace ownership | Previously implicit in agency client/site relationships | `page_studio_customer_workspaces` plus explicit memberships. Creation and initial owner membership are one transaction. An identity can belong to several workspaces. |
| Legacy client ownership | `agency_clients` | `page_studio_workspace_client_bindings` maps one existing client to one workspace and retains its exact tenant ID. No default/shared client is synthesized. |
| Site rights | `page_studio_sites`, `page_studio_site_memberships`, entitlements | Unchanged. Workspace membership alone does not authorize existing site, content, editor or publishing calls. |
| Customer operational data | Scoped business content/runtime stores; legacy native records also exist | No database move or new enquiry store. Existing `clientId/businessId/siteId/environment` bindings remain authoritative until explicit adapter cutover. |
| Payer and plan | Client subscriptions, Page Studio entitlements, AI credit/payment records | Unchanged and not consulted to confer workspace ownership. A future payer transition must preserve balances and obligations explicitly. |

The existing portal user table has uniqueness on `(client_id, email)`, not global person identity. Two records sharing an email are not automatically the same owner. Existing content scope uses `businessId = clientId`; treating a new workspace UUID as a drop-in client ID would break scope validation and foreign keys. Standalone site provisioning therefore needs an explicit next-stage adapter, not a fabricated agency client or relaxed constraint.

## Implemented contracts

`server/utils/pageStudio/customerWorkspaces.ts` exposes internal transaction services:

- `createCustomerWorkspace({ identityId, requestId, name })`: checks a persisted active verified identity, creates one workspace/owner/audit event atomically, reconciles repeated requests, and conflicts on changed terms. Replay rechecks ownership and portal/client isolation; it never restores a revoked membership.
- `resolveCustomerWorkspaceAccess({ workspaceId, identityId })`: checks fresh identity, workspace and membership state, expiry and any active mapped client. Foreign-client portal identities fail even when a membership was mistakenly inserted. It returns the workspace role and optional legacy mapping, not database credentials or a site authorization token.
- `bindLegacyCustomerWorkspace({ workspaceId, identityId, tenantId, clientId })`: requires workspace ownership plus the exact active portal admin/manager and one matching non-cancelled entitlement. The binding does not activate an expired subscription. Duplicate competing bindings fail; existing bindings cannot be silently replaced.
- `resolveAgencyWorkspaceAccess({ workspaceId, agencyUserId, tenantId })`: checks an explicit live grant for the exact actor and tenant, active staff/workspace/client, and expiry/revocation. Only `workspace.read` and `site.design` are supported. Neither ownership nor billing is a grant capability.

All identity IDs and agency actor/tenant values must come from server-validated authentication adapters, never request bodies. The helpers do not validate a login token themselves and must not be directly exposed as unauthenticated HTTP endpoints. Recheck authority within any later state-changing site operation; a returned context is not a long-lived permission token. New membership/agency-grant administration and last-owner continuity need their own audited transactions before an administration UI is exposed.

Migration 442 is additive and does not infer owners, backfill existing customers, grant entitlements, create agency staff or change publication policies. Its unique keys and foreign keys enforce identity/mapping consistency; identity row locking serializes creation retries. See PostgreSQL's official [constraint documentation](https://www.postgresql.org/docs/current/ddl-constraints.html) and [locking documentation](https://www.postgresql.org/docs/current/explicit-locking.html).

## Cutover and rollback

1. Inventory current client/site/entitlement/storage and actor mappings, including ambiguous clients with multiple tenant contexts. Keep ambiguity blocked for manual reconciliation; do not select an arbitrary tenant.
2. Add verified identity adapters using current authentication. For existing portal identities, map exact authenticated user IDs only. Preserve invitation and account activation semantics.
3. Explicitly create/link approved customer workspaces. Test both entry journeys and revoked/foreign access. Do not bulk promote primary contacts or all existing admins to owners.
4. Add standalone signup/onboarding and a site/storage provisioning adapter. Preserve existing site, asset, database and publication IDs; verify old and new authorized reads agree before moving each management route.
5. Enable routes only with hosted two-customer acceptance and a recorded deployment receipt. Existing site/environment checks remain mandatory throughout.

Rollback before route activation: revert service consumers if any were added and leave additive tables in place. No legacy data or access path was modified by this foundation. After activation, stop new onboarding and revert routing to the last verified adapter while retaining workspace records for reconciliation; never drop customer identities or ownership mappings as a routine rollback.

## Verification — 30 September 2026

- Applied migration 442 twice using this worktree's ignored `.env`, pointing at an agent-created PostgreSQL 17 instance on `127.0.0.1:55483`. Existing production credentials and database were not used. Test schemas were created/dropped only inside this disposable instance.
- The real PostgreSQL suite covers independent customers, concurrent duplicate creation, transaction rollback, invalid/unverified identities, expired/revoked memberships, suspended workspaces, explicit client mapping, foreign identities, competing bindings, role checks and agency grant restrictions.
- The independent review found a replay path missing the portal/client recheck. A regression reproduced it, then passed after the fix; the broader targeted suite passed 79 tests across six files.
- Targeted ESLint passed. `vue-tsc --noEmit -p .nuxt/tsconfig.server.json` reported 289 errors, identical to the unchanged baseline; none reference the new module. The root `vue-tsc --noEmit` command checks no files because the root config contains only project references, so its zero exit code is not counted as typecheck evidence. No production build or hosted signup acceptance is claimed.
- The dedicated workspace PostgreSQL test step is included in `.github/workflows/ci.yml`; the test database remains runner-local and separate from production.

Reproduce with a disposable local PostgreSQL instance (the test refuses non-loopback database hosts):

```sh
PAGE_STUDIO_WORKSPACE_TEST_URL=postgresql://USER@127.0.0.1:PORT/postgres \
  pnpm exec vitest run test/server/utils/pageStudioCustomerWorkspacesPostgres.test.ts
```

RND-17 now has a tested persistence/access foundation. It remains open for verified identity adapters, existing-customer migration validation and hosted evidence. RND-01 remains open for the complete per-capability writer/reader inventory and legacy data cutover; this mapping does not mark that broader audit complete. Public marketing pages remain unchanged because no new customer-facing capability is enabled.
