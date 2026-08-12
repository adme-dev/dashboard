# Portal Investment Breakdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the client invoice page so live amounts due remain prominent while invoiced media/supplier charges, agency services, GST, credits, and unknown adjustments are transparently separated.

**Architecture:** Extend the existing Xero-backed portal invoice endpoint without breaking its current response. A pure server utility owns period parsing, financial-year boundaries, line classification, channel normalisation, and reconciliation; the route owns scoped database reads and assembles `paymentStatus` and `investment` payloads; the Vue page renders those payloads with Nuxt UI v4 components.

**Tech Stack:** Nuxt 4, Vue 3 Composition API, Nuxt UI v4, Nitro endpoints, Neon Postgres, Vitest, Tailwind semantic tokens.

## Global Constraints

- Use Nuxt UI v4 components for interactive UI; do not introduce browser-native dialogs or raw form controls.
- Preserve the existing portal-auth permission check and Xero contact/tenant scoping.
- Default the investment period to the Australian financial year (`1 July` through `30 June`); accept only `financial-year`, `last-90-days`, and `all-time`.
- Treat invoice headers as authoritative for total invoiced; report all header-to-line differences as `Unclassified & adjustments`.
- Never classify missing or ambiguous account metadata as agency services.
- Do not expose supplier bills, internal cost, profit, margin, mark-up, rebate, or confidential commercial data.
- Keep the existing `summary` response fields for compatibility.
- Currency remains AUD in this release.
- Implement each behaviour test-first and commit each independently testable slice.

---

### Task 1: Deterministic investment classification and reconciliation

**Files:**
- Create: `server/utils/portalInvoiceInvestment.ts`
- Create: `test/server/utils/portalInvoiceInvestment.test.ts`

**Interfaces:**
- Consumes: cached invoice-line values `account_code`, `account_name`, `account_type`, `tracking_media`, and `line_ex_gst_cents`.
- Produces: `parseInvestmentPeriod(value): InvestmentPeriod`, `investmentPeriodBounds(period, today): InvestmentPeriodBounds`, `classifyInvestmentLine(line): InvestmentCategory`, and `buildInvestmentBreakdown(input): PortalInvestmentBreakdown`.

- [ ] **Step 1: Write failing period and classifier tests**

Create tests covering:

```ts
expect(parseInvestmentPeriod('last-90-days')).toBe('last-90-days')
expect(parseInvestmentPeriod('unexpected')).toBe('financial-year')
expect(investmentPeriodBounds('financial-year', new Date('2026-08-12T00:00:00Z')))
  .toEqual({ start: '2026-07-01', endExclusive: '2027-07-01' })

expect(classifyInvestmentLine({ accountType: 'DIRECTCOSTS', accountName: 'Direct Costs: Media Other (Reimb Exp)' }))
  .toBe('media-and-suppliers')
expect(classifyInvestmentLine({ accountType: 'SALES', accountName: 'Sales - Media' }))
  .toBe('media-and-suppliers')
expect(classifyInvestmentLine({ accountType: 'SALES', accountName: 'Sales - Digital Advertising' }))
  .toBe('agency-services')
expect(classifyInvestmentLine({ accountType: null, accountName: null }))
  .toBe('unclassified')
```

- [ ] **Step 2: Run the new utility test and verify RED**

Run:

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm vitest run test/server/utils/portalInvoiceInvestment.test.ts
```

Expected: FAIL because `portalInvoiceInvestment.ts` does not exist.

- [ ] **Step 3: Implement period parsing and deterministic classification**

Define:

```ts
export type InvestmentPeriod = 'financial-year' | 'last-90-days' | 'all-time'
export type InvestmentCategory = 'media-and-suppliers' | 'agency-services' | 'unclassified'

