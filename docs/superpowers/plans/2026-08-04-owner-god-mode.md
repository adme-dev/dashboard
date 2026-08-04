# Owner God Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every authenticated, active database owner always-on God mode across the application, employee AI assistant, and MCP surface while preserving authentication, tenant/client isolation, and immutable audit logging.

**Architecture:** Resolve owner authority once per H3 request from a fresh database read, cache only that server-derived result in trusted request context, and pass it through common permission, feature, AI, execution, and MCP boundaries. God-mode writes reuse the existing tool and executor registries but execute synchronously behind a mandatory append-only audit attempt/outcome pair. MCP adds a unique signed request claim, replay protection, fresh owner revalidation, complete registry projection, and the same direct-execution coordinator. Ordinary users retain the existing governed path.

**Tech Stack:** Nuxt 4, Vue 3, Nitro/H3, TypeScript, Neon PostgreSQL, Cloudflare Pages/Workers/KV/AI Gateway, Nuxt UI v4, Zod, Vitest, happy-dom, Graphify.

## Global Constraints

- Authority comes only from a fresh `team_members` lookup by the authenticated user ID: `is_active = TRUE` and `user_role = 'owner'`.
- Never grant authority from email, an in-memory role, request data, cookies, query parameters, browser state, an unsigned header, or the synthetic cron actor.
- Authentication, tenant/client/entity isolation, schema validation, provider credentials, database constraints, and immutable audit are never bypassed.
- God mode is always on for every active owner. There is no session toggle, email allowlist, synthetic membership, or per-user switch.
- `GOD_MODE_DISABLED` is the only global incident control. Unset/`false` enables God mode; `true` disables it; malformed non-empty values fail closed as disabled.
- Owner authority must be re-read on every application or MCP request. Reuse is allowed only inside the same H3 request through `event.context`.
- Application governance bypass includes permissions, feature/suite flags, release/evaluation/readiness gates, personal disables, budgets/rates, proposal/confirmation, and MCP scopes. Non-owners remain unchanged.
- Model inference continues through the configured Cloudflare AI Gateway. God mode never falls back to a direct provider URL to evade gateway policy/observability; missing gateway/provider credentials remain operational failures.
- God-mode audit failure blocks execution. Never use `.catch(() => {})` for the God-mode audit path.
- Audit metadata is allowlisted, bounded, and credential-free. Never store prompts, request/response bodies, signed claims, tokens, API keys, uploaded contents, or provider payloads.
- The Worker artifact guard remains exactly `24,750,000` bytes. Do not raise, parameterize, or bypass it.
- Use migration number `345`; first verify the other active branch has moved its board-files migration to `344` and no migration collision exists.
- Apply migration 345 automatically to the configured Neon database before deployment, per `AGENTS.md`.
- Use only Nuxt UI v4. Before touching any form-bearing UI file, read the project-mandated `frontend-design` skill and do not alter existing form controls unless required.
- Update the public feature pages in the same implementation.
- Use Node 24 for tests and builds.
- Fix adjacent defects found by tests or review when they are in a touched path and preserve this specification. Record unrelated failures without broadening scope.
- Every task follows RED → GREEN → focused review → atomic commit. Under subagent-driven execution, each task receives an implementer, a specification reviewer, then a code-quality reviewer before the next dependent task.

## Dependency Flow

```text
authenticated request
        |
        v
fresh active-owner lookup -----> emergency disable control
        |
        v
GodModeAuthority (request context only)
   |            |              |                 |
   v            v              v                 v
permissions   AI catalog    direct execution   MCP projection/call
and gates     and budgets   via executors      + signed unique claim
   |            |              |                 |
   +------------+--------------+-----------------+
                              |
                              v
               mandatory append-only attempt/outcome audit
                              |
                              v
            tenant-scoped application/provider/database operation
```

The scoped Graphify pass over `server/utils/ai` identified `AiTool`, `ToolContext`, `pendingActions.ts`, the executor registry, `catalogComposition.ts`, and the MCP projectors as the central integration points. The graph diagnostic reported 281 dangling external-reference edges and 25 same-endpoint collapses, so implementation decisions must still be verified against source and tests rather than inferred from those incomplete graph edges.

## File Structure

### New files

- `server/database/migrations/345_god_mode_audit_events.sql`: immutable audit table, replay ledger, execution idempotency ledger, constraints, and triggers.
- `server/utils/godMode/authority.ts`: fresh active-owner resolution and request-scoped cache.
- `server/utils/godMode/audit.ts`: bounded audit writer and transaction-aware helpers.
- `server/utils/godMode/featureGate.ts`: common application feature/suite bypass adapter.
- `server/plugins/godModeAudit.ts`: terminal response/error audit hook for non-tool application bypasses.
- `server/middleware/godMode.ts`: pre-handler audit admission for every authenticated owner API request.
- `server/utils/godMode/reconciliation.ts`: stale external-operation reconciliation and terminal audit recovery.
- `server/api/cron/god-mode-reconciliation.post.ts`: protected reconciliation runner.
- `server/utils/ai/godModeExecution.ts`: audited direct application execution through existing action executors.
- `shared/utils/mcpRequestClaim.ts`: Worker-safe unique request-claim codec shared by Pages and the standalone MCP Worker.
- `server/utils/ai/mcp/requestClaim.ts`: Pages-side claim consumption, replay protection, and owner revalidation.
- `server/utils/ai/mcp/registry.ts`: authoritative union of all registered MCP suites.
- `server/utils/ai/mcp/directExecution.ts`: audited God-mode MCP execution adapters.
- `test/server/utils/godModeAuthority.test.ts`: authority and fail-closed cases.
- `test/server/utils/godModeAudit.test.ts`: metadata bounds and audit sequencing.
- `test/config/godModeAuditMigration.test.ts`: DDL/trigger/constraint contract.
- `test/config/godModeGateInventory.test.ts`: prevents new in-scope one-off gates from escaping the central adapter.
- `test/config/godModeIsolationInventory.test.ts`: proves every newly reachable route has an independent tenant/client/entity boundary.
- `test/ai/godModeCatalog.test.ts`: AI release/tool/budget bypass matrix.
- `test/ai/godModeDirectExecution.test.ts`: application direct-write and audit behavior.
- `test/ai/godModeReconciliation.test.ts`: idempotency-ledger recovery without duplicate provider effects.
- `test/ai/mcpRequestClaim.test.ts`: signature, subject, expiry, and replay contract.
- `test/server/api/godModeMcp.test.ts`: MCP discovery, calls, isolation, and audit integration.
- `test/app/godModeUi.test.ts`: persistent owner indicator and governance copy.
- `docs/runbooks/owner-god-mode.md`: operations, emergency disable, verification, and rollback.

### Principal modified files

