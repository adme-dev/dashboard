# Client Financial Façade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace misleading client-detail financial figures with a reconciled Xero, project-delivery, and ad-spend view plus a one-to-one project allocation workflow.

**Architecture:** A canonical server service loads normalized financial sources, performs all cent-based calculations and reconciliation, and returns one client-scoped façade response. Thin read/mutation endpoints enforce permissions; focused Nuxt UI components render the response and allocate media/Xero sources without recalculating totals in the browser.

**Tech Stack:** Nuxt 4, Vue 3 `<script setup>`, Nuxt UI v4, Nitro/H3, Neon Postgres, Zod, date-fns v4, Vitest, happy-dom.

**Spec:** `docs/superpowers/specs/2026-08-22-client-financial-facade-design.md`

## Global Constraints

- Use Nuxt UI v4 for every control; allocation project and Xero tracking selectors must use `USelectMenu` with non-empty sentinel values.
- Invoke the project frontend-design skill before editing the allocation form or other form fields.
- Revenue is eligible Xero ACCREC ex-GST line revenue; `projects.budget_amount` remains the lifetime `projectBudget` plan.
- AGI is Xero revenue minus agency-paid actual media spend.
- Delivery cost is labour plus deduplicated project expenses plus allocated Xero ACCPAY direct costs.
- One media campaign or Xero line maps to zero or one project; split allocations are out of scope.
- Client source totals must reconcile within one cent as project allocations plus unallocated amounts.
- Use integer cents internally. Return `null` margin with an explicit reason when AGI is zero, negative, or affected by unresolved source conflicts.
- Read summaries require `CLIENTS`; Xero source details and allocation mutations require `FINANCE`; mutations also require write access.
- Server imports use `~~/server/utils/`; types exposed to the frontend are re-exported through `app/types/index.ts`.
- Use `useFetch()` for reads and `$fetch()` for mutations.
- Preserve unrelated dirty-worktree changes. Inspect every target file before editing and stage only the paths or hunks owned by the task.
- Run migration `337_client_financial_allocations.sql` automatically against the `.env` database immediately after it is created and statically tested.
- Keep current endpoints compatible for other consumers during initial rollout.
- Update the existing public Xero Integration feature copy before completion.

## File Map

| File | Responsibility |
|---|---|
| `server/database/migrations/337_client_financial_allocations.sql` | Client tracking mapping, Xero line allocation, append-only allocation audit, and lookup indexes |
| `shared/types/clientFinancials.ts` | Shared façade, activity, warning, source, allocation, and mutation contracts |
| `app/types/index.ts` | Runtime type re-exports for frontend imports |
| `server/utils/clientFinancialCalculations.ts` | Date validation, cents arithmetic, AGI/delivery calculations, coverage, deduplication, and reconciliation |
| `server/utils/clientFinancialRepository.ts` | Parameterized queries for Xero caches, projects, time, expenses, media, invoices, mappings, freshness, and tracking options |
| `server/utils/clientFinancials.ts` | Canonical orchestration service and permission-neutral response assembly |
| `server/utils/clientFinancialAllocations.ts` | Transactional media/Xero/tracking assignment and audit writes |
| `server/api/agency/clients/[id]/financials.get.ts` | CLIENTS-gated façade adapter with FINANCE-aware source visibility |
| `server/api/agency/clients/[id]/financial-allocations.patch.ts` | Zod-validated FINANCE/write-gated allocation adapter |
| `app/components/clients/ClientFinancialSummary.vue` | Nine aligned KPI cards and freshness context |
| `app/components/clients/ClientProjectFinancialTable.vue` | Project financial `UTable` with accurate unknown/margin/coverage states |
| `app/components/clients/ClientFinancialWarnings.vue` | Source-specific warning and reconciliation alerts |
| `app/components/clients/ClientFinancialAllocationSlideover.vue` | Finance-only `USlideover` allocation form and mutation feedback |
| `app/components/social/SpendPeriodPicker.vue` | Add an opt-out for spend-only sync controls so the existing picker can be reused |
| `app/pages/agency/clients/[id].vue` | Fetch metadata plus the façade, own the shared reporting period, and compose all route tabs |
| `server/utils/ai/tools/economics.ts` | Batch portfolio adapter onto the canonical economics model |
| `server/utils/ai/tools/profitability.ts` | Report the same AGI/delivery-cost definition as the client route |
| `app/pages/features/index.vue` | Update Xero Integration summary copy |
| `app/pages/features/[slug].vue` | Document explicit allocation, reconciliation, and unallocated states |

---

### Task 1: Add the allocation schema and run it

**Files:**
- Create: `server/database/migrations/337_client_financial_allocations.sql`
- Create: `test/config/clientFinancialAllocationsMigration.test.ts`

**Interfaces:**
- Consumes: existing `agency_clients`, `projects`, and `team_members` UUID keys.
- Produces: `agency_client_xero_tracking_mappings`, `xero_project_allocations`, and append-only `financial_allocation_audit` for Tasks 3 and 5.

- [ ] **Step 1: Write the failing migration contract test**

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync('server/database/migrations/337_client_financial_allocations.sql', 'utf8')