export function parseInvestmentPeriod(value: unknown): InvestmentPeriod
export function investmentPeriodBounds(period: InvestmentPeriod, today?: Date): {
  start: string | null
  endExclusive: string | null
}
export function classifyInvestmentLine(line: {
  accountType?: unknown
  accountName?: unknown
}): InvestmentCategory
```

Classification precedence:

```ts
if (accountType === 'DIRECTCOSTS') return 'media-and-suppliers'
if (/^Sales - (Media|Printing Income)$/i.test(accountName)) return 'media-and-suppliers'
if (['SALES', 'REVENUE', 'OTHERINCOME'].includes(accountType)) return 'agency-services'
return 'unclassified'
```

- [ ] **Step 4: Add failing reconciliation and channel tests**

Use a fixture with header totals of `660_000` cents, line ex-GST totals split across direct-cost media, sales services, and an unknown account, plus `60_000` cents GST. Assert:

```ts
expect(result).toMatchObject({
  totalInvoiced: 6600,
  mediaAndSuppliers: 3000,
  agencyServices: 2000,
  gst: 600,
  unclassifiedAndAdjustments: 1000
})
expect(result.channels).toEqual([
  { name: 'Meta', amount: 2000 },
  { name: 'Google', amount: 1000 }
])
```

Also assert that a missing line amount or a header/line mismatch increases `unclassifiedAndAdjustments`, never `agencyServices`.

- [ ] **Step 5: Implement breakdown aggregation**

Define exact input and output types:

```ts
export interface InvestmentLine {
  accountType: string | null
  accountName: string | null
  trackingMedia: string | null
  lineExGstCents: unknown
}

export interface PortalInvestmentBreakdown {
  period: InvestmentPeriod
  periodStart: string | null
  periodEnd: string | null
  totalInvoiced: number
  mediaAndSuppliers: number
  agencyServices: number
  gst: number
  unclassifiedAndAdjustments: number
  allocationAvailable: boolean
  channels: Array<{ name: string, amount: number }>
}

export function buildInvestmentBreakdown(input: {
  period: InvestmentPeriod
  periodStart: string | null
  periodEnd: string | null
  totalInvoicedCents: unknown
  gstCents: unknown
  invoiceCount: unknown
  lines: InvestmentLine[]
}): PortalInvestmentBreakdown
```

Normalise known tracking labels to `Meta`, `Google`, `YouTube`, `Carsales`, `Displays`, `Printing`, and `SMS`; group everything else as `Other suppliers`. Sort channel amounts descending. Calculate the remainder as:

```ts
totalInvoicedCents - gstCents - mediaCents - agencyCents
```

Allow negative adjustments to remain visible, round currency only after converting cents to dollars, and set `allocationAvailable` only when at least one source line exists.

- [ ] **Step 6: Run utility tests and commit**

Run:

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm vitest run test/server/utils/portalInvoiceInvestment.test.ts
git diff --check
```

Expected: PASS and clean diff.

Commit:

```bash
git add server/utils/portalInvoiceInvestment.ts test/server/utils/portalInvoiceInvestment.test.ts
git commit -m "feat: classify portal invoice investment"
```

---

### Task 2: Xero-backed payment status and investment API

**Files:**
- Modify: `server/api/portal/invoices/index.get.ts`
- Modify: `test/server/api/portalXeroInvoices.test.ts`
- Modify: `test/server/api/portalInvoicesViews.test.ts`

**Interfaces:**
- Consumes: Task 1 exports from `~~/server/utils/portalInvoiceInvestment`.
- Produces: backward-compatible invoice response plus `paymentStatus` and `investment` objects defined in the design spec.

- [ ] **Step 1: Extend the Xero API test fixture and write failing assertions**

Make the Xero test mock the following calls in order:

1. source resolver via `queryOne`;
2. live/current summary via `queryOne`;
3. investment header totals via `queryOne`;
4. invoice list via `queryRows`;
5. classified line rows via `queryRows`.

Assert the route:

```ts
expect(result.paymentStatus).toEqual({
  outstanding: 5432.1,
  openInvoiceCount: 3,
  overdueAmount: 5432.1,
  overdueCount: 3,
  dueNext7Amount: 0,
  dueNext7Count: 0,
  lastPaymentDate: '2026-08-04',
  financialYearCashPaid: 44033.39,
  financialYearCreditsApplied: 0
})
expect(result.investment).toMatchObject({
  period: 'financial-year',
  totalInvoiced: 3000,
  mediaAndSuppliers: 2000,
  agencyServices: 727.27,
  gst: 272.73,
  unclassifiedAndAdjustments: 0
})
```