- `server/utils/auth.ts`, `server/utils/roleResolver.ts`, `server/api/auth/me.get.ts`: application authorization and client-safe authority.
- `app/types/index.ts`: client-safe authenticated-user God-mode state.
- `server/utils/ai/governance/catalogComposition.ts`, `server/utils/ai/toolRegistry.ts`, `server/utils/ai/toolLoop.ts`: AI composition and budgets.
- `server/utils/ai/personalAssistantContext.ts`, `server/utils/ai/assistantExplainability.ts`, `shared/types/aiAssistant.ts`: `god_mode` explainability.
- `server/utils/ai/pendingActions.ts`, `server/utils/ai/executors/index.ts`, `server/api/agency/ai/chat/conversations/[id]/confirm-action.post.ts`: reusable execution service.
- `server/utils/ai/mcp/*.ts`, `server/api/internal/mcp/{exchange,tools,call}.post.ts`, `workers/mcp-server/src/index.ts`: signed MCP authority, complete projection, and direct execution.
- `workers/mcp-server/wrangler.toml`, `workers/mcp-server/DEPLOYMENT.md`, `docs/mcp-server-guide.md`: new signing secret, owner-write posture, safe Worker deployment, and operator instructions.
- `server/api/agency/ai/mcp/my-tools.get.ts`: owner-visible complete MCP manifest.
- `app/composables/useAuth.ts`, `app/components/UserMenu.vue`, `app/layouts/agency.vue`, `app/layouts/admin.vue`, `app/pages/agency/ai/my-assistant.vue`, `app/pages/admin/ai/governance.vue`: persistent UI and governance status.
- `app/pages/features/index.vue`, `app/pages/features/[slug].vue`, `app/components/MarketingNav.vue`: public feature sync where relevant.

---

### Task 1: Create the Immutable Audit and Replay Foundation

**Files:**
- Create: `server/database/migrations/345_god_mode_audit_events.sql`
- Create: `server/utils/godMode/audit.ts`
- Create: `test/config/godModeAuditMigration.test.ts`
- Create: `test/server/utils/godModeAudit.test.ts`

**Interfaces:**

```ts
export type GodModeChannel = 'application' | 'mcp'
export type GodModeAuditPhase = 'attempt' | 'succeeded' | 'failed'
export type GodModeBypassedControl =
  | 'permission'
  | 'feature_flag'
  | 'release_policy'
  | 'evaluation_policy'
  | 'personal_policy'
  | 'budget'
  | 'rate_limit'
  | 'confirmation'
  | 'mcp_scope'
  | 'mcp_suite_flag'

export interface GodModeAuditEventInput {
  actorUserId: string
  correlationId: string
  sessionDigest: string
  channel: GodModeChannel
  routeOrTool: string
  phase: GodModeAuditPhase
  tenantId?: string | null
  clientId?: string | null
  entityType?: string | null
  entityId?: string | null
  bypassedControls: GodModeBypassedControl[]
  outcomeCode: string
  emergencyDisabled: boolean
}

export async function appendGodModeAuditEvent(
  input: GodModeAuditEventInput,
  db?: Pick<Pool, 'query'>
): Promise<void>
```

- [ ] **Step 1: Confirm the migration number is free**

```bash
rg -n "345_|341_board_files_library|344_board_files_library" server/database/migrations .paul docs
```

Expected: no existing migration 345. If PR #374 still owns 341, notify that session to rename it to 344 before merging; do not rename another session's file here.

- [ ] **Step 2: Write failing migration and audit tests**

Require the migration to contain:

```sql
CREATE TABLE IF NOT EXISTS god_mode_audit_events
CREATE TABLE IF NOT EXISTS god_mode_mcp_request_nonces
CREATE TABLE IF NOT EXISTS god_mode_execution_ledger
WHERE phase = 'attempt'
WHERE phase IN ('succeeded', 'failed')
terminal event requires matching attempt
BEFORE UPDATE OR DELETE ON god_mode_audit_events
```

Test that the serializer rejects unknown bypass-control names, more than 24 controls, overlong individual control/entity/route/outcome values, malformed UUIDs/digests, and any unexpected metadata key. Add a database regression proving a terminal event cannot be inserted unless the same correlation already has an attempt. Test that database errors propagate.

- [ ] **Step 3: Run RED**

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm exec vitest run \
  test/config/godModeAuditMigration.test.ts \
  test/server/utils/godModeAudit.test.ts
```

Expected: FAIL because the migration and repository do not exist.

- [ ] **Step 4: Implement migration 345**

Use UUID keys, `TIMESTAMPTZ`, bounded `VARCHAR`, bounded/allowlisted control values, nullable tenant/client/entity identifiers, and no free-form request payload column. Add check constraints for channel/phase, individual lengths, and array cardinality. Add an immutable trigger function that raises on `UPDATE OR DELETE`. Use two partial unique indexes so each correlation has exactly one attempt and at most one terminal row; a success and failure must never coexist. Add an insert trigger for terminal phases that takes an advisory/row lock and rejects the insert unless the matching attempt already exists, preventing orphan terminal events under concurrency. Add `god_mode_mcp_request_nonces(jti UUID PRIMARY KEY, actor_user_id UUID, expires_at TIMESTAMPTZ, consumed_at TIMESTAMPTZ DEFAULT NOW())` for atomic replay rejection, with an expiry index and opportunistic bounded cleanup that never removes an unexpired nonce.

Add `god_mode_execution_ledger` keyed by actor, channel, and stable logical idempotency key. It records `in_progress`, `succeeded`, `failed`, or `ambiguous` plus a bounded result reference/digest, never a raw payload. This mutable coordination ledger is separate from immutable audit history. An `in_progress`/`ambiguous` high-risk operation blocks duplicate execution until provider reconciliation proves the outcome.

Keep attempt and terminal events as separate immutable rows sharing `correlation_id`; partial uniqueness makes a replayed attempt fail and prevents contradictory terminal outcomes.

- [ ] **Step 5: Implement strict audit input validation**

Use a strict Zod schema, the closed `GodModeBypassedControl` union, and parameterized SQL. Hash session/assertion correlation material with SHA-256 before calling the repository; the repository accepts only the fixed-length digest. Return no database row to the caller.

- [ ] **Step 6: Run GREEN and verify real DDL in a disposable transaction**

Run the Step 3 tests. Then use the project database test harness or a disposable schema to verify that an inserted event cannot be updated or deleted and that a duplicate nonce fails. Do not mutate production data during this verification.

- [ ] **Step 7: Review and commit**

Read every new file end-to-end; verify there is no secret/raw-payload field and no swallowed error. Run `git diff --check`, then:

```bash
git add server/database/migrations/345_god_mode_audit_events.sql \
  server/utils/godMode/audit.ts \
  test/config/godModeAuditMigration.test.ts \
  test/server/utils/godModeAudit.test.ts
git commit -m "feat(ai): add immutable God mode audit"
```

---

### Task 2: Resolve Fresh Active-Owner Authority Once Per Request

**Files:**
- Create: `server/utils/godMode/authority.ts`
- Modify: `server/api/auth/me.get.ts`
- Modify: `app/composables/useAuth.ts`
- Modify: `app/types/index.ts`
- Create: `test/server/utils/godModeAuthority.test.ts`
- Modify or create endpoint tests for `server/api/auth/me.get.ts`

**Interfaces:**

```ts
export type GodModeAuthorityReason =
  | 'active_owner'
  | 'not_owner'
  | 'inactive_or_missing'
  | 'emergency_disabled'
  | 'verification_failed'