describe('client financial allocation migration', () => {
  it('creates durable one-to-one mappings and append-only audit storage', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS agency_client_xero_tracking_mappings')
    expect(sql).toContain('PRIMARY KEY (tenant_id, client_id)')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS xero_project_allocations')
    expect(sql).toContain('PRIMARY KEY (tenant_id, line_item_id)')
    expect(sql).toContain('source_fingerprint TEXT NOT NULL')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS financial_allocation_audit')
    expect(sql).toContain("CHECK (source_type IN ('media_spend', 'xero_line', 'client_tracking'))")
    expect(sql).not.toContain('REFERENCES xero_invoice_lines_cache')
  })

  it('indexes reconciliation and stale-mapping lookups', () => {
    expect(sql).toContain('idx_xpa_client_project')
    expect(sql).toContain('idx_xpa_invoice')
    expect(sql).toContain('idx_faa_client_changed')
  })
})
```

- [ ] **Step 2: Run the test and verify the migration is missing**

Run: `pnpm vitest run test/config/clientFinancialAllocationsMigration.test.ts`

Expected: FAIL with `ENOENT` for `337_client_financial_allocations.sql`.

- [ ] **Step 3: Create the additive migration**

Use idempotent `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`. The Xero allocation snapshot columns are:

```sql
source_invoice_type TEXT NOT NULL,
source_invoice_date DATE NOT NULL,
source_account_code TEXT,
source_description TEXT,
source_ex_gst_cents BIGINT NOT NULL,
source_fingerprint TEXT NOT NULL
```

Use these exact referential actions:

```sql
client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
assigned_by UUID REFERENCES team_members(id) ON DELETE SET NULL
```

For `financial_allocation_audit`, preserve history with `client_id ... ON DELETE RESTRICT`, project IDs `ON DELETE SET NULL`, `metadata JSONB NOT NULL DEFAULT '{}'::jsonb`, and `changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`.

- [ ] **Step 4: Run the static migration test**

Run: `pnpm vitest run test/config/clientFinancialAllocationsMigration.test.ts`

Expected: PASS (2 tests).

- [ ] **Step 5: Apply the migration to the configured database**

Run exactly as separate shell actions:

```bash
export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-)
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f server/database/migrations/337_client_financial_allocations.sql
```

Expected: all three `CREATE TABLE` statements and indexes complete without error. A second run must also complete without error.

Run the same `psql` command a second time and expect only idempotent notices/success, with no duplicate-object failure.

- [ ] **Step 6: Re-read, inspect, and commit only the schema task**

```bash
git diff --check -- server/database/migrations/337_client_financial_allocations.sql test/config/clientFinancialAllocationsMigration.test.ts
git add server/database/migrations/337_client_financial_allocations.sql test/config/clientFinancialAllocationsMigration.test.ts
git commit -m "feat: add client financial allocation schema"
```

### Task 2: Define contracts and the pure calculation kernel

**Files:**
- Create: `shared/types/clientFinancials.ts`
- Create: `server/utils/clientFinancialCalculations.ts`
- Modify: `app/types/index.ts`
- Create: `test/server/utils/clientFinancialCalculations.test.ts`

**Interfaces:**
- Consumes: raw source amounts represented as integer cents.
- Produces: `parseClientFinancialRange()`, `calculateClientFinancials()`, and all shared response/mutation types consumed by every later task.

- [ ] **Step 1: Write failing tests for date bounds and accounting invariants**

Cover these exact expectations:

```ts
expect(parseClientFinancialRange(undefined, undefined, new Date('2026-08-22T00:00:00Z')))
  .toEqual({ from: '2026-08-01', to: '2026-08-22', label: '1–22 Aug 2026' })
expect(() => parseClientFinancialRange('2026-08-23', '2026-08-22')).toThrow(/before or equal/)
expect(() => parseClientFinancialRange('2025-01-01', '2026-08-22')).toThrow(/366 days/)
```

Build a fixture with one project, `$6,020` revenue, `$2,592.82` media, `$500` labour, `$100` manual expenses, and `$300` Xero supplier cost. Assert:

```ts
expect(result.summary.xeroRevenue).toBe(6020)
expect(result.summary.mediaSpend).toBe(2592.82)
expect(result.summary.agi).toBe(3427.18)
expect(result.summary.deliveryCost).toBe(900)
expect(result.summary.deliveryProfit).toBe(2527.18)
expect(result.summary.deliveryMarginPct).toBeCloseTo(73.74, 2)
expect(result.reconciliation.every(item => item.differenceCents === 0)).toBe(true)
```

Also test:

- AGI `0` returns `deliveryMarginPct: null` and `marginReason: 'no_agi'`.
- Negative AGI returns `marginReason: 'negative_agi'`.
- A linked manual expense sharing an allocated Xero invoice ID is excluded once.
- A conflicting cross-project Xero/manual link returns `marginReason: 'source_conflict'` and warning `possible_duplicate`.
- Amount-weighted coverage uses cents, while project coverage reports mapped source counts rather than a percentage.
- An unallocated source remains in the client total but not any project row.

- [ ] **Step 2: Run the calculation tests and verify imports fail**

Run: `pnpm vitest run test/server/utils/clientFinancialCalculations.test.ts`

Expected: FAIL because `clientFinancialCalculations.ts` and shared contracts do not exist.

- [ ] **Step 3: Define the shared contracts**

`shared/types/clientFinancials.ts` must export these named contracts:

```ts
export type FinancialMarginReason = 'no_agi' | 'negative_agi' | 'source_conflict' | null
export type FinancialWarningCode =
  | 'xero_not_linked'
  | 'xero_lines_unavailable'
  | 'media_not_connected'
  | 'media_partial'
  | 'stale_allocation'
  | 'possible_duplicate'
  | 'reconciliation_failed'
  | 'activity_truncated'

export type FinancialAllocationMutation =
  | { sourceType: 'media_spend'; sourceId: string; projectId: string | null }
  | { sourceType: 'xero_line'; sourceId: string; projectId: string | null }
  | { sourceType: 'client_tracking'; trackingOptionId: string | null; trackingOptionName: string }

export interface FinancialAllocationResult {
  sourceType: FinancialAllocationMutation['sourceType']
  sourceId: string
  previousProjectId: string | null
  projectId: string | null
  changedAt: string
}

