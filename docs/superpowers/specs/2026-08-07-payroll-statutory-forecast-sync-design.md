# Payroll & Statutory Obligations in the 13-Week Treasury Forecast

**Date:** 2026-08-07
**Status:** Approved design (Option A — seeded commitments)
**Deadline context:** must be live before the Treasury walkthrough with the bookkeeper on 27 Aug 2026 (Monday board 18424992941, task C-11). This closes the C-08 gap: the forecast currently includes real bills, draft bills, repeating-bill templates and register commitments, but nothing for wages, super, SRO payroll tax, or the ATO debt instalment.

## Goal

The 13-week forecast (`server/api/xero/get-out/cashflow-13w.get.ts`) reproduces the bookkeeper's weekly spreadsheet totals — including payroll and statutory outflows — closely enough that the walkthrough comparison holds up. Source of process truth: the PRD — Bookkeeper Process working doc (Monday doc 45543750); amounts refined by Kellie's answers to the S-00 questions posted 7 Aug.

## Approach

Reuse the existing commitment register (`cashflow_commitments`, endpoints under `server/api/cashflow/commitments/`, validation in `server/utils/cashflowCommitments.ts`). No new tables. The forecast endpoint already:

- expands commitment recurrences (weekly / fortnightly / monthly / quarterly / yearly) across the horizon with a recurrence-end bound, and
- suppresses a commitment in any week where a real bill exists for the same Xero contact (matching engine in `server/utils/commitmentMatcher.ts` handles supersession).

So the feature is: a seed config, an idempotent seeder, a new `source` value, a UI badge, and tests.

## Components

### 1. Source enum extension

`server/utils/cashflowCommitments.ts`: add `'statutory-seed'` to `SOURCES`. Seeded rows are otherwise ordinary commitments — editable, holdable, matchable.

### 2. Seed config — `server/utils/statutorySeed.ts`

A single exported array of seed definitions (data, not logic), each with a stable `seedKey`:

| seedKey | supplier | amount (cents) | recurrence | anchor date rule | account | confidence |
|---|---|---|---|---|---|---|
| `wages-weekly` | Wages — weekly pay run | 1_650_000 | weekly | next Friday | NAB_BUSINESS | committed |
| `super-weekly` | SuperChoice — employee super | 240_000 | weekly | next Friday | NAB_BUSINESS | committed |
| `sro-payroll-tax` | SRO — payroll tax (monthly) | 50_000 | monthly | 7th of next month | NAB_TAX | provisional |
| `ato-debt-instalment` | ATO — debt instalment | 600_000 | monthly | 13th of next month | NAB_BUSINESS | committed |

Amounts are current working figures from the 3 Aug spreadsheet; SRO is deliberately `provisional` until Kellie confirms the estimation basis. Updating an amount later = editing the row in the commitments UI (the seeder never overwrites, see below).

**Explicitly excluded (double-count guards):**
- PAYGW and BAS — the bookkeeper enters these as authorised bills in Xero (documented standard); they already flow through the bills path.
- NAB Business → Tax Acc weekly transfers — intra-company transfers net to zero at org level; only relevant when a per-account forecast view exists (out of scope).
- CP & PG wages — paid on a separate arrangement; excluded from the weekly wage figure pending Kellie's answer.

### 3. Idempotent seeder — `server/api/cashflow/commitments/seed-statutory.post.ts`

Admin-only (FINANCE permission). For each seed definition:

- Look up an existing row by `(tenant_id, source='statutory-seed', notes LIKE 'seedKey:<key>%')` — the seedKey is stored in `notes` to avoid a schema change.
- **If absent:** insert with the config values.
- **If present:** do nothing. Never update amounts, dates, status, or recurrence — human edits win, always.
- Returns `{ created: [...], skipped: [...] }`.

Run manually once per tenant; safe to re-run any time. No cron needed.

### 4. UI

`/cashflow/commitments` page: rows with `source === 'statutory-seed'` get a neutral `UBadge` labelled "Statutory". A "Seed statutory set" button (FINANCE-gated) calls the seeder and toasts the created/skipped result. No other UI changes.

### 5. Forecast endpoint

No changes expected — commitments already flow in. Verify during implementation that `status IN ('expected','hold')` and the recurrence expansion cover the seeded rows; fix only if a gap is found.

## Error handling

- Seeder wraps inserts in a transaction; partial failure rolls back and returns 500 with the failing seedKey.
- Seeder refuses to run if the tenant has no Xero connection (no tenant_id to key on).
- Validation: seed definitions pass through `validateCommitmentBody` like any other entry, so enum drift is caught at insert time.

## Testing

Vitest, colocated with existing commitment tests:

1. **Idempotency:** run seeder twice → second run creates nothing; an edited amount (e.g. wages → $17,000) survives a third run.
2. **Recurrence expansion:** seeded weekly wages appear in all 13 forecast weeks; monthly SRO appears in the correct weeks only.
3. **No double count:** an authorised ATO bill for the same contact+week suppresses the commitment occurrence (exercises the existing `seen` guard).
4. **Exclusion guard:** test asserts the seed config contains no PAYGW/BAS entries (protects the double-count rule against future edits).

## Acceptance / verification

- Forecast week containing Fri 7 Aug shows wages + super + SRO consistent with the spreadsheet's current-week summary (~$21.2k wages block + $1.3k SRO) within rounding.
- Seeder run twice produces identical DB state.
- Walkthrough prep (task C-11): side-by-side of forecast vs sheet for the then-current week, differences explained by data (missing bills) not by missing categories.

## Out of scope (deliberate)

- Xero Payroll AU API sync (Option B) — future layer for actuals; blocked on Xero quota instrumentation work.
- Per-account (NAB Business vs Tax) forecast view and transfer modelling.
- Automatic amount updates from bank-transaction patterns (Option C — rejected: inference risk).
