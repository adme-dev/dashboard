# PRD: End-of-Month Invoicing & Social Media Integration

**Project**: ADME Dashboard — EOM Invoicing Automation
**Author**: Claude Code (from Kellie White's requirements + existing docs)
**Date**: 2026-02-24
**Status**: Draft
**Stakeholders**: Rob (Agency Owner/Approver), Kellie (Admin/Accounts), Hannah (Data Entry), Clara (EOM Review)

---

## 1. Problem Statement

ADME Advertising currently manages end-of-month invoicing through a 132-sheet Excel workbook with 67 columns per sheet. This process involves 4+ people, dual data entry (Monday.com AND Excel), manual GST classification, manual invoice numbering, and manual CSV generation for Xero import. The process is error-prone (particularly GST classification — the #1 source of BAS audit risk in agency accounting), unscalable, and provides no mid-month billing visibility.

### Current Pain Points

| Pain Point | Severity | Impact |
|---|---|---|
| Dual entry (Monday + Excel) | Critical | Double the work, data drift between systems |
| Manual GST classification | Critical | Facebook (GST-free) vs Google (GST on Expenses) manually selected per line — BAS audit risk |
| 132 client sheets × 67 columns | High | Impossible to scale, no overview |
| Manual invoice numbering | High | Sequential assignment across all clients at EOM |
| No mid-month visibility | High | Totals only available after full EOM process |
| Contact name mismatches | Medium | Excel names must exactly match 161 Xero legal entities |
| PPC budget vs actual reconciliation | Medium | Manual comparison of budgets to actual Meta/Google spend |

### Goal

Replace the Excel workbook with an automated pipeline: **Monday.com → Invoice Engine → Xero (DRAFT)**. Eliminate dual entry. Auto-classify GST. Provide mid-month visibility. Connect actual Meta and Google ad spend for PPC passthrough invoicing.

---

## 2. Existing Infrastructure (What We Have)

| Component | Status | Location |
|---|---|---|
| Xero OAuth + auto-refresh | Complete | `server/utils/xeroClient.ts`, `server/api/xero/` |
| Xero read APIs (invoices, contacts, reports) | Complete | `server/api/xero/invoices.get.ts`, `contacts.get.ts` |
| Monday.com GraphQL client + sync | Complete | `server/utils/mondayClient.ts`, `server/api/agency/monday/` |
| Standalone invoice CRUD | Complete | `server/api/agency/invoices/` (NOT connected to Xero) |
| Board system (groups, columns, views) | Complete | `server/api/agency/boards/` |
| Email + notifications | Complete | `server/utils/email.ts`, `server/api/notifications/` |
| Board automations | Complete | `server/utils/automationEngine.ts` |
| Real-time SSE events | Complete | `server/api/agency/boards/[id]/events.get.ts` |
| Pre-built invoicing config modules | Ready to integrate | `docs/end of month/files/*.ts` |

---

## 3. Architecture Overview

```
Monday.com (Jobs Board #3199166934)     Meta Ads API     Google Ads API
         │ GraphQL                       │ REST v21.0     │ REST v19
         └──────────────┬────────────────┘────────────────┘
                        ▼
              ┌─────────────────────┐
              │   EOM Invoice Engine │
              │                     │
              │  • COA mapping      │
              │  • GST classifier   │
              │  • Client matcher   │
              │  • Invoice numbering│
              │  • Margin calc      │
              │  • Sanity checks    │
              └─────────┬───────────┘
                        ▼
              ┌─────────────────────┐
              │  Dashboard Preview  │──→ Manual review + corrections
              │  (EOM UI)           │
              └─────────┬───────────┘
                        ▼
              ┌─────────────────────┐
              │  Xero API v2.0     │
              │  POST /Invoices    │──→ DRAFT status (Rob reviews & authorises)
              │  Batch ≤50/request │
              └─────────────────────┘
```

---

## 4. Business Rules (Non-Negotiable)

### 4.1 GST Classification Rules (ATO-Compliant)

| Platform | COA | TaxType | Xero Code | Reason |
|---|---|---|---|---|
| Facebook / Meta / Instagram ads | 330 | GST Free Expenses | BASEXCLUDED | Foreign entity, no AU GST |
| Google / YouTube / PMax ads | 330 | GST on Expenses | INPUT | Google AU registered since 2016 |
| Microsoft / LinkedIn / Spotify ads | 330 | GST on Expenses | INPUT | AU-registered platforms |
| Campaign Monitor (eDM sends) | 330 | GST on Expenses | INPUT | AU-registered |
| All ADME service fees | 205-225 | GST on Income | OUTPUT | 10% GST on taxable supplies |
| Media bookings (radio, TV, OOH) | 220 | GST on Income | OUTPUT | 10% GST |

### 4.2 Chart of Accounts

| Code | Category | Margin | Billing Rule |
|---|---|---|---|
| 205 | Printing | 100% | Amount = fee |
| 210 | Production | 100% | Amount = fee (default catch-all) |
| 215 | Marketing | 100% | Amount = fee |
| 216 | Digital Advertising | 100% | Amount = fee (management fees, not ad spend) |
| 217 | Social Media | 100% | Amount = fee |
| 219 | Video Production | 100% | Amount = fee |
| 220 | Media | 10% | Amount = cost × 1.10 |
| 225 | Website | 100% | Amount = fee |
| 330 | Other (PPC) | 0% | Amount = exact spend (passthrough) |

### 4.3 Invoice Rules

- InvoiceDate = last day of billing month
- DueDate = InvoiceDate + 7 days (standard) or + 14 days (Northern Motor Group entities)
- All invoices created as **DRAFT** — never auto-authorise
- Invoice numbers: plain sequential integers (e.g. 18401), no prefix
- Multiple line items per client share same InvoiceNumber = one invoice in Xero
- Quantity = always 1
- Tracking: TrackingName1=Media (62 categories), TrackingName2=Client (legal entity name)
- Currency = AUD, BrandingTheme = ADME

### 4.4 Payment Terms

- Standard: **7 days** from invoice date
- Northern Motor Group (11 entities): **14 days** from invoice date
  - Northern Motor Group, Northern Isuzu Ute, Northern JAC Motors, Northern Jeep, Northern KIA, Northern MG, Northern Motor Group Service (415), Northern Nissan, Northern RAM, Northern KGM Ssangyong, Northern Used Cars

---

## 5. Phases, Tasks & Subtasks

---

### Phase 1: Invoicing Data Layer (Foundation)

**Goal**: Move pre-built config modules into the project, create DB schema, expose reference data APIs.
**Depends on**: Nothing (foundation)
**Estimated scope**: ~15 files

#### Task 1.1: Integrate Invoicing Config Modules
> Copy and adapt the pre-built TypeScript modules into the server.

- [ ] **1.1.1** Create `server/utils/invoicing/` directory
- [ ] **1.1.2** Copy `coa-map.ts` — COA keyword mapper (description → account code + GST type + tracking category). Adapt imports for Nuxt server utils conventions.
- [ ] **1.1.3** Copy `gst-rules.ts` — GST classification engine with `classifyGST()`, `validateGSTClassification()`, `calculateBASSummary()`. This is the critical BAS compliance layer.
- [ ] **1.1.4** Copy `xero-clients.ts` — 161 Xero contacts with fuzzy matching (`matchClient()`), dealer groups, payment terms.
- [ ] **1.1.5** Copy `tracking-categories.ts` — 62 media tracking categories mapped to COA codes.
- [ ] **1.1.6** Copy `invoice-config.ts` — Date rules, numbering, CSV format, Xero API batch config, EOM checklist, sanity checks.
- [ ] **1.1.7** Create `index.ts` barrel export for all modules.
- [ ] **1.1.8** Verify all modules compile with existing project TS config.

**Acceptance criteria**: All 6 modules importable from `server/utils/invoicing`. `mapToAccount('Facebook & Instagram PPC Payable to Meta')` returns `{ code: '330', taxType: 'GST Free Expenses' }`.

#### Task 1.2: Database Migration — EOM Tables
> Create the database schema for tracking EOM generation runs and line items.

- [ ] **1.2.1** Create migration `006-eom-invoicing.sql`:
  ```sql
  -- EOM generation runs
  CREATE TABLE eom_runs (
    id SERIAL PRIMARY KEY,
    agency_id INTEGER REFERENCES agencies(id),
    month INTEGER NOT NULL,        -- 1-12
    year INTEGER NOT NULL,
    status TEXT DEFAULT 'draft',    -- draft | generating | review | pushed | complete | failed
    total_ex_gst DECIMAL(12,2),
    total_gst DECIMAL(12,2),
    invoice_count INTEGER DEFAULT 0,
    line_item_count INTEGER DEFAULT 0,
    flagged_count INTEGER DEFAULT 0,
    first_invoice_number INTEGER,
    last_invoice_number INTEGER,
    xero_batch_id TEXT,
    notes TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(agency_id, month, year)
  );

  -- Individual invoice line items
  CREATE TABLE eom_line_items (
    id SERIAL PRIMARY KEY,
    run_id INTEGER REFERENCES eom_runs(id) ON DELETE CASCADE,
    client_name TEXT NOT NULL,             -- Xero contact name (matched)
    client_code TEXT,                       -- Xero account code
    monday_item_id TEXT,                   -- source Monday item ID
    description TEXT NOT NULL,
    quantity INTEGER DEFAULT 1,
    unit_amount DECIMAL(12,2) NOT NULL,    -- ex-GST
    account_code TEXT NOT NULL,            -- COA code (205-330)
    tax_type TEXT NOT NULL,                -- GST on Income / GST Free Expenses / GST on Expenses
    tracking_option1 TEXT,                 -- media category
    invoice_number INTEGER,
    source TEXT DEFAULT 'monday',          -- monday | meta_ads | google_ads | manual
    confidence TEXT DEFAULT 'high',        -- high | medium | low
    matched_keyword TEXT,                  -- which keyword triggered the COA mapping
    review_status TEXT DEFAULT 'auto',     -- auto | reviewed | flagged | corrected
    review_notes TEXT,
    original_values JSONB,                 -- snapshot before manual corrections
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  -- Add Xero sync fields to existing invoices table
  ALTER TABLE invoices ADD COLUMN IF NOT EXISTS xero_invoice_id TEXT;
  ALTER TABLE invoices ADD COLUMN IF NOT EXISTS xero_status TEXT;
  ALTER TABLE invoices ADD COLUMN IF NOT EXISTS eom_run_id INTEGER REFERENCES eom_runs(id);
  ```
- [ ] **1.2.2** Run migration against dev database.
- [ ] **1.2.3** Add TypeScript types for `EomRun` and `EomLineItem` to `app/types/index.ts`.

**Acceptance criteria**: Tables created, types available, `eom_runs` enforces unique month/year per agency.

#### Task 1.3: Reference Data API Endpoints
> Expose the invoicing config data for the frontend.

- [ ] **1.3.1** Create `GET /api/agency/invoicing/coa-codes` — returns all 9 COA codes with categories, margins, descriptions.
- [ ] **1.3.2** Create `GET /api/agency/invoicing/tracking-categories` — returns all 62 tracking categories with COA mapping.
- [ ] **1.3.3** Create `GET /api/agency/invoicing/clients` — returns 161 Xero clients with codes and dealer groups.
- [ ] **1.3.4** Create `POST /api/agency/invoicing/match-client` — fuzzy match a Monday client name to a Xero contact. Body: `{ name: string }`. Returns best match + confidence.
- [ ] **1.3.5** Create `POST /api/agency/invoicing/classify` — classify a description. Body: `{ description: string }`. Returns COA code, GST type, tracking category, confidence.

**Acceptance criteria**: All 5 endpoints return correct data behind `requireAuth()`. Classification endpoint correctly identifies Facebook as GST-free and Google as GST-on-expenses.

---

### Phase 2: Meta (Facebook/Instagram) Ads Integration

**Goal**: Connect to Meta Marketing API to pull actual PPC spend per client per month.
**Depends on**: Phase 1 (for ad_spend_cache schema and COA mapping)
**Can run in parallel with**: Phase 3

#### Task 2.1: Social Connections Database Schema
> Shared schema for all social media platform connections.

- [ ] **2.1.1** Create migration `007-social-connections.sql`:
  ```sql
  CREATE TABLE social_connections (
    id SERIAL PRIMARY KEY,
    agency_id INTEGER REFERENCES agencies(id),
    platform TEXT NOT NULL,             -- meta | google | linkedin | tiktok
    account_id TEXT NOT NULL,           -- platform-specific account ID
    account_name TEXT,
    access_token TEXT,                  -- encrypted
    refresh_token TEXT,                 -- encrypted
    token_expires_at TIMESTAMPTZ,
    scopes TEXT[],
    status TEXT DEFAULT 'active',       -- active | expired | disconnected
    metadata JSONB,                     -- platform-specific config
    connected_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(agency_id, platform, account_id)
  );

  CREATE TABLE ad_spend_cache (
    id SERIAL PRIMARY KEY,
    connection_id INTEGER REFERENCES social_connections(id),
    platform TEXT NOT NULL,
    account_id TEXT NOT NULL,
    client_name TEXT,                   -- mapped Xero client name
    campaign_id TEXT,
    campaign_name TEXT,
    date DATE NOT NULL,
    spend DECIMAL(12,2) NOT NULL,       -- actual spend in AUD
    impressions INTEGER,
    clicks INTEGER,
    conversions INTEGER,
    currency TEXT DEFAULT 'AUD',
    cached_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(platform, account_id, campaign_id, date)
  );

  -- Map ad accounts to Xero clients
  CREATE TABLE ad_account_client_map (
    id SERIAL PRIMARY KEY,
    connection_id INTEGER REFERENCES social_connections(id),
    campaign_id TEXT,                   -- optional: map at campaign level
    campaign_name_pattern TEXT,         -- optional: regex pattern for campaign names
    xero_client_name TEXT NOT NULL,     -- exact Xero contact name
    xero_client_code TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  ```
- [ ] **2.1.2** Run migration.
- [ ] **2.1.3** Add TypeScript types for `SocialConnection`, `AdSpendCache`, `AdAccountClientMap`.

#### Task 2.2: Meta Ads API Client
> Server-side client for Meta Marketing API v21.0.

- [ ] **2.2.1** Create `server/utils/metaAdsClient.ts`:
  - `getAdAccountInfo(accountId, token)` — account name, status, currency, balance
  - `listCampaigns(accountId, token)` — all campaigns with status and budgets
  - `getAccountInsights(accountId, token, dateRange)` — aggregated spend/impressions/clicks
  - `getCampaignInsights(campaignId, token, dateRange)` — per-campaign breakdown
  - `getMonthlySpendByAccount(accountId, token, month, year)` — total spend for a month
  - Rate limit handling (200 calls/hour for ads insights)
  - Error handling for expired tokens (notify user to reconnect)
- [ ] **2.2.2** Create `server/utils/metaOAuth.ts`:
  - `getAuthUrl(redirectUri)` — generate Meta OAuth URL with ads_management scope
  - `exchangeCode(code)` — exchange auth code for access token
  - `refreshLongLivedToken(token)` — extend to 60-day token
  - Token storage in `social_connections` table
- [ ] **2.2.3** Handle Meta's monetary format (values in cents — divide by 100).

**Acceptance criteria**: Can authenticate via OAuth, retrieve ad account info, and pull monthly spend data. Amounts correctly converted from cents to dollars.

#### Task 2.3: Meta Ads API Endpoints
> REST endpoints for the dashboard frontend.

- [ ] **2.3.1** Create `POST /api/agency/social/meta/connect` — initiate OAuth flow, return redirect URL.
- [ ] **2.3.2** Create `GET /api/agency/social/meta/callback` — handle OAuth callback, store tokens.
- [ ] **2.3.3** Create `GET /api/agency/social/meta/accounts` — list connected ad accounts.
- [ ] **2.3.4** Create `GET /api/agency/social/meta/spend?month=X&year=Y` — monthly spend by account/campaign.
- [ ] **2.3.5** Create `POST /api/agency/social/meta/sync-spend` — pull latest spend data into cache.
- [ ] **2.3.6** Create `GET /api/agency/social/meta/insights?accountId=X&dateRange=Y` — campaign performance.
- [ ] **2.3.7** Create `POST /api/agency/social/meta/map-client` — map an ad account/campaign to a Xero client.
- [ ] **2.3.8** Create `DELETE /api/agency/social/meta/disconnect` — revoke and remove connection.

**Acceptance criteria**: Full OAuth flow works. Spend data cached in `ad_spend_cache`. Each cached record has the correct `client_name` mapped via `ad_account_client_map`.

---

### Phase 3: Google Ads Integration

**Goal**: Connect to Google Ads API to pull actual PPC spend per client per month.
**Depends on**: Phase 1 (schema), Task 2.1 (shared social_connections table)
**Can run in parallel with**: Phase 2

#### Task 3.1: Google Ads API Client
> Server-side client for Google Ads API v19.

- [ ] **3.1.1** Create `server/utils/googleAdsClient.ts`:
  - `listAccessibleCustomers(token)` — list all MCC child accounts
  - `getCustomerInfo(customerId, token)` — account name, currency, status
  - `getCampaigns(customerId, token)` — all campaigns with status and budgets
  - `getMonthlySpend(customerId, token, month, year)` — total spend for a month
  - `getCampaignMetrics(customerId, token, dateRange)` — per-campaign breakdown
  - Use developer token from env (`GOOGLE_DEVELOPER_TOKEN`)
  - GAQL query builder for metrics (impressions, clicks, cost_micros, conversions)
  - Rate limit handling
  - Convert `cost_micros` to AUD (divide by 1,000,000)
- [ ] **3.1.2** Extend existing Google OAuth (`server/utils/googleOAuth.ts` or similar):
  - Add `https://www.googleapis.com/auth/adwords` scope
  - Token storage in `social_connections` table
  - Refresh token flow

**Acceptance criteria**: Can authenticate, list customer accounts, and pull monthly spend. Amounts correctly converted from micros to dollars.

#### Task 3.2: Google Ads API Endpoints
> REST endpoints for the dashboard frontend.

- [ ] **3.2.1** Create `POST /api/agency/social/google/connect` — initiate OAuth with ads scope.
- [ ] **3.2.2** Create `GET /api/agency/social/google/callback` — handle callback, store tokens.
- [ ] **3.2.3** Create `GET /api/agency/social/google/accounts` — list connected customer IDs.
- [ ] **3.2.4** Create `GET /api/agency/social/google/spend?month=X&year=Y` — monthly spend by customer/campaign.
- [ ] **3.2.5** Create `POST /api/agency/social/google/sync-spend` — pull latest spend into cache.
- [ ] **3.2.6** Create `GET /api/agency/social/google/insights?customerId=X&dateRange=Y` — campaign performance.
- [ ] **3.2.7** Create `POST /api/agency/social/google/map-client` — map a customer ID/campaign to a Xero client.
- [ ] **3.2.8** Create `DELETE /api/agency/social/google/disconnect` — revoke and remove connection.

**Acceptance criteria**: Full OAuth flow works. Spend data cached with correct Xero client mapping. Google spend correctly tagged as `GST on Expenses`.

---

### Phase 4: EOM Invoice Generation Engine

**Goal**: The core automation — pull Monday jobs + PPC spend, apply business rules, produce invoice line items ready for Xero.
**Depends on**: Phases 1, 2, 3

#### Task 4.1: EOM Engine Core
> Server-side engine that orchestrates the full generation workflow.

- [ ] **4.1.1** Create `server/utils/eomEngine.ts` with main function `generateEomInvoices(agencyId, month, year)`:
  - Step 1: Create `eom_runs` record with status `generating`
  - Step 2: Query Xero for last invoice number (`GET /Invoices?Type=ACCREC&order=InvoiceNumber+DESC&pageSize=1`)
  - Step 3: Pull completed jobs from Monday (status = Done/Proof to be Billed, filtered by target month)
  - Step 4: Pull cached Meta spend from `ad_spend_cache` for the month
  - Step 5: Pull cached Google spend from `ad_spend_cache` for the month
  - Step 6: For each Monday job:
    - `mapToAccountWithConfidence()` → COA code, tracking, confidence
    - `classifyGST()` → tax type, xero code, risk level
    - `matchClient()` → Xero legal entity name
    - `calculateBillAmount()` → apply 10% margin (COA 220) or passthrough (330)
    - `getPaymentTermDays()` → 7 or 14 days
    - Store in `eom_line_items`
  - Step 7: For each PPC spend line (Meta):
    - COA = 330, TaxType = GST Free Expenses
    - Client from `ad_account_client_map`
    - Amount = exact spend (passthrough)
  - Step 8: For each PPC spend line (Google):
    - COA = 330, TaxType = GST on Expenses
    - Client from `ad_account_client_map`
    - Amount = exact spend (passthrough)
  - Step 9: Assign sequential invoice numbers (group by client → one invoice number per client)
  - Step 10: Run sanity checks (from `SANITY_CHECKS` config)
  - Step 11: Update `eom_runs` with totals, counts, status = `review`
- [ ] **4.1.2** Create `server/utils/eomValidation.ts`:
  - `runSanityChecks(runId)` → validate totals against expected ranges ($200-350K)
  - `validateGSTBreakdown(runId)` → check GST type distribution (~65% Income, ~15% Free, ~20% Expenses)
  - `validateClientNames(runId)` → check all client names match Xero contacts
  - `flagLargeInvoices(runId)` → flag any single invoice > $100K
  - `flagLowConfidence(runId)` → flag items with confidence = 'low'
  - `validateCOA330Platform(runId)` → flag any COA 330 items where platform couldn't be detected
- [ ] **4.1.3** Create `server/utils/eomCsvExport.ts`:
  - `generateXeroCSV(runId)` → produce 27-column CSV matching Xero SalesInvoiceTemplate
  - Uses `rowToCSV()` from invoice-config for proper escaping
  - Returns CSV string or writes to R2 storage

**Acceptance criteria**: Given a set of Monday jobs and cached PPC spend, the engine produces correctly mapped, numbered, and validated `eom_line_items`. Facebook items classified GST-free, Google items classified GST-on-expenses. Sanity checks flag anomalies.

#### Task 4.2: EOM API Endpoints
> Expose the engine via REST APIs.

- [ ] **4.2.1** Create `POST /api/agency/eom/generate` — kick off generation for `{ month, year }`. Returns run ID. Requires `requireRole(event, ['admin', 'finance'])`.
- [ ] **4.2.2** Create `GET /api/agency/eom/runs` — list past EOM runs with status, totals, dates. Supports `?year=` filter.
- [ ] **4.2.3** Create `GET /api/agency/eom/runs/:id` — full run detail with summary stats.
- [ ] **4.2.4** Create `GET /api/agency/eom/runs/:id/items` — paginated line items. Supports filters: `?client=`, `?coa=`, `?gst=`, `?confidence=`, `?reviewStatus=`.
- [ ] **4.2.5** Create `PATCH /api/agency/eom/runs/:id/items/:itemId` — manual correction. Body: `{ unitAmount?, accountCode?, taxType?, clientName?, reviewNotes? }`. Stores original values in `original_values` JSONB, sets `review_status = 'corrected'`.
- [ ] **4.2.6** Create `GET /api/agency/eom/runs/:id/validation` — returns all sanity check results.
- [ ] **4.2.7** Create `GET /api/agency/eom/runs/:id/summary` — GST breakdown, COA breakdown, client totals, flagged items count.
- [ ] **4.2.8** Create `GET /api/agency/eom/runs/:id/export-csv` — download Xero-format CSV. Sets `Content-Disposition: attachment` header.
- [ ] **4.2.9** Create `DELETE /api/agency/eom/runs/:id` — delete a draft run (only if status = 'draft' or 'review').
- [ ] **4.2.10** Create `POST /api/agency/eom/runs/:id/regenerate` — re-run generation for an existing month (deletes old line items, re-generates).

**Acceptance criteria**: Full CRUD for EOM runs. Manual corrections preserve audit trail in `original_values`. CSV export matches Xero's 27-column template exactly.

---

### Phase 5: Xero Invoice Upload (Write API)

**Goal**: Push DRAFT invoices to Xero via API batch endpoint.
**Depends on**: Phase 4

#### Task 5.1: Xero Write Client
> Extend the existing Xero client with invoice creation capabilities.

- [ ] **5.1.1** Extend `server/utils/xeroClient.ts` (or create `server/utils/xeroInvoiceWriter.ts`):
  - `validateContacts(clientNames[])` → check all names exist in Xero contacts. Return matches and mismatches.
  - `batchCreateInvoices(invoices[], tenantId)` → POST /Invoices with up to 50 per request. Status = DRAFT.
  - `getInvoiceStatuses(invoiceNumbers[])` → check current status of pushed invoices.
  - Token freshness check before any write operation (auto-refresh if needed).
  - Error handling per-invoice (log failures with ValidationErrors, continue with rest).
  - Rate limit awareness (60/min, 5000/day).
- [ ] **5.1.2** Create payload builder `buildXeroPayload(lineItems[])`:
  - Group line items by client → one XeroAPIInvoice per client
  - Include LineItems with Description, Quantity, UnitAmount, AccountCode, TaxType
  - Include Tracking categories (Media + Client) on every line item
  - Set: Type=ACCREC, Status=DRAFT, LineAmountTypes=Exclusive, CurrencyCode=AUD

**Acceptance criteria**: Given a set of `eom_line_items`, produces valid Xero API payloads. Handles batch limits (50/request). Correctly groups multi-line invoices by client.

#### Task 5.2: Xero Push API Endpoints
> Expose the Xero write operations.

- [ ] **5.2.1** Create `POST /api/agency/eom/runs/:id/push-to-xero` — validate contacts, batch create invoices, update run status. Requires `requireRole(event, ['admin', 'finance'])`. Returns: `{ total, created, errors[] }`.
- [ ] **5.2.2** Create `GET /api/agency/eom/runs/:id/xero-status` — check status of pushed invoices in Xero (DRAFT/SUBMITTED/AUTHORISED/PAID).
- [ ] **5.2.3** Create `POST /api/agency/eom/runs/:id/validate-contacts` — dry-run contact validation without pushing. Returns matched/unmatched client names.
- [ ] **5.2.4** Create `POST /api/agency/eom/runs/:id/archive` — archive CSV to R2 storage, mark run as complete.

**Acceptance criteria**: Invoices appear in Xero as DRAFT. Rob can review and AUTHORISE in Xero UI. Failed invoices reported with specific error messages. CSV archived to R2.

---

### Phase 6: EOM Dashboard UI

**Goal**: Visual workflow for monthly invoice generation, review, and Xero push.
**Depends on**: Phases 4, 5

#### Task 6.1: EOM Dashboard Page
> Main entry point for the monthly invoicing workflow.

- [ ] **6.1.1** Create `app/pages/agency/eom/index.vue`:
  - Month/year selector (default: previous month)
  - Current run status card (not started / generating / review / pushed / complete)
  - Summary stats: total revenue ex-GST, PPC passthrough, GST collected, invoice count, line item count, flagged items
  - Action buttons: "Generate Invoices", "View Details", "Push to Xero"
  - Past runs history table
- [ ] **6.1.2** Create `app/composables/useEom.ts`:
  - `generateRun(month, year)` → POST /eom/generate
  - `fetchRuns(year?)` → GET /eom/runs
  - `fetchRun(id)` → GET /eom/runs/:id
  - `fetchItems(id, filters?)` → GET /eom/runs/:id/items
  - `updateItem(runId, itemId, changes)` → PATCH
  - `pushToXero(id)` → POST /eom/runs/:id/push-to-xero
  - `exportCSV(id)` → GET /eom/runs/:id/export-csv
  - Reactive state with loading/error handling
- [ ] **6.1.3** Add "Invoicing" item to agency sidebar navigation.

**Acceptance criteria**: User can select a month, generate invoices, and see summary stats. Navigation accessible from sidebar.

#### Task 6.2: Run Detail & Line Item Review
> Detailed view for reviewing and correcting generated invoice lines.

- [ ] **6.2.1** Create `app/pages/agency/eom/[runId].vue`:
  - Tabbed layout: "Line Items" | "GST Audit" | "Validation" | "Summary"
  - Line items table grouped by client:
    - Columns: Client, Description, COA, Amount, GST Type, Tracking, Confidence, Status
    - Color-coded confidence badges (green=high, yellow=medium, red=low)
    - Inline edit for amount, COA, GST type, client name
    - "Needs Review" filter toggle
  - Sticky header with run totals and action buttons
- [ ] **6.2.2** Create `app/components/eom/EomLineItemTable.vue`:
  - Sortable/filterable data table
  - Expandable rows showing: matched keyword, confidence reason, GST explanation, original values (if corrected)
  - Batch actions: select multiple → bulk update COA or GST type
- [ ] **6.2.3** Create `app/components/eom/EomItemEditor.vue`:
  - Slideover for editing a single line item
  - COA dropdown (9 options with descriptions)
  - GST type dropdown (3 options with explanations)
  - Client name with fuzzy search/autocomplete against 161 Xero contacts
  - Amount field with margin calculator preview
  - Review notes textarea
  - Save + "Flag for Review" actions

**Acceptance criteria**: All line items visible and editable. Corrections tracked with audit trail. Filters work for confidence level and review status.

#### Task 6.3: GST Audit & Validation Views
> Dedicated views for BAS compliance checking and sanity validation.

- [ ] **6.3.1** Create `app/components/eom/EomGSTAudit.vue`:
  - GST breakdown: pie/bar chart showing GST on Income / GST Free / GST on Expenses
  - Expected vs actual ratios (from `SANITY_CHECKS.gstBreakdown`)
  - Table of all COA 330 items with platform detection results
  - Highlight any items where platform couldn't be detected (needs manual review)
  - Facebook vs Google distinction prominently displayed
- [ ] **6.3.2** Create `app/components/eom/EomValidation.vue`:
  - Sanity check results (pass/fail for each check)
  - Total range check ($200-350K expected)
  - Invoice count range (100-200 expected)
  - Large invoice flag (>$100K)
  - Client name match results (matched / unmatched / fuzzy matched)
  - Warnings and errors list with severity indicators
- [ ] **6.3.3** Create `app/components/eom/EomChecklist.vue`:
  - 13-step EOM workflow checklist
  - Auto-marks system steps (token check, invoice number fetch, generation, upload)
  - Manual checkboxes for human steps (Kellie review, PPC reconciliation, Rob approval)
  - Progress indicator

**Acceptance criteria**: GST audit view clearly shows classification breakdown. Validation catches anomalies. Checklist tracks workflow progress.

#### Task 6.4: Xero Push UI
> Interface for pushing invoices to Xero and monitoring status.

- [ ] **6.4.1** Create `app/components/eom/EomPushToXero.vue`:
  - Pre-push summary: invoice count, total amount, batch count (ceil(n/50))
  - Contact name validation results (run dry-check first)
  - Unmatched contacts shown as errors that must be resolved before push
  - "Push to Xero as DRAFT" button with confirmation modal
  - Progress bar during batch upload (updates per batch)
  - Results: created count, error count, error details per invoice
  - Link to Xero to review and authorise
- [ ] **6.4.2** Create `app/components/eom/EomXeroStatus.vue`:
  - Status tracker for pushed invoices (DRAFT → AUTHORISED → PAID)
  - Polling or manual refresh to sync status from Xero
  - Summary: X drafts, Y authorised, Z paid
- [ ] **6.4.3** Add CSV download button as fallback (for manual Xero upload if API fails).

**Acceptance criteria**: User can validate contacts, push to Xero, see progress, and review results. CSV fallback available.

---

### Phase 7: Social Media Connections Hub

**Goal**: Unified management UI for Meta, Google, and future platform connections. Monthly spend dashboard for PPC reconciliation.
**Depends on**: Phases 2, 3
**Can overlap with**: Phases 5, 6

#### Task 7.1: Social Connections Management Page
> Central hub for connecting and managing ad platform accounts.

- [ ] **7.1.1** Create `app/pages/agency/social/index.vue`:
  - Connection cards for each platform (Meta, Google, LinkedIn — future, TikTok — future)
  - Per card: platform logo, account name, status badge (connected/expired/disconnected), last sync time
  - "Connect" button → OAuth flow for each platform
  - "Disconnect" button with confirmation
  - "Refresh Token" button for expired connections
  - Account-to-client mapping interface (which ad account maps to which Xero client)
- [ ] **7.1.2** Create `app/composables/useSocialConnections.ts`:
  - `fetchConnections()` → list all platform connections
  - `connectPlatform(platform)` → initiate OAuth
  - `disconnectPlatform(connectionId)` → remove connection
  - `syncSpend(connectionId, month, year)` → trigger spend data pull
  - `updateClientMapping(connectionId, mapping)` → update account-to-client map
- [ ] **7.1.3** Create `app/components/social/SocialConnectionCard.vue`:
  - Reusable card component for each platform
  - Status-specific UI (connect button vs account info)
  - Token expiry countdown/warning

**Acceptance criteria**: Users can connect Meta and Google accounts via OAuth. Connection status visible. Can disconnect and reconnect.

#### Task 7.2: Monthly Spend Dashboard
> View actual ad spend across platforms, compare to budgets.

- [ ] **7.2.1** Create `app/pages/agency/social/spend.vue`:
  - Month/year selector
  - Platform tabs: All | Meta | Google
  - Spend table by client: Client Name, Platform, Budget (from Monday), Actual Spend, Variance, Variance %
  - Variance alerts: highlight rows where actual differs from budget by >10%
  - Totals row per platform and grand total
  - Export to CSV
- [ ] **7.2.2** Create `app/components/social/SpendVarianceTable.vue`:
  - Sortable table with color-coded variance column (green = under budget, red = over)
  - Click-through to campaign-level breakdown
  - Filter by client, platform, variance threshold
- [ ] **7.2.3** Create `GET /api/agency/social/spend/summary?month=X&year=Y` — aggregated spend across all platforms by client, with budget comparison from Monday.
- [ ] **7.2.4** Wire spend data into EOM engine (Phase 4) — when generating, auto-populate COA 330 lines from cached spend.

**Acceptance criteria**: Spend data visible per client per platform per month. Budget vs actual variance calculated and highlighted. Data feeds into EOM generation.

#### Task 7.3: Social Connections API (Shared)
> Platform-agnostic endpoints for managing connections.

- [ ] **7.3.1** Create `GET /api/agency/social/connections` — list all connections across platforms.
- [ ] **7.3.2** Create `GET /api/agency/social/connections/:id` — connection detail with account info.
- [ ] **7.3.3** Create `DELETE /api/agency/social/connections/:id` — disconnect and revoke.
- [ ] **7.3.4** Create `GET /api/agency/social/connections/:id/client-map` — get account-to-client mappings.
- [ ] **7.3.5** Create `PUT /api/agency/social/connections/:id/client-map` — update mappings.

**Acceptance criteria**: CRUD for social connections. Client mapping persisted and used by spend sync.

---

### Phase 8: Task Manager Integration (Board System Hooks)

**Goal**: Wire invoicing status into the existing board/task system for visibility during the month.
**Depends on**: Phase 1 (data layer), Phase 6 (EOM UI)
**Optional / Enhancement Phase**

#### Task 8.1: Board Column for Invoice Status
> Track billing status per task item on boards.

- [ ] **8.1.1** Add "Invoice Status" as a predefined custom column option:
  - Values: Not Billed | In EOM Queue | In Review | DRAFT in Xero | AUTHORISED | PAID
  - Color-coded badges
- [ ] **8.1.2** When EOM engine processes a Monday item, update the task's invoice status column value via `task_column_values`.
- [ ] **8.1.3** When Xero status changes (DRAFT → AUTHORISED → PAID), update the board column.

#### Task 8.2: Board Automation for Billing
> Auto-flag tasks for billing when they reach "Done" status.

- [ ] **8.2.1** Add a pre-built automation recipe: "When status changes to Done → Set Invoice Status to In EOM Queue".
- [ ] **8.2.2** Add a pre-built automation recipe: "When Invoice Status changes to AUTHORISED → Notify account manager".
- [ ] **8.2.3** Board subscription: Kellie auto-subscribed to Invoice Status changes.

#### Task 8.3: Billing Tab in Task Slideover
> Show billing details for individual tasks.

- [ ] **8.3.1** Add "Billing" tab to the task slideover (alongside existing Details, Subtasks, Activity tabs).
- [ ] **8.3.2** Show: COA code (auto-mapped from description), GST type, amount, invoice number (if generated), Xero status.
- [ ] **8.3.3** Allow manual override of COA and GST from the task level.

**Acceptance criteria**: Invoice status visible on boards. Automations trigger on status change. Billing tab shows classification details.

---

## 6. Security Requirements

| Requirement | Implementation |
|---|---|
| EOM generation restricted to admin/finance roles | `requireRole(event, ['admin', 'finance'])` on all `/eom/` write endpoints |
| Xero push restricted to admin/finance roles | `requireRole(event, ['admin', 'finance'])` on push endpoint |
| OAuth tokens encrypted at rest | Encrypt `access_token` and `refresh_token` in `social_connections` |
| API credentials not in client code | All Meta/Google/Xero credentials server-side only (no `VITE_` prefix for secrets) |
| Audit trail for corrections | `original_values` JSONB preserves pre-correction state |
| Invoices always DRAFT | Engine hardcodes `Status: 'DRAFT'` — never auto-authorise |
| .env file in docs must not be committed | Add to `.gitignore`, move credentials to server env |

---

## 7. Data Flow Summary

### Monthly Invoicing (EOM)
```
1. Monday Jobs Board → GraphQL → Filter by month + status
2. Meta Ads API → Ad spend per campaign → Cache in ad_spend_cache
3. Google Ads API → Ad spend per customer → Cache in ad_spend_cache
4. EOM Engine:
   a. COA Mapper → description keywords → account code
   b. GST Classifier → platform + COA → tax type
   c. Client Matcher → Monday name → Xero legal entity
   d. Margin Calculator → COA 220 × 1.10, COA 330 passthrough
   e. Invoice Numberer → sequential from Xero's last #
   f. Sanity Checker → validate totals, ratios, contacts
5. Dashboard Preview → Human review + corrections
6. Xero API → POST /Invoices (DRAFT, batch ≤50)
7. Rob reviews → Authorises in Xero → Sends to clients
```

### Mid-Month Visibility
```
1. Monday Jobs Board → Current month items (any status)
2. Ad spend cache → Current month spend (synced daily)
3. Dashboard → Running totals, client breakdown, COA breakdown
```

---

## 8. Dependency Graph

```
Phase 1 (Data Layer) ────────────────────────────────────┐
    │                                                     │
    ├──→ Phase 2 (Meta Ads) ──┐                          │
    │                          ├──→ Phase 4 (EOM Engine) ──→ Phase 5 (Xero Push) ──→ Phase 6 (EOM UI)
    ├──→ Phase 3 (Google Ads) ─┘         │                          │
    │                                     │                          │
    │    Phase 2 + 3 ──→ Phase 7 (Social Hub) ─────────────────────┘
    │
    └──→ Phase 8 (Board Integration) — can start after Phase 1, evolve with later phases
```

**Parallel tracks**:
- Phases 2 and 3 can be built simultaneously
- Phase 7 can overlap with Phases 5-6
- Phase 8 can start early and evolve

---

## 9. Sanity Check Thresholds

| Check | Expected Range | Action if Outside |
|---|---|---|
| Monthly total (ex-GST) | $200,000 – $350,000 | Warning flag on run |
| Invoice count | 100 – 200 | Warning flag |
| Line item count | 300 – 800 | Warning flag |
| Single invoice max | < $100,000 | Flag for manual review |
| GST on Income ratio | ~65% of lines | Warning if < 50% or > 80% |
| GST Free Expenses ratio | ~15% of lines | Warning if < 5% or > 30% |
| GST on Expenses ratio | ~20% of lines | Warning if < 5% or > 35% |
| Unmatched client names | 0 | Block Xero push until resolved |

---

## 10. Open Questions

1. **Monday board structure**: Does the current jobs board (#3199166934) have all required columns (Client, Amount, Status, Description, Media Tracking), or do columns need to be added?
2. **Budget Hawk**: Is the existing Budget Hawk app at `/Users/paulgiurin/Downloads/auto-meta-budget-hawk-main` the source for PPC spend, or should we connect directly to Meta/Google APIs? (This PRD assumes direct API connection.)
3. **Multi-agency**: Does the system need to support multiple agencies, or is this ADME-only?
4. **Historical data**: Should we back-fill past months (e.g., run the engine on October 2024 data to validate against the existing workbook)?
5. **LinkedIn/TikTok ads**: Are these platforms used for PPC passthrough billing currently, or only Meta and Google?
6. **Campaign-to-client mapping**: How are Meta/Google ad accounts currently mapped to clients? One ad account per client, or shared accounts with campaign-level splitting?
7. **Xero branding theme**: Is "ADME" already set up as a branding theme in Xero, or does it need to be created?