export interface ClientFinancialsResponse {
  period: { from: string; to: string; label: string }
  basis: {
    currency: 'AUD'
    revenue: 'xero_accrec_ex_gst'
    media: 'agency_paid_passthrough'
    projectBudget: 'lifetime_plan'
  }
  summary: ClientFinancialSummary
  projects: ClientProjectFinancialRow[]
  activity: {
    timeEntries: ClientFinancialTimeEntry[]
    invoices: ClientXeroInvoiceRow[]
    mediaCampaigns: ClientFinancialMediaCampaign[]
    totalTimeEntries: number
    truncated: boolean
  }
  unallocated: FinancialUnallocatedSummary
  allocationCoverage: FinancialAllocationCoverage
  sources?: FinancialAllocationSource[]
  tracking?: {
    selected: FinancialTrackingOption | null
    options: FinancialTrackingOption[]
  }
  freshness: FinancialSourceFreshness[]
  warnings: FinancialSourceWarning[]
  reconciliation: FinancialReconciliation[]
  permissions: { canViewSources: boolean; canAllocate: boolean }
}
```

Define the referenced interfaces in the same file with stable camelCase properties. Money fields are decimal AUD at the API boundary; raw calculation inputs remain cents and stay server-only.

Re-export the shared contracts from `app/types/index.ts`:

```ts
export type {
  ClientFinancialsResponse,
  ClientProjectFinancialRow,
  FinancialAllocationMutation,
  FinancialAllocationResult,
  FinancialAllocationSource,
  FinancialWarningCode
} from '~~/shared/types/clientFinancials'
```

- [ ] **Step 4: Implement pure date, coverage, reconciliation, and financial functions**

Export these exact signatures:

```ts
export function parseClientFinancialRange(
  from: unknown,
  to: unknown,
  now?: Date
): { from: string; to: string; label: string }

