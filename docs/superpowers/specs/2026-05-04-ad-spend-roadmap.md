# Ad Spend Roadmap (P1–P5)

**Status:** Approved 2026-05-04
**Owner:** Paul (Product)
**Source:** Conversational brainstorm 2026-05-04 + R&D pass on 8 specialized agency platforms

## Vision

`/agency/social/spend` becomes a media-buyer's daily operating page. At a glance you see (a) which connections are healthy, (b) where each client is pacing this period, (c) what changed in the last 24h, and (d) which numbers need a human. The page graduates from a static table into a live dashboard that surfaces problems before clients notice them.

## Why this work, why now

A live R&D pass against 8 specialized agency platforms (Funnel.io, Improvado, Supermetrics, AgencyAnalytics, Whatagraph, NinjaCat, TapClicks, Adverity) confirmed XeroFlow has the core math (spend, budget, variance, commission) but is missing the intelligence layer everyone else now ships as table-stakes: pacing projections, connection-health surfacing, configurable alerts, daily granularity. Today's incident — 113 expired Meta tokens silently blanked Meta data from the spend table — is the canonical case for P1.

## Phase ordering

| # | Phase | Status | Why this order |
|---|-------|--------|----------------|
| P1 | Connection Health Surface | Firm — **shipped 2026-05-04** | Pacing/alerts mislead when half the data is stale. Must come first. |
| P2 | Pacing Intelligence | Firm | Closes the biggest competitive gap; informs P3's alert dimensions. |
| P3 | Alert Rules + Activity Feed | Firm | Depends on P2 (pacing status is one alert dimension). Closes the operator's morning-routine loop. |
| P4 | In-App AI Chat as MCP Client | Sketch (revised) | Becomes much smaller after P6 ships. Revisited after P3. |
| P5 | Three-Way Reconciliation + Margin | Sketch | Depends on invoice schema not yet wired. |

## Adjacent initiative — XeroFlow MCP server (P6)

**[P6](2026-05-04-xeroflow-mcp-server-sketch.md)** is not part of the ad-spend-page sequence but is referenced from this roadmap because it changes P4's architecture. P6 exposes XeroFlow as a remote MCP server (`mcp.adme.net.au/agency`) so agency staff can query the data layer from any AI tool — Claude Desktop, Perplexity, ChatGPT, Cursor, the in-app chat — via standard remote-MCP-with-OAuth.

Why it earns a spot on this roadmap: **P4 stops being a from-scratch build once P6 exists** — the in-app chat becomes one MCP client among many, all calling the same tool surface. The leverage ratio is high (one MCP server unlocks every AI surface the team uses), and it has no upstream dependency on P2/P3 — can ship in parallel.

**Decision point:** validate ergonomics by installing Meta's MCP (`mcp.facebook.com/ads`) in Claude Desktop and doing a real ad-ops task before committing to P6 scope.

## Per-phase success metrics

| Phase | How we know it worked |
|-------|------------------------|
| P1 | Zero "missing data" surprises like 2026-05-04. Token expiry visible within 24h, ≤2-click reconnect. |
| P2 | Media buyer answers "which clients will overspend this period?" without leaving the page. Pacing pill correct on a 5-client manual sample. |
| P3 | At least one useful (non-noise) alert per week. Activity feed checked at start of every working day. |

## Cross-phase exit criteria

The roadmap is "done" when a media buyer can run their morning routine entirely on this page (no spreadsheets, no platform UIs, no Slack manual checks) for the current period.

## Cross-cutting

**RBAC**
- Connection Health strip: visible to anyone with `canAccessMediaBuying`
- Reconnect CTAs: gated to `canAccessAdmin` OR `canWrite`
- Spend Alerts settings page: `canAccessAdmin`
- Cron endpoints: `INTERNAL_API_KEY` (existing pattern)

**Tenancy**
- The agency app is **single-tenant** at the data layer (no `org_id` on `media_spend`, `social_connections`, `team_members`, etc.). Only Xero-related tables carry a `tenant_id`, and that's the Xero organisation, not an app tenant.
- New tables in this roadmap follow the same convention: no `org_id`. Rules and events are global.
- Cached endpoints scope cache keys per Xero `tenant_id` only when the data depends on Xero (e.g., bank-charges); otherwise a single global key.

**Telemetry**
- Stable log prefixes per phase: `[ConnectionHealth]`, `[Pacing]`, `[SpendAlerts]` — keeps CF logs greppable
- No analytics events (no analytics infra in this project today)

**Backwards compatibility**
- All API extensions are additive (new fields, no field removals/renames). Old client builds keep working until cache drains.

## Rollout

| Phase | Migrations | Feature flag | Target |
|-------|-----------|--------------|--------|
| P1 | None | None | This week |
| P2 | None | None | 1–2 weeks after P1 |
| P3 | 1 (`spend_alert_rules`, `spend_alert_events`) | None — conservative seed rules + monitor inbox | 1 week after P2 |

No feature flags. The page is internal-only — broken changes get redeployed. P3's cron is the only shared-state effect; we seed conservative rules and monitor inbox volume for the first week.

## PRD index

- [P1 — Connection Health Surface](2026-05-04-ad-spend-p1-connection-health.md) — firm
- [P2 — Pacing Intelligence](2026-05-04-ad-spend-p2-pacing.md) — firm
- [P3 — Alert Rules + Activity Feed](2026-05-04-ad-spend-p3-alerts.md) — firm
- [P4 — In-App AI Chat as MCP Client](2026-05-04-ad-spend-p4-ai-sketch.md) — sketch only (revised 2026-05-04)
- [P5 — Three-Way Reconciliation + Margin](2026-05-04-ad-spend-p5-reconciliation-sketch.md) — sketch only
- [P6 — XeroFlow MCP Server](2026-05-04-xeroflow-mcp-server-sketch.md) — sketch only, adjacent initiative (added 2026-05-04)

## Source material

- 2026-05-04 R&D synthesis across 8 competitors (Funnel.io, Improvado, Supermetrics, AgencyAnalytics, Whatagraph, NinjaCat, TapClicks, Adverity)
- 2026-05-04 production incident: 113 Meta connections expired silently → spend page showed Google-only data with no warning
- Existing project intel: notification system (importance scoring + daily digest + snooze), Groq AI stack, Xero bank-charges integration, `social_connections` schema
