# Xero Revenue Data — Database & API Proposal

- **Date:** 2026-06-03
- **Status:** Proposal (needs owner sign-off on margin rules before build)
- **Purpose:** Store the right Xero data so "Get Out" can measure **ADME net
  revenue (margin)** accurately and repeatably — reconciled to the long-standing
  spreadsheet ($158,033 ADME total vs $159,257 target = −$1,224 for the sample
  month).

## Why this exists

The dashboard currently sums Xero invoice **header totals** (`inv.total`) and
treats that as "invoiced". But the agency invoices the **gross** amount —
its own services *plus* passthrough media that flows straight to
Facebook/Google. The number measured against the Get Out target is ADME's
**margin**: 100% of owned services + a commission slice of media/printing.

Gross billings ≈ **$342k ex-GST**; true ADME revenue ≈ **$158k**. The dashboard
is therefore ~2.1× too high. To fix it accurately we must classify revenue
**per line item** by account code / tracking, which Xero exposes but we don't
currently store.

## What the Xero API exposes (confirmed against live docs, 2026-06-03)

**GET /Invoices**
- Returns **full line items by default**. `summaryOnly=true` strips them (so we
  simply *don't* set it). `pageSize` up to **1000**, with `page`.
- Delta sync via the **`If-Modified-Since`** header (`UpdatedDateUTC`).
- Invoice fields: `Type`, `Status`, `Date`, `Contact`, `LineAmountTypes`,
  `SubTotal` (ex-tax), `TotalTax`, `Total` (inc-tax), `UpdatedDateUTC`,
  `InvoiceID`.

**LineItem fields** (the ones we need):
- `LineItemID`, `AccountCode`, `Description`, `Quantity`, `UnitAmount`
- `TaxType`, `TaxAmount`, `LineAmount`
- **`Tracking[]`** — up to **2** TrackingCategory entries (`Name` + `Option`).
  ADME uses `Media` (TrackingName1, 64 options) and `Client` (TrackingName2).

**`LineAmountTypes`** drives ex-GST derivation per line:
- `Exclusive` → `LineAmount` is ex-GST; gst = `TaxAmount`
- `Inclusive` → ex-GST = `LineAmount − TaxAmount`; gst = `TaxAmount`
- `NoTax` → ex-GST = `LineAmount`; gst = 0

**Supporting endpoints (already integrated):** `Accounts` (code→name),
`TrackingCategories` (category + options). SDK: `xero-node`
`accountingApi.getInvoices(tenantId, ifModifiedSince, where, order, …, page, …,
summaryOnly, pageSize)`.

## What we store today vs the gap

| Asset | State | Gap |
| --- | --- | --- |
| `xero_invoices_cache` | invoice **headers** only (total/subtotal/tax/status/date) | **no line items, no account codes, no tracking** |
| `xero_tracking_categories` / `xero_tracking_options` | ✅ `Media` category + **64 options**, each enriched with **COA code + GST type** (TV/Radio/Paper→220, FB/Google/LinkedIn/Spotify→330, Printing→205, …) | classification key exists but isn't joined to invoice lines |
| `coa-map.ts` (`COA_ACCOUNTS`) | ✅ COA→margin rules | **conflicts with the spreadsheet** (see blocker) |

**Net:** the classification *dimension* already exists (tracking options → COA →
GST), but there's nowhere that stores **which account code / tracking option each
invoiced dollar belongs to**, so no margin can be computed from stored data.

## 🚩 ACCURACY BLOCKER — margin rules conflict (must resolve first)

Two authoritative-looking sources disagree:

| Bucket | PDF spreadsheet ("seen for years") | `coa-map.ts` (Kellie White, Oct 2024) |
| --- | --- | --- |
| Media (220) | **16%** | **10%** (cost ×1.10) |
| PPC/digital (330) | (within media) | **0%** (pure passthrough) |
| Printing (205) | **33%** | **100%** |
| Owned (210/215/216/217/219/225) | 100% | 100% |

No build should encode either set until the owner confirms which is correct (or
that they apply to different periods). This is the single most important input.

## Proposed schema

### New: `xero_invoice_lines_cache`
```
tenant_id            TEXT     NOT NULL
invoice_id           TEXT     NOT NULL          -- FK→xero_invoices_cache (logical)
line_item_id         TEXT     NOT NULL          -- Xero LineItemID
account_code         TEXT                       -- LineItem.AccountCode
tax_type             TEXT                       -- LineItem.TaxType
description          TEXT
quantity             NUMERIC(14,4)
unit_amount_cents    BIGINT   NOT NULL DEFAULT 0
line_ex_gst_cents    BIGINT   NOT NULL DEFAULT 0  -- derived via LineAmountTypes
tax_amount_cents     BIGINT   NOT NULL DEFAULT 0
tracking_media       TEXT                       -- Tracking option for 'Media'
tracking_client      TEXT                       -- Tracking option for 'Client'
-- denormalised from the header so margin queries don't need a join:
invoice_date         DATE     NOT NULL
invoice_status       TEXT     NOT NULL
invoice_type         TEXT     NOT NULL           -- ACCREC/ACCPAY
synced_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
PRIMARY KEY (tenant_id, line_item_id)
```
Indexes: `(tenant_id, invoice_date)`, `(tenant_id, account_code)`,
`(tenant_id, tracking_media)`.

### Config: `adme_revenue_rules` (or extend `getOutConfig`)
Stores the **confirmed** keep-rates + code→bucket map so the resolved conflict
lives in one editable place, not in code:
```
bucket_by_code   JSONB   -- { "220":"media","330":"media","205":"printing", ... }
keep_by_bucket   JSONB   -- { "media":0.16,"printing":0.33,"owned":1,"excluded":0 }
default_bucket   TEXT
```
Seeded from `xero_tracking_options.coa_code` + the agreed rates.

## Sync

Extend the existing invoice sync (the writer for `xero_invoices_cache`):
1. Page `GET /Invoices` (full, **not** `summaryOnly`), `pageSize=1000`, with
   `If-Modified-Since` for deltas.
2. For each line: derive `line_ex_gst_cents` / `tax_amount_cents` from
   `LineAmountTypes`; pull `account_code`, `tax_type`, and the two `Tracking`
   options; upsert into `xero_invoice_lines_cache`.
3. Backfill ~13 months once; nightly delta thereafter (companion Worker cron, per
   the existing Pages-cron pattern — Nitro Pages has no `scheduled()`).

## How margin is computed (once rules confirmed)

Per line → classify by `account_code` (cross-checked against the
`tracking_media → coa_code` map) → bucket → keep-rate → `contribution =
line_ex_gst × keep`. Sum = **ADME net revenue**. Already prototyped as the pure,
tested `server/utils/admeRevenue.ts` (`computeAdmeRevenue`) — it just needs the
confirmed rule config and a cached line source instead of guesses.

## Reconciliation-first rollout

1. **Resolve the margin-rule conflict** (owner). ← blocking
2. Ship `xero_invoice_lines_cache` + sync (additive; no risk to existing cards).
3. **Read-only reconciliation view** over the cached lines for a chosen month →
   prove it lands on $158,033 / −$1,224 and that account-code totals match the
   PDF columns. Tune the code→bucket map until it reconciles.
4. Only then build the "true position" card and switch the Get Out headline to
   ADME net revenue (keeping gross as a secondary view).

## Open questions for the owner

1. **Which margin rates are correct** — PDF (16%/33%) or code (10%/0%/100%), or
   do they differ by period?
2. **Classification source of truth** — `AccountCode` or the `Media` tracking
   option? (They should agree via the COA map; confirm which wins on conflict.)
3. **Unmapped account codes** — default to 100% (owned) or exclude?
4. **Scope of revenue** — ACCREC only, or net of ACCRECCREDIT credit notes too?

---

# v2 — ACCURATE AGI MODEL (supersedes the rate-based approach)

**Decision (2026-06-03):** stop applying *guessed commission rates* to media
revenue. Compute the true margin from **actual revenue − actual cost**. A
"16% vs 10%" debate is just two approximations of a figure Xero holds exactly:
what you billed minus what you paid the vendor. The commission rate becomes a
**reported output**, not an input.

## The model

**ADME Net Revenue (Agency Gross Income) = Revenue − media pass-through cost**

- **Revenue** = all ACCREC ex-GST (owned services + media billed + passthrough
  billed).
- **Media pass-through cost** = what ADME actually paid media vendors:
  - Digital (FB/Google/etc.) → `media_spend.actual_spend` (already captured via
    the Meta/Google API integrations).
  - Traditional (shopping-centre, TV, billboards, print, RED, carsales) → Xero
    **ACCPAY** vendor bills coded to media/direct-cost accounts.

This nets *media* (true passthrough) out of revenue. It does **not** net
delivery costs (wages, freelance/production contractors) — those sit on the
**Get Out target** side (the PDF target is "wages + expenses **inc DrCost DA
contractors + bal est DrCosts** + extras"). Keeping that split is what avoids
**double-counting**: media cost nets from revenue; people/contractor cost is the
target. AGI is then compared to that target.

## Why the existing `margin.get.ts` isn't enough

It has the right *concept* (`AGI = Revenue − passthrough`, configurable
`passthrough_account_codes`) but an incomplete cost source: it only subtracts
`media_spend.actual_spend` (digital) and never the **traditional-media ACCPAY
bills**, and it reads revenue gross from headers. The accurate model needs the
ACCPAY cost side, which we don't yet store.

## Data gap to close

- **ACCREC line items** (revenue by code/tracking) — proposed `xero_invoice_lines_cache`.
- **ACCPAY bills + line items** (cost by code/tracking/vendor) — **new sync; not
  currently pulled at all.** Extend the cache + sync to `type IN (ACCREC, ACCPAY)`.
- **`media_spend`** (digital cost) — already present; join by client + month.

## Cost classification (grounded in real accounts, not guesses)

Tag each cost account as **media-passthrough** (nets from revenue) vs
**delivery/overhead** (target side). Driven by the Xero cost accounts
("Direct Costs: Media…", "AP - Media Vendors", contractor/labour accounts) +
the `Media` tracking dimension — a config table, confirmed once with the owner,
not curve-fitted to the PDF.

## Reported outputs (the PDF becomes a cross-check, not the source)

- ADME Net Revenue (AGI) vs Get Out target → true position.
- **Effective media margin %** per category (revenue − cost) ÷ revenue — this is
  where "is it 10% or 16%?" gets *answered from data* instead of assumed.
- Gross billings + passthrough still shown for volume/context.

## Revised rollout

1. Sync **ACCPAY** (cost side) + ACCREC line items into the line-item cache.
2. Cost-classification config (media-passthrough vs delivery), owner-confirmed.
3. Extend the reconciliation view to show Revenue − actual cost = AGI, with the
   derived effective media margin %. Cross-check against the PDF; investigate
   divergences (Xero is system of record).
4. Lock the model; build the production "true position" card on Get Out.

## Open question for the owner (just one, now)

**Which cost accounts/vendors count as media pass-through** (netted from
revenue) vs **delivery cost** (target side)? Everything else is computed from
actual Xero data.