export function calculateClientFinancials(
  input: ClientFinancialCalculationInput
): ClientFinancialCalculationResult
```

Export `ClientFinancialCalculationInput` and `ClientFinancialCalculationResult` from the calculation module. The input contains normalized client/project/source rows in cents; the result contains summary, project rows, coverage, unallocated, warnings, and reconciliation before activity/freshness/permission decoration.

Use `Math.round(dollars * 100)` only when normalizing database decimals. All aggregation functions accept cents. For each source, calculate:

```ts
const unallocatedCents = totalCents - allocatedCents
const differenceCents = totalCents - allocatedCents - unallocatedCents
const percentage = totalCents > 0 ? Math.round((allocatedCents / totalCents) * 1000) / 10 : null
```

Return `marginReason: 'source_conflict'` before normal AGI reason selection when a deduplication conflict affects a project.

- [ ] **Step 5: Run tests and type-check the new contracts**

Run:

```bash
pnpm vitest run test/server/utils/clientFinancialCalculations.test.ts
pnpm exec vue-tsc --noEmit --pretty false
```

Expected: calculation tests PASS. Typecheck may report documented repository-wide pre-existing errors; it must not report an error in the four Task 2 files.

- [ ] **Step 6: Re-read, inspect, and commit the calculation slice**

Stage only the new shared/server/test files and the type-export hunk in `app/types/index.ts`:

```bash
git diff --check -- shared/types/clientFinancials.ts server/utils/clientFinancialCalculations.ts app/types/index.ts test/server/utils/clientFinancialCalculations.test.ts
git add shared/types/clientFinancials.ts server/utils/clientFinancialCalculations.ts test/server/utils/clientFinancialCalculations.test.ts
git add -p app/types/index.ts
git commit -m "feat: define client financial calculations"
```

### Task 3: Build the financial repository and canonical service

**Files:**
- Create: `server/utils/clientFinancialRepository.ts`
- Create: `server/utils/clientFinancials.ts`
- Create: `test/server/utils/clientFinancials.test.ts`

**Interfaces:**
- Consumes: Task 1 tables and Task 2 contracts/calculation functions.
- Produces: `loadClientFinancialDataset()` and `getClientFinancials()` for the read endpoint and AI adapter.

- [ ] **Step 1: Write failing service tests with dependency injection**

Create fixtures for Astoria-like data and inject a fake repository. Assert that `getClientFinancials()`:

- joins ACCREC lines to the Xero contact without needing an allocation for client totals;
- includes only allocated lines in project rows;
- discovers ACCPAY candidates only through a confirmed Client tracking mapping;
- marks a saved allocation stale when its current line is absent or its fingerprint changed;
- uses daily media spend for partial ranges;
- uses `media_spend.actual_spend` only for a full historical month/current MTD fallback;
- returns `media_partial` and excludes unsupported arbitrary partial totals;
- returns at most 500 time-entry rows, preserves the total count, and emits `activity_truncated` when needed;
- exposes source details and tracking options only when `includeSources` is true;
- returns freshness independently for Xero invoices, Xero lines, media, time, and project expenses.
- returns `xero_not_linked` while preserving project/time/media data when the client has no Xero contact;
- returns header invoice activity plus `xero_lines_unavailable` when invoice headers exist but line cache data does not;
- distinguishes an active connected account with confirmed zero spend from `media_not_connected`.

Use the exact dependency shape:

```ts
export interface ClientFinancialServiceDeps {
  loadDataset: typeof loadClientFinancialDataset
  now: () => Date
}
```

- [ ] **Step 2: Run the service test and verify missing modules**

Run: `pnpm vitest run test/server/utils/clientFinancials.test.ts`

Expected: FAIL because `clientFinancialRepository.ts` and `clientFinancials.ts` do not exist.

- [ ] **Step 3: Implement parameterized source queries**

Export:

```ts
export async function loadClientFinancialDataset(input: {
  tenantId: string | null
  clientId: string
  from: string
  to: string
  includeSources: boolean
}): Promise<ClientFinancialDataset>
```

Export `ClientFinancialDataset` from this repository module so the canonical service and its tests share one raw-data contract.

Required query rules:

- Resolve the client first and throw a typed `client_not_found` repository error when absent.
- Join `xero_invoice_lines_cache` to `xero_invoices_cache` by `(tenant_id, invoice_id)` for ACCREC contact scoping.
- Filter Xero line status with `NOT IN ('DRAFT','VOIDED','DELETED')`.
- Filter ACCPAY by the confirmed `agency_client_xero_tracking_mappings.tracking_option_name` using exact case-insensitive equality.
- Join `xero_accounts_cache` by tenant/account code and include only `type = 'DIRECTCOSTS'` in delivery-cost ACCPAY candidates; client-tagged overhead/expense lines remain visible as excluded source context rather than delivery cost.
- Left join `xero_project_allocations` by tenant and line item.
- Load `daily_spend` by `media_spend_id` and inclusive `spend_date` range.
- Load active connection state from `social_connections.client_id` and `status = 'active'`; emit `media_not_connected` only when there is neither an active connection nor a manual media row.
- Load all client projects, even projects without period activity.
- Load time and expenses through `projects.client_id` with inclusive dates.
- Load Xero invoice headers for the client contact and period; map status, gross totals, amount paid/due, and dates for the Invoices tab.
- Load active Xero Client tracking options from `xero_tracking_categories` plus `xero_tracking_options` only when `includeSources` is true.
- Count time entries separately from the `LIMIT 500` detail query.

- [ ] **Step 4: Implement the canonical orchestration service**

Export:

```ts
export async function getClientFinancials(
  input: {
    tenantId: string | null
    clientId: string
    from?: unknown
    to?: unknown
    includeSources: boolean
    canAllocate: boolean
  },
  deps?: ClientFinancialServiceDeps
): Promise<ClientFinancialsResponse>
```

The service must:

1. call `parseClientFinancialRange()`;
2. load the dataset once;
3. normalize database decimals to cents;
4. calculate a SHA-256 source fingerprint from the UTF-8 string `tenantId|lineItemId|invoiceId|invoiceType|invoiceDate|accountCode|lineExGstCents|description` using `crypto.subtle.digest('SHA-256', ...)`;
5. call `calculateClientFinancials()`;
6. attach activity, freshness, tracking options, warnings, permissions, and basis;
7. omit `sources` and `tracking` for non-FINANCE callers.

Use `Promise.all` inside the repository for independent reads. Do not call local HTTP endpoints.

- [ ] **Step 5: Run focused service and calculation tests**

Run:

```bash
pnpm vitest run test/server/utils/clientFinancialCalculations.test.ts test/server/utils/clientFinancials.test.ts
```

Expected: PASS.

- [ ] **Step 6: Re-read, inspect SQL ownership, and commit**

```bash
git diff --check -- server/utils/clientFinancialRepository.ts server/utils/clientFinancials.ts test/server/utils/clientFinancials.test.ts
git add server/utils/clientFinancialRepository.ts server/utils/clientFinancials.ts test/server/utils/clientFinancials.test.ts
git commit -m "feat: add canonical client financial service"
```

### Task 4: Add the permission-aware read façade

**Files:**
- Create: `server/api/agency/clients/[id]/financials.get.ts`
- Create: `test/server/api/clientFinancialsEndpoint.test.ts`

**Interfaces:**
- Consumes: `getClientFinancials()` from Task 3.
- Produces: `GET /api/agency/clients/:id/financials?from&to` for the client page.

- [ ] **Step 1: Write failing endpoint tests**

Mock `requireRole`, `getSelectedTenant`, `roleHasPermission`, and `getClientFinancials`. Assert:

- the route calls `requireRole(event, PERMISSIONS.CLIENTS)`;
- an `account_manager` receives `includeSources: false` and `canAllocate: false`;
- a `finance` custom-role user with `permissionGroups: ['CLIENTS','FINANCE']` receives source details;
- `from` and `to` are passed unchanged to the service;
- a service `client_not_found` becomes 404;
- invalid date input becomes 400;
- unexpected repository failure becomes 500 without leaking SQL text.

- [ ] **Step 2: Run and verify the endpoint is absent**

Run: `pnpm vitest run test/server/api/clientFinancialsEndpoint.test.ts`

Expected: FAIL because the endpoint module does not exist.

- [ ] **Step 3: Implement the thin endpoint**

Use this permission calculation after the CLIENTS gate:

```ts
const user = await requireRole(event, PERMISSIONS.CLIENTS)
const canViewSources = roleHasPermission(user.role, 'FINANCE')
  || user.permissionGroups?.includes('FINANCE') === true
const canAllocate = canViewSources
  && !isReadOnlyRole(user.role)
  && user.isCustomReadOnly !== true