Assert the summary SQL filters `financial_year_cash_paid_cents` and `financial_year_credits_cents` using 1 July boundaries and that the investment SQL is scoped by tenant and contact.

- [ ] **Step 2: Run the endpoint tests and verify RED**

Run:

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm vitest run test/server/api/portalXeroInvoices.test.ts test/server/api/portalInvoicesViews.test.ts
```

Expected: FAIL because the new payload fields and queries do not exist.

- [ ] **Step 3: Add period-aware Xero aggregation**

In `getXeroInvoices`, accept `period: InvestmentPeriod`. Use `investmentPeriodBounds()` to create parameterised predicates:

```sql
i.date >= $3::date AND i.date < $4::date
```

for bounded periods and no date predicate for all-time. Query header totals from `xero_invoices_cache` for `ACCREC` invoices in `AUTHORISED` or `PAID` status, then query lines by joining `xero_invoice_lines_cache` back to those scoped headers and `LEFT JOIN xero_accounts_cache` for account metadata.

Select only:

```sql
a.type AS account_type,
a.name AS account_name,
l.tracking_media,
l.line_ex_gst_cents
```

Pass these rows to `buildInvestmentBreakdown()`.

- [ ] **Step 4: Correct financial-year payment and credit calculations**

Add to the live Xero summary query:

```sql
COALESCE(SUM(amount_paid_cents) FILTER (
  WHERE status = 'PAID'
    AND fully_paid_on_date >= make_date(
      CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 7
        THEN EXTRACT(YEAR FROM CURRENT_DATE)::int
        ELSE EXTRACT(YEAR FROM CURRENT_DATE)::int - 1
      END, 7, 1)
), 0) AS financial_year_cash_paid_cents,
COALESCE(SUM(amount_credited_cents) FILTER (
  WHERE status = 'PAID'
    AND fully_paid_on_date >= make_date(
      CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 7
        THEN EXTRACT(YEAR FROM CURRENT_DATE)::int
        ELSE EXTRACT(YEAR FROM CURRENT_DATE)::int - 1
      END, 7, 1)
), 0) AS financial_year_credits_cents
```

Assemble `paymentStatus` from live summary values. Continue returning current `summary` fields unchanged.

- [ ] **Step 5: Add graceful allocation fallback**

Read the investment header totals first. If no cached line rows exist, pass those real header totals with `lines: []` so the full ex-GST amount appears as `Unclassified & adjustments` and `allocationAvailable` is false.

Wrap the investment aggregation separately from invoice-list and live-receivables work. If the line query fails after header totals succeed, log a message containing tenant/contact IDs but no invoice descriptions and still return the header totals as unclassified. If the header query itself fails, return:

```ts
buildInvestmentBreakdown({
  period,
  periodStart,
  periodEnd,
  totalInvoicedCents: 0,
  gstCents: 0,
  invoiceCount: 0,
  lines: []
})
```

Do not swallow failures from the invoice list or live receivables query.

- [ ] **Step 6: Preserve the internal-invoice fallback**

For clients without a Xero source, keep current list and summary behaviour. Add equivalent `paymentStatus` values from the internal summary and return a safe unavailable investment payload with zero values. Update `portalInvoicesViews.test.ts` to assert this compatibility path still works.

- [ ] **Step 7: Run endpoint tests and commit**

Run:

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm vitest run test/server/api/portalXeroInvoices.test.ts test/server/api/portalInvoicesViews.test.ts test/server/utils/portalInvoiceInvestment.test.ts
git diff --check
```

Expected: PASS.

Commit:

```bash
git add server/api/portal/invoices/index.get.ts test/server/api/portalXeroInvoices.test.ts test/server/api/portalInvoicesViews.test.ts
git commit -m "feat: expose portal investment breakdown"
```

---

### Task 3: Credits in Xero invoice detail

