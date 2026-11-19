# Marketing automation governance: detect → decide → approve → execute → automate

Captured: 2026-11-19
Priority: P1
Status: in progress (phases 1–4 assigned to implementation agents 2026-11-19; phase 5 gated)
Source: Paul + Garrix (marketing) request to let the marketing department make, schedule and automate
Google Ads/Meta changes from Claude, ChatGPT and XeroFlow chat when alerts occur.

## Principle

Claude / ChatGPT / XeroFlow chat are the **authoring and approval surface**. XeroFlow is the **only scheduler
and executor**. A chat app's own scheduled tasks never change a client account: they run on one person's
token, are invisible to the team and are non-deterministic. Everything new ships **dormant behind a flag
(default off)**; flipping any flag needs Paul's explicit go-ahead.

## Phases

### 1. Alerts, notify-only
Route existing detectors to the marketing team (Slack channel / XeroFlow notification), notify-only:
budget pacing (over/under, no budget set), anomalies, Google policy-limited ads/assets, spend-sync failures
(e.g. Google 403 manager-link loss, Meta coverage staleness), wasted search-term spend. Each alert gets a
stable id, dedupe key, client/account scope and a deep link; alerts never execute anything.

### 2. Risk tiers, limits, kill switch, rule registry (governance core)
- Risk tiers per action family: `read` (no gate) · `low` (e.g. add negative keywords: one independent
  approval) · `medium` (budget, bidding, conversion settings, pause: manager approval) · `high` (remove
  campaigns/conversion actions: owner only, never automatable).
- Hard limits: max ±% budget change per campaign per day, max changes per account per day, business-hours
  window; one global automation kill switch.
- Automation rule registry: every rule has a named owner, scope, thresholds, mode
  (`notify` → `draft` → `auto_apply`), expiry/review date, and immutable version history (who changed what).
- Configurable proposal expiry (the fixed 24 h window expired the team's first 21 November budget
  proposals; default to business-day aware, e.g. 72 h).

### 3. Draft → approve flows for marketing
Marketing staff can run the existing search-term and pause policy runners and get **drafts**, approved
independently (requester can never approve their own), then executed by XeroFlow with re-validation and drift
checks. Approvals reachable from MCP (Claude/ChatGPT) and in-app chat; owner (God mode) can review too.

### 4. Per-client change timeline (history log)
One timeline per client/account across today's scattered sources (`ai_action_audit`, `ai_pending_actions`,
Google Ads action plans/execution ledger, `budget_audit_log`, binding events): who asked, why, triggering
alert, approver, before/after, provider request id, verification result, rollback reference. Exposed as a
XeroFlow page and a read-only MCP tool. Retention ≥ client contract term.

### 5. First auto-apply (gated — do NOT start without go-ahead)
One low-risk family only (negative keywords from wasted search terms) under phase-2 limits, business hours,
with undo recorded. Expand per family based on phase-4 history.

## Acceptance
- No new code path can change a provider account without an approved, re-validated plan or an active,
  owned, unexpired rule within limits; the kill switch stops all automation immediately.
- Every change appears once in the client timeline with full lineage, including Google's request id.
- All flags default off; tests prove dormancy.