```

Resolve `clientId` with `getRouterParam`, parse `getQuery`, resolve `tenantId` with `getSelectedTenant`, and call `getClientFinancials()` once. Preserve typed 400/404 errors and wrap only unknown failures.

- [ ] **Step 4: Run endpoint and service tests**

Run:

```bash
pnpm vitest run test/server/api/clientFinancialsEndpoint.test.ts test/server/utils/clientFinancials.test.ts
```

Expected: PASS.

- [ ] **Step 5: Re-read and commit the read façade**

```bash
git diff --check -- 'server/api/agency/clients/[id]/financials.get.ts' test/server/api/clientFinancialsEndpoint.test.ts
git add 'server/api/agency/clients/[id]/financials.get.ts' test/server/api/clientFinancialsEndpoint.test.ts
git commit -m "feat: expose client financial facade"
```

### Task 5: Add transactional allocations and audit

**Files:**
- Create: `server/utils/clientFinancialAllocations.ts`
- Create: `server/api/agency/clients/[id]/financial-allocations.patch.ts`
- Create: `test/server/utils/clientFinancialAllocations.test.ts`
- Create: `test/server/api/clientFinancialAllocationsEndpoint.test.ts`

**Interfaces:**
- Consumes: Task 1 tables and `FinancialAllocationMutation` from Task 2.
- Produces: `applyClientFinancialAllocation()` and the PATCH endpoint used by the slideover.

- [ ] **Step 1: Write failing transactional service tests**

Inject a transaction runner with a fake `db.query`. Assert:

- media assignment locks the `media_spend` row, validates `client_id`, validates the target project belongs to the client, updates `project_id`, and writes one audit row;
- Xero assignment locks the current line/mapping, validates tenant/client/source status, snapshots the line fingerprint, upserts the mapping, and writes one audit row;
- Xero reassignment records previous and new project IDs;
- Xero unassign deletes the mapping and audits the previous project;
- client tracking confirmation validates an active Client option before upsert;
- cross-client project assignment throws `invalid_assignment` before any update;
- stale fingerprint conflict throws `stale_source` and writes no audit row;
- any query failure rolls back update and audit together.

Use the exact public signature:

```ts
export async function applyClientFinancialAllocation(input: {
  tenantId: string | null
  clientId: string
  actorId: string
  mutation: FinancialAllocationMutation
}): Promise<FinancialAllocationResult>
```

- [ ] **Step 2: Write failing endpoint authorization and validation tests**

Assert that the route:

- calls both `requirePermission(event, 'FINANCE')` and `requireWriteAccess(event)`;
- rejects an empty source ID, invalid UUID project ID, empty tracking name, and an unknown source type with 400;
- requires a selected tenant for `xero_line` and `client_tracking` but not `media_spend`;
- maps `invalid_assignment` to 422 and `stale_source` to 409;
- returns the service result without client-side financial calculations.

- [ ] **Step 3: Run tests and verify both modules are missing**

Run:

```bash
pnpm vitest run test/server/utils/clientFinancialAllocations.test.ts test/server/api/clientFinancialAllocationsEndpoint.test.ts
```

Expected: FAIL on missing modules.

- [ ] **Step 4: Implement the allocation service**

Use the existing `transaction(async db => ...)` helper. Lock source and target rows using `FOR UPDATE`. Media and Xero mutations must use one transaction with this ordering:

```text
resolve and lock source -> resolve target project -> validate client/tenant
-> update mapping -> insert audit -> return mapping result
```

Never accept amount, description, invoice ID, or fingerprint from the browser as authoritative. Derive the Xero fingerprint server-side from the current cached line.

- [ ] **Step 5: Implement Zod validation and the PATCH adapter**

Use `z.discriminatedUnion('sourceType', [...])`. UUID validation applies to media source/project IDs; Xero `line_item_id` remains a non-empty string because Xero fallback IDs may contain `:`. Map service error codes with explicit `createError()` status codes.

- [ ] **Step 6: Run all allocation tests**

Run:

```bash
pnpm vitest run test/server/utils/clientFinancialAllocations.test.ts test/server/api/clientFinancialAllocationsEndpoint.test.ts test/config/clientFinancialAllocationsMigration.test.ts
```

Expected: PASS.

- [ ] **Step 7: Re-read transaction paths and commit**

```bash
git diff --check -- server/utils/clientFinancialAllocations.ts 'server/api/agency/clients/[id]/financial-allocations.patch.ts' test/server/utils/clientFinancialAllocations.test.ts test/server/api/clientFinancialAllocationsEndpoint.test.ts
git add server/utils/clientFinancialAllocations.ts 'server/api/agency/clients/[id]/financial-allocations.patch.ts' test/server/utils/clientFinancialAllocations.test.ts test/server/api/clientFinancialAllocationsEndpoint.test.ts
git commit -m "feat: allocate client financial sources"
```

### Task 6: Build financial summary, warning, table, and period UI

**Files:**
- Create: `app/components/clients/ClientFinancialSummary.vue`
- Create: `app/components/clients/ClientProjectFinancialTable.vue`
- Create: `app/components/clients/ClientFinancialWarnings.vue`
- Modify: `app/components/social/SpendPeriodPicker.vue`
- Create: `test/app/clientFinancialPresentation.test.ts`
- Create: `test/app/spendPeriodPicker.test.ts`

**Interfaces:**
- Consumes: Task 2 response contracts.
- Produces: presentational components and a reusable period picker with `show-sync` disabled for client financials.

- [ ] **Step 1: Invoke and read the required frontend-design skill**

Read `~/.Codex/plugins/marketplaces/Codex-plugins-official/plugins/frontend-design/skills/frontend-design/SKILL.md` before changing any UI/form surface. Apply its hierarchy, typography, density, and anti-generic guidance to these components.

- [ ] **Step 2: Write failing presentation tests**

Mount the three client components with Nuxt UI stubs. Assert:

- the summary renders exactly nine `dt`/`dd` groups in the approved order;
- `null` delivery margin renders an em dash and the supplied reason, never `0.0%`;
- genuine zero with an available source renders `$0`;
- unavailable/unallocated states render their explicit label, never `$NaN`;
- project rows render Xero revenue, media, delivery cost/profit, margin, and mapped-source count from `row.original`;
- warnings render source-specific `UAlert` content and do not hide successful metrics.

- [ ] **Step 3: Write the failing period-picker regression test**

Add a `showSync: false` case and assert that month/week controls remain while `Sync now` and `Never synced` are absent. Add a default case asserting current social-spend callers still see sync UI.

- [ ] **Step 4: Run the UI tests and verify missing behavior**

Run:

```bash
pnpm vitest run test/app/clientFinancialPresentation.test.ts test/app/spendPeriodPicker.test.ts
```

Expected: FAIL because the client components and `showSync` prop do not exist.

- [ ] **Step 5: Implement the period-picker opt-out**

Add `showSync?: boolean` with a default of `true`. Wrap only the right-hand freshness/sync group in `v-if="showSync !== false"`; month, week, popover, and navigation behavior remain unchanged.

- [ ] **Step 6: Implement the three presentational components**

`ClientFinancialSummary.vue` props:

```ts
defineProps<{
  summary: ClientFinancialSummary
  allocationCoverage: FinancialAllocationCoverage
  freshness: FinancialSourceFreshness[]
}>()
```

`ClientProjectFinancialTable.vue` props:

```ts
defineProps<{ projects: ClientProjectFinancialRow[]; pending?: boolean }>()
```

`ClientFinancialWarnings.vue` props:

```ts
defineProps<{
  warnings: FinancialSourceWarning[]
  reconciliation: FinancialReconciliation[]
}>()
```

Use equal-height `UCard`/`dl` groups, tabular numerals, semantic `text-success`/`text-error`, `UTable`, and responsive overflow. Do not use hardcoded dark-mode colors.

- [ ] **Step 7: Run the presentation tests**

Run:

```bash
pnpm vitest run test/app/clientFinancialPresentation.test.ts test/app/spendPeriodPicker.test.ts
```

Expected: PASS.

- [ ] **Step 8: Re-read visual contracts and commit**

```bash
git diff --check -- app/components/clients/ClientFinancialSummary.vue app/components/clients/ClientProjectFinancialTable.vue app/components/clients/ClientFinancialWarnings.vue app/components/social/SpendPeriodPicker.vue test/app/clientFinancialPresentation.test.ts test/app/spendPeriodPicker.test.ts
git add app/components/clients/ClientFinancialSummary.vue app/components/clients/ClientProjectFinancialTable.vue app/components/clients/ClientFinancialWarnings.vue app/components/social/SpendPeriodPicker.vue test/app/clientFinancialPresentation.test.ts test/app/spendPeriodPicker.test.ts
git commit -m "feat: add client financial presentation"
```

### Task 7: Build the Nuxt UI allocation slideover

**Files:**
- Create: `app/components/clients/ClientFinancialAllocationSlideover.vue`
- Create: `test/app/clientFinancialAllocationSlideover.test.ts`

**Interfaces:**
- Consumes: `FinancialAllocationSource`, `ClientProjectFinancialRow`, tracking options, and the Task 5 PATCH endpoint.
- Produces: `allocated` event after a successful server-confirmed mutation.

- [ ] **Step 1: Confirm the frontend-design skill has been applied in this execution context**

If Task 7 is executed by a fresh worker, read the required frontend-design skill before editing this form.

- [ ] **Step 2: Write failing interaction tests**

Mount with one unallocated media source, one ACCREC source, one ACCPAY source, two projects, and tracking options. Assert:

- the slideover groups Unallocated Media, Xero Revenue, and Xero Costs;
- every selector is a full-width `USelectMenu` inside `UFormField`;
- a `UInput` search and non-empty `USelectMenu` source filter narrow the local source list without changing the server payload;
- every visible row includes date, amount, description/campaign, source type, and platform/vendor where available;
- selector values use project UUIDs plus `__unassigned__`, never an empty string;
- selecting a project calls `$fetch` with the exact discriminated PATCH body;
- selecting `__unassigned__` sends `projectId: null`;
- a client without tracking mapping sees the Client tracking selector first;
- success emits `allocated`, closes no unrelated state, and shows a success toast;
- failure keeps the selection surface open and shows the server message in an error toast;
- controls are disabled while their mutation is in flight.

- [ ] **Step 3: Run and verify the component is absent**

Run: `pnpm vitest run test/app/clientFinancialAllocationSlideover.test.ts`

Expected: FAIL on the missing component.

- [ ] **Step 4: Implement the slideover**

Use this public component contract:

```ts
const props = defineProps<{
  open: boolean
  clientId: string
  projects: ClientProjectFinancialRow[]
  sources: FinancialAllocationSource[]
  tracking: ClientFinancialsResponse['tracking']
}>()
const emit = defineEmits<{
  'update:open': [open: boolean]
  'allocated': []
}>()
```

Call:

```ts
await $fetch(`/api/agency/clients/${props.clientId}/financial-allocations`, {
  method: 'PATCH',
  body: mutation
})
```

Do not mutate KPI/project totals locally. Emit `allocated` only after the PATCH resolves.

Use `all`, `media_spend`, `xero_revenue`, and `xero_cost` as the source-filter values. The search string matches label, description, platform/vendor, and amount text. Filtering remains entirely local because the façade supplies the client-period source set.

- [ ] **Step 5: Run the component test**

Run: `pnpm vitest run test/app/clientFinancialAllocationSlideover.test.ts`

Expected: PASS.

- [ ] **Step 6: Re-read form alignment and commit**

```bash
git diff --check -- app/components/clients/ClientFinancialAllocationSlideover.vue test/app/clientFinancialAllocationSlideover.test.ts
git add app/components/clients/ClientFinancialAllocationSlideover.vue test/app/clientFinancialAllocationSlideover.test.ts
git commit -m "feat: add client financial allocation workflow"
```

### Task 8: Integrate the façade across the client-detail route

**Files:**
- Modify: `app/pages/agency/clients/[id].vue`
- Modify: `test/app/clientDetailPage.test.ts`

**Interfaces:**
- Consumes: Tasks 4, 6, and 7.
- Produces: period-consistent Overview, Projects, Time Entries, Invoices, and Media Spend tabs while preserving Website and Measurement.

- [ ] **Step 1: Rewrite the page fixture around the façade and add failing route tests**

Keep the metadata response for client identity/editing. Add a second fixture for `/financials` containing summary, projects, activity, warnings, coverage, sources, tracking, and permissions.

Assert:

- the page calls `/api/agency/clients/:id/financials` with inclusive `from`/`to` from the period picker;
- the old `summary.totalRevenue`/budget-as-revenue values are not rendered;
- the approved nine KPI labels render from the façade;
- Projects uses the new table and never renders `NaN`;
- Time Entries renders the selected-period activity rows and shows truncation explicitly;
- Invoices uses Xero header-cache fields (`invoiceNumber`, `total`, `amountDue`, status), not local invoice aliases;
- Media Spend renders campaign, budget, actual spend, pacing/source state, and an explicit no-connection state;
- `Allocate costs` appears only when `permissions.canAllocate` is true;
- after the slideover emits `allocated`, only the financial façade refetches;
- a financial fetch failure shows a retryable alert while Website and Measurement tabs remain navigable;
- the existing table regression still verifies `row.original` values.

- [ ] **Step 2: Run and verify route tests fail against the legacy page**

Run: `pnpm vitest run test/app/clientDetailPage.test.ts`

Expected: FAIL because the page still renders legacy summary/projects/invoices/media data.

- [ ] **Step 3: Add the shared reporting-period state and façade read**

Use `SocialSpendPeriodPicker` with `:show-sync="false"`. Map month/week state to inclusive ISO dates; for the current month clamp `to` to today.

Read with `useFetch<ClientFinancialsResponse>()` and a reactive query:

```ts
const financialQuery = computed(() => ({
  from: financialRange.value.from,
  to: financialRange.value.to
}))