export interface GodModeAuthority {
  active: boolean
  actorUserId: string
  reason: GodModeAuthorityReason
  emergencyDisabled: boolean
}

export async function resolveGodModeAuthority(
  event: H3Event,
  authenticatedUserId: string,
  deps?: GodModeAuthorityDeps
): Promise<GodModeAuthority>
```

- [ ] **Step 1: Write failing authority tests**

Cover active owner, inactive owner, downgraded owner, admin, member, missing row, malformed ID, database failure, emergency true, emergency false/unset, malformed emergency value, two calls in one event, and two separate events. Call owner→member and member→owner within the same event to prove cache entries are keyed by actor ID and never bleed authority. For the emergency control, test Cloudflare request binding true/false/malformed/absent, process fallback, and conflicting values; the request binding wins. Assert:

```ts
expect(queryOneFresh).toHaveBeenCalledWith(
  expect.stringContaining("user_role = 'owner'"),
  [USER_ID]
)
```

Client-provided role/email/`godMode` fields must have no effect. The cron actor `id: 'cron'` must not pass UUID validation or reach an active authority result.

- [ ] **Step 2: Run RED**

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm exec vitest run test/server/utils/godModeAuthority.test.ts
```

Expected: FAIL because the resolver does not exist.

- [ ] **Step 3: Implement fail-closed resolution**

Resolve `GOD_MODE_DISABLED` from `event.context.cloudflare.env` first, then server runtime/process fallback for local tests. Never use client runtime config. Malformed non-empty values disable God mode and emit a bounded server diagnostic without printing configuration values.

Use `queryOneFresh`, never `queryOne`, cached role data, or caller role:

```sql
SELECT id
  FROM team_members
 WHERE id = $1
   AND is_active = TRUE
   AND user_role = 'owner'
 LIMIT 1
```

Store in-flight promises/results under a private actor-ID-keyed map on `event.context`; this coalesces duplicate lookups for the same authenticated actor within one request without ever reusing one actor's result for another ID. Separate requests always execute a fresh lookup. Convert database errors into inactive authority with `verification_failed`; authorization callers deny rather than throwing stale authority.

- [ ] **Step 4: Expose only client-safe state**

Add `godMode: { active: boolean, label: 'God mode active' }` to `/api/auth/me` only after resolving authority. Extend the canonical `User` interface in `app/types/index.ts` and add `isGodMode` to `useAuth`. Do not expose reason details, emergency configuration values, audit identifiers, or database role evidence.

- [ ] **Step 5: Run GREEN and adjacent auth tests**

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm exec vitest run \
  test/server/utils/godModeAuthority.test.ts \
  test/server/api/auth*.test.ts \
  test/middleware/auth*.test.ts
```

Use `rg --files test | rg '/auth|auth\.'` to substitute the exact existing test paths if the glob is not accepted by Vitest.

- [ ] **Step 6: Review and commit**

Verify one DB read per H3 event and a new read for the next event. Run `git diff --check`, then commit:

```bash
git add server/utils/godMode/authority.ts server/api/auth/me.get.ts app/composables/useAuth.ts app/types/index.ts \
  test/server/utils/godModeAuthority.test.ts test/server/api
git commit -m "feat(auth): resolve active owner God mode"
```

---

### Task 3: Route Application Permissions and Feature Gates Through Authority

**Files:**
- Create: `server/utils/godMode/featureGate.ts`
- Create: `server/middleware/godMode.ts`
- Create: `server/plugins/godModeAudit.ts`
- Modify: `server/utils/auth.ts`
- Modify: `server/utils/roleResolver.ts`
- Create: `test/config/godModeGateInventory.test.ts`
- Create: `test/config/godModeIsolationInventory.test.ts`
- Modify: authorization tests in `test/server/utils/`

**Interfaces:**

```ts
export async function isApplicationCapabilityEnabled(
  event: H3Event,
  normalGate: boolean | (() => boolean | Promise<boolean>)
): Promise<boolean>
```

- [ ] **Step 1: Inventory in-scope gates before editing**

```bash
rg -n "process\.env\.|useRuntimeConfig\(|runtimeConfig\.|feature.?flag|suite.?enabled|roleHasPermission\(|hasRole\(|user\.role|user_role|permissionGroups|requirePermission\(|requireRole\(|requireWriteAccess\(|isReadOnlyRole\(" \
  server app shared | sort
```

Classify every server and client result as identity/tenant hard boundary, provider/infrastructure availability, application governance bypass, ordinary-user behavior, or unrelated configuration. Include non-AI suites such as Finance, Marketing, Banners, publishing, Search Authority, Agency Workflows, Workspace Send, dealer feeds, nearby-market tools, social-budget writes, and platform agents. Record file, line-pattern class, and chosen central helper in `godModeGateInventory.test.ts`; fail when an unclassified direct gate is added or an inventoried line disappears without the fixture being updated.

For every route newly reachable through a bypassed role/permission/read-only/feature gate, record its independent tenant/client/entity boundary in `godModeIsolationInventory.test.ts`. A role check is not sufficient evidence. Classify each owner mutation route as local-transactional or coordinated-external. Local mutations must accept a transaction-bound audit dependency; external/internal-HTTP mutations must use the Task 5 idempotency/outbox coordinator. Add negative endpoint and audit-atomicity tests for each mutation family; any route without an independent scope boundary and durable terminal strategy blocks implementation until both are added.

- [ ] **Step 2: Write failing permission and inventory tests**

For active owner authority, require `requireRole`, `requirePermission`, and `requireWriteAccess` to allow access even when the normal role/group/read-only result denies. For inactive/non-owner/emergency-disabled cases, require byte-for-byte existing decisions. Explicitly test that `requireAuth`, `canAccessImplementation`, tenant lookup helpers, and entity ownership checks are not bypassed.

For every authenticated active-owner API request (not only one that normal RBAC would deny), require one durable route-level attempt event before the route handler begins. This makes always-on owner operations auditable even when the legacy owner role would already pass. Require the Nitro response/error hook to append exactly one `succeeded` or `failed` terminal event with only the route, response class, and bounded outcome code. Attempt-audit failure blocks the route.

For read-only routes, if direct terminal insertion fails, send the already-bounded terminal event directly to the existing `JOBS_QUEUE` binding without first touching the database job ledger; the queue message is the durable recovery record and the response is withheld until either DB or Queue persistence succeeds. For mutation routes, the inventory must route terminal audit through the same local database transaction or Task 5 execution ledger/outbox; post-response middleware alone is never accepted as mutation audit. Tool-specific execution audit remains separate and more precise.

- [ ] **Step 3: Run RED**

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm exec vitest run \
  test/server/utils/godModeAuthority.test.ts \
  test/config/godModeGateInventory.test.ts \
  test/config/godModeIsolationInventory.test.ts \
  test/server/utils/auth*.test.ts
```

- [ ] **Step 4: Integrate the central authority**

Add `server/middleware/godMode.ts` after the existing auth middleware. For authenticated staff API requests it resolves authority from `event.context.user.id`, writes the mandatory attempt before the handler, and seeds trusted audit state for the terminal plugin. Exclude public/health/static routes and internal MCP routes, which have their own signed audit path. Audit admission failure blocks the owner request.

