# ADR-007: Mirror Xero into a landing/domain schema and read from ours, not theirs

## Status

Proposed

## Date

2026-08-02

## Context

On 2026-08-02 at ~19:50 AEST the Xero daily quota for tenant
`ADME Advertising Pty Ltd` was exhausted. Measured directly against production:

| Endpoint | Result |
|---|---|
| `/api/xero/get-out/cash-position` | `429`, `Retry-After: 66728s` (~18.5h) |
| `/api/xero/invoices` | `429` |
| `/api/xero/expenses` | `502` |
| `/api/xero/bank-monitoring` | `504` gateway timeout |
| `/api/xero/status` | `200` (does not call Xero) |

Every Xero-backed surface in the dashboard was degraded for the rest of the day.
This is recurring, not novel — `fix/xero-getout-429`,
`fix/xero-rate-limit-systemic` and `fix/xero-widget-rate-limit` were all cut on
2026-07-23 against the same class of failure.

Three causes were identified, none of which are fixed by tuning cache TTLs.

### 1. The rate limiter cannot work as written

`server/utils/xeroRateLimit.ts` holds its gate in module scope:

```ts
let nextCallAt = 0
let globalRetryUntil = 0
```

On Cloudflare Workers module scope is **per-isolate**. Many isolates run
concurrently, so a "global 250ms gate" is really N independent gates, and the
429 cooldown one isolate learns is invisible to the others. The system believes
it is rate-limited while consuming quota at N times the intended rate.

### 2. Caching is burst protection, not quota protection

34 endpoints wrap Xero calls in `cachedFetch` with TTLs from 60s to 1800s
(mostly 300–600s). That collapses concurrent duplicate requests, but a daily cap
is a function of *distinct* requests over 24h. A 5-minute TTL on a page used
through the working day still yields ~100 upstream calls, and `bank-monitoring`
costs ~6 Xero calls per miss.

Eight endpoints bypass `cachedFetch` entirely. Most are writes and legitimately
uncacheable, but `get-out/revenue-reconciliation.get.ts` loops up to 15 pages
uncached — 15 Xero calls per request, every request.

### 3. The RAG layer consumes quota instead of relieving it

`server/utils/financialEmbedder.ts` builds its vectors by calling
`/api/xero/expenses`, `/api/xero/invoices`, `/api/xero/bank-monitoring` and
`/api/xero/contacts`. Every re-embed is dozens of Xero calls.

Worse, `aiContextRetriever.searchFinancial` fires those same four endpoints
**live on every financial question**. One "what's our cash position?" costs
roughly 10–15 Xero calls. The vector index exists but the chat path reads
through to Xero rather than from the index.

### What already exists

The mirror is half-built and was never finished:

| Table | Rows | Staleness (2026-08-02) |
|---|---|---|
| `xero_invoices_cache` | 1,880 | fresh |
| `xero_contacts_cache` | 1,265 | 2 days |
| `xero_accounts_cache` | 181 | **17 days** |
| `xero_invoice_lines_cache` | 16,579 | **17 days** |
| `xero_customer_rollups` | 149 | derived, no sync column |

`xero_customer_rollups` is already domain-shaped data that exists nowhere in
Xero. Write-back paths already exist too: the EOM engine creates invoices, and
Briefs→Xero Quotes creates quotes. The Ops Autopilot notes already assert
*dashboard = system of record*.

So the direction is established. What is missing is that read paths were never
pointed at the mirror, and the sync jobs stopped.

## Decision

Adopt a two-layer mirror and invert the read path.

```
Xero ──(incremental sync, quota-budgeted)──▶ landing ──(typed transform)──▶ domain
                                                                             ├──▶ page reads
                                                                             └──▶ embeddings ──▶ Vectorize ──▶ AI chat
```

Live Xero reads occur only on an explicit operator "refresh now", and those go
through the same budget.

### Landing layer

Faithful mirror. Xero's field names, Xero's GUID as natural key, no
interpretation:

