# Design — MCP read-coverage expansion (CRM · Leads · Social listening/inbox · EDM)

**Date:** 2026-06-22 · **Status:** design (awaiting review) · **Owner:** agent build
**Sub-project 1 of 3** in the "build the other missing MCPs" roadmap (`docs/superpowers/TODO-mcp-and-task-execution.md`).
Siblings (later, own specs): #2 **2d banner render over MCP**, #3 **financial writes over MCP (D4)**.

## 1. Goal & context

The MCP server is a **thin projection over the in-app AI tool registry** (`server/utils/ai/toolRegistry.ts`):
`projectReadOnlyTools()` exposes every non-mutating registry tool to external AI hosts, role-scoped, and
`executeReadOnlyTool()` runs it under the same RBAC ceiling as the in-app agent. So "missing MCP reads" = **missing
registry read tools**, not a gap in the MCP layer itself.

Today reads cover finance, adspend, campaigns, budget health, clients, projects, tasks, briefs, capacity, anomalies,
**social *performance*** (publishing/reporting KPIs), knowledge, forecasting, over-servicing, retainer burn, creative
queue. Four live platform domains have **zero read surface**: CRM, the leads inbox, social **listening/inbox**, and
EDM **campaign engagement**. This sub-project adds **6 read tools** to close that gap.

**Intended side-benefit (call out for review):** the registry is shared, so these tools also become available to the
**in-app AI chat** (`/agency/ai/chat`, `AI_TOOLS_ENABLED` on in prod) the moment they ship — not just to external MCP
hosts. That is desirable (the chat agent gets a richer read surface) and safe (read-only, role-gated, untrusted-spotlit).
There is no mechanism to expose a tool to MCP only; if MCP-only were required it would be new infrastructure — out of scope.

