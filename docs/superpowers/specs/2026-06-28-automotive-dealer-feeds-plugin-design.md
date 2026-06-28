# Automotive Dealer Feeds Plugin — Design Spec

- **Date:** 2026-06-28
- **Status:** Draft (approved in brainstorming; pending spec review → implementation plan)
- **Authors:** Paul + Claude
- **Repos touched:** `dashboard` (XeroFlow, Nuxt 4 / Neon / CF Pages) and `social-dashboard` (Vehicle Feed Platform, Nuxt 3 / Supabase / CF Pages)

## 1. Problem & Goal

XeroFlow runs automotive dealer ad campaigns (Meta AIA, Google PMax Inventory) whose briefs reference a dealer's vehicle inventory feed — but today those references (`feed_partner`, `auto_stock_feed_url`, `auto_catalogue_id`) are **inert stored strings**; nothing in XeroFlow fetches a feed.

The separate **`social-dashboard`** app is a Vehicle Feed Platform that already ingests dealer inventory (DealerStudio via Meilisearch, plus a Supabase vehicles DB), builds Google/Facebook feeds, and exposes an MCP server.

**Goal:** a reusable **feed-provider plugin** in XeroFlow so the marketing team can set up and manage a dealer's feeds conversationally (AI chatbot), and so automated jobs (briefs, sync, pacing) can consume live feed data — with `social-dashboard` as the first provider behind a pluggable interface.

### v1 scope (confirmed)

All four consumers, read **and** write:
1. **Marketing AI chatbot** — list/preview/create/update/generate a dealer's feeds conversationally.
2. **Brief & campaign automation** — auto-fill live feed data into `meta-aia`/`google-pmax` briefs; the C5 gatekeeper can require a valid linked feed.
3. **Scheduled feed-sync cache** — cron pulls each linked dealer's inventory/metrics into XeroFlow.
4. **Spend & pacing AI** — inventory-aware pacing (e.g. flag spend on a near-empty feed).

Dealer mapping must handle the **mixed** reality: link to an existing org/feeds, create feeds in an existing org, or onboard a dealer from scratch.

## 2. Confirmed system facts (verified against code, 2026-06-28)

**social-dashboard**
- MCP server: `dashboard/server/mcp/server.ts` (official `@modelcontextprotocol/sdk ^1.29`), 14 tools — 7 Google + 7 Facebook: `list / get / preview / validate / generate / metrics / update_*_feed_settings`. **No `create_feed`** (creation is REST `POST /api/feeds`).
- Transport: custom **SSE session** (`server/api/mcp/sse.get.ts` + `message.post.ts`, `NitroSSETransport`) with a 250 ms `MCP_SESSIONS` KV poll. **Cloudflare-Pages only** (`preset: cloudflare-pages`).
- Auth: `serverSupabaseUser(event)` → 401 without a Supabase **user** JWT (dev bypass only when `NODE_ENV=development`). **No service-to-service auth path.**
- Feed-source abstraction: `server/utils/vehicleSource.ts` — `FeedSource = { type: 'supabase' | 'meilisearch' }`, routed per-feed via `feed.source`. Vehicle fetch is **always feed-scoped** (`fetchFeedVehicles(feed, filters)`); **no dealer/org-level inventory query exists**. Dealer key in normalized vehicles = `seller_id` / `seller_name` (DealerStudio `dealership_slug`); feeds belong to `organization_id`.
- REST surface: `/api/feeds` (GET list, POST create), `/api/feeds/[id]` (GET, PATCH), `/api/feeds/[id]/{preview,metrics,serve}`, `/api/feeds/{generate,preview,merge-*}`.

**XeroFlow**
- AI stack: core `ai ^6.0.197` (AI SDK v6), `@ai-sdk/anthropic`, `@ai-sdk/groq`. Tool loop `server/utils/ai/toolLoop.ts` builds native `AiTool`s → `toSdkTools` → `generateText`. Safety rails (propose→confirm "Option B", RBAC `filterToolsForUser`, invocation ledger, untrusted-content spotlight) live in the **native AiTool layer**.
- MCP server (its own): `workers/mcp-server` (Cloudflare Worker) projects XeroFlow's native tools to external hosts via `/api/internal/mcp/{tools,call}` (`x-mcp-secret` + asserted userId, role re-derived server-side). **No MCP _client_ today.**
- Integration pattern: `integration_configs` table (`integration_type` unique; Monday/Xero/Meta/Google-Ads). Cron = `/api/cron/*` + companion Workers + `x-cron-secret`. Bindings: `CACHE` (KV), `JOBS_QUEUE`, `HYPERDRIVE`, `AI`, `VECTORIZE`, `MEDIA_BUCKET` (R2).
- Briefs: `meta-aia` (objective traffic/leads/sales) and `google-pmax` (pmax_type standard/inventory) templates carry `auto_catalogue_id`, `auto_stock_feed_url`, `feed_partner`. See the companion `server/utils/briefCampaignType.ts` (brief→Monday code mapping).

