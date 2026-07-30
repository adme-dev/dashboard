# CRM Inbound Email Route Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let agency operators and authorized client CRM administrators provision and manage one secure CRM inbound email address per client without SQL.

**Architecture:** A focused route-management service owns lifecycle, tenancy,
configuration, safe DTO projection, and audit writes around the existing
`crm_email_routes` resolver. Agency and portal handlers provide separate auth
boundaries over that service. A shared Nuxt UI onboarding panel renders safe
metadata and holds a one-time address only in memory after create or rotation.

**Tech Stack:** Nuxt 4, Vue 3, Nuxt UI v4, Nitro/H3, Zod, Neon Postgres,
Cloudflare Email Routing/Workers/Queues, Vitest, Tailwind CSS.

## Global Constraints

- Full inbound addresses are bearer capabilities and are returned only by create and rotate.
- Plaintext route tokens and addresses are never persisted, logged, audited, included in URLs, or written to Graph Wiki.
- Portal tenant identity comes exclusively from the authenticated session.
- `conversation_reply` routes remain system-managed and outside these APIs.
- One active, unrevoked `lead_inbox` route per client is enforced by Postgres.
- New routes use explicit `CRM_EMAIL_REPLY_CURRENT_VERSION` and `CRM_EMAIL_LEAD_ROUTE_DOMAIN`; never infer or accept them from a request.
- Agency handlers require `PERMISSIONS.CLIENTS`; portal mutations explicitly require CRM `admin`.
- Use Nuxt UI v4 components and the approved responsive form composition.
- Every production behavior begins with a failing test and a witnessed RED state.
- Production deployments use `pnpm deploy:production` only after `pnpm deploy:check`.

---

## File Structure

### Create

- `server/database/migrations/326_crm_email_route_management.sql` — additive lifecycle fields, active-route uniqueness, and append-only audit storage.
- `server/utils/crm/emailRouteManagement.ts` — issuance configuration, safe DTO mapping, tenant-scoped create/list/rotate/revoke transactions.
- `server/api/crm/email-routes/index.get.ts` — agency list handler.
- `server/api/crm/email-routes/index.post.ts` — agency issuance handler.
- `server/api/crm/email-routes/[id]/rotate.post.ts` — agency rotation handler.
- `server/api/crm/email-routes/[id].delete.ts` — agency revoke handler.
- `server/api/client-portal/crm/email-routes/index.get.ts` — portal safe list handler.
- `server/api/client-portal/crm/email-routes/index.post.ts` — portal issuance handler.
- `server/api/client-portal/crm/email-routes/[id]/rotate.post.ts` — portal rotation handler.
- `server/api/client-portal/crm/email-routes/[id].delete.ts` — portal revoke handler.
- `app/types/crmEmailRoute.ts` — shared safe UI/API DTOs.
- `app/composables/useCrmInboundEmailRoute.ts` — fetch, one-time reveal, copy, and lifecycle state.
- `app/components/crm/InboundEmailOnboarding.vue` — shared Nuxt UI onboarding panel.
- `test/config/crmEmailRouteManagementMigration.test.ts` — migration and schema contracts.
- `test/server/utils/crm/emailRouteManagement.test.ts` — service lifecycle and secrecy tests.
- `test/server/api/crmEmailRouteHandlers.test.ts` — agency/portal boundary tests.
- `test/app/crmInboundEmailOnboarding.test.ts` — UI composition and state tests.

### Modify

- `server/utils/crm/emailInboundConfig.ts` — parse explicit issuance version/domain.
- `server/utils/crm/clientCrmAccess.ts` — make the route-management namespace admin-only for portal mutations while retaining view access for GET.
- `app/components/leads/EmailEndpointsTab.vue` — add the agency CRM inbox section for the selected client.
- `app/components/crm/DataSources.vue` — add the portal CRM inbound-email source before inventory sources.
- `app/pages/portal/crm.vue` — pass `canAdminCrm`, not `canInviteUsers`, to CRM data-source controls.
- `wrangler.toml` — document non-secret issuance variables without embedding secrets.
- `docs/prd/crm-conversations-email-gateway-prd.md` — mark E5/E6 route onboarding tasks.
- `docs/runbooks/crm-email-inbound.md` — provisioning, rotation, rollover, smoke, and rollback.
- `app/pages/features/index.vue` — surface CRM inbound email in the relevant feature summary.
- `app/pages/features/[slug].vue` — describe client-scoped email-to-CRM onboarding.
- `app/components/MarketingNav.vue` — update only if the existing CRM/Leads item copy needs the new capability; do not add another top-level item.