const {
  data: financialData,
  status: financialStatus,
  error: financialError,
  refresh: refreshFinancials
} = await useFetch<ClientFinancialsResponse>(
  `/api/agency/clients/${clientId}/financials`,
  { query: financialQuery }
)
```

Keep `$fetch` mutations for client edit/unlink and allocation.

- [ ] **Step 4: Replace the summary and project markup with focused components**

Compose `ClientsClientFinancialSummary`, `ClientsClientFinancialWarnings`, and `ClientsClientProjectFinancialTable`. Remove `formatPercent(value ?? 0)`, `getMarginColor()` assumptions for nullable margin, and every budget-as-revenue computed.

- [ ] **Step 5: Update Time Entries, Invoices, and Media Spend tabs**

Use `financialData.activity`. Each tab must have distinct successful-empty, unavailable, partial-warning, and loading behavior. Reuse Nuxt UI `UTable`; keep `row.original` slots. Show `$0` only for available confirmed zero values.

- [ ] **Step 6: Wire the allocation slideover**

Pass finance-visible sources/tracking plus projects. On `allocated`, call `await refreshFinancials()` and leave the selected reporting period unchanged.

- [ ] **Step 7: Run all client UI tests**

Run:

```bash
pnpm vitest run test/app/clientDetailPage.test.ts test/app/clientFinancialPresentation.test.ts test/app/clientFinancialAllocationSlideover.test.ts test/app/spendPeriodPicker.test.ts
```

Expected: PASS.

- [ ] **Step 8: Re-read the entire page and commit only relevant hunks**

Because the page already contains relevant uncommitted UI fixes, inspect the complete diff and preserve them. Stage no unrelated file:

```bash
git diff --check -- 'app/pages/agency/clients/[id].vue' test/app/clientDetailPage.test.ts
git add 'app/pages/agency/clients/[id].vue' test/app/clientDetailPage.test.ts
git commit -m "feat: use reconciled client financials"
```

### Task 9: Converge AI profitability on the same economics

**Files:**
- Modify: `server/utils/ai/tools/economics.ts`
- Modify: `server/utils/ai/tools/profitability.ts`
- Modify: `test/ai/tools/profitability.test.ts`
- Create: `test/server/utils/clientFinancialPortfolio.test.ts`

**Interfaces:**
- Consumes: the Task 3 repository/calculation vocabulary.
- Produces: batch MTD/YTD portfolio economics with the same AGI and delivery-cost definition as the client page.

- [ ] **Step 1: Add failing parity tests**

Assert that portfolio results include:

```ts
{
  revenueCents,
  passthroughCents,
  agiCents,
  laborCents,
  projectExpenseCents,
  xeroSupplierCostCents,
  deliveryCostCents,
  deliveryMarginPct
}
```

Update the AI tool test so a client with revenue `602000`, pass-through `259282`, and total delivery cost `90000` reports AGI `$3,427.18`, delivery cost `$900`, and margin `73.7%`. Assert AGI `<= 0` still returns null margin and ranks as loss-making.

- [ ] **Step 2: Run parity tests and verify the old labour-only model fails**

Run:

```bash
pnpm vitest run test/server/utils/clientFinancialPortfolio.test.ts test/ai/tools/profitability.test.ts
```

Expected: FAIL because current economics omits project expenses and Xero supplier costs.

- [ ] **Step 3: Add a batch portfolio query adapter**

Keep one batch query per source; do not call `getClientFinancials()` once per client. Reuse the same eligible statuses, period bounds, pass-through definition, tracking mapping, and cents calculations as the client service. Export `fetchPortfolioClientEconomics(event, period)` and keep `fetchClientEconomics` as a compatibility alias during rollout.

- [ ] **Step 4: Update the profitability tool output**

Replace labour-only delivery margin with total delivery cost. Preserve `laborCost` for explanatory detail and add `deliveryCost`. Update the tool description so it states AGI minus labour, project expenses, and allocated Xero supplier costs.

- [ ] **Step 5: Run AI and financial parity tests**

Run:

```bash
pnpm vitest run test/server/utils/clientFinancialPortfolio.test.ts test/ai/tools/profitability.test.ts test/server/utils/clientFinancialCalculations.test.ts test/server/utils/clientFinancials.test.ts
```

Expected: PASS.

- [ ] **Step 6: Re-read and commit AI convergence**

```bash
git diff --check -- server/utils/ai/tools/economics.ts server/utils/ai/tools/profitability.ts test/ai/tools/profitability.test.ts test/server/utils/clientFinancialPortfolio.test.ts
git add server/utils/ai/tools/economics.ts server/utils/ai/tools/profitability.ts test/ai/tools/profitability.test.ts test/server/utils/clientFinancialPortfolio.test.ts
git commit -m "refactor: unify client profitability calculations"
```

### Task 10: Update public copy and complete the battle test

**Files:**
- Modify: `app/pages/features/index.vue`
- Modify: `app/pages/features/[slug].vue`
- Create: `test/app/clientFinancialMarketing.test.ts`
- Review: every file changed in Tasks 1–9

**Interfaces:**
- Consumes: the complete feature.
- Produces: synchronized marketing copy and completion evidence.

- [ ] **Step 1: Write the failing marketing sync test**

Read the two marketing files and assert that the Xero Integration entry mentions project allocations, Agency Gross Income, and unallocated-source reconciliation. Do not add a new top-level nav item because Xero Integration already exists in `MarketingNav.vue`.

- [ ] **Step 2: Run and verify the copy test fails**

Run: `pnpm vitest run test/app/clientFinancialMarketing.test.ts`

Expected: FAIL because the existing copy describes generic profitability but not explicit allocation/reconciliation.

- [ ] **Step 3: Update existing Xero Integration copy**

In `app/pages/features/index.vue`, update the existing `xero-integration` summary rather than adding a duplicate feature. In `app/pages/features/[slug].vue`, revise the project-cost section to explain:

- Xero revenue and supplier lines map to projects;
- synced ad spend is treated as pass-through for AGI;
- unallocated values remain visible until assigned;
- client totals reconcile to projects plus unallocated amounts;
- allocation changes are finance-gated and audited.

- [ ] **Step 4: Run all targeted tests**

```bash
pnpm vitest run \
  test/config/clientFinancialAllocationsMigration.test.ts \
  test/server/utils/clientFinancialCalculations.test.ts \
  test/server/utils/clientFinancials.test.ts \
  test/server/utils/clientFinancialAllocations.test.ts \
  test/server/utils/clientFinancialPortfolio.test.ts \
  test/server/api/clientFinancialsEndpoint.test.ts \
  test/server/api/clientFinancialAllocationsEndpoint.test.ts \
  test/app/clientFinancialPresentation.test.ts \
  test/app/clientFinancialAllocationSlideover.test.ts \
  test/app/spendPeriodPicker.test.ts \
  test/app/clientDetailPage.test.ts \
  test/app/clientFinancialMarketing.test.ts \
  test/ai/tools/profitability.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run repository-wide static verification**

