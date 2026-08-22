# Client Financial Façade and Project Allocation Design

**Date:** 2026-08-22 · **Status:** Approved design · **Route:** `/agency/clients/:id`
**Primary users:** account managers, media buyers, project managers, and finance staff

## 1. Goal

Make every financial number on the client-detail route accurate, explainable, and reconcilable across Xero, project delivery data, and ad-platform spend.

The client route must stop treating project budgets as revenue and stop rendering missing or unallocated data as `$0`, `$NaN`, or `0%`. It will expose a single reporting period, a consistent financial vocabulary, and a finance-controlled workflow for assigning media campaigns and Xero line items to projects.

The approved accounting basis is:

```text
Agency Gross Income (AGI) = Xero revenue - actual media spend
Delivery cost = labour + project expenses + allocated Xero supplier costs
Delivery profit = AGI - delivery cost
Delivery margin = delivery profit / AGI
```

Actual ad-platform spend is agency-paid pass-through cost. Project budget remains a planning value; it is not earned revenue.

## 2. Success criteria

- A client total always reconciles as `sum(project allocations) + unallocated` for every source.
- Project rows contain only data explicitly assigned to that project.
- Revenue comes from Xero, not `projects.budget_amount`.
- Media spend comes from synced platform data and retains its existing campaign identity.
- Labour and project expenses use dated operational records.
- Xero supplier costs cannot be double-counted with linked project expenses.
- Unallocated, unavailable, partial, and stale states are explicit.
- The Overview, Projects, Time Entries, Invoices, Media Spend, Website, and Measurement tabs use consistent loading, empty, warning, and error states.
- All selects use Nuxt UI v4 `USelectMenu` or `USelect`.

## 3. Non-goals

- Replacing Xero as the accounting system of record.
- Writing invoices, bills, tracking categories, or payments back to Xero.
- Automatically guessing project allocations from descriptions or fuzzy name matching.
- Supporting percentage splits across projects in the first release.
- Replacing the agency-wide Financial Health experience.
- Rewriting ad-platform ingestion or pacing calculations.
- Changing existing financial endpoints for consumers outside the client-detail route during initial rollout.

## 4. Architectural decision

Use a client financial façade backed by a canonical server-side financial service.

```text
Xero caches -----------+
Media/daily spend -----+
Projects/time/expenses +--> clientFinancials service --> client financial façade --> client-detail tabs
Allocation mappings ---+                |
                                        +--> AI profitability consumer
```

The service, not the HTTP route or Vue page, owns calculation, reconciliation, allocation coverage, source warnings, and freshness. The endpoint is an authenticated adapter around that service.

### 4.1 Primary modules

- `server/utils/clientFinancials.ts`: canonical query and calculation service.
- `server/api/agency/clients/[id]/financials.get.ts`: read façade.
- `server/api/agency/clients/[id]/financial-allocations.patch.ts`: one-to-one assign/unassign mutation.
- `app/components/clients/ClientFinancialSummary.vue`: responsive KPI grid.
- `app/components/clients/ClientProjectFinancialTable.vue`: project financial table.
- `app/components/clients/ClientFinancialAllocationSlideover.vue`: finance-only allocation workflow.
- `app/types/index.ts`: public response and mutation types.

The exact component split may be adjusted during planning if the existing client page already provides an appropriate boundary, but the server contract and calculation ownership must remain unchanged.

### 4.2 Existing code to reuse

Architectural discovery with the existing Graphify graph identified these valid reuse points:

- `periodBounds()` patterns in `server/utils/ai/tools/economics.ts` for consistent UTC period boundaries.
- `normalizeInvoiceLines()` in `server/utils/xeroInvoiceLines.ts` for ex-GST values and Xero Client/Media tracking names.
- `computeCampaignBudgetPacing()` in `server/utils/budgetPacing.ts` for canonical campaign budget status.
- Normalized `media_spend` and `daily_spend` outputs produced by `server/utils/spendSync.ts`.
- Xero tracking option sync utilities in `server/utils/invoicing/tracking-categories.ts`.
- Existing social spend period picker/chart components where their props support client-scoped data.