---

### Task 1: Issuance Configuration and Database Guarantees

**Files:**
- Create: `server/database/migrations/326_crm_email_route_management.sql`
- Create: `test/config/crmEmailRouteManagementMigration.test.ts`
- Modify: `server/utils/crm/emailInboundConfig.ts`
- Modify: `test/server/utils/crm/emailInboundConfig.test.ts`
- Modify: `wrangler.toml`

**Interfaces:**
- Produces:
  `parseCrmEmailRouteIssuanceConfig(input): { currentVersion: number, domain: string, secret: string }`.
- Produces the lifecycle columns and `crm_email_route_audits` required by Task 2.

- [ ] **Step 1: Write failing issuance-config tests**

Add cases proving explicit version selection, canonical domain handling, and
failure when the version is absent from the keyring:

```ts
expect(parseCrmEmailRouteIssuanceConfig({
  secrets: JSON.stringify({ 1: 'a'.repeat(32), 2: 'b'.repeat(32) }),
  currentVersion: '2',
  domain: 'XeroFlow.io.'
})).toEqual({
  currentVersion: 2,
  domain: 'xeroflow.io',
  secret: 'b'.repeat(32)
})

expect(() => parseCrmEmailRouteIssuanceConfig({
  secrets: JSON.stringify({ 1: 'a'.repeat(32) }),
  currentVersion: '2',
  domain: 'xeroflow.io'
})).toThrow('CRM email route issuance is not configured safely')
```

- [ ] **Step 2: Run the focused config test and witness RED**

Run:

```bash
pnpm vitest run test/server/utils/crm/emailInboundConfig.test.ts
```

Expected: FAIL because `parseCrmEmailRouteIssuanceConfig` does not exist.

- [ ] **Step 3: Implement the minimal issuance parser**

Reuse `parseCrmEmailReplySecrets()` and
`canonicalizeCrmEmailDomain()`. Validate the explicit integer version and
return only the selected secret:

```ts
export function parseCrmEmailRouteIssuanceConfig(input: {
  secrets: string | undefined
  currentVersion: string | undefined
  domain: string | undefined
}): CrmEmailRouteIssuanceConfig
```

All invalid inputs throw the same safe configuration error.

- [ ] **Step 4: Run the config tests and witness GREEN**

Run:

```bash
pnpm vitest run test/server/utils/crm/emailInboundConfig.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write the migration contract test**

Assert that migration 326:

- adds `label`, `updated_at`, revocation actor/reason, and replacement link;
- creates a partial unique active `lead_inbox` index;
- creates `crm_email_route_audits`;
- permits only `team_member`, `client_user`, and `system` actors;
- installs an append-only trigger;
- does not add plaintext address/token columns.

- [ ] **Step 6: Run the migration test and witness RED**

Run:

```bash
pnpm vitest run test/config/crmEmailRouteManagementMigration.test.ts
```

Expected: FAIL because migration 326 does not exist.

- [ ] **Step 7: Add migration 326 and Wrangler variable declarations**

Use guarded `ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, and
`CREATE INDEX IF NOT EXISTS`. Install an append-only trigger that raises on
audit UPDATE or DELETE. Add documented, non-secret defaults:

```toml
CRM_EMAIL_REPLY_CURRENT_VERSION = "1"
CRM_EMAIL_LEAD_ROUTE_DOMAIN = "xeroflow.io"
```

Do not put `CRM_EMAIL_REPLY_SECRETS` in source.

- [ ] **Step 8: Run tests and apply the migration**

Run:

```bash
pnpm vitest run test/config/crmEmailRouteManagementMigration.test.ts test/server/utils/crm/emailInboundConfig.test.ts
```