## 3. Architecture — two planes, one plugin boundary

```
                       XeroFlow (Neon · CF Pages)
┌──────────────────────────────────────────────────────────────┐
│ Marketing chatbot (/agency/ai/chat)                            │
│   feed_* AiTools (native; propose→confirm + RBAC + ledger)     │
│        │                                                       │
│        ▼                                                       │
│ FeedProvider registry  server/utils/feeds/providers/          │
│   provider#1 = social-dashboard   (future: autogate, carloop) │
│        │  socialDashboardClient (REST + service-auth)          │
│ Cron feed-sync ─────────┤                                      │
│   └─► dealer_feed cache (Neon tables + KV/R2)                  │
│ Brief automation · Pacing AI ──► read cache                   │
│                                                                │
│ XeroFlow MCP server (workers/mcp-server) ── exposes the SAME   │
│   feed_* native tools to external AI hosts (Claude/ChatGPT)    │
└───────────────────────────────────┬──────────────────────────┘
            REST  /api/feeds/*  (x-feed-service-secret + org ref)│
                                                                 ▼
                    social-dashboard (Supabase · CF Pages)
┌──────────────────────────────────────────────────────────────┐
│ REST /api/feeds/*  (+ NEW create parity, search_inventory,     │
│                      service-auth path)                        │
│ MCP /api/mcp/*  (+ NEW create_feed, search_inventory tools,    │
│                   service-auth) — parity for external hosts    │
│ feed-source plugins (vehicleSource.ts): DealerStudio / Supabase│
└──────────────────────────────────────────────────────────────┘
```

**Key design decisions baked in:**

- **D1 — Native AiTools, not raw MCP passthrough.** The chatbot's feed tools are XeroFlow-native `AiTool`s whose *handlers* call `social-dashboard`. This preserves propose→confirm, RBAC, the ledger, and spotlighting. (Piping SD's MCP tools raw into `generateText` would let writes execute ungated — rejected.) Because they're native tools, they are automatically exposed over XeroFlow's existing MCP server to chat + external hosts.
- **D2 — Internal hop = REST.** XeroFlow→SD uses SD's REST `/api/feeds/*` (stateless, cache-friendly, no SSE-session fragility). SD's MCP is enhanced *in parallel* (same underlying functions) so external AI hosts keep parity. The fragile SSE-session MCP stays off XeroFlow's critical path.
- **D3 — One capability contract.** A `FeedProvider` interface is the plugin boundary; `socialDashboard` is provider #1. Both planes (chatbot handlers + cron) call the provider, so there is a single capability surface, not two transports to drift.

## 4. The plugin boundary — `FeedProvider`

`server/utils/feeds/types.ts`:

```ts
export interface FeedRef { providerId: string; feedId: string; platform: 'google' | 'facebook' }
export interface DealerLink {
  clientId: string
  providerId: string
  externalOrgId: string        // SD organization_id (feed ownership)
  sellerRefs: string[]         // SD seller_id / dealership_slug (inventory queries)
  defaultFeedIds?: string[]
}
export interface VehicleSummary { /* normalized subset of SD vehicle shape */ }
export interface FeedSummary { id: string; name: string; platform: 'google'|'facebook'; isActive: boolean }
export interface FeedMetrics { inventory: number; active: number; issues: number; fetchedAt: string }

export interface FeedProvider {
  id: string                                  // 'social-dashboard'
  label: string
  listFeeds(ctx, link: DealerLink): Promise<FeedSummary[]>
  getFeed(ctx, ref: FeedRef): Promise<FeedDetail>
  previewFeed(ctx, ref: FeedRef, opts): Promise<{ total: number; items: VehicleSummary[] }>
  searchInventory(ctx, link: DealerLink, filters): Promise<{ total: number; items: VehicleSummary[] }>
  createFeed(ctx, link: DealerLink, spec): Promise<FeedRef>     // write
  updateFeed(ctx, ref: FeedRef, patch): Promise<void>          // write
  generateFeed(ctx, ref: FeedRef, fmt): Promise<{ url: string; itemCount: number }>  // write
  getMetrics(ctx, ref: FeedRef): Promise<FeedMetrics>
  // onboarding (mixed-case): present only if provider supports it
  ensureOrg?(ctx, clientId: string, spec): Promise<{ externalOrgId: string }>
  linkSource?(ctx, ref: FeedRef, source): Promise<void>
}
```

