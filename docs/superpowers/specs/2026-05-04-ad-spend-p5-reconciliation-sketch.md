# P5 — Three-Way Reconciliation + Margin (Sketch Only)

**Status:** Exploratory — not committed
**Roadmap:** [Ad Spend Roadmap](2026-05-04-ad-spend-roadmap.md)
**Date:** 2026-05-04

## Status

Sketch only. Acceptance criteria deferred until invoice schema is committed and bank-charges reconciliation has been validated in production for at least one full month-end cycle.

## Likely shape

**Three-way reconciliation column** in spend table:
- Per row: Platform Spend ↔ Bank Charged ↔ Client Invoiced
- Each leg shows currency + delta vs. the others + source badge (`platform`, `xero_bank`, `xero_invoice`)
- Discrepancy highlight: amber pill if any pair differs by >2%
- Click cell → drawer with detailed breakdown (which transactions, which campaigns)

**Margin health card** at top of page:
- Gross margin % per client (derived from invoiced − platform spend)
- Agency-wide aggregate margin
- Benchmark bands: 50–60% concerning / 60–70% healthy / >70% strong (industry sources: NetSuite, Scoro)
- Trend indicator: month-over-month direction

**FX-normalized totals** (Funnel.io pattern):
- Per-row currency badge when source ≠ AUD
- All totals normalized to AUD using stored FX rate at end of month
- FX rate cache table (or use Xero's rate, since their invoices are already in AUD)

## Hard prerequisites

- **Client-invoice schema committed** — currently invoices are in `xero_invoices_cache` but not joined to `media_spend` per-client per-period. Need explicit join table OR a query that maps invoice line items → media_spend rows
- **Decision: Xero invoice-out as source of truth** — likely yes (already pulled by EOM engine), but confirm before building
- **FX rate cache** — needed if multi-currency. Skip for v1 if all clients are AUD

## Open questions

- Where does "client invoiced" come from? EOM engine creates draft invoices in Xero. Do we treat draft as committed or only finalized?
- How do we handle prepayments / negative invoices / credit notes?
- Margin shown gross or net of agency overhead? (R&D found platforms that do both)

## Dependencies

- P1 connection-health surface should also reflect Xero token state (extend the strip)
- Bank charges reconciliation (already shipped, refined in P1) must be running cleanly for 1 month
- Invoice → media_spend mapping schema must exist

## Decision point

Decide if/when to commit after:
- One full month-end cycle has run with bank-charges reconciliation visible
- Invoice schema decision is made (separate project)
- Operator confirms margin/reconciliation is the next pain point above the AI layer (P4)