The new service should absorb or generalize the reusable query logic in `server/utils/ai/tools/economics.ts`. The AI profitability tool must then call the canonical service or a shared lower-level calculation function so AGI definitions cannot drift.

### 4.3 Code explicitly not used as the source of truth

- `embedClientFinancials()` writes semantic AI snapshots; it is not a financial read model.
- `/api/agency/projects/profitability` calculates media commission profitability, not delivery profitability.
- The Graphify match `server/utils/audio/projects.ts` belongs to the audio subsystem.
- `/api/xero/invoices` is an organization-wide live endpoint and is not the client façade's read path.
- Self-fetching Financial Health tabs may provide presentation patterns, but they are not embedded directly.

Graphify reported that the existing graph uses the pre-path-qualified node ID scheme. File-name matches were therefore verified against their recorded source paths before inclusion in this design.

## 5. Source-of-truth rules

### 5.1 Xero revenue and invoice status

- Client identity for ACCREC invoices is `agency_clients.xero_contact_id` joined to `xero_invoices_cache.contact_id` within the selected tenant.
- Project revenue uses allocated `xero_invoice_lines_cache` ACCREC lines and `line_ex_gst_cents`.
- Exclude `DRAFT`, `VOIDED`, and `DELETED` records from recognized revenue.
- Client-summary Xero revenue and project revenue both use eligible line-cache ex-GST amounts so they share one reconciliation basis.
- Invoice KPIs such as invoiced, paid, due, and outstanding use header-cache amounts and statuses; they are accounting-status metrics, not inputs to AGI.
- The client total is independent of allocation. Unallocated Xero revenue stays in the client total and unallocated bucket.

### 5.2 Xero supplier costs

- Candidate ACCPAY lines for a client are identified by the configured Xero Client tracking option.
- A unique exact case-insensitive match between the agency client name and active Xero Client option may be offered as a suggested mapping; it is never silently persisted.
- No fuzzy matching is used.
- Project supplier cost uses allocated ACCPAY `line_ex_gst_cents` only.
- A missing, renamed, or deleted source line makes its allocation stale and produces a warning.

### 5.3 Media spend

- `media_spend.project_id` remains the canonical one-to-one campaign allocation.
- For arbitrary partial date ranges, use `daily_spend` aggregated by `media_spend_id`.
- A `media_spend.actual_spend` fallback is allowed only when the requested range covers that complete historical month or the current month-to-date period represented by the row.
- Never prorate a monthly total across an arbitrary partial range. Omit that amount from the computed total and return a partial-data warning instead.
- Campaign pacing uses `computeCampaignBudgetPacing()`.

### 5.4 Labour and project expenses

- Labour cost is `time_entries.hours * time_entries.hourly_rate`, filtered by entry date.
- Hours use the same time-entry range.
- Project expenses are filtered by expense date.
- If a project expense is linked to a Xero invoice/bill already represented by an allocated ACCPAY line, Xero is authoritative and the linked manual expense is excluded from delivery cost.
- If deterministic line-level deduplication is impossible, the response marks the amount as a possible duplicate and excludes it from a definitive margin until resolved. It must not silently count both.

### 5.5 Project budgets

- `projects.budget_amount` is returned as `projectBudget` and labelled as a lifetime planning value.
- It is never aliased to `revenue`.
- Budget variance and campaign pacing are separate concepts from delivery margin.

## 6. Allocation data model

### 6.1 Client-to-Xero tracking mapping

Add `agency_client_xero_tracking_mappings`:

- `tenant_id TEXT NOT NULL`
- `client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE`
- `tracking_option_id TEXT`
- `tracking_option_name TEXT NOT NULL`
- `confirmed_by UUID REFERENCES team_members(id) ON DELETE SET NULL`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- primary key on `(tenant_id, client_id)`

