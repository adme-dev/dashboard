# P3 — Alert Rules + Activity Feed

**Status:** Firm
**Roadmap:** [Ad Spend Roadmap](2026-05-04-ad-spend-roadmap.md)
**Target:** 1 week after P2
**Date:** 2026-05-04

## Problem

The spend page is reactive — operators have to come look. When something goes wrong (sudden CPC spike, projected overspend, expired connection) it surfaces only on the next manual check. Best-in-class platforms (Improvado, Adverity) ship configurable alert rules with channel routing as table-stakes.

## Goal

Operator gets notified when something needs attention without manually scanning the page; the page itself shows the last 24h of activity at the top so the morning check-in is one screen.

## User stories

- As a media buyer, when a client's projected EOM spend exceeds budget by >130%, I get notified in my inbox without checking the page
- As an account manager, the first thing I see in the morning is "what changed yesterday" — sync results, large spend swings, anomalies, budget changes
- As an admin, I can toggle individual alert rules on/off without engineering involvement

## Acceptance criteria

1. New table `spend_alert_rules` (org-scoped, see Data model)
2. Seed rules created on first deploy:
   - `Pacing > 130% (Will exhaust early)` — high severity
   - `Conversions = 0 while spend > $100 in last 7 days` — high severity
   - `Daily spend up >50% vs 7-day average` — medium severity
   - `Connection expired` — high severity (deduped by connection_id, fires once per expiry)
   - `Sync failed for 24h+` — medium severity
3. Cron handler `POST /api/cron/spend-alerts` (`INTERNAL_API_KEY`):
   - Runs hourly via CF Workers cron trigger
   - Iterates all enabled rules
   - Evaluates condition against current state for each rule
   - Emits to existing `notifications` table with `importance` scored via existing `notificationImportance.ts`
   - Writes evaluation result to `spend_alert_events` (dedup — don't re-fire same alert within 12h for the same `trigger_key`)
4. Settings page `/settings/spend-alerts` — list of rules with enable/disable toggles. Custom-rule creation deferred to P3.5
5. New "Activity Feed" on `/agency/social/spend` — mounted between Connection Health strip and Summary Cards. Shows top 5 events from last 24h:
   - Sync completed/failed
   - Budget changed (existing `budget_audit_log`)
   - Anomaly fired
   - Connection state changed
   - "View all" link → `/agency/inbox?filter=spend`

## Data model

**Migration `092_spend_alert_rules.sql`:**

```sql
CREATE TABLE spend_alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  condition_json JSONB NOT NULL, -- {type, op, value, [sustained_days, threshold]}
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES team_members(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_spend_alert_rules_enabled ON spend_alert_rules(enabled) WHERE enabled = true;

CREATE TABLE spend_alert_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES spend_alert_rules(id) ON DELETE CASCADE,
  client_id UUID REFERENCES agency_clients(id),
  trigger_key TEXT NOT NULL, -- dedupe key like "client_id:platform"
  fired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notification_id UUID, -- FK to notifications.id when emitted
  payload JSONB
);
CREATE INDEX idx_spend_alert_events_dedupe ON spend_alert_events(rule_id, trigger_key, fired_at DESC);
```

**Tenancy note:** The agency app is single-tenant at the data layer (no `org_id` on `media_spend`, `social_connections`, `team_members`, etc.). Alert rules and events are therefore global. If multi-tenancy is added later, both tables get `org_id` columns in a follow-up migration; until then, single-tenant is the existing pattern across all agency tables.

## API surface

- `GET /api/agency/social/alerts/rules` — list all rules
- `PATCH /api/agency/social/alerts/rules/:id` — toggle `enabled` (and update other fields in P3.5)
- `GET /api/agency/social/spend/activity` — merged feed of last 24h events from `notifications`, `media_spend.updated_at` (sync events), `budget_audit_log`, `spend_alert_events`
- `POST /api/cron/spend-alerts` — `INTERNAL_API_KEY` guarded, evaluates and emits

## UI components

**New:**
- `app/components/social/SpendActivityFeed.vue` — compact list of 5 events with type icon + timestamp + one-line summary
- `app/pages/settings/spend-alerts.vue` — `UTable` of rules with enable/disable toggle column

**Edited:**
- `app/pages/agency/social/spend.vue` — mount `SpendActivityFeed` between health strip and summary cards
- `app/layouts/agency.vue` — add "Spend Alerts" link under Settings (gated to `canAccessAdmin`)

## Cron wiring

After deploy, add CF Workers cron trigger in dashboard:
- Schedule: `0 * * * *` (hourly)
- Target: `POST https://agency-dashboard-6cm.pages.dev/api/cron/spend-alerts`
- Header: `Authorization: Bearer ${CRON_SECRET}`

## Out of scope

- Custom rule builder UI (P3.5) — only seed rules editable via toggle in v1
- Email/Slack delivery channels — existing notifications stack is in-app only; channel additions covered in a future "notifications channels" project
- Multi-tenancy hooks (single-tenant app today; revisit when multi-tenant is added project-wide)

## Test plan

- Manual: trigger an artificial pacing > 130% scenario via budget UI, wait one hour, confirm notification arrives
- Manual: toggle a rule off, repeat, confirm no notification
- Manual: confirm dedup — same scenario doesn't re-fire within 12h
- Manual: invoke cron endpoint directly via curl with `INTERNAL_API_KEY` for faster iteration
- Code: `pnpm exec vue-tsc --noEmit` clean

## Risks

- Inbox flood: bad rules can spam everyone. Mitigation: conservative seed thresholds + dedup window + monitor inbox volume for 1 week post-launch
- Cron failures aren't surfaced. Mitigation: log to CF Workers logs; future: add a "last evaluation" timestamp to rules table