**Files:**
- Modify: `server/api/portal/invoices/[id].get.ts`
- Modify: `test/server/api/portalXeroInvoices.test.ts`

**Interfaces:**
- Consumes: `amount_credited_cents` from `xero_invoices_cache`.
- Produces: `invoice.amountCredited: number` for Xero invoice details and `0` for internal-invoice details.

- [ ] **Step 1: Write a failing credit-detail test**

Add `amount_credited_cents: '847000'` to a paid Xero invoice fixture and assert:

```ts
expect(result.invoice.amountPaid).toBe(0)
expect(result.invoice.amountCredited).toBe(8470)
expect(result.invoice.amountDue).toBe(0)
```

- [ ] **Step 2: Run the detail test and verify RED**

Run:

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm vitest run test/server/api/portalXeroInvoices.test.ts
```

Expected: FAIL because `amountCredited` is missing.

- [ ] **Step 3: Implement credit mapping**

Select `i.amount_credited_cents` in the Xero query and map it with `dollarsFromCents`. Add `amountCredited: 0` to the internal-invoice fallback contract so the UI has one stable shape.

- [ ] **Step 4: Run the detail tests and commit**

Run:

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm vitest run test/server/api/portalXeroInvoices.test.ts
git diff --check
```

Expected: PASS.

Commit:

```bash
git add server/api/portal/invoices/[id].get.ts test/server/api/portalXeroInvoices.test.ts
git commit -m "feat: show Xero credits in portal invoices"
```

---

### Task 4: Client-facing invoice and investment redesign

**Files:**
- Modify: `app/pages/portal/invoices.vue`
- Create: `test/app/portalInvoiceInvestmentPage.test.ts`

**Interfaces:**
- Consumes: Task 2 `paymentStatus` and `investment`; Task 3 `invoice.amountCredited`.
- Produces: responsive `Invoices & marketing investment` screen and period query `period=financial-year|last-90-days|all-time`.

- [ ] **Step 1: Write a failing source-contract page test**

Read `app/pages/portal/invoices.vue` and assert it contains:

```ts
expect(source).toContain('Invoices & marketing investment')
expect(source).toContain('Amount currently due')
expect(source).toContain('Payments applied this financial year')
expect(source).toContain('Your marketing investment')
expect(source).toContain('Media & external suppliers')
expect(source).toContain('Agency services')
expect(source).toContain('Unclassified & adjustments')
expect(source).toContain("USelect")
expect(source).toContain("period: investmentPeriod.value")
```

And it does not contain:

```ts
expect(source).not.toContain('Paid This Year')
expect(source).not.toContain('Commercial summary')
expect(source).not.toContain('Payment planning')
expect(source).not.toContain('Average paid invoice')
```

- [ ] **Step 2: Run the page test and verify RED**

Run:

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm vitest run test/app/portalInvoiceInvestmentPage.test.ts
```

Expected: FAIL on the new copy.

- [ ] **Step 3: Add period state without changing invoice tabs**

Define:

```ts
type InvestmentPeriod = 'financial-year' | 'last-90-days' | 'all-time'
const investmentPeriod = ref<InvestmentPeriod>('financial-year')
const investmentPeriodOptions = [
  { label: 'This financial year', value: 'financial-year' },
  { label: 'Last 90 days', value: 'last-90-days' },
  { label: 'All time', value: 'all-time' }
]
```

Include `period: investmentPeriod.value` in `invoiceQuery`. Preserve existing tab/view/status URL behaviour; the period is local presentation state and need not be written to the route.

- [ ] **Step 4: Replace the summary hierarchy**

Use `UCard`, `UIcon`, `UBadge`, and semantic Tailwind tokens to render:

1. Heading and supporting text.
2. A two-column payment-status card where `Amount currently due` receives the largest type and `Due in the next 7 days`, `Last payment`, and `Payments applied this financial year` are secondary facts.
3. An investment card with `USelect` period control, the explanatory disclosure, a labelled segmented composition bar, total invoiced including GST, category values, and channel rows.
4. The existing ageing section in compact form.
5. Existing tabs and invoice list.

Show the unclassified category only when non-zero. When `allocationAvailable` is false and `totalInvoiced > 0`, show:

```text
Detailed allocation is not available for these invoices yet.
```

Use muted/neutral colours for gross totals. Reserve success colour for actual paid status.

- [ ] **Step 5: Show credits in invoice detail**

After the paid row, render:

```vue
<div v-if="detailData.invoice.amountCredited > 0" class="flex justify-between text-primary">
  <span>Credits applied</span>
  <span>-{{ formatCurrency(detailData.invoice.amountCredited) }}</span>