`server/utils/feeds/registry.ts` maps `id → FeedProvider`. v1: one entry (`socialDashboard.ts`). Adding a *direct* Autogate/CarLoop provider later = a new file implementing this interface + one registry line — **that is the "plugin section."**

## 5. Auth / identity bridge

- XeroFlow → SD: header `x-feed-service-secret: <SOCIAL_DASHBOARD_SERVICE_SECRET>` plus asserted context `{ actingUserEmail, externalOrgId }` (body/header).
- SD enhancement: when the service secret is valid, **bypass the Supabase-user JWT but hard-scope every query to the asserted `externalOrgId`** and record the acting user in audit. Mirrors XeroFlow's own internal-MCP pattern (secret + asserted identity, validated server-side; never trust an asserted role).
- Secrets live in CF Pages env on both sides (never DB/code). XeroFlow stores the connection (`baseUrl`) in an `integration_configs` row `integration_type='social-dashboard'`.

## 6. Data model (XeroFlow / Neon — new tables)

- `integration_configs` row: `integration_type='social-dashboard'`, `settings={ baseUrl }`. (Secret in env.)
- **`client_feed_links`** — the client↔dealer map (handles mixed case):
  `id, client_id (FK agency_clients), provider_id, external_org_id, seller_refs jsonb, default_feed_ids jsonb, status, created_by, created_at, updated_at` — unique `(client_id, provider_id)`.
- **`dealer_feed_cache`** — per-sync snapshot: `id, client_id, provider_id, feed_id, platform, vehicle_count, active_count, issues_count, metrics jsonb, sample jsonb, fetched_at`. Large raw vehicle lists → KV (`CACHE`, key `feed:<client>:<feedId>`, TTL≈sync interval) or R2 if oversized.
- **`dealer_feed_sync_logs`** — audit per run (mirrors existing `sync_logs`): `id, client_id, provider_id, operation, status, started_at, completed_at, vehicle_count, error_message, details jsonb`.

All cache reads surface `fetched_at` (cross-DB staleness is explicit, never hidden).

## 7. social-dashboard enhancements

1. **`create_feed`** — REST already has `POST /api/feeds`; add an MCP `create_feed` tool wrapping the same create function (parity for external hosts).
2. **`search_inventory`** — net-new dealer/org-level vehicle query (not feed-scoped). REST endpoint + MCP tool, both wrapping a new `searchInventory(orgId|sellerRefs, filters)` built from existing `vehiclesClient` + `sellerMatches` + `applyVehicleFilters`.
3. **Service-auth path** on `/api/feeds/*` (and MCP) — accept `x-feed-service-secret` + asserted `externalOrgId`, strictly org-scoped.
4. **Onboarding (optional in v1, gated by `ensureOrg`/`linkSource`)** — `create_organization` + `link_source` (set DealerStudio/Autogate `source`) for greenfield dealers. Can ship in P4 if time-boxed.

> All of these reuse existing functions; the marginal cost of MCP parity over REST is thin wrappers.

## 8. Consumer wiring

- **Chatbot** — `server/utils/ai/tools/feeds*.ts`: `feed_list`, `feed_preview`, `inventory_search` (read, `auto`); `feed_create`, `feed_update` (`mutates`, propose→confirm); `feed_generate` (`mutates`, `riskTier:'rich_confirm'` — it changes what live ads serve). Registered in `server/utils/ai/tools/index.ts`. Gated behind a `FEEDS` permission group, re-checked at execute.
- **Brief & campaign automation** — on a linked client's `meta-aia`/`google-pmax` brief create/edit, auto-fill `auto_catalogue_id` / `auto_stock_feed_url` from the link and surface live inventory counts from the cache; C5 gatekeeper can require a valid linked feed (extends the completeness contract). Composes with `briefCampaignType.ts`.
- **Feed-sync cron** — `server/api/cron/feed-sync.post.ts` (+ companion Worker, `x-cron-secret`): iterate `client_feed_links` → `getMetrics` + `searchInventory` via the REST provider → write `dealer_feed_cache` + KV → log to `dealer_feed_sync_logs`. Cadence ≈ every 6 h.
- **Pacing AI** — new detector "spend continuing on near-empty / zero-stock feed" reads `dealer_feed_cache` (depends on the cron existing).