```sql
CREATE TABLE xero_raw_invoices (
  xero_id           UUID PRIMARY KEY,        -- Xero InvoiceID
  tenant_id         TEXT NOT NULL,
  xero_updated_utc  TIMESTAMPTZ NOT NULL,    -- drives incremental sync
  raw_payload       JSONB NOT NULL,          -- replay source
  synced_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

`raw_payload` is the load-bearing column. It means the domain schema can be
rebuilt, corrected or extended **without spending a single Xero call**. Given
that quota is the binding constraint, replay-without-refetch is the property
that makes iteration affordable at all.

Landing must be *completely* faithful — no renaming, no flattening, no
filtering. Ugly Xero field names are a feature: they make drift obvious.

### Domain layer

Our schema, shaped for how the dashboard thinks, built by an explicit typed
transform from landing. Domain tables never call Xero.

### Why the split is not over-engineering

It removes a bug class this codebase has already paid for. Client Profiles never
embedded a single vector because `/api/xero/contacts` quietly reshaped Xero's
payload (`contactID`→`id`, nested `balances.accountsReceivable.outstanding`→flat
`balances.receivableOutstanding`) while `financialEmbedder` read the raw shape.
Every contact silently failed the filter; the stage reported
`0 embedded … (0 total)`, which reads like success. Fixed 2026-08-02 in PR #363
after months undetected.

That happens because the transform lived ad-hoc inside a request handler with no
contract on either side. With landing/domain the transform is one typed,
testable function with a fixture at each end — a mismatch becomes a failing test
rather than a filter that rejects everything.

### Incremental sync

Xero supports `If-Modified-Since` / `UpdatedDateUTC` filtering. Sync pulls only
records changed since `max(xero_updated_utc)`.

Full invoice pull: ~19 pages for 1,880 invoices. Incremental: typically 0–2
pages. This is what turns "5,000 calls/day and still degraded" into a
predictable ~50–100 calls/day with better freshness than today.

Nothing currently uses it. Every sync re-pulls everything.

### Quota budget in a Durable Object

Replace the per-isolate gate with a single DO holding a token bucket, a shared
429 cooldown honouring the real `Retry-After`, and a daily budget counter. DOs
are already in use (`chat-rooms`, `board-events`, `banner-rooms`), so this is an
established pattern here.

The DO also fixes the failure *mode*: today a quota exhaustion Xero reports
instantly becomes a 45-second `504`, because `xeroRateLimit.ts` caps
`Retry-After` at 12s and retries 3× against a 45s deadline. A clean fast `429`
would have made this diagnosis immediate.

## Boundary: what does not move

Xero remains the **ledger** of record, legally and for the accountant.
Reconciliation happens in Xero. What moves to our side is the operating
picture — derived metrics, pacing, rollups, client economics, forecasts — which
is most of what the dashboard actually renders.

The split is *Xero owns the ledger, we own the operating picture*. Not "replace
Xero"; "stop asking Xero questions we can answer ourselves."

## Phasing

1. **Landing schema + incremental sync.** Additive migration, no read-path
   change, no behaviour change. Safe to land ahead of everything else.
2. **Point reads at the mirror.** Largest quota win, lowest risk — reads cannot
   corrupt anything.
3. **DO quota budget + fail-fast on 429.** Makes exhaustion structurally
   impossible rather than periodically fought.
4. **Drift detection.** Daily reconcile flagging mirror ≠ Xero. Required
   *before* trusting the mirror, not after.
5. **Widen write-back.** Only once 1–4 are solid. Needs idempotency keys and an
   outbox; this is where financial risk concentrates.

Steps 1–3 are independently valuable and would have prevented the 2026-08-02
outage on their own. They do not require committing to step 5.

## Consequences

**Positive.** Quota spend becomes a known constant rather than a function of
team activity. Dashboard reads stop failing when Xero is unavailable. Schema
iteration costs no quota. The reshape bug class is eliminated at the boundary.
AI/RAG reads from Postgres and Vectorize instead of amplifying load.

**Negative.** Two schemas to maintain and a transform layer to keep honest.
Mirror staleness becomes a first-class concern needing drift detection —
today's stale tables show it will not maintain itself. Storage grows
(`raw_payload` roughly doubles landing size; acceptable at current volumes —
16.5k invoice lines).

**Risks.** Write-back (step 5) can double-post without idempotency keys.
A faithful landing layer will surface Xero schema changes as transform failures,
which is correct but needs alerting. Backfill itself consumes quota and must run
inside the DO budget.

## Open questions

1. **What is actually consuming 5,000 calls/day?** Not yet measured. The sync
   budget in step 1 should not be sized until it is.
2. Which Xero entities need landing tables beyond invoices, contacts, accounts,
   line items? Bank transactions and credit notes are likely.
3. Retention for `raw_payload` — indefinite, or trimmed once the domain layer is
   trusted?
4. Does drift detection reconcile against Xero reports, or recompute from
   landing?

## Not doing tonight

An unattended job that fires when the quota resets was considered and rejected
for now. Backfill against a rate-limited API, written at the end of a long
session, running unobserved overnight, is the shape of change that goes wrong
quietly. Step 1 lands the schema; the sync engine should be built and enabled
with someone watching.