</div>
```

- [ ] **Step 6: Run UI contract and portal tests**

Run:

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm vitest run test/app/portalInvoiceInvestmentPage.test.ts test/app/portalContentWidth.test.ts test/server/api/portalXeroInvoices.test.ts test/server/api/portalInvoicesViews.test.ts test/server/utils/portalInvoiceInvestment.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit the UI slice**

```bash
git add app/pages/portal/invoices.vue test/app/portalInvoiceInvestmentPage.test.ts
git commit -m "feat: clarify client marketing investment"
```

---

### Task 5: Deep review, production verification, and release

**Files:**
- Review all files changed by Tasks 1–4.
- Update tests only if review exposes a real defect.

**Interfaces:**
- Consumes: all previous tasks.
- Produces: reviewed, merged, and deployed production release.

- [ ] **Step 1: Reconcile against production South Morang data read-only**

Run a scoped query joining South Morang's `xero_invoices_cache`, `xero_invoice_lines_cache`, and `xero_accounts_cache`. Verify:

```text
outstanding = 5432.10
overdue invoices = 3
FY cash paid = 44033.39
all-time cash paid = 55990.39
all-time credits = 8470.00
total invoiced = media/suppliers + agency services + GST + unclassified/adjustments
```

- [ ] **Step 2: Complete mandatory pre-commit deep review**

Re-read every changed file end-to-end. Check server aliases, parameterised SQL, tenant/contact scoping, period boundaries, source-line classification precedence, currency conversion, negative/unknown reconciliation, duplicate UI, responsive layout, dark-mode semantic tokens, and absence of secrets.

- [ ] **Step 3: Run focused lint and tests**

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm eslint server/utils/portalInvoiceInvestment.ts server/api/portal/invoices/index.get.ts server/api/portal/invoices/[id].get.ts app/pages/portal/invoices.vue test/server/utils/portalInvoiceInvestment.test.ts test/server/api/portalXeroInvoices.test.ts test/server/api/portalInvoicesViews.test.ts test/app/portalInvoiceInvestmentPage.test.ts
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm vitest run test/server/utils/portalInvoiceInvestment.test.ts test/server/api/portalXeroInvoices.test.ts test/server/api/portalInvoicesViews.test.ts test/app/portalInvoiceInvestmentPage.test.ts test/app/portalContentWidth.test.ts
git diff --check origin/main...HEAD
```

Expected: all checks pass.

- [ ] **Step 4: Run release gates**

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm deploy:check
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm build
```

Expected: deploy target resolves to `agency-dashboard / main`; production build and worker-size guard pass.

- [ ] **Step 5: Push, open PR, and wait for CI**

```bash
git push -u origin feature/portal-investment-breakdown
gh pr create --base main --head feature/portal-investment-breakdown --title "feat: clarify portal marketing investment" --body-file /tmp/portal-investment-pr.md
gh pr checks --watch <PR_NUMBER>
```

The PR body must state the client-facing copy change, classification/reconciliation safety, South Morang evidence, tests, and rollback path.

- [ ] **Step 6: Merge and deploy through the guarded production command**

After CI passes:

```bash
gh pr merge <PR_NUMBER> --merge --delete-branch
git fetch origin main
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm deploy:production
```

Expected: Cloudflare deployment completes and returns an `agency-dashboard` deployment URL.

- [ ] **Step 7: Verify production read-only**

Confirm the protected production endpoint returns `401` without a client session, the deployment is active, and the production database still resolves South Morang to the correct Xero contact with the reconciled totals. Do not mutate production data.
