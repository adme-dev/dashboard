# ADR-008: Originate finance entries in the platform; rent Xero as compliance infrastructure

## Status

Proposed — requires an accountant in the room before acceptance.

## Date

2026-08-02

## Context

Today the bookkeeper keys entries directly into Xero. The intent is to reverse
that: entries originate in the platform, which then pushes to Xero.

This **contradicts the boundary asserted in ADR-007** ("Xero remains the ledger
of record… reconciliation happens in Xero"). It inverts that ADR's risk profile
rather than extending it, which is why it gets its own record.

A stronger version was also raised: keep bills and finances entirely as company
IP, and use Xero only for banking connections and ATO lodgement. That framing
turns out not to be mechanically available — see below.

### Why inverting entry is genuinely justified

Not "our UI is nicer" — that argument is weak and would rightly be ignored by
the person whose workflow changes.

The real reason: **the coding decision requires context that only exists in this
platform.** Which client, which brief, which job, which budget an expense
belongs to is knowledge Xero does not hold and cannot derive. The bookkeeper
currently reconstructs it from memory while working inside Xero. That is
unsolvable in Xero at any level of Xero skill.

### Both halves of the pipeline already exist

- `expenseClassifyTool`, `expenseApprovalTool`, `eomGenerateTool` are already
  registered in the AI tool layer on main.
- The CRM email inbound gateway has a PRD, design spec, runbook and three
  implementation plans (2026-07-30).

They have never been pointed at each other. The proposed pipeline is therefore
mostly wiring:

```
email → inbound gateway → AI extracts vendor/amount/date/GST
      → classifier proposes coding using client/job/brief/budget context
      → bookkeeper reviews and approves → push to Xero
```

Corrections feed `aiFeedbackProcessor` / `aiTrainingDataExtractor`, so the
classifier improves from real bookkeeping rather than plateauing.

## Decision

### 1. Entry and coding originate here; the sync is bidirectional

What can move: bills, expense categorisation, client/job allocation, approvals.

What cannot: **bank feeds originate in Xero** — banks push to Xero directly —
and tax, BAS and year-end adjustments stay there. So this is never
one-directional. Two writers means a per-field ownership model is required, not
optional.

### 2. Xero's banking and ATO features cannot be taken without its ledger

The "use Xero only for banking and ATO" framing does not work, for structural
rather than API reasons:

- **Bank feeds** land against Xero *accounts* and reconcile against Xero
  *invoices and bills*. With the transactions held elsewhere there is nothing in
  Xero to reconcile against — the result is a feed of unmatched lines.
- **BAS/GST is computed from Xero's ledger.** Xero can only lodge what it holds.

Bypassing Xero entirely is possible but is a fintech-grade compliance programme,
not a feature:

- Bank feeds require direct bank agreements (Xero holds these), an aggregator
  such as Basiq, or CDR/Open Banking accreditation as a Data Recipient.
- ATO lodgement via SBR requires accreditation as a Digital Service Provider
  under the ATO Operational Framework — security certification, audits, ongoing
  obligations. Otherwise lodgement goes through a registered BAS/tax agent.
- Statutory record-keeping obligations (five years, accessible, auditable)
  transfer to us.

*These are structural observations, not compliance advice. Confirm obligations
with the accountant.*

### 3. The ledger is not the IP

Double-entry bookkeeping is commodity. There is no moat in owning debits and
credits and no competitor is deterred by it.

The defensible IP is the **operating layer**: job costing, client
profitability, retainer burn, pacing, margin by brief, and a coding classifier
trained on our own corrections. None of that exists in Xero, none of it is
Xero's, and we already own all of it — `xero_customer_rollups` is exactly that
shape today.

So the question is not "how do we stop sending data to Xero" but **"what do we
own that Xero could never derive?"** — and the answer is already most of what
makes the platform valuable.

### 4. Therefore: rent Xero as compliance infrastructure

Push a sufficient ledger to Xero for banking and ATO. Keep the operating
picture, the intelligence and the client-facing surface entirely ours.

If the concern is lock-in rather than IP, ADR-007's landing layer already
resolves it: `raw_payload` holds a complete, replayable copy of everything Xero
has. Leaving remains possible, on our terms, if the economics ever justify the
accreditation work. **That optionality is worth more than exercising it now.**

## Consequences

**Positive.** The bookkeeper stops re-deriving context the platform already
holds. Coding quality improves with job/client context that Xero cannot see.
The IP position is achieved without a regulatory programme. Lock-in is bounded
by the landing layer.

**Negative.** Bidirectional sync with two writers is materially harder than
ADR-007's one-way mirror and needs a per-field ownership model. Write-back moves
from "phase 5" to load-bearing on day one, so the outbox, idempotency keys and
drift detection become prerequisites rather than refinements.

**Risks.** A mis-coded expense is worse than an uncoded one because it looks
finished and stops being reviewed. GST treatment and account codes are where
errors are expensive.

Mitigations, held firm: **never auto-push** — AI proposes, human approves;
**confidence-gate per field**, not per document, so the model defers on GST and
account codes while auto-filling vendor and amount.

## Sequencing

ADR-007 phases 1–3 are prerequisites, not preferences. A platform cannot safely
originate financial entries while its read layer collapses when a quota is
exhausted (as it did on 2026-08-02).

1. **Deliver the fixes already promised to the bookkeeper** (2026-07-16: credit
   notes not netted from "invoiced", refresh not busting the KV cache,
   front-page KPI cards disagreeing with Xero's P&L).
2. Measure Xero call consumption.
3. ADR-007 phases 1–3 — landing sync, reads from the mirror, per-tenant quota
   budget.
4. This ADR.

Step 1 is first for a reason beyond politeness: asking someone to trust
AI-proposed coding from a system whose front page currently disagrees with
Xero's P&L is not a winnable argument. Fix the numbers, then earn the workflow.

## Open questions

1. Which entries genuinely belong here, and which are reconciliation work that
   should stay in Xero? The bookkeeper knows; we do not.
2. Per-field ownership: for a bill that exists in both systems, which side wins
   on amount, date, account code, tracking category?
3. Does the external accountant's year-end process tolerate entries originating
   outside Xero?
4. What is the minimum "sufficient ledger" Xero needs to hold for bank
   reconciliation and BAS to work correctly?

Questions 1 and 3 need the bookkeeper and accountant, not engineering
judgement. This ADR should not be accepted before that conversation.