## 9. Write safety, RBAC, flag

- Whole feature behind `DEALER_FEEDS_ENABLED` (default off), per XeroFlow convention.
- Writes (`feed_create`/`feed_update`/`feed_generate`) PROPOSE only; the operator confirms in the existing propose→confirm UI before XeroFlow calls SD. `feed_generate` uses `rich_confirm`.
- `FEEDS` permission group; marketing roles granted. Service-auth to SD is org-scoped; never cross-org.

## 10. Phasing (scope = all four, sequenced to de-risk)

- **P1 — Foundation:** `integration_configs` row + `client_feed_links` + `FeedProvider` interface/registry + `socialDashboardClient` (REST + service-auth). SD: service-auth path + `create_feed`/`search_inventory` (REST + MCP).
- **P2 — Chatbot (headline):** native `feed_*` AiTools + propose→confirm + `FEEDS` RBAC; auto-exposed via XeroFlow MCP server.
- **P3 — Sync cache:** `feed-sync` cron + companion Worker + `dealer_feed_cache`/`sync_logs` + KV.
- **P4 — Automation + pacing:** brief auto-fill + gatekeeper requirement + inventory-aware pacing detector (needs P3); optional dealer onboarding (`ensureOrg`/`linkSource`).

## 11. Testing

- **Unit:** mapping resolution; provider REST request/response normalization; service-auth header construction; propose→confirm gating on write tools; cache read/write + staleness surfacing. SD mocked.
- **Contract test:** pin a fixture of SD's responses (REST + MCP `tools/list`) so schema drift on the SD side fails CI loudly.
- **Integration (manual smoke):** against SD staging with the service secret; verify org-scoping (cannot read another org).

## 12. Risks & mitigations

- **Cross-DB staleness** — cache is a snapshot; always show `fetched_at`; chatbot reads can go live via the provider when freshness matters.
- **Two surfaces on SD (REST + MCP)** — keep both as thin wrappers over shared functions; contract test guards drift.
- **SD hosting** — MCP/KV require the CF Pages deployment; do not target the Netlify path. Confirm the canonical `baseUrl`.
- **Live-ad blast radius** — `feed_generate` changes served ads → `rich_confirm` + audit; feature flag default off.
- **Org-scoping correctness** — service-auth MUST scope every SD query by asserted org; add a negative test.

## 13. Out of scope (v1)

- Bidirectional sync / writing XeroFlow data back into SD beyond feed management.
- Direct Autogate/CarLoop providers (the interface is built so they slot in later).
- Replacing SD's SSE MCP transport (left as-is for existing external consumers).

## 14. Implementation change map

**XeroFlow (`dashboard`)**
- `server/utils/feeds/types.ts`, `registry.ts`, `providers/socialDashboard.ts`, `socialDashboardClient.ts`
- `server/utils/ai/tools/feeds*.ts` (+ register in `tools/index.ts`); add `FEEDS` to the permission groups
- `server/database/migrations/NNN_dealer_feeds.sql` (`client_feed_links`, `dealer_feed_cache`, `dealer_feed_sync_logs`)
- `server/api/cron/feed-sync.post.ts` + `workers/feed-sync-cron/`
- brief auto-fill hook in the brief create/edit path; gatekeeper requirement
- pacing detector addition
- `nuxt.config` runtime config + env: `DEALER_FEEDS_ENABLED`, `SOCIAL_DASHBOARD_SERVICE_SECRET`, SD `baseUrl`

**social-dashboard**
- `server/utils/serviceAuth.ts` (validate `x-feed-service-secret` + asserted org)
- `server/utils/inventorySearch.ts` (org/seller-level query)
- `server/api/feeds/search-inventory.post.ts` (REST) + service-auth on existing `/api/feeds/*`
- `server/mcp/tools/*` add `create_feed` + `search_inventory`; wire service-auth into `sse.get.ts`/`message.post.ts`
- env: `SOCIAL_DASHBOARD_SERVICE_SECRET`

## 15. Open questions for review

1. Onboarding (`ensureOrg`/`linkSource`) in P4 v1, or a fast follow?
2. `FEEDS` as a new permission group vs reuse `CLIENTS`?
3. Sync cadence (6 h default) and whether pacing needs fresher data.