After `requireAuth(event)` succeeds, resolve God mode using `user.id`. Admit active God mode before application RBAC/read-only checks. Do not change `requireAuth`, session validation, tenant/client queries, or entity access helpers. In `resolveUserPermissions`, return every value from `PERMISSION_GROUPS` for active God mode only when the caller supplies an H3 event and server-resolved authority; never add a role-string-only shortcut.

Replace in-scope AI/application flag checks with `isApplicationCapabilityEnabled(event, normalGate)`. Keep infrastructure availability gates such as missing secrets/bindings/providers outside the bypass adapter.

Implement `server/plugins/godModeAudit.ts` with Nitro/H3 response and error hooks fed only by trusted state placed on `event.context` by the owner-audit middleware. It must not infer authority from response bodies or client headers and must deduplicate multiple helpers in the same route. Its queue fallback contains only the strict audit schema, never a request/response body, and uses a dedicated `god-mode.audit-terminal` job handler.

- [ ] **Step 5: Run GREEN and security controls**

Run the Step 3 tests plus the complete route-isolation inventory and permission, board-access, client-isolation, and SSRF suites discovered with:

```bash
rg --files test | rg '(permission|boardAccess|client.*isolation|ssrf)' 
```

Expected: God-mode cases pass and all negative controls remain denied.

- [ ] **Step 6: Review and commit**

Re-run the broad inventory and confirm every result—not only `AI_`/`MCP_` flags—has an explicit classification. Commit:

```bash
git add server/utils/godMode/featureGate.ts server/middleware/godMode.ts server/plugins/godModeAudit.ts \
  server/utils/auth.ts server/utils/roleResolver.ts \
  test/config/godModeGateInventory.test.ts test/config/godModeIsolationInventory.test.ts test/server/utils
git commit -m "feat(auth): bypass application governance for owners"
```

---

### Task 4: Admit the Complete AI Catalog and Remove Owner Budgets

**Files:**
- Modify: `server/utils/ai/governance/catalogComposition.ts`
- Modify: `server/utils/ai/toolRegistry.ts`
- Modify: `server/utils/ai/toolLoop.ts`
- Modify: `server/utils/ai/personalAssistantContext.ts`
- Modify: `server/utils/ai/assistantExplainability.ts`
- Modify: `shared/types/aiAssistant.ts`
- Create: `test/ai/godModeCatalog.test.ts`
- Modify: existing catalog/tool-loop/explainability tests

**Interfaces:**

```ts
export type AssistantReleaseAccessBasis = 'god_mode' | 'company_owner' | 'catalog_policy'
```

- [ ] **Step 1: Write the full failing bypass matrix**

Test an active owner against draft, pilot, active, suspended, retired, failed evaluation, missing evaluation, missing pilot membership, missing department membership, personal disable, permission ceiling, persona narrowing, token ceiling, cost ceiling, latency ceiling, usage ceiling, and application rate limit. Each case must admit registered tools/material or avoid the application budget rejection. Execute a normally permission-denied read and a read-only-denied write through the real SDK wrapper so `toSdkTools()` cannot reapply the bypassed governance. Assert model calls still use `AI_GATEWAY_URL` and fail closed when gateway/provider credentials are unavailable. Add ordinary member/admin controls proving existing outcomes do not change.

- [ ] **Step 2: Run RED**

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm exec vitest run \
  test/ai/godModeCatalog.test.ts \
  test/ai/catalogComposition.test.ts \
  test/ai/catalogRuntimePolicy.test.ts \
  test/ai/personalAssistantContext.test.ts \
  test/ai/toolLoop.test.ts \
  test/ai/assistantExplainability.test.ts
```

- [ ] **Step 3: Add the God-mode catalog branch**

Make catalog composition accept server-resolved authority. The normal query remains unchanged for non-owners. The God-mode query selects the latest registered pack/capability material across every release state without evaluation, pilot, rollout, department-membership, manager-membership, or personal-scope predicates. It spans all organizational departments while retaining tenant/client/entity isolation from trusted server scope and parameterized identifiers. Do not concatenate user values into SQL and do not mistake department membership for a non-bypassable tenant boundary.

- [ ] **Step 4: Bypass tool and budget governance**

Teach `filterToolsForUser`, `toSdkTools()`, and the tool loop to consume the same server-derived authority and admit/execute the authoritative registered tool set when `authority.active`. The SDK wrapper must bypass its independent permission-group and read-only defenses only for that authority object, never for an owner role string. Skip application token/cost/latency/usage/rate rejection for God mode, but retain finite provider-safe request bounds required to prevent malformed/unbounded calls. Record the bypass-control names for the execution audit instead of silently discarding the information.

- [ ] **Step 5: Return stable explainability**

Populate `accessBasis: 'god_mode'`, label `God mode active`, full registered-tool coverage, and a description that identity, tenant isolation, and audit still apply. When the emergency flag disables God mode, return the pre-existing governed owner state (`company_owner` if still applicable).

- [ ] **Step 6: Run GREEN, focused typecheck, and commit**

Run the Step 2 suite. Then run the full typecheck and filter diagnostics to the changed files; inherited unrelated diagnostics may remain, but no changed path may emit a diagnostic. Commit:

```bash
git add server/utils/ai/governance/catalogComposition.ts server/utils/ai/toolRegistry.ts \
  server/utils/ai/toolLoop.ts server/utils/ai/personalAssistantContext.ts \
  server/utils/ai/assistantExplainability.ts shared/types/aiAssistant.ts \
  test/ai/godModeCatalog.test.ts test/ai
git commit -m "feat(ai): unlock complete owner catalog"
```

---

### Task 5: Execute In-App Owner Actions Directly with Mandatory Audit

**Files:**
- Create: `server/utils/ai/godModeExecution.ts`
- Create: `server/utils/godMode/reconciliation.ts`
- Create: `server/api/cron/god-mode-reconciliation.post.ts`
- Modify: `server/utils/queue.ts`
- Modify: `server/utils/queueConsumer.ts`
- Modify: `workers/pages-cron/src/index.ts`
- Modify: `server/utils/ai/pendingActions.ts`
- Modify: `server/utils/ai/executors/types.ts`
- Modify: `server/utils/ai/executors/index.ts`
- Modify: transaction-capable executors identified by the Task 1/3 inventory
- Modify: `server/api/agency/ai/chat/conversations/[id]/confirm-action.post.ts`
- Modify: `server/utils/ai/toolLoop.ts`
- Create: `test/ai/godModeDirectExecution.test.ts`
- Create: `test/ai/godModeReconciliation.test.ts`
- Modify: `test/ai/confirmAction.test.ts`, `test/ai/pendingActions.test.ts`, executor tests

**Interfaces:**

```ts
export interface GodModeExecutionRequest {
  event: H3Event
  conversationId?: string
  toolName: string
  args: unknown
  idempotencyKey: string
  tenantId?: string
  clientId?: string
}

