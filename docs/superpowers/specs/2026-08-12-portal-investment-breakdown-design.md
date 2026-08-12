# Client Portal Invoice Investment Breakdown

**Date:** 12 August 2026

**Status:** Approved for implementation

**Scope:** Client portal invoice overview and its Xero-backed summary API

## Problem

The client portal currently gives large visual emphasis to `Paid This Year` and `Total Billed`. Those figures combine agency services with media, platform, production, and other third-party charges. A client can reasonably read the page as saying that the agency retained the entire amount as revenue.

The page also mixes payment status, receivables ageing, commercial history, and payment-planning metrics across three similarly weighted sections. The result is accurate at invoice-header level but does not explain where the client's marketing investment was allocated.

## Design Objective

Make the page answer two questions in this order:

1. **What requires the client's attention now?**
2. **How was the client's invoiced marketing investment allocated?**

The page must explicitly distinguish agency services from media and third-party charges. It must never imply that an unclassified invoice amount is agency revenue.

## Research Basis

- AASB 15 distinguishes gross consideration earned as a principal from fees or commissions earned as an agent and requires useful disaggregation where materially different categories would otherwise be obscured.
- Advertising-industry transparency guidance recommends itemising media costs and agency compensation and making principal-versus-agent arrangements clear.
- Xero supports account codes and tracking categories on transaction lines. XeroFlow already caches invoice-line account codes, account metadata, media tracking options, tax, and invoice headers.

This screen is an operational client view, not a statutory revenue statement. Its labels describe invoice composition and payment status. The agency's formal principal-versus-agent accounting policy remains a contract and accounting judgement outside this feature.

## Information Architecture

### 1. Page header

Title: **Invoices & marketing investment**

Supporting copy: **See what is due and how your invoiced investment is allocated.**

### 2. Payment status

Replace the four equal summary cards and the separate `Payment planning` section with one compact payment-status area.

The primary card is visually dominant:

- **Amount currently due**
- Outstanding amount
- Open-invoice count
- Overdue amount and count when applicable

Three secondary facts sit beside it:

- **Due in the next 7 days** — amount and count
- **Last payment** — date
- **Payments applied this financial year** — cash payments only, filtered by `fully_paid_on_date`

If Xero credits have settled invoices during the selected history, show a small supporting line such as `Includes $8,470.00 settled by Xero credits`. Credits must not be presented as cash paid.

### 3. Marketing investment breakdown

Section title: **Your marketing investment**

Supporting copy: **Charges associated with media platforms and external delivery are shown separately from agency services.**

The section contains a local period selector:

- **This financial year** — default, Australian financial year from 1 July to 30 June
- **Last 90 days**
- **All time**

Changing this selector affects only the investment breakdown. It does not change the live amount due, overdue count, receivables ageing, or the explicitly financial-year payment metric.

Display a compact composition visual and exact values for:

- **Total invoiced, including GST**
- **Media & external suppliers**
- **Agency services**
- **GST**
- **Unclassified & adjustments**, only when non-zero

The media/supplier category can expand into channel rows using Xero's `tracking_media` value, including Meta, Google, YouTube, Carsales, displays, printing, SMS, and `Other suppliers`. These values describe how invoiced charges were allocated; they do not claim to disclose the agency's profit or the exact settlement of confidential supplier bills.

Do not use a large green number for total payments or total invoiced. Green remains reserved for successful payment status, not revenue or spend magnitude.

### 4. Receivables ageing

Keep ageing because it helps the client understand the outstanding balance, but reduce it to a compact horizontal distribution directly above the invoice tabs. The buckets remain:

- Current
- 1–30 days overdue
- 31–60 days overdue
- 60+ days overdue

Each bucket shows amount and invoice count and filters the invoice list when selected.

### 5. Invoice list and detail

Keep the existing current, overdue, billing-history, and all tabs. Keep invoice totals as the legally billed amounts. Invoice detail continues to expose the original Xero line descriptions, tax, amount paid, credits where present, and balance due.

Remove the existing `Commercial summary` and `Payment planning` cards. Their useful information is consolidated into payment status and the investment breakdown; `Average paid invoice`, `Recent billing throughput`, and `Balance at risk` are not client-actionable enough to retain.

## Classification Rules

Classification operates on cached Xero sales-invoice (`ACCREC`) lines and joins `xero_accounts_cache` by tenant and account code.

Rules are applied in this order:

1. **Media & external suppliers**
   - Xero account type `DIRECTCOSTS`; or
   - account names explicitly representing media placement or reimbursed external costs, initially including `Sales - Media`; or
   - an explicitly recognised pass-through tracking option where account metadata is incomplete.
2. **Agency services**
   - sales/revenue accounts representing strategy, creative production, digital-advertising management, social-media services, email services, websites, hosting, and similar agency-delivered work.
3. **Unclassified & adjustments**
   - missing account metadata;
   - an account whose purpose is ambiguous;
   - rounding or header-to-line reconciliation differences.