Run:

```bash
pnpm run typecheck
pnpm run build
```

Expected: build PASS. Typecheck must introduce no errors in feature-owned files; separately record any already-known repository-wide baseline failures.

- [ ] **Step 6: Perform the required deep-dive review**

Re-read every modified/new file end-to-end. Verify:

- no `~/server/utils` imports;
- all `USelectMenu` values are UUIDs or non-empty sentinels;
- tracking and project selection reactively updates the mutation payload;
- no duplicate summary/table/allocation UI remains;
- no raw select/input/button elements were introduced;
- server URL fetching was not introduced;
- source totals reconcile within one cent;
- cross-client and cross-tenant writes fail closed;
- stale mappings do not contribute to definitive margin;
- local invoice `tax`/`total` aliases are no longer used by this route;
- only existing Xero Integration marketing entries were updated.

- [ ] **Step 7: Run an authenticated local browser battle test**

Invoke the browser-testing-with-devtools skill. Start `pnpm dev` in a PTY, open the Astoria client route, and verify desktop plus narrow layouts:

```text
/agency/clients/3b095707-1e86-454a-9280-a504c1ccddc5
```

Check all tabs, period changes, warning/empty states, project table values, allocation slideover, dark mode, network responses, and console errors. Confirm the Astoria client total equals projects plus unallocated for Xero revenue, media spend, and Xero costs. Do not submit an allocation against production-backed data: exercise assign/clear mutations only when the local server uses a disposable test database; otherwise verify the selector and request construction through the automated tests without sending the mutation. Stop the dev server with Ctrl-C after verification.

- [ ] **Step 8: Commit marketing and verified completion**

```bash
git diff --check -- app/pages/features/index.vue 'app/pages/features/[slug].vue' test/app/clientFinancialMarketing.test.ts
git add -p app/pages/features/index.vue 'app/pages/features/[slug].vue'
git add test/app/clientFinancialMarketing.test.ts
git commit -m "docs: explain reconciled client profitability"
```

- [ ] **Step 9: Record final evidence**

Run:

```bash
git status --short
git log --oneline -10
```

Report targeted test totals, typecheck/build outcome, migration execution, browser-tested route and viewport states, reconciliation results, commits created, and any unrelated dirty files left untouched.