export async function executeGodModeTool(request: GodModeExecutionRequest): Promise<ToolResult>
```

- [ ] **Step 1: Write failing direct-execution tests**

Require one owner tool call to produce this observable sequence:

```text
fresh authority -> attempt audit -> tool schema/tenant validation -> executor -> succeeded audit
```

Test finance, social publishing, creative/banner, CRM/administration, and task writes. Assert there is no user-facing `confirm_action` step. Test executor failure, audit-attempt failure, success-audit failure, duplicate correlation ID, stable idempotency-key replay, tenant mismatch, actor substitution, and role downgrade on the next request. A non-owner event paired with an owner UUID in args/context must remain impossible. Include the adversarial sequence “provider reports success → terminal audit write fails → client retries” and prove money-moving/publishing side effects execute at most once while the ledger remains `ambiguous` until reconciled.

- [ ] **Step 2: Run RED**

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm exec vitest run \
  test/ai/godModeDirectExecution.test.ts \
  test/ai/godModeReconciliation.test.ts \
  test/ai/confirmAction.test.ts \
  test/ai/pendingActions.test.ts \
  test/ai/executors.test.ts
```

- [ ] **Step 3: Extract reusable confirmation execution**

Move the existing pending-action claim, executor lookup, input validation, tenant/client resolution, and result mapping out of the route into a server utility. The existing confirmation endpoint calls that utility and preserves non-owner behavior exactly.

Extend `ActionExecutor` with an optional execution-services/dependency object rather than a global transaction assumption. Classify every executor as local-transactional, internal-HTTP, or external-provider. For local transactional actions, pass the transaction-bound DB/service dependency through the interface and prove mutation plus success audit roll back together. Never pretend an internal `$fetch` or external provider call shares the Pages database transaction.

- [ ] **Step 4: Implement the God-mode coordinator**

For proposal-style `AiTool` handlers, run the handler, capture the internal proposal ID, and immediately claim/execute it through the shared executor in the same server request. The client sees the terminal action result, not a confirmation card. Claim the stable logical idempotency key in `god_mode_execution_ledger` before any handler/provider call. A completed retry returns the recorded bounded result reference; an `in_progress` or `ambiguous` retry never re-executes automatically.

`executeGodModeTool` derives the actor internally with `requireAuth(event)` and immediately resolves fresh authority for that exact ID. It accepts no caller-supplied actor ID, role, email, or unbranded authority object.

For in-app calls, derive the idempotency key from the persisted conversation/message/tool-call identity before execution, not from a timestamp or caller-supplied email/role. A legitimate repeated action receives a new persisted tool-call identity; a transport retry reuses the original identity.

For explicitly classified local transactional actions, insert the success event using the same `transaction()` client as the mutation and add rollback tests. For internal-HTTP/external-provider actions, persist the execution-ledger/outbox row before dispatch and send provider-supported idempotency keys, then persist the terminal audit and ledger state. If terminal persistence fails after a reported provider success, return `outcome_ambiguous`, leave the durable pre-dispatch row blocked from replay, and require reconciliation rather than returning a generic retryable failure.

Add `god-mode.audit-terminal` to the existing Queue job union and consumer. Provide a security-specific direct producer that sends only a strict terminal audit message to `JOBS_QUEUE` without calling `recordJobQueued` first, so a database outage cannot prevent the independent durable fallback. The consumer validates the strict schema and idempotently appends the terminal event; retry/dead-letter behavior remains the existing jobs-consumer behavior.

Implement a `CRON_SECRET`-protected reconciliation route that scans bounded stale `in_progress`/`ambiguous` execution rows and attempt events missing a terminal, queries providers by their idempotency/reference keys without repeating the action, appends the missing immutable terminal event, and closes the coordination row. Add it to the existing `workers/pages-cron` schedule/route list. Unknown mutation outcomes remain blocked and alertable; read-route queue events replay their captured bounded outcome. Add tests for success, failure, still-unknown, duplicate reconciliation, provider lookup outage, direct Queue fallback during DB outage, dead-letter visibility, and pages-cron wiring.

Always write the attempt before calling the handler or provider. On error, write a bounded failed event and rethrow a sanitized operational error. If the failed event itself cannot persist, return a generic audit-system failure without leaking the underlying secret/provider message.

- [ ] **Step 5: Wire the tool loop**

When authority is active and a registered tool is write/proposal class, call `executeGodModeTool`. Read tools may use their existing path but must still create attempt/outcome audit events because every God-mode attempt is audited.

- [ ] **Step 6: Run GREEN, concurrency checks, and commit**

Add a double-submit test proving only one executor claim wins. Run the Step 2 suite, `git diff --check`, and commit:

```bash
git add server/utils/ai/godModeExecution.ts server/utils/godMode/reconciliation.ts \
  server/api/cron/god-mode-reconciliation.post.ts workers/pages-cron/src/index.ts \
  server/utils/queue.ts server/utils/queueConsumer.ts server/utils/ai/pendingActions.ts \
  server/utils/ai/executors/types.ts server/utils/ai/executors/index.ts \
  'server/api/agency/ai/chat/conversations/[id]/confirm-action.post.ts' \
  server/utils/ai/toolLoop.ts test/ai
git commit -m "feat(ai): execute owner actions directly"
```

---

### Task 6: Add Signed, Unique MCP Request Authority

**Files:**
- Create: `shared/utils/mcpRequestClaim.ts`
- Create: `server/utils/ai/mcp/requestClaim.ts`
- Modify: `server/utils/ai/mcp/assertion.ts`
- Modify: `server/api/internal/mcp/exchange.post.ts`
- Modify: `server/api/internal/mcp/tools.post.ts`
- Modify: `server/api/internal/mcp/call.post.ts`
- Modify: `workers/mcp-server/src/index.ts`
- Modify: `workers/mcp-server/wrangler.toml`
- Modify: `workers/mcp-server/DEPLOYMENT.md`
- Modify: `docs/mcp-server-guide.md`
- Create: `test/ai/mcpRequestClaim.test.ts`
- Modify: `test/ai/mcpAssertion.test.ts`
- Create or modify internal MCP endpoint tests

**Interfaces:**

```ts
export interface McpRequestClaim {
  uid: string
  scope: string[]
  godMode: boolean
  jti: string
  exp: number
  audience: 'agency-dashboard-internal-mcp'
  method: 'POST'
  path: '/api/internal/mcp/tools' | '/api/internal/mcp/call'
  toolName?: string
  bodyDigest: string
}

export async function signMcpRequestClaim(
  input: Omit<McpRequestClaim, 'jti' | 'exp'>,
  secret: string,
  options?: { now?: number; ttlSec?: number; jti?: string }
): Promise<string>

export async function consumeMcpRequestClaim(
  event: H3Event,
  encoded: string,
  expectedUserId: string
): Promise<McpRequestClaim>
```

- [ ] **Step 1: Write failing signature and replay tests**

Cover valid, forged, expired, malformed, cross-user, wrong audience/method/path/tool/body digest, wrong scope, wrong God-mode bit, missing JTI, duplicate JTI, unsigned/signed scope mismatch, cross-runtime Worker-sign/Pages-verify, and database role downgrade. A captured unused tools-list claim must not authorize a call, and a call claim must not authorize different arguments. A claim can authorize exactly one exact internal request. The internal shared secret remains required in addition to the claim.