Tracking values provide the channel sub-breakdown but do not, by themselves, override a clearly agency-service account. This prevents a line such as `Meta strategy and optimisation` from being mistaken for money paid to Meta merely because it has a Meta tracking value.

The classifier must be a small, deterministic server utility with unit tests. Initial rules are grounded in the synced Xero chart of accounts, not invoice-description keyword guesses. Future tenant-configurable overrides are intentionally out of scope.

## Calculation Contracts

### Live receivables

Live receivables always use all current `AUTHORISED` sales invoices for the linked client:

`amount currently due = sum(amount_due_cents)`

Overdue and ageing continue to use the invoice due date relative to the database current date.

### Investment composition

For `PAID` and `AUTHORISED` sales invoices whose invoice date falls in the selected period:

`classified ex-GST lines + GST + unclassified/adjustments = total invoiced`

Invoice headers remain authoritative for total invoiced. Line totals provide the allocation. Any difference between header and classified line totals is reported as `Unclassified & adjustments`; it is never assigned to agency services.

### Settlement reconciliation

For the same invoice population:

`cash paid + credits applied + outstanding + settlement adjustments = total invoiced`

This is separate from investment composition. A credit settles an invoice but does not change what the original invoice contained. Any exceptional Xero settlement difference is labelled as an adjustment rather than being folded into cash payments.

### Current financial-year payments

`payments applied this financial year = sum(amount_paid_cents)` for paid invoices whose `fully_paid_on_date` is in the current Australian financial year.

The label must never use an all-time value.

## API Shape

Keep the existing invoice-list response compatible and add explicit summary groups:

```ts
{
  invoices: PortalInvoice[],
  summary: { /* existing compatibility fields */ },
  paymentStatus: {
    outstanding: number,
    openInvoiceCount: number,
    overdueAmount: number,
    overdueCount: number,
    dueNext7Amount: number,
    dueNext7Count: number,
    lastPaymentDate: string | null,
    financialYearCashPaid: number,
    financialYearCreditsApplied: number
  },
  investment: {
    period: 'financial-year' | 'last-90-days' | 'all-time',
    periodStart: string | null,
    periodEnd: string | null,
    totalInvoiced: number,
    mediaAndSuppliers: number,
    agencyServices: number,
    gst: number,
    unclassifiedAndAdjustments: number,
    channels: Array<{ name: string, amount: number }>
  }
}
```

The API accepts `period=financial-year|last-90-days|all-time`. Invalid values fall back to `financial-year`.

## Empty, Partial, and Error States

- If invoice headers exist but line details are unavailable, show total invoiced with `Detailed allocation is not available for these invoices yet`; place the unresolved amount in `Unclassified & adjustments`.
- If a line cannot be classified, expose it as unclassified and continue rendering.
- If no invoices fall in the selected period, show a zero-state rather than carrying values from another period.
- A failed investment aggregation must not hide the live amount due or invoice list. The API returns a safe empty investment summary and logs the aggregation failure with tenant and client identifiers but no sensitive invoice descriptions.
- Currency remains AUD for this release, matching the existing portal formatter and linked Xero organisation.

## Accessibility and Responsive Behaviour

- Use Nuxt UI v4 components and semantic colours.
- Do not rely on colour alone; every composition segment has a text label and amount.
- Maintain keyboard-accessible period controls, ageing filters, tabs, invoice rows, and detail slideover.
- On narrow screens, payment facts and investment categories stack in one column. The composition visual remains readable without horizontal scrolling.
- Preserve dark-mode semantic tokens.

## Testing and Verification

Implementation follows test-driven development.

1. Unit-test classification precedence, account-type rules, ambiguous lines, channel grouping, and reconciliation fallback.
2. API-test each period, Australian financial-year boundaries, cash-versus-credit settlement, current receivables remaining unfiltered, and missing line data.
3. Component-test the approved labels and verify that `Paid This Year`, `Total Billed`, `Commercial summary`, and `Payment planning` no longer render.
4. Verify the South Morang fixture reconciles:
   - total billed equals the sum of investment categories and GST;
   - cash paid and credits are distinct;
   - outstanding and ageing remain unchanged.
5. Run targeted tests, lint on changed files, the production build, deployment guard, and the repository's pre-commit deep review.

## Non-Goals

- Determining or changing the agency's statutory principal-versus-agent accounting policy.
- Calculating agency profit or margin for the client.
- Exposing supplier bills, internal costs, mark-ups, rebates, or confidential commercial terms.
- Adding a tenant-facing classification administration screen in this release.
- Changing Xero invoices or accounting records.

## Success Criteria

- A client cannot reasonably interpret the largest historical invoice number as agency earnings.
- Agency services are explicitly shown separately from media and supplier charges.
- All displayed amounts reconcile, including cash payments, Xero credits, GST, and outstanding balances.
- Unknown data is visible as unclassified rather than attributed to the agency.
- The live payment action remains the first and most prominent information on the page.