This mapping scopes ACCPAY discovery without relying on fuzzy client names. The stored option name is required because the current invoice-line cache stores tracking names.

### 6.2 Xero line-to-project allocation

Add `xero_project_allocations`:

- `tenant_id TEXT NOT NULL`
- `line_item_id TEXT NOT NULL`
- `invoice_id TEXT NOT NULL`
- `client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE`
- `project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE`
- `source_fingerprint TEXT NOT NULL`
- snapshot fields for invoice type, date, account code, description, and ex-GST cents
- `assigned_by UUID REFERENCES team_members(id) ON DELETE SET NULL`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- primary key on `(tenant_id, line_item_id)`

Do not add a foreign key to `xero_invoice_lines_cache`: Xero resync replaces cached invoice lines, and allocation intent must survive a temporary cache miss. At read and mutation time, validate the current line and compare its fingerprint with the stored source snapshot.

### 6.3 Allocation audit

Add append-only `financial_allocation_audit`:

- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `source_type TEXT NOT NULL` constrained to `media_spend`, `xero_line`, or `client_tracking`
- `tenant_id TEXT`
- `source_key TEXT NOT NULL`
- `client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE RESTRICT`
- `previous_project_id UUID REFERENCES projects(id) ON DELETE SET NULL`
- `new_project_id UUID REFERENCES projects(id) ON DELETE SET NULL`
- `actor_id UUID REFERENCES team_members(id) ON DELETE SET NULL`
- `metadata JSONB NOT NULL DEFAULT '{}'::jsonb`
- `changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

Media mutations update `media_spend.project_id` and append an audit record in the same database transaction. Xero mutations upsert/delete the mapping and append the audit record in the same transaction.

### 6.4 One-to-one rule

Each media campaign or Xero line maps to zero or one project. Assigning it to a new project replaces the old assignment and records both values in the audit log. `projectId: null` explicitly unassigns it.

## 7. Financial calculations

All internal arithmetic uses integer cents. Currency conversion to decimal numbers happens only at the response boundary.

Per project and reporting period:

```text
xeroRevenue = allocated valid ACCREC line amounts
mediaSpend = allocated platform actual spend
agi = xeroRevenue - mediaSpend
deliveryCost = laborCost + projectExpenseCost + allocatedXeroSupplierCost
deliveryProfit = agi - deliveryCost
deliveryMarginPct = agi > 0 ? deliveryProfit / agi * 100 : null
```

If AGI is zero or negative, margin is `null`, not `0`. The response supplies a reason such as `no_agi` or `negative_agi`.

Client totals run over all eligible client sources, regardless of allocation. For every additive source:

```text
client source total = allocated project source total + unallocated source total
```

Reconciliation is calculated server-side and returned as a diagnostic. A failed equality within one cent sets a source warning and prevents the response from claiming complete coverage.

### 7.1 Coverage semantics

Client allocation coverage is amount-weighted and returned separately for Xero revenue, media spend, and Xero supplier cost. Each entry includes allocated amount, unallocated amount, allocated item count, total item count, and percentage when the denominator is positive.

Project rows do not claim a percentage of unknown client items. Their Coverage cell reports mapped source counts and source types, for example `4 sources mapped` or `No financial sources mapped`. The client-level KPI is the authoritative percentage.

## 8. Read API contract

`GET /api/agency/clients/:id/financials?from=YYYY-MM-DD&to=YYYY-MM-DD`

- Default range: first day of the current calendar month through today.
- Both dates are inclusive.
- Reject malformed, reversed, or ranges longer than 366 days with 400.
- Read access requires `CLIENTS`.
- Detailed allocation-source payloads are included only for users with `FINANCE`; other users receive summaries and project results.

Top-level response shape:

```ts
interface ClientFinancialsResponse {
  period: { from: string; to: string; label: string }
  basis: {
    currency: 'AUD'
    revenue: 'xero_accrec_ex_gst'
    media: 'agency_paid_passthrough'
    projectBudget: 'lifetime_plan'
  }
  summary: ClientFinancialSummary
  projects: ClientProjectFinancialRow[]
  unallocated: FinancialUnallocatedSummary
  allocationCoverage: FinancialAllocationCoverage
  sources?: FinancialAllocationSource[]
  freshness: FinancialSourceFreshness[]
  warnings: FinancialSourceWarning[]
  reconciliation: FinancialReconciliation[]
  permissions: { canViewSources: boolean; canAllocate: boolean }
}
```

Warnings are source-specific. A stale Xero cache or missing daily media detail does not blank unrelated project, time, or website data.

## 9. Mutation contract

`PATCH /api/agency/clients/:id/financial-allocations`

```ts
type FinancialAllocationMutation =
  | { sourceType: 'media_spend'; sourceId: string; projectId: string | null }
  | { sourceType: 'xero_line'; sourceId: string; projectId: string | null }
  | {
      sourceType: 'client_tracking'
      trackingOptionId: string | null
      trackingOptionName: string
    }