- [ ] **Step 2: Run RED**

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm exec vitest run \
  test/ai/mcpAssertion.test.ts \
  test/ai/mcpRequestClaim.test.ts
```

- [ ] **Step 3: Extend exchange authority**

After verifying the existing OAuth assertion, resolve God mode freshly for the assertion subject. Return owner state to the trusted Worker callback only; do not accept a God-mode bit from the OAuth client. Store it in OAuth `Props` with the validated user ID and scopes.

- [ ] **Step 4: Sign every Worker-to-app request**

Put only environment-independent Web Crypto encoding/signing/verification and deterministic canonical-JSON hashing in `shared/utils/mcpRequestClaim.ts`, imported by both the Nitro build and Worker build. Pages-only database consumption remains in `server/utils/ai/mcp/requestClaim.ts`. Add `MCP_REQUEST_SIGNING_SECRET` to both Worker and Pages secrets. For each `appFetch`, mint a short-lived claim with a cryptographically random JTI bound to audience, HTTP method, exact path, tool name when present, and canonical body digest; include it as `x-mcp-assertion` and never log it. Replace the Worker's init-time cached manifest with a fresh internal manifest fetch inside every `ListToolsRequestSchema` handler so every tools/list request gets a new claim and a fresh database authority check.

Derive a stable MCP logical idempotency key from the authenticated OAuth session plus the MCP transport request ID and include it in the internal call body. If the SDK does not expose a stable request ID, add a Durable Object request ledger keyed by the protocol request/payload digest and cache the terminal result; do not use the one-time JTI as the operation idempotency key.

Update the Worker config comments, deployment guide, and MCP guide so they no longer describe the live surface as read-only or require a second confirmation for an owner. Keep ordinary-user scope/confirmation documentation intact. Add a config contract test requiring the new secret to be documented on both deployment sides without embedding a value.

- [ ] **Step 5: Verify and consume claims inside Pages**

Both internal endpoints must require the service secret, verify the signed claim, compare its subject to the body user ID, recompute/compare audience, method, path, tool, and canonical body digest, atomically insert the JTI into `god_mode_mcp_request_nonces`, and freshly re-resolve active owner authority. Consume the nonce only after all request-binding checks pass and before projection/execution. A claimed `godMode: true` with a non-owner database result is rejected. A current active owner with a stale `godMode: false` still receives God mode from the fresh database result, because the signed bit is evidence about the exchange and never outranks current server authority.

Use `claim.scope` as the only scope authority. Remove `x-mcp-scope`, or retain it only as a transition header that must exactly equal the signed claim; a mismatch is rejected. Add negative tests proving an unsigned header cannot add write scope or change the God-mode path.

Fix the adjacent schema defect in `tools.post.ts` and the matching call query:

```sql
SELECT user_role AS role
  FROM team_members
 WHERE id = $1 AND is_active = TRUE
```

- [ ] **Step 6: Run GREEN and Worker tests**

Run the Step 2 tests plus all internal MCP endpoint and Worker tests. Verify no test or log snapshot contains the full signed claim or secret.

- [ ] **Step 7: Review and commit**

```bash
git add shared/utils/mcpRequestClaim.ts server/utils/ai/mcp/requestClaim.ts server/utils/ai/mcp/assertion.ts \
  server/api/internal/mcp/exchange.post.ts server/api/internal/mcp/tools.post.ts \
  server/api/internal/mcp/call.post.ts workers/mcp-server/src/index.ts \
  workers/mcp-server/wrangler.toml workers/mcp-server/DEPLOYMENT.md docs/mcp-server-guide.md \
  test/ai/mcpAssertion.test.ts test/ai/mcpRequestClaim.test.ts test/server test/config
git commit -m "feat(mcp): sign and revalidate owner requests"
```

---

### Task 7: Project Every Registered MCP Suite for God Mode

**Files:**
- Create: `server/utils/ai/mcp/registry.ts`
- Modify: `server/utils/ai/mcp/project.ts`
- Modify: `server/utils/ai/mcp/generationTools.ts`
- Modify: `server/utils/ai/mcp/writeTools.ts`
- Modify: `server/utils/ai/mcp/videoTools.ts`
- Modify: `server/utils/ai/mcp/bannerTools.ts`
- Modify: `server/api/internal/mcp/tools.post.ts`
- Modify: `server/api/agency/ai/mcp/my-tools.get.ts`
- Modify: MCP projection tests

**Interfaces:**

```ts
export interface RegisteredMcpSuite {
  key: string
  project: (context: McpProjectionContext) => McpToolManifest[]
}

export const registeredMcpSuites: readonly RegisteredMcpSuite[]
export function projectGodModeTools(context: McpProjectionContext): McpToolManifest[]
```

- [ ] **Step 1: Write failing completeness tests**

Assert the God-mode manifest contains the union of core reads, generation, writes, finance, marketing/social publishing, banners, video/media, and administration. Add a synthetic suite/tool to `registeredMcpSuites` in the test and assert it appears without another allowlist edit. Assert names are unique and schemas are valid JSON Schema.

- [ ] **Step 2: Run RED**

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm exec vitest run \
  test/ai/mcpProject.test.ts \
  test/ai/mcpGenerationTools.test.ts \
  test/ai/mcpWriteTools.test.ts \
  test/ai/mcpFinancialWiring.test.ts \
  test/ai/mcpVideoTools.test.ts \
  test/ai/mcpBannerTools.test.ts \
  test/server/api/godModeMcp.test.ts
```

- [ ] **Step 3: Centralize suite registration**

Make `registeredMcpSuites` the only authoritative suite list. Normal users pass through the existing flag, permission, and scope predicates. Active God mode invokes every registered projector with governance bypass enabled, deduplicates by name, and ignores `MCP_*_TOOLS_ENABLED` plus read/write OAuth scope. `MCP_SERVER_ENABLED`, service authentication, request signing, tenant resolution, and actual provider availability remain hard boundaries.

The tools/list branch must write its mandatory God-mode attempt event before projection and a succeeded/failed terminal event afterward. Discovery audit failure blocks the manifest response just as execution audit failure blocks a call.

- [ ] **Step 4: Make future registry additions default-on**

Base `AiTool` registry entries must flow into the MCP registry automatically. Supplemental non-`AiTool` projectors register once in `registeredMcpSuites`. Add a contract test that compares exported suite keys/tool names and fails if a projector exists but is not registered.

- [ ] **Step 5: Update owner-visible manifest**

`my-tools.get.ts` returns the same God-mode union and `authority: 'god_mode'` for active owners. It returns existing governed tools for everyone else.

- [ ] **Step 6: Run GREEN and commit**

Run the Step 2 suite, review every tool class, and commit:

```bash
git add server/utils/ai/mcp server/api/internal/mcp/tools.post.ts \
  server/api/agency/ai/mcp/my-tools.get.ts test/ai test/server/api/godModeMcp.test.ts
git commit -m "feat(mcp): expose complete owner tool registry"
```

---

### Task 8: Execute Every MCP Tool Directly and Audit It

**Files:**
- Create: `server/utils/ai/mcp/directExecution.ts`
- Modify: `server/api/internal/mcp/call.post.ts`
- Modify: relevant MCP projectors/adapters
- Modify: `test/server/api/godModeMcp.test.ts`
- Modify: MCP rate/scope/write/finance/banner/video tests