Then load `.env` and execute:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f server/database/migrations/326_crm_email_route_management.sql
```

Expected: tests PASS and migration applies without error.

- [ ] **Step 9: Commit**

```bash
git add server/database/migrations/326_crm_email_route_management.sql server/utils/crm/emailInboundConfig.ts test/config/crmEmailRouteManagementMigration.test.ts test/server/utils/crm/emailInboundConfig.test.ts wrangler.toml
git commit -m "feat(crm): add inbound route issuance guarantees"
```

### Task 2: Safe Route Listing and One-Time Creation

**Files:**
- Create: `server/utils/crm/emailRouteManagement.ts`
- Create: `test/server/utils/crm/emailRouteManagement.test.ts`

**Interfaces:**
- Consumes:
  `createCrmEmailReplyToken()`,
  `parseCrmEmailRouteIssuanceConfig()`,
  `transaction()`.
- Produces:
  `listCrmLeadInboxRoutes(input)`,
  `createCrmLeadInboxRoute(input)`,
  `CrmEmailRouteSummary`,
  `IssuedCrmEmailRoute`.

- [ ] **Step 1: Write failing safe-projection and list tests**

Define a fixture row containing `route_token_hash` and `token_version`, then
prove the public summary has neither field:

```ts
const summary = toCrmEmailRouteSummary(row, { includeClientId: false })
expect(summary).not.toHaveProperty('routeTokenHash')
expect(summary).not.toHaveProperty('tokenVersion')
expect(JSON.stringify(summary)).not.toContain(row.route_token_hash)
```

Prove list SQL filters `route_kind = 'lead_inbox'` and `client_id = $1`.

- [ ] **Step 2: Run service tests and witness RED**

Run:

```bash
pnpm vitest run test/server/utils/crm/emailRouteManagement.test.ts
```

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement safe types, projection, and list**

Return only the DTO fields in the approved spec. Derive:

- `revoked` when revoked or inactive;
- `expired` when `expires_at <= now`;
- `never_used` when active and `last_used_at` is null;
- `active` otherwise.

Never select or serialize token-bearing values except the hash required by an
insert.

- [ ] **Step 4: Run the focused tests and witness GREEN**

Run the Task 2 test file. Expected: safe projection and tenant-scoped list
tests PASS.

- [ ] **Step 5: Write failing create tests**

Cover:

- client row lock and CRM-mode eligibility;
- team-member client assignment authorization;
- `CRM_EMAIL_CONVERSATIONS_ENABLED === 'true'`;
- 409 when an active route exists;
- hash-only insert;
- safe audit insert;
- returned `lead+<token>@<domain>` exactly once;
- database uniqueness error `23505` maps to 409;
- emitted address never appears in query calls except as the returned value.

- [ ] **Step 6: Run create tests and witness RED**

Expected: FAIL because `createCrmLeadInboxRoute` is missing.

- [ ] **Step 7: Implement transactional creation**

Use an input that contains server-derived identity and config only:

```ts
interface CreateCrmLeadInboxRouteInput {
  clientId: string
  label: string
  actor: { id: string, type: 'team_member' | 'client_user' }
  issuance: CrmEmailRouteIssuanceConfig
}
```

Insert the hash, append a safe audit row, and construct the address after the
transaction returns. Do not attach the address to the persisted row or audit
payload.

- [ ] **Step 8: Run service tests and witness GREEN**

Run:

```bash
pnpm vitest run test/server/utils/crm/emailRouteManagement.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add server/utils/crm/emailRouteManagement.ts test/server/utils/crm/emailRouteManagement.test.ts
git commit -m "feat(crm): issue safe inbound email routes"
```

### Task 3: Atomic Rotation, Idempotent Revocation, and Audit

**Files:**
- Modify: `server/utils/crm/emailRouteManagement.ts`
- Modify: `test/server/utils/crm/emailRouteManagement.test.ts`

**Interfaces:**
- Produces:
  `rotateCrmLeadInboxRoute(input): Promise<IssuedCrmEmailRoute>`.
- Produces:
  `revokeCrmLeadInboxRoute(input): Promise<{ route: CrmEmailRouteSummary }>`.

- [ ] **Step 1: Write failing rotation tests**

Prove one transaction:

- locks an active tenant-scoped `lead_inbox` route;
- returns 404 for absent and cross-tenant IDs;
- inserts the replacement before linking and revoking the old route;
- invalidates the old route immediately;
- writes a safe audit record;
- returns only the replacement address once;
- rolls back when any write fails.

- [ ] **Step 2: Run the rotation tests and witness RED**

Expected: FAIL because rotation is missing.

- [ ] **Step 3: Implement minimal atomic rotation**

Use the same issuance configuration as create. Update the old row with:

```sql
is_active = FALSE,
revoked_at = NOW(),
revoked_by = $actor,
revoked_actor_type = $type,
revoked_reason = 'rotated',
replaced_by_route_id = $replacement,
updated_at = NOW()
```

- [ ] **Step 4: Run rotation tests and witness GREEN**

Expected: PASS.

- [ ] **Step 5: Write failing revoke tests**

Prove tenant-scoped soft revoke, safe audit, and idempotent success for an
already revoked route. A cross-tenant ID must return the same 404 as an absent
ID.

- [ ] **Step 6: Run revoke tests and witness RED**

Expected: FAIL because revoke is missing.

- [ ] **Step 7: Implement minimal revocation**

Never delete the row. The second same-tenant revoke returns the existing safe
summary without a duplicate audit write.

- [ ] **Step 8: Run the entire service test and witness GREEN**

Run:

```bash
pnpm vitest run test/server/utils/crm/emailRouteManagement.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add server/utils/crm/emailRouteManagement.ts test/server/utils/crm/emailRouteManagement.test.ts
git commit -m "feat(crm): rotate and revoke inbound routes"
```

### Task 4: Agency and Portal HTTP Boundaries

**Files:**
- Create: `server/api/crm/email-routes/index.get.ts`
- Create: `server/api/crm/email-routes/index.post.ts`
- Create: `server/api/crm/email-routes/[id]/rotate.post.ts`
- Create: `server/api/crm/email-routes/[id].delete.ts`
- Create: `server/api/client-portal/crm/email-routes/index.get.ts`
- Create: `server/api/client-portal/crm/email-routes/index.post.ts`
- Create: `server/api/client-portal/crm/email-routes/[id]/rotate.post.ts`
- Create: `server/api/client-portal/crm/email-routes/[id].delete.ts`
- Create: `test/server/api/crmEmailRouteHandlers.test.ts`
- Modify: `server/utils/crm/clientCrmAccess.ts`
- Modify: `test/server/utils/crm/clientCrmAccess.test.ts`

**Interfaces:**
- Consumes Task 2/3 service methods.
- Produces the HTTP contracts used by Task 5.

- [ ] **Step 1: Write failing agency handler tests**

Prove all four handlers:

- reject `clientPortalUser` before staff RBAC;
- require `PERMISSIONS.CLIENTS`;
- validate UUIDs and labels with strict Zod schemas;
- pass server-resolved issuance configuration;
- set `Cache-Control: private, no-store` on create/rotate;
- never accept client-provided domain, version, route kind, or actor;
- never expose hashes or signing versions.

- [ ] **Step 2: Run handler tests and witness RED**

Run:

```bash
pnpm vitest run test/server/api/crmEmailRouteHandlers.test.ts
```

Expected: FAIL because handlers do not exist.

- [ ] **Step 3: Implement agency handlers**

Use query/body name `client_id` to match existing CRM handlers. Creation accepts
only:

```ts
z.object({
  client_id: z.string().uuid(),
  label: z.string().trim().min(1).max(128).default('CRM inbox')
}).strict()
```

- [ ] **Step 4: Run agency handler tests and witness GREEN**

Expected: agency cases PASS.

- [ ] **Step 5: Write failing portal access and handler tests**

Prove:

- GET requires CRM view and derives client ID from the session;
- POST/rotate/delete explicitly require CRM admin;
- bodies cannot override client ID or actor;
- a primary contact or `canAdminCrm` can mutate;
- `canInviteUsers` alone cannot mutate;
- mutation responses are no-store.

- [ ] **Step 6: Run portal tests and witness RED**

Expected: FAIL on missing handlers/admin path classification.

- [ ] **Step 7: Implement portal handlers and access classification**

Add `/api/client-portal/crm/email-routes` to the portal admin mutation
namespace. Handlers still call `requireClientCrmAccess(event, 'admin')`
explicitly so their contract remains clear if middleware changes.

- [ ] **Step 8: Run handler and client-access tests and witness GREEN**

Run:

```bash
pnpm vitest run test/server/api/crmEmailRouteHandlers.test.ts test/server/utils/crm/clientCrmAccess.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add server/api/crm/email-routes server/api/client-portal/crm/email-routes server/utils/crm/clientCrmAccess.ts test/server/api/crmEmailRouteHandlers.test.ts test/server/utils/crm/clientCrmAccess.test.ts
git commit -m "feat(crm): expose inbound route onboarding APIs"
```

### Task 5: Shared Onboarding State and Nuxt UI Panel

**Files:**
- Create: `app/types/crmEmailRoute.ts`
- Create: `app/composables/useCrmInboundEmailRoute.ts`
- Create: `app/components/crm/InboundEmailOnboarding.vue`
- Create: `test/app/crmInboundEmailOnboarding.test.ts`

**Interfaces:**
- Consumes Task 4 HTTP contracts.
- Produces:

```ts
<CrmInboundEmailOnboarding
  :api-base="string"
  :client-id="string | undefined"
  :can-manage="boolean"
