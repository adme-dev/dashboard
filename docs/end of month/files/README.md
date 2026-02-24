# ADME Invoicing Config Modules

## What This Is

Pre-built TypeScript configuration modules for ADME Advertising's invoicing automation. These replace a 132-sheet Excel workbook (`OCTOBER_2024_Invoicingcopy_for_Rob.xlsx`) with programmatic data that can be integrated into the existing dashboard.

**Drop this folder into the dashboard project** (e.g., `src/lib/invoicing/`) and import as needed.

## Files

| File | Purpose | Key Exports |
|------|---------|-------------|
| `coa-map.ts` | Maps job descriptions to Xero Chart of Account codes via keyword matching | `mapToAccount()`, `mapToAccountWithConfidence()` |
| `gst-rules.ts` | Classifies GST treatment per ATO rules — the critical BAS compliance layer | `classifyGST()`, `validateGSTClassification()`, `calculateBASSummary()` |
| `xero-clients.ts` | All 161 Xero contacts with codes, dealer groups, payment terms, fuzzy matching | `matchClient()`, `XERO_CLIENTS`, `FOURTEEN_DAY_CLIENTS` |
| `tracking-categories.ts` | 62 media tracking dropdown categories mapped to COA codes | `TRACKING_CATEGORIES`, `getTrackingCategory()` |
| `invoice-config.ts` | Date rules, invoice numbering, CSV/API formats, Monday.com + Xero settings | `XERO_CONFIG`, `MONDAY_CONFIG`, `EOM_CHECKLIST`, `SANITY_CHECKS` |
| `index.ts` | Barrel export — import everything from one place | All of the above |

## Critical Business Rules

### GST Classification (BAS Compliance)
This is the **#1 source of errors** in agency accounting. The engine auto-classifies:

- **Facebook/Meta/Instagram ads** → `GST Free Expenses` (foreign entity, no AU GST)
- **Google/YouTube/PMax ads** → `GST on Expenses` (Google AU registered since 2016)
- **Microsoft/LinkedIn/Spotify** → `GST on Expenses` (AU-registered platforms)
- **All ADME service fees** → `GST on Income` (10% GST charged to client)

### Chart of Accounts (9 codes)
- **205** Printing (100% margin)
- **210** Production (100% margin) — *default catch-all*
- **215** Marketing (100% margin)
- **216** Digital Advertising (100% margin)
- **217** Social Media (100% margin)
- **219** Video Production (100% margin)
- **220** Media (10% margin — bill at cost × 1.10)
- **225** Website (100% margin)
- **330** Other/PPC (0% margin — passthrough, no markup)

### Payment Terms
- Standard: **7 days** from invoice date
- Northern Motor Group entities: **14 days** (11 entities listed in `FOURTEEN_DAY_CLIENTS`)

### Invoice Rules
- InvoiceDate = last day of billing month
- All invoices created as **DRAFT** — Rob approves before sending
- Invoice numbers are plain sequential integers (e.g., 18401)
- Multiple line items per client share the same InvoiceNumber = one invoice in Xero
- Quantity is always 1
- Tracking: `TrackingName1=Media` (62 categories), `TrackingName2=Client` (legal entity name)

## Integration Points

### Existing Dashboard
The dashboard at `/Users/paulgiurin/Documents/Projects/dashboard` already has:
- Xero OAuth integration (reuse the token management)
- Agency boards (Monday.com connection)
- Ad performance views

Add an **Invoicing** tab that uses these modules for:
1. EOM invoice generation from Monday.com data
2. Mid-month billing totals (Kellie's requirement)
3. GST audit view with auto-flagging
4. Invoice queue for Rob's approval

### Monday.com
Board ID: `3199166934` (Jobs / Proof-to-be-Billed)
Query via GraphQL API for items with status = Done/Proof in the target month.

### Xero API
Base URL: `https://api.xero.com/api.xro/2.0`
- `GET /Invoices?Type=ACCREC&order=InvoiceNumber+DESC&pageSize=1` — last invoice #
- `GET /Contacts?IsCustomer=true` — validate client names
- `POST /Invoices` — batch create (up to 50 per request, Status: DRAFT)

### Budget Hawk
Located at `/Users/paulgiurin/Downloads/auto-meta-budget-hawk-main`
Provides actual Facebook/Google ad spend for COA 330 passthrough amounts.

## Usage Example

```typescript
import {
  mapToAccount,
  classifyGST,
  matchClient,
  getPaymentTermDays,
  calculateBillAmount,
} from './invoicing'

// A job comes in from Monday.com
const job = {
  client: 'Northern KIA',
  description: 'Facebook & Instagram PPC Payable to Meta',
  amount: 5000,
}

// 1. Map to COA
const coa = mapToAccount(job.description)
// → { code: '330', tracking: 'Facebook Ads', taxType: 'GST Free Expenses', margin: 0 }

// 2. Classify GST
const gst = classifyGST(job.description, coa.code)
// → { taxType: 'GST Free Expenses', xeroCode: 'BASEXCLUDED', gstRate: 0, ... }

// 3. Match client to Xero
const client = matchClient(job.client)
// → { name: 'Northern KIA', code: 'NMG10' }

// 4. Payment terms
const terms = getPaymentTermDays(client.name)
// → 14 (Northern Group)

// 5. Calculate bill amount
const billAmount = calculateBillAmount(job.amount, coa.code)
// → 5000 (passthrough, no markup)
```

## Data Sources

All data extracted from ADME's actual working files:
- `OCTOBER_2024_Invoicingcopy_for_Rob.xlsx` — 132 client sheets, 67 columns
- `Dropdown_menu_for_Media_Tracking.xlsx` — 62 tracking categories
- `Inv_Descriptionscopy_for_Rob.xlsx` — 1069 service descriptions
- `Customers_Xero.csv` — 161 Xero contacts with account codes
- `SalesInvoiceTemplate.csv` — 27-column Xero import template
- Kellie White's email (Oct 8 2024) — COA codes, GST rules, requirements