**Interfaces:**

```ts
export async function executeGodModeMcpCall(input: {
  event: H3Event
  claim: McpRequestClaim
  idempotencyKey: string
  toolName: string
  args: unknown
}): Promise<{ ok: true; data: unknown }>
```

- [ ] **Step 1: Write failing representative suite tests**

For one tool in each registered suite, assert direct completion without `confirm_action`, rich financial acknowledgement, proposal follow-up, scope denial, suite flag denial, application rate denial, or budget denial. Assert tenant/client/schema/provider errors still fail and receive a failed audit event.

- [ ] **Step 2: Run RED**

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm exec vitest run \
  test/server/api/godModeMcp.test.ts \
  test/ai/mcpScope.test.ts \
  test/ai/mcpRateLimit.test.ts \
  test/ai/mcpWriteTools.test.ts \
  test/ai/mcpFinancialWiring.test.ts \
  test/ai/mcpBannerTools.test.ts \
  test/ai/mcpVideoTools.test.ts
```

- [ ] **Step 3: Reuse application execution rather than duplicate it**

Map registry-backed MCP names to `executeGodModeTool`. For supplemental generation/video/banner/finance projections, create narrow adapters that call the existing validated service/executor. Do not reimplement provider clients or omit tenant/client checks.

- [ ] **Step 4: Enforce mandatory audit ordering**

Consume the unique request claim, revalidate active owner, write attempt, execute, and write terminal event. Remove the existing fail-open `ai_action_audit.catch(() => {})` only for the God-mode branch; preserve non-owner behavior until separately migrated. Return sanitized MCP errors.

- [ ] **Step 5: Add adversarial tests**

Battle-test forged subject, replay, duplicate call, malformed schema, SQL metacharacters in IDs, cross-client IDs, missing provider credential, upstream timeout, executor exception, attempt-audit outage, terminal-audit outage, provider-success/terminal-audit-failure/retry, and concurrent role downgrade. No case may execute before a durable attempt, and no transport retry may repeat a money-moving or publishing side effect.

- [ ] **Step 6: Run GREEN and commit**

```bash
git add server/utils/ai/mcp/directExecution.ts server/api/internal/mcp/call.post.ts \
  server/utils/ai/mcp test/server/api/godModeMcp.test.ts test/ai
git commit -m "feat(mcp): directly execute audited owner tools"
```

---

### Task 9: Add Persistent Owner UI, Governance Reporting, and Public Documentation

**Files:**
- Modify: `app/components/UserMenu.vue`
- Modify: `app/layouts/agency.vue`
- Modify: `app/layouts/admin.vue`
- Modify: `app/pages/agency/ai/my-assistant.vue`
- Modify: `app/pages/admin/ai/governance.vue`
- Modify: `server/api/admin/ai/governance/rollout.get.ts`
- Modify: `server/utils/ai/governance/companyRolloutReadiness.ts`
- Modify: `app/types/aiGovernance.ts`
- Modify: `app/pages/features/index.vue`
- Modify: `app/pages/features/[slug].vue`
- Modify: `app/components/MarketingNav.vue` only if AI administration is represented there
- Create: `test/app/godModeUi.test.ts`
- Modify: governance and marketing tests
- Create: `docs/runbooks/owner-god-mode.md`

- [ ] **Step 1: Read the mandatory frontend-design skill**

Read `~/.Codex/plugins/marketplaces/Codex-plugins-official/plugins/frontend-design/skills/frontend-design/SKILL.md` before editing the UI files. Preserve every existing form field and Nuxt UI v4 pattern.

- [ ] **Step 2: Write failing source/component tests**

Require active owners to see `God mode active` persistently in both authenticated layouts and My Assistant. Require non-owners not to see it. Governance must show owner God-mode coverage separately from employee readiness and must continue to display draft/failed/suspended states rather than pretending they passed. Add endpoint tests proving the count includes only active exact-role owners, exposes no emails/IDs, and is unaffected by pilot membership.

- [ ] **Step 3: Run RED**

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm exec vitest run \
  test/app/godModeUi.test.ts \
  test/app/aiAssistantExplainabilityUi.test.ts \
  test/app/*governance*.test.ts \
  test/app/aiAssistantsMarketingPage.test.ts
```

- [ ] **Step 4: Implement restrained persistent status**

Use `UBadge`, `UIcon`, `UTooltip`, and existing cards. Explain: all registered capabilities are available; identity, tenant isolation, and audit remain enforced. Do not add a toggle. Extend the governance rollout service/endpoint and `AiCompanyRolloutReadiness` type with a privacy-safe active-owner count and God-mode emergency state. Keep employee rollout metrics intact and render owner coverage separately.

- [ ] **Step 5: Synchronize public pages and runbook**

Add truthful God-mode content to the AI feature category and detailed feature entry. Update the mega menu only if its existing category structure calls for it. State explicitly that God mode is owner-only and ordinary employees remain governed. The runbook must include emergency disable, audit verification, role downgrade behavior, MCP secret/claim rotation, rollback, and Paul/Clara smoke checks.

- [ ] **Step 6: Run GREEN, dark-mode review, and commit**

Run the Step 3 tests. Inspect light/dark mode and narrow/wide layouts. Confirm no raw HTML inputs/dialogs/buttons were introduced. Commit:

```bash
git add app/components/UserMenu.vue app/layouts/agency.vue app/layouts/admin.vue \
  app/pages/agency/ai/my-assistant.vue app/pages/admin/ai/governance.vue \
  server/api/admin/ai/governance/rollout.get.ts server/utils/ai/governance/companyRolloutReadiness.ts \
  app/types/aiGovernance.ts \
  app/pages/features/index.vue 'app/pages/features/[slug].vue' app/components/MarketingNav.vue \
  test/app docs/runbooks/owner-god-mode.md
git commit -m "feat(ai): show owner God mode across platform"
```

---

### Task 10: Battle-Test, Apply Migration, Deploy, and Verify Paul and Clara

**Files:**
- Modify only if verification finds an in-scope defect.
- Update: `docs/runbooks/owner-god-mode.md` with actual rollout evidence, without secrets.

- [ ] **Step 1: Perform the mandatory pre-commit deep review**

Re-read every modified/new file end-to-end. Check server aliases, empty `USelectMenu` values, reactivity, duplicate UI, CSS alpha construction, SSRF, frontend imports in Nitro, audit fail-open catches, direct `role` selects, direct AI/MCP flags, tenant bypasses, secret logging, and proposal paths that still require confirmation for God mode.

- [ ] **Step 2: Run focused security and battle suites**

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm exec vitest run \
  test/server/utils/godModeAuthority.test.ts \
  test/server/utils/godModeAudit.test.ts \
  test/config/godModeAuditMigration.test.ts \
  test/config/godModeGateInventory.test.ts \
  test/config/godModeIsolationInventory.test.ts \
  test/ai/godModeCatalog.test.ts \
  test/ai/godModeDirectExecution.test.ts \
  test/ai/godModeReconciliation.test.ts \
  test/ai/mcpRequestClaim.test.ts \
  test/server/api/godModeMcp.test.ts \
  test/app/godModeUi.test.ts