/>
```

- [ ] **Step 1: Write failing composable tests**

Cover loading, safe list, create, rotate, revoke, load failure, clipboard
success, and clipboard failure. Prove `issuedAddress` is in-memory only and is
cleared after dismissal or refresh.

- [ ] **Step 2: Run the UI test and witness RED**

Run:

```bash
pnpm vitest run test/app/crmInboundEmailOnboarding.test.ts
```

Expected: FAIL because the composable/component does not exist.

- [ ] **Step 3: Implement shared types and the minimal composable**

Agency requests include `client_id`; portal requests omit it. Do not put the
issued address in route state, URL state, `useState`, local storage, or
analytics. Keep it in a component-scoped `ref`.

- [ ] **Step 4: Run composable tests and witness GREEN**

Expected: composable cases PASS.

- [ ] **Step 5: Write failing component composition tests**

Assert:

- Nuxt UI v4 controls only;
- `UFormField` and `UInput` for the label/reveal;
- `UModal` for rotation/revocation;
- `@container` and `@lg:grid-cols-2` for the constrained form;
- no unconditional two-column form;
- all documented empty/issued/awaiting/ready/revoked/error states;
- local Lucide icons only;
- 320 px-safe `min-w-0` and `shrink-0` address row;
- copy button has the exact accessible label.

- [ ] **Step 6: Run component tests and witness RED**

Expected: FAIL on missing panel markup.

- [ ] **Step 7: Implement the onboarding panel**

The one-time reveal must state:

> Copy this address now. For security, XeroFlow cannot show it again.

Rotation confirmation must state that the current address stops working as
soon as rotation completes.

- [ ] **Step 8: Run the UI tests and witness GREEN**

Run:

```bash
pnpm vitest run test/app/crmInboundEmailOnboarding.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add app/types/crmEmailRoute.ts app/composables/useCrmInboundEmailRoute.ts app/components/crm/InboundEmailOnboarding.vue test/app/crmInboundEmailOnboarding.test.ts
git commit -m "feat(crm): add inbound email onboarding panel"
```

### Task 6: Agency and Portal Composition

**Files:**
- Modify: `app/components/leads/EmailEndpointsTab.vue`
- Modify: `app/components/crm/DataSources.vue`
- Modify: `app/pages/portal/crm.vue`
- Modify: `test/app/leadsEmailEndpoints.test.ts`
- Modify: `test/app/crmInboundEmailOnboarding.test.ts`

**Interfaces:**
- Consumes Task 5 `CrmInboundEmailOnboarding`.

- [ ] **Step 1: Write failing agency composition test**

Prove the CRM inbox panel is above the existing endpoint table and receives the
selected client:

```ts
expect(tabSource.indexOf('<CrmInboundEmailOnboarding')).toBeLessThan(
  tabSource.indexOf('<LeadsEmailEndpointsTable')
)
expect(tabSource).toContain(':client-id="selectedClient"')
expect(tabSource).toContain('api-base="/api/crm/email-routes"')
```

- [ ] **Step 2: Run the agency UI test and witness RED**

Run:

```bash
pnpm vitest run test/app/leadsEmailEndpoints.test.ts
```

Expected: FAIL because the panel is not mounted.

- [ ] **Step 3: Mount the agency panel**

Preserve existing endpoint loading/error states. The CRM panel handles its own
load error so it cannot blank the general email endpoint table.

- [ ] **Step 4: Run the agency UI test and witness GREEN**

Expected: PASS.

- [ ] **Step 5: Write failing portal composition and permission tests**

Prove:

- Data Sources renders inbound email before inventory sources;
- `canManageDataSources` uses primary-contact or `canAdminCrm`;
- `canInviteUsers` is absent from that decision;
- the portal panel uses `/api/client-portal/crm/email-routes`;
- safe status remains visible when management is false.

- [ ] **Step 6: Run portal UI tests and witness RED**

Expected: FAIL on the existing `canInviteUsers` permission and missing panel.

- [ ] **Step 7: Mount the portal panel and correct the permission**

Pass the portal client ID only for component refresh keys; the portal API must
still derive tenancy from the session.

- [ ] **Step 8: Run both UI test files and witness GREEN**

Run:

```bash
pnpm vitest run test/app/leadsEmailEndpoints.test.ts test/app/crmInboundEmailOnboarding.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add app/components/leads/EmailEndpointsTab.vue app/components/crm/DataSources.vue app/pages/portal/crm.vue test/app/leadsEmailEndpoints.test.ts test/app/crmInboundEmailOnboarding.test.ts
git commit -m "feat(crm): surface email onboarding in agency and portal"
```

### Task 7: Documentation, Marketing, and Graph Wiki

**Files:**
- Modify: `docs/prd/crm-conversations-email-gateway-prd.md`
- Modify: `docs/runbooks/crm-email-inbound.md`
- Modify: `app/pages/features/index.vue`
- Modify: `app/pages/features/[slug].vue`
- Modify: `app/components/MarketingNav.vue` only if its existing CRM/Leads copy is stale

**Interfaces:**
- Documents the final Task 1–6 behavior and production operations.

- [ ] **Step 1: Add failing documentation/marketing contract assertions**

Extend the most relevant existing feature-page test or add assertions to
`test/app/crmInboundEmailOnboarding.test.ts` proving the public CRM feature
mentions dedicated inbound email, client-scoped conversation capture, and
one-time secure issuance.

- [ ] **Step 2: Run the contract test and witness RED**

Expected: FAIL because public copy is not yet updated.

- [ ] **Step 3: Update the PRD and runbook**

Mark only completed E5/E6 checklist entries. Document:

- creation, rotation, revocation;
- one-time display;
- explicit signing version;
- key rollover order;
- production smoke;
- immediate feature disable and route-revoke rollback.

- [ ] **Step 4: Update the public feature pages**

Add the capability to the existing Lead Capture / CRM feature entries. Avoid a
duplicate top-level marketing feature. Include dark-mode variants for any new
hardcoded public-page colors.

- [ ] **Step 5: Run the contract test and witness GREEN**

Run the focused UI contract test. Expected: PASS.

- [ ] **Step 6: Update Graph Wiki**

Run an incremental Graphify update or save a focused memory that records:

- management service and API boundaries;
- one-time/hash-only credential invariant;
- agency and portal placement;
- production verification outcome after Task 8.

Do not include a real issued address, token, hash, secret, raw message content,
R2 key, or customer PII.

- [ ] **Step 7: Commit tracked documentation and marketing changes**

```bash
git add docs/prd/crm-conversations-email-gateway-prd.md docs/runbooks/crm-email-inbound.md app/pages/features/index.vue 'app/pages/features/[slug].vue' app/components/MarketingNav.vue test/app/crmInboundEmailOnboarding.test.ts
git commit -m "docs(crm): publish inbound email onboarding"
```

Omit unchanged paths from `git add`.

### Task 8: Deep Review, Production Proof, and Release

**Files:**
- Review every changed and new file.
- Modify only files required by review findings.

**Interfaces:**
- Produces the reviewed PR, production migration, merged main deployment, and
  sanitized Graph Wiki completion record.

- [ ] **Step 1: Run the pre-commit deep-dive review**

Read every changed file end to end. Explicitly verify:

- Nitro uses `~~/server/` aliases;
- no raw HTML controls;
- no empty `USelectMenu` values;
- no duplicate UI;
- no secret/address/hash leakage;
- no client-provided tenant/domain/version/actor;
- no SSRF surface;
- route uniqueness and transaction order;
- portal admin permission;
- `conversation_reply` exclusion.

- [ ] **Step 2: Run focused and regression tests**

Run:

```bash
pnpm vitest run \
  test/config/crmEmailRouteManagementMigration.test.ts \
  test/server/utils/crm/emailInboundConfig.test.ts \
  test/server/utils/crm/emailRouteManagement.test.ts \
  test/server/api/crmEmailRouteHandlers.test.ts \
  test/server/utils/crm/clientCrmAccess.test.ts \
  test/app/crmInboundEmailOnboarding.test.ts \
  test/app/leadsEmailEndpoints.test.ts \
  test/server/utils/crm/emailReplyToken.test.ts \
  test/server/utils/crm/emailRouteRepository.test.ts \
  test/server/utils/crm/emailInboundProcessor.test.ts