```

Mutation requirements:

- `requirePermission(event, 'FINANCE')`
- write-access check for read-only custom roles
- selected Xero tenant for Xero sources
- source, client, project, and tenant ownership validation
- one database transaction for mapping plus audit
- 404 for missing sources, 409 for stale/source-fingerprint conflicts, and 422 for cross-client or invalid assignments
- return the updated allocation record and affected reconciliation summary

The client page refetches the façade after success. It does not optimistically recalculate financial totals.

## 10. Client-detail UI

### 10.1 Shared period and states

A visible reporting-period control sits above the financial summary and is shared by Overview, Projects, Invoices, and Media Spend. Time Entries follows the same dates. Website and Measurement keep their domain-specific ranges where required but use the same visual state components.

All edited controls use Nuxt UI v4. Forms use `UFormField`; project allocation uses `USelectMenu`; mutations use `UButton`; feedback uses `useToast()`; the allocation surface uses `USlideover`.

### 10.2 KPI grid

Render a balanced responsive grid containing:

- Xero revenue
- Media spend
- Agency Gross Income
- Delivery cost
- Delivery profit
- Delivery margin
- Hours
- Allocation coverage
- Active projects

Cards use consistent label, primary value, context/footer, and height. Values are never positioned by content-dependent margins. Margin and coverage badges use semantic Nuxt UI colors with accessible dark-mode contrast.

### 10.3 Projects table

Use `UTable` with:

- Project
- Status
- Project budget
- Xero revenue
- Media spend
- Delivery cost
- Delivery profit
- Margin
- Coverage

Unknown and invalid states display `Unallocated`, `Not available`, or an em dash as appropriate. A zero is shown only when the source is present and the measured amount is genuinely zero.

### 10.4 Allocation slideover

The finance-only `Allocate costs` action opens a slideover with sections for:

- Unallocated Media
- Unallocated Xero Revenue
- Unallocated Xero Costs

Each source row shows source type, platform/vendor, date, description/campaign, amount, current project, and freshness. A full-width `USelectMenu` assigns one project. A small clear action unassigns it. Search and source-type filters remain local when all sources are present; pagination/filtering moves server-side if source volume requires it.

If the client has no confirmed Xero Client tracking mapping, the Xero Costs section first presents a `USelectMenu` of active Client tracking options with explicit confirmation.

## 11. Error and empty-state behavior

- No Xero contact match: keep operational data visible and show `Xero client not linked`.
- Xero header cache present but line cache absent: show invoice totals, mark project revenue allocation unavailable, and offer sync guidance to FINANCE users.
- No media connections: show `No media account connected`, not `$0 spend`.
- Media connected with a confirmed zero: show `$0` plus source freshness.
- No time entries: show `No time recorded` and genuine `0.0h` only after a successful source query.
- Stale allocations: show a warning and exclude the stale amount from definitive project margin.
- Partial source failure: preserve successful sections and list warnings near affected metrics.
- Full façade failure: use a retryable `UAlert` while non-financial tabs remain available.

## 12. Authorization and security

- Summary/project read: `CLIENTS` permission.
- Xero line descriptions, unallocated source details, and allocation mutations: `FINANCE` permission.
- Mutation also enforces write access.
- Never trust client, tenant, amount, or project identity from the request body; resolve them server-side.
- Use parameterized SQL via existing database utilities.
- Do not make server-to-server HTTP calls to local Nitro endpoints. Compose repository/service functions directly.
- Audit allocation changes without storing access tokens or unnecessary Xero payloads.

## 13. Tests

### 13.1 Pure calculation tests

- Positive, zero, and negative AGI.
- Delivery profit and null-margin reasons.
- Cent rounding.
- Project sums plus unallocated equal client totals.
- Amount-weighted coverage.
- Full-month/current-MTD media fallback and arbitrary-partial-range rejection.
- Xero/manual-expense deduplication.

### 13.2 Service and endpoint tests

- Client/contact/tenant resolution.
- ACCREC and ACCPAY status filtering.
- Exact Client tracking mapping behavior.
- Stale and fingerprint-conflict detection.
- Cross-client and cross-tenant allocation rejection.
- `CLIENTS` read and `FINANCE` source/mutation authorization, including custom permission groups.
- Atomic media/Xero allocation plus audit.
- Source warning isolation.
- Date validation.

### 13.3 UI tests

- No `$NaN`, false `$0`, or misleading `0%`.
- KPI alignment and semantic state rendering.
- `UTable` slot rows use Nuxt UI v4's row shape correctly.
- `USelectMenu` assignment and clear behavior.
- Finance-only allocation controls.
- Loading, empty, partial warning, error, and retry states across tabs.
- Responsive and dark-mode behavior.

## 14. Migration and rollout

1. Add the three allocation/mapping tables and indexes with an additive, idempotent migration.
2. Run the migration against the configured database as required by the project migration policy.
3. Implement the canonical service and tests.
4. Add the read façade and mutation endpoint.
5. Add the allocation slideover and switch the client route to the new response.
6. Preserve existing endpoints for other consumers.
7. Compare façade totals with existing Xero and spend reports for selected clients and periods.
8. Verify the invariant `projects + unallocated = client` before considering the rollout complete.
9. Refactor the AI profitability consumer onto the shared calculation path after parity tests pass.
10. Remove the client page's dependency on the legacy budget-as-revenue and local-invoice aggregation while leaving the metadata endpoint compatible for other consumers.
11. Update `app/pages/features/index.vue` and the relevant entry in `app/pages/features/[slug].vue`; update `MarketingNav.vue` only if this becomes a top-level navigation feature.

Existing `media_spend.project_id` values are preserved. Existing Xero lines start unallocated. No historical project mapping is guessed automatically.

## 15. Implementation constraints

- Nuxt UI v4 for all UI and form controls.
- The project frontend-design skill must be applied before editing allocation forms.
- Types live in `app/types/index.ts`, not only `index.d.ts`.
- Server imports use `~~/server/utils/`.
- Reads use `useFetch`; mutations use `$fetch`.
- Dark mode uses semantic Nuxt UI/Tailwind colors.
- The dirty worktree contains unrelated user changes; implementation must preserve and work around them.
- Before any commit, perform the repository's deep-dive review and targeted verification.

## 16. Accepted decisions

- Client financial façade rather than frontend aggregation or expansion of the broad client endpoint.
- Agency-paid media is pass-through and deducted from Xero revenue for AGI.
- One source maps to at most one project; no split allocations in this release.
- The allocation workflow ships in the same release as the financial façade.
- Client totals include unallocated sources; project rows do not.
- Xero is authoritative for linked accounting transactions.
- No optimistic financial recalculation in the browser.