```

Then run every existing AI, MCP, permission, tenant-isolation, audit, finance, marketing, banner, video, and publishing test selected with `rg --files test`.

- [ ] **Step 3: Run the full repository verification**

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm test:run
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm run typecheck
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm run build
git diff --check
```

Expected: all tests pass; changed files have no type errors; inherited typecheck errors are compared to the documented baseline; build passes; the exact Worker artifact is below `24,750,000` bytes. If it exceeds the immutable limit, move MCP God-mode authority/projection into the existing standalone MCP Worker, rerun all affected tests, and rebuild. Do not change the guard.

- [ ] **Step 4: Apply migration 345 automatically**

Load `DATABASE_URL` from `.env` without printing it and run:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f server/database/migrations/345_god_mode_audit_events.sql
```

Verify table, constraints, trigger, and replay ledger. Insert/delete only a disposable test event inside a transaction that rolls back.

- [ ] **Step 5: Verify exact live owner records**

Run a parameterized production query for `paul@adme.net.au` and `clara@adme.net.au`. Each email must resolve to exactly one active row with `user_role = 'owner'`. Do not mutate roles and do not activate by email matching. If either result is missing, duplicated, inactive, or not owner, stop deployment and report the exact non-sensitive state.

- [ ] **Step 6: Configure and verify Cloudflare secrets safely**

Using Cloudflare MCP/API, confirm Pages and the standalone MCP Worker share `MCP_REQUEST_SIGNING_SECRET`, retain `MCP_INTERNAL_SECRET`, use `MCP_SERVER_ENABLED=true`, and have `AI_GATEWAY_URL` configured. Never read or print secret values. Exercise `GOD_MODE_DISABLED=true` in preview/staging to prove owners fall back to governance, then set production to unset/`false` for always-on owner activation.

- [ ] **Step 7: Deploy the backward-compatible standalone MCP Worker first**

First use Cloudflare MCP/API to verify the target Worker is exactly `mcp-server` in the expected account and that its Durable Object and OAuth KV bindings already exist. Run a Worker dry-run from a temporary copy as documented in `workers/mcp-server/DEPLOYMENT.md`. Then deploy the Worker, not Pages, from that copy:

```bash
MCP_DEPLOY_DIR=$(mktemp -d /private/tmp/xeroflow-mcp-deploy.XXXXXX)
mkdir -p "$MCP_DEPLOY_DIR/workers"
cp -R workers/mcp-server "$MCP_DEPLOY_DIR/workers/mcp-server"
cp -R shared "$MCP_DEPLOY_DIR/shared"
npm --prefix "$MCP_DEPLOY_DIR/workers/mcp-server" install
"$MCP_DEPLOY_DIR/workers/mcp-server/node_modules/.bin/wrangler" deploy \
  --cwd "$MCP_DEPLOY_DIR/workers/mcp-server"
```

The Worker release must remain compatible with the old Pages endpoints: it sends the new signed header, defaults missing exchange `godMode` to false, and retains the old body fields during this transition. Set/rotate `MCP_REQUEST_SIGNING_SECRET` through Cloudflare secret APIs without exposing it in shell history or output. Do not overwrite `MCP_INTERNAL_SECRET`, `MCP_HANDSHAKE_SECRET`, OAuth KV, or Durable Object state. Verify the new Worker can still list/call a safe read against the old Pages version before continuing.

- [ ] **Step 8: Run the Pages guard and deploy enforcement**

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm deploy:check
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm deploy:production
```

Never call `wrangler pages deploy` directly and never change the target project from `agency-dashboard`. Immediately verify signed list/call succeeds. If it fails, roll Pages back to the previous deployment while leaving the backward-compatible Worker in place.

- [ ] **Step 9: Deploy the updated reconciliation scheduler**

Verify the target is exactly the existing `pages-cron` Worker and its `CRON_SECRET`/`APP_BASE_URL` are unchanged. Deploy its updated route list from an isolated temporary copy using the established Worker process, then invoke one bounded reconciliation run and verify zero unresolved test rows:

```bash
PAGES_CRON_DEPLOY_DIR=$(mktemp -d /private/tmp/xeroflow-pages-cron.XXXXXX)
cp -R workers/pages-cron/. "$PAGES_CRON_DEPLOY_DIR/"
npm --prefix "$PAGES_CRON_DEPLOY_DIR" install
"$PAGES_CRON_DEPLOY_DIR/node_modules/.bin/wrangler" deploy --cwd "$PAGES_CRON_DEPLOY_DIR"
```

- [ ] **Step 10: Perform authenticated production smoke tests**

For Paul and Clara, verify:

1. persistent `God mode active` UI;
2. My Assistant lists complete authority;
3. Finance, Marketing, Banners, video/generation, publishing, and administration tools appear in MCP;
4. representative safe read and reversible/write-test operations execute directly;
5. attempt and success/failure audit rows exist without payloads/secrets.

Use a non-owner control to verify governed catalog/scopes/confirmations still apply. Use a deliberately mismatched client/entity ID to verify cross-tenant denial and a failed audit event. Do not perform irreversible finance or publishing actions merely for smoke testing; use dry-run/test targets or reversible fixtures.

- [ ] **Step 11: Correct in-scope failures and rerun the whole affected matrix**

Use `superpowers:systematic-debugging` for every bug/test failure. Add a regression test before each fix. Repeat Steps 2–10 until clean. Do not call the rollout complete from partial test output.

- [ ] **Step 12: Final review, commit rollout evidence, and push**

Record timestamps, commit IDs, test counts, deployed artifact bytes, migration verification, owner record counts, smoke outcomes, and rollback state in the runbook without secrets or personal session data. Run `superpowers:verification-before-completion`, request a final code review, then:

```bash
git add docs/runbooks/owner-god-mode.md
git commit -m "docs(ai): record God mode rollout"
git push origin main
```

Expected final state: every active owner, including Paul and Clara, receives always-on God mode; non-owners remain governed; tenant isolation and immutable audit tests pass; production and MCP smoke tests pass; Worker size remains within the immutable budget.

---

## Subagent-Driven Execution Order

Run Tasks 1 and the test-only inventory portion of Task 3 in parallel. Task 2 depends on Task 1's audit vocabulary only conceptually and may start in parallel if file ownership is kept disjoint. Then execute Tasks 3–5 sequentially because they share authority/tool-loop/executor files. Task 6 may run in parallel with Task 4 after Task 2 lands. Tasks 7–8 are sequential. Task 9 follows the finalized API response shape. Task 10 is the single integration/deployment gate.

For each implementation task:

1. implementation subagent owns only the files listed for that task and writes tests first;
2. specification-review subagent checks the approved design and this plan;
3. code-quality/security subagent checks hard boundaries, audit ordering, and ordinary-user regressions;
4. implementer fixes all findings and reruns focused tests;
5. orchestrator reviews the diff and commit before starting a dependent task.

Do not let parallel agents edit `server/utils/auth.ts`, `server/utils/ai/toolLoop.ts`, either internal MCP endpoint, or shared response types at the same time.