**Non-goals:** no writes (sub-projects #2/#3), no new permission groups, no new MCP flags, no EDM draft-template/module
reads (low signal — only *sent* campaign engagement is worth exposing), no new aggregation **endpoints** (the one
aggregate we need — leads summary — is a direct query inside the handler).

## 2. Architecture (fixed by the existing pattern)

Each tool follows `server/utils/ai/tools/social.ts` exactly:

1. A **pure, dependency-injected handler** `async (args, ctx, deps = defaultDeps) => ToolResult`. `deps` wraps every
   I/O boundary (client resolution, the upstream `$fetch`, any direct query) so the handler is unit-testable without
   the app graph or a DB.
2. The default deps **resolve `clientName → clientId`** via the shared idiom
   `SELECT id FROM agency_clients WHERE name ILIKE $1 ORDER BY name ASC LIMIT 1` (escaped with `escapeLike`), then
   **internal-`$fetch` an existing endpoint forwarding `ctx.event.headers`** (so the upstream endpoint re-applies its
   own auth + per-client scope). Mirrors `social.ts:56-70`.
3. Returns a **compact projection** via `ok(...)` (cap lists with `capWithMore`, truncate text), never the raw upstream
   payload. Errors are caught and returned as natural-language `fail(...)` — handlers never throw to the loop.
4. An **`AiTool` descriptor**: `name`, 3-4 sentence `description` (purpose / when / when-not / returns),
   `parameters` (Zod), `requiredPermission`, `returnsUntrusted: true` wherever user/platform text is returned,
   `mutates` omitted (read). Registered in `server/utils/ai/tools/index.ts`.

No migration. No new env flag. MCP exposure rides the existing `MCP_SERVER_ENABLED`; in-app exposure rides
`AI_TOOLS_ENABLED`. Both already on in prod.

### Shared helper
Add `resolveClientId(clientName, deps)` to a small shared module (or reuse the inline idiom) so the six tools don't
re-implement the lookup six ways. Returns `{ id, name }` or null → handler returns `fail('No matching client …')`.
Disambiguation (multiple matches) is **not** needed for reads — take the best single match, ORDER BY exact-match then
name, and name the resolved client back in the result so the host can see which one it used.

## 3. The six tools

> All client-scoped. All `returnsUntrusted: true` unless noted. All read-only (`mutates` omitted → projected to MCP).
> Period params use the existing `'7d'|'30d'|'90d'` enum where a window applies (see `socialPeriodWindow`).

### 3.1 `search_crm`  — RBAC `CLIENTS`
- **Purpose:** global CRM search across people, companies, opportunities, activities, tasks for one client.
- **Source:** `GET /api/crm/search?client_id=&q=&limit=` → `{ results: {type,id,title,subtitle,rank}[] }`.
- **Params:** `clientName: string`, `query: string (min 1)`, `limit?: number (default 20, max 50)`.
- **Returns:** `{ client, query, results: {type,id,title,subtitle}[] (capped), more }`. `title`/`subtitle` are untrusted
  (contact names, opp names, note snippets).

### 3.2 `get_crm_pipeline`  — RBAC `CLIENTS`
- **Purpose:** sales-pipeline snapshot — open opportunity count, total and weighted value, broken down by stage.
- **Source:** `GET /api/crm/pipeline?client_id=` → `{ byStage, openTotal, weightedTotal }` + `GET /api/crm/stages?client_id=`
  to map `stage_id → stage name` (pipeline returns ids only).
- **Params:** `clientName: string`.
- **Returns:** `{ client, openTotal, weightedTotal, stages: {stage, count, total, weighted}[] }`. Numeric — stage names
  are agency-defined config, low risk; mark `returnsUntrusted: false` (no free user text).

### 3.3 `get_leads`  — RBAC **none** (any authenticated user; matches current `/api/leads/list` which is `requireAuth`-only)
- **Purpose:** inbound leads for a client — either a recent list or a counts summary. The leads inbox has no read surface today.
- **Source (list mode):** `GET /api/leads/list?client_id=&status=&source=&from=&to=&page_size=` (excludes `is_test` by
  default — keep that default; do **not** set `include_test`).
- **Source (summary mode):** a **direct parameterized query** in the handler (no endpoint exists):
  `SELECT status, source, COUNT(*) FROM leads WHERE client_id=$1 AND deleted_at IS NULL AND is_test=false AND submitted_at >= $2 GROUP BY status, source`.
- **Params:** `clientName: string`, `summary?: boolean (default false)`, `status?: enum`, `source?: enum`,
  `period?: '7d'|'30d'|'90d' (default 30d)`, `limit?: number (default 20, max 50)`.
- **Returns:**
  - list mode → `{ client, period, total, leads: {id, submittedAt, source, status, name, contact, campaignName}[] (capped), more }`
  - summary mode → `{ client, period, total, byStatus: {status,count}[], bySource: {source,count}[] }`
- **PII / untrusted:** `field_data` carries PII (name/email/phone) and arbitrary advertiser-defined free text →
  `returnsUntrusted: true`, and the **projection surfaces only `name` + a single masked `contact` string**, never the
  full `field_data` blob. (Consistent with current in-app exposure, but deliberately compact over the wire.)

### 3.4 `get_social_listening`  — RBAC `CLIENTS`
- **Purpose:** social-listening overview for a client — volume, sentiment split, share-of-voice, top topics/sources,
  plus a few notable recent mentions.
- **Source:** `GET /api/agency/social/listening/overview?clientId=&days=` (aggregates; no untrusted text) +
  `GET /api/agency/social/listening/mentions?clientId=&sentiment=negative&limit=5` (top notable mentions, untrusted).
- **Params:** `clientName: string`, `period?: '7d'|'30d'|'90d' (default 30d)`.
- **Returns:** `{ client, period, total, sentiment:{positive,neutral,negative,unknown}, topTopics:[{topic,count}],
  topSources:[{source,count}], shareOfVoice:[{category,count}], notableMentions:[{source,sentiment,excerpt,url}] (≤5) }`.
  `excerpt` (truncated mention content) + topic strings are untrusted → `returnsUntrusted: true`.

### 3.5 `get_social_inbox`  — RBAC `CLIENTS`
- **Purpose:** social-inbox health for a client — open/closed counts, SLA breaches, response time, and optionally the
  most-urgent open conversations.
- **Source:** `GET /api/agency/social/inbox/analytics/overview?clientId=&days=` (metrics) + optionally
  `GET /api/agency/social/inbox/conversations?clientId=&status=open&breached=true&limit=5` (urgent list).
- **Params:** `clientName: string`, `period?: '7d'|'30d'|'90d' (default 30d)`, `includeUrgent?: boolean (default true)`.
- **Returns:** `{ client, period, total, open, responded, avgFirstResponseMinutes, slaBreaches, withinSlaPct,
  automationRatePct, urgent:[{platform, channel, participant, lastPreview, slaDueAt}] (≤5) }`. `participant` +
  `lastPreview` are untrusted → `returnsUntrusted: true`.

### 3.6 `get_email_campaign_performance`  — RBAC `MANAGEMENT`
- **Purpose:** EDM campaign engagement for a client — list recent campaigns with status + open/click/bounce rates, or
  drill into one campaign's metrics. (Draft templates/modules are deliberately excluded — no send signal.)
- **Source:** `GET /api/email/campaigns` (denormalized counters: `to_send,sent,delivered,opened,clicked,bounced,
  complained,unsubscribed`, `status`, `client_id`) filtered to the resolved client; optional drill via
  `GET /api/email/campaigns/[id]/events` for one campaign's engagement summary.
- **Params:** `clientName: string`, `campaignName?: string (drill to one)`, `limit?: number (default 10, max 25)`.
- **Returns (list):** `{ client, campaigns: [{id, name, status, sent, openRate, clickRate, bounceRate,
  unsubscribeRate, flags:[…]}] (capped), more }` where `flags` calls out bounce>5% / open<5% / unsub-spike.
  **Drill:** adds `{ delivered, opened, clicked, … }` for the named campaign. `name`/`subject` are untrusted →
  `returnsUntrusted: true`. Rates computed in the handler from counters (avoid divide-by-zero → null rate).

## 4. RBAC summary
| Tool | `requiredPermission` | Rationale |
|---|---|---|
| `search_crm`, `get_crm_pipeline` | `CLIENTS` | matches `social.ts` precedent; includes account managers + sales |
| `get_leads` | *(none — any authed)* | matches current `/api/leads/list` (`requireAuth`-only); operator chose "all" |
| `get_social_listening`, `get_social_inbox` | `CLIENTS` | same group as existing `get_social_performance` |
| `get_email_campaign_performance` | `MANAGEMENT` | matches `email-marketing/access.ts` "agency email user" model |

Defense-in-depth is automatic: `filterToolsForUser` (pre-send) + `roleHasPermission` re-check at execute
(`toolRegistry.ts:72`) + the upstream endpoint's own `requireAuth`/per-client scope when we `$fetch` it.

## 5. Testing (TDD, per tool)
Mirror `test/ai/` and the `social.ts` deps pattern. For each tool, unit-test the **pure handler with injected deps** (no
DB, no network):
- happy path → compact projection shape is correct, lists capped, `more` accurate;
- client-not-found → `fail(...)` (no upstream call made);
- upstream throw / non-ok → graceful `fail(...)`, never throws;
- untrusted fields present and truncated; numeric rates handle zero denominators (email);
- leads **summary mode** vs **list mode** branch on `summary` and shape correctly; `is_test` excluded.
Plus one **projection/RBAC assertion** that all six are `mutates`-false (so `projectReadOnlyTools` exposes them) and carry
the intended `requiredPermission`. Target: each tool file lint+tsc clean; full `test/ai/` green (no regressions to the
existing 600+).

## 6. Out of scope / deferred
- Writes of any kind (sub-projects #2 banner, #3 financial-D4).
- EDM template/module/subscriber-list reads (low signal); CRM contacts/opportunities as *separate* tools (folded into
  `search_crm`; can be promoted later if hosts ask for structured lists — Approach C).
- A dedicated leads-summary **endpoint** (handler-local query is enough); new permission groups; MCP-only exposure.

## 7. Rollout
No migration, no flag. Ships on the next deploy from the clean `.worktrees/deploy-prod` worktree. On deploy the six tools
are live to both the in-app chat (role-gated) and external MCP hosts (role-gated). Marketing/connector copy (M-sync) and
the `mcp-server-guide.md` capability list get a follow-up doc update noting the broadened read surface.