```

Then run:

```bash
pnpm test --run
```

Expected: focused tests PASS and the full suite matches or improves the
documented baseline.

- [ ] **Step 3: Run lint, diff, build, and deployment guard**

Run:

```bash
pnpm eslint <changed TypeScript and Vue files>
git diff --check
pnpm build
pnpm deploy:check
```

Expected: no new lint errors, clean diff, successful build, and immutable
`agency-dashboard` target confirmation.

- [ ] **Step 4: Request independent review**

Review security, transactionality, tenant isolation, response secrecy, UI
permission composition, and rollback. Fix all critical and important findings
using a fresh RED/GREEN cycle.

- [ ] **Step 5: Push and open the PR**

```bash
git push -u origin feature/crm-email-route-onboarding
gh pr create --base main --head feature/crm-email-route-onboarding
gh pr checks --watch
```

- [ ] **Step 6: Apply/verify production configuration safely**

Confirm without printing values:

- Pages and email Worker share `CRM_EMAIL_REPLY_SECRETS`;
- Pages has `CRM_EMAIL_REPLY_CURRENT_VERSION`;
- Pages has `CRM_EMAIL_LEAD_ROUTE_DOMAIN`;
- `CRM_EMAIL_CONVERSATIONS_ENABLED=true`;
- the Worker remains bound to Queue, Hyperdrive, and R2;
- invocation logs remain disabled.

- [ ] **Step 7: Merge and deploy**

After required checks and review pass:

```bash
gh pr merge --squash --delete-branch
git fetch origin main
pnpm deploy:production
```

If the GitHub main workflow already performed the production deployment,
inspect its successful deployment rather than issuing a duplicate deploy.

- [ ] **Step 8: Run a sanitized production smoke**

For a designated test client:

1. create a CRM inbox through the production API/UI;
2. copy the address without writing it to shell history or logs;
3. send one uniquely identified synthetic message;
4. verify Worker receipt, Queue drain, CRM lead/person/conversation/message,
   event, communication projection, and `last_used_at`;
5. rotate the route and verify the old address is rejected;
6. revoke the replacement and verify it is inactive;
7. remove or soft-delete synthetic CRM records;
8. leave the existing DLQ untouched.

- [ ] **Step 9: Finish Graph Wiki and handoff**

Record only sanitized architecture, PR, merge SHA, deployment, test totals,
route-state result, and remaining deferred items. Confirm the worktree is
clean and production is serving the merged commit.
