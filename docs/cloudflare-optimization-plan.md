# Cloudflare Optimization Plan — XeroFlow Agency

> Comprehensive plan to leverage Cloudflare's edge network, AI Gateway, and infrastructure services to transform the dashboard into a high-performance, production-grade application.

## Current Architecture

| Layer | Technology | Status |
|-------|-----------|--------|
| Frontend | Nuxt 4 (SPA mode, Cloudflare Pages) | Deployed |
| Backend | Nitro (Cloudflare Pages Functions) | Deployed |
| Database | Neon Serverless Postgres via Cloudflare Hyperdrive | Active; `DATABASE_URL` fallback |
| AI/LLM | Groq SDK (direct API calls) | Connected (direct) |
| Object Storage | Cloudflare R2 | Connected |
| Email | Resend | Connected |
| Accounting | Xero API (OAuth2) | Connected |
| Ads | Meta Graph API, Google Ads REST API | Connected |

### Key Bottlenecks Identified

1. **Database connections**: Hyperdrive now provides the primary edge TCP connection pool for Pages and DB-writing Workers; remaining work is observability, fallback verification, and hot-query measurement.
2. **Xero API latency**: `cash-flow-forecast` makes 4 sequential Xero API calls (~2-4s total), token validation adds 2-3 DB queries per request
3. **AI calls unmonitored**: Groq calls go direct — no caching, rate limiting, cost tracking, or fallback routing
4. **In-memory state lost**: Board events bus uses module-level `Map` — each Cloudflare Pages isolate gets its own empty state
5. **No response caching**: Expensive computations (EOM engine, AI insights, Xero reports) re-execute on every request

---

## Phase 1 — Connection & AI Optimization (Immediate)

**Goal**: Reduce latency on every request by optimizing database connections and AI call routing.
**Impact**: High | **Effort**: Low | **Risk**: Minimal

### Phase 1a — Neon Connection Pooler

**What**: Switch `DATABASE_URL` to use Neon's built-in PgBouncer pooler endpoint.

**Why**: Every Pages Function invocation currently opens a fresh TCP+TLS connection to Neon's compute. The pooler endpoint (`-pooler` suffix on the host) routes through PgBouncer, which maintains warm connections and reduces handshake overhead.

**Changes**:
- **Environment variable only** — no code changes required
- Change `DATABASE_URL` from:
  ```
  postgresql://user:pass@ep-xxxx.us-east-2.aws.neon.tech/dbname?sslmode=require
  ```
  to:
  ```
  postgresql://user:pass@ep-xxxx-pooler.us-east-2.aws.neon.tech/dbname?sslmode=require
  ```
  (Note the `-pooler` suffix on the hostname)

**Where to change**:
- Cloudflare Pages dashboard → Settings → Environment Variables → `DATABASE_URL`
- Local `.env` file for development (optional — pooler works locally too)

**Verification**:
- Query latency should drop ~50-100ms on cold starts
- Monitor via Neon dashboard → Connection pooling metrics

**Status**: Ready to deploy (env var change only)

---

### Phase 1b — Cloudflare Hyperdrive

**What**: Cloudflare Hyperdrive is the active production database path for the Pages app and standalone DB-writing Workers.

**Why**: Hyperdrive provides edge-level TCP connection pooling for Neon Postgres. It maintains persistent connections from Cloudflare's edge to Neon and avoids every request paying a fresh connection setup cost.

**Changes**:

1. **`wrangler.toml`** — Pages app binding:
   ```toml
   [[hyperdrive]]
   binding = "HYPERDRIVE"
   id = "900b4b74ec41462cbbabebd0aa8775aa"
   ```

2. **Standalone DB-writing Workers** — `workers/leads-delivery-worker/`, `workers/audio-jobs/`, `workers/video-generation/`, and `workers/asset-intelligence/` declare the same `HYPERDRIVE` binding id so queue consumers write through the same pooled Neon path.

3. **`server/utils/db.ts`** — The shared Pages DB utility attempts `event.context.cloudflare.env.HYPERDRIVE.connectionString` first, then falls back to `DATABASE_URL` for local development and non-Cloudflare execution.

**How it works**:
- Cloudflare maintains warm TCP connections to Neon from edge locations.
- Pages uses the shared dual-driver DB layer: Hyperdrive over `pg` in Cloudflare, Neon HTTP via `DATABASE_URL` as the local/fallback path.
- Standalone queue Workers stash `env.HYPERDRIVE.connectionString` on `globalThis` and use local `pg` adapters.
- Pages app and standalone DB-writing Workers share the same `HYPERDRIVE` binding id: `900b4b74ec41462cbbabebd0aa8775aa`.

**Verification**:
- `pnpm exec vitest run test/config/cloudflareHyperdriveBindings.test.ts` verifies the Pages binding, standalone worker bindings, DB fallback path, and this plan's production status.
- Cloudflare dashboard -> Hyperdrive -> Analytics should show production query traffic.
- For live incidents, confirm Pages still has `DATABASE_URL` as a fallback secret while Hyperdrive remains the primary path.

**Status**: Active in production. The binding is configured in the root Pages app and the DB-writing standalone Workers; no new Hyperdrive creation step is required for the current production path.

---

### Phase 1c — AI Gateway for Groq

**What**: Route all Groq LLM calls through Cloudflare AI Gateway.

**Why**: AI Gateway provides:
- **Response caching** (including semantic caching) — identical/similar prompts return cached results instantly
- **Rate limiting** — prevent runaway AI costs
- **Cost analytics** — track token usage and cost per endpoint
- **Fallback routing** — automatically fail over to alternative providers
- **Request logging** — full audit trail of all AI interactions

**Changes**:

1. **`server/utils/groqClient.ts`** — Add AI Gateway `baseURL`:
   ```ts
   groq = new Groq({
     apiKey,
     baseURL: process.env.AI_GATEWAY_URL || undefined
     // When AI_GATEWAY_URL is set, all requests route through the gateway
     // When unset, requests go directly to Groq (local dev fallback)
   })
   ```

2. **`server/api/ai/cashflow-insights.post.ts`** — Refactor to use shared `groqClient.ts` instead of its own duplicate Groq client.

3. **Environment variables**:
   ```
   AI_GATEWAY_URL=https://gateway.ai.cloudflare.com/v1/<account-id>/<gateway-name>/groq
   ```

4. **AI Gateway setup** (Cloudflare dashboard):
   - Dashboard → AI → AI Gateway → Create Gateway
   - Name: `agency-dashboard`
   - Enable: Caching, Rate Limiting, Logging
   - Cache TTL: 3600s (1 hour) for financial analysis prompts
   - Rate limit: 100 requests/minute

**How it works**:
- Groq SDK's `baseURL` option redirects all API calls through the gateway
- The gateway transparently proxies to Groq's API, adding caching + monitoring
- Cached responses return in <50ms instead of 1-3s
- No changes to prompt structure or response handling

**Verification**:
- AI Gateway dashboard shows request logs
- Duplicate prompts should show "CACHE HIT" status
- Token usage tracked in real-time

**Status**: Implemented in code, requires AI Gateway creation in Cloudflare dashboard

---

## Phase 2 — KV Caching Layer

**Goal**: Cache expensive API responses (Xero, sessions) at the edge using Cloudflare KV.
**Impact**: High | **Effort**: Medium | **Risk**: Low

### Phase 2a — Xero Session Token Cache

**What**: Cache Xero OAuth tokens in KV instead of querying Postgres on every request.

**Why**: Every Xero API request currently runs 2-3 DB queries just to validate/refresh the OAuth token. With KV, token lookups become <5ms reads from the edge.

**Implementation plan**:

1. Create KV namespace:
   ```bash
   npx wrangler kv namespace create XERO_CACHE
   ```

2. Add binding to `wrangler.toml`:
   ```toml
   [[kv_namespaces]]
   binding = "XERO_CACHE"
   id = "<namespace-id>"
   ```

3. Modify `server/utils/tokenStore.ts`:
   - On token read: check KV first → fall back to DB → write to KV
   - On token refresh: update both KV and DB
   - TTL: Match token expiry (typically 30 minutes)

**Expected improvement**: -100-200ms per Xero-dependent request

---

### Phase 2b — Xero Report Caching

**What**: Cache Xero financial report responses in KV with intelligent TTLs.

**Why**: `cash-flow-forecast` makes 4 sequential Xero API calls totaling 2-4s. Financial data changes infrequently — caching for 5-15 minutes is safe.

**Implementation plan**:

1. Create cache wrapper for Xero API calls:
   ```ts
   async function cachedXeroCall(key: string, ttlSeconds: number, fetcher: () => Promise<any>) {
     const cached = await env.XERO_CACHE.get(key, 'json')
     if (cached) return cached
     const result = await fetcher()
     await env.XERO_CACHE.put(key, JSON.stringify(result), { expirationTtl: ttlSeconds })
     return result
   }
   ```

2. Apply to endpoints:
   - `cash-flow-forecast`: 10-minute cache
   - `invoice-pipeline`: 5-minute cache
   - `kpis-advanced`: 5-minute cache
   - `profit-loss`: 15-minute cache

3. Add cache invalidation on Xero webhook events (if configured)

**Expected improvement**: -2-4s on cached requests (instant response from KV)

---

### Phase 2c — User Session Cache

**What**: Cache authenticated user sessions in KV to reduce auth DB queries.

**Why**: Every authenticated request queries the DB for session validation. KV provides <5ms lookups.

**Implementation plan**:
- Cache session data with 1-hour TTL
- Invalidate on logout or permission changes
- Fall back to DB if KV miss

---

## Phase 3 — Cloudflare Queues for Reliability

**Goal**: Move fire-and-forget background jobs to durable message queues.
**Impact**: Medium | **Effort**: Medium | **Risk**: Low

### What gets queued

Currently, several operations use fire-and-forget patterns that silently fail:

| Operation | Current | With Queues |
|-----------|---------|-------------|
| Board notifications | `notifyBoardSubscribers()` fire-and-forget | Queued with retry |
| Automation triggers | `evaluateAutomations()` fire-and-forget | Queued with retry |
| Email sending | Direct Resend call | Queued with retry + dead letter |
| EOM generation | Synchronous, blocks request | Async via queue |
| Ad spend sync | Synchronous API calls | Batched via queue |

### Implementation plan

1. Create queue:
   ```bash
   npx wrangler queues create agency-jobs
   ```

2. Add binding to `wrangler.toml`:
   ```toml
   [[queues.producers]]
   binding = "JOBS_QUEUE"
   queue = "agency-jobs"

   [[queues.consumers]]
   queue = "agency-jobs"
   max_batch_size = 10
   max_retries = 3
   ```

3. Create queue consumer worker that routes messages by type
4. Replace fire-and-forget calls with `env.JOBS_QUEUE.send({ type, payload })`

**Expected improvement**: Zero lost notifications/emails, faster API responses (offload work)

---

## Phase 4 — Advanced Infrastructure

**Goal**: Real-time collaboration, semantic search, and intelligent caching.
**Impact**: High | **Effort**: High | **Risk**: Medium

### Phase 4a — Durable Objects for Real-Time Board State

**What**: Replace in-memory board events with Durable Objects for persistent, shared state.

**Why**: Current `boardEvents.ts` uses a module-level `Map` — each Cloudflare isolate gets its own empty state. Durable Objects provide a single-writer, globally consistent state machine per board.

**Implementation plan**:
- One Durable Object per board ID
- WebSocket connections for live updates (replace SSE polling)
- Alarm-based cleanup for stale connections
- Cursor-based event replay for reconnections

### Phase 4b — Vectorize for Semantic Search

**What**: Index board items, tasks, and client data into Cloudflare Vectorize for semantic search.

**Why**: Current search is basic text matching. Vectorize enables:
- "Find tasks similar to X"
- Natural language board search
- AI-powered task recommendations
- Client similarity matching

**Implementation plan**:
- Use Workers AI for embeddings (`@cf/baai/bge-small-en-v1.5`)
- Index on task create/update
- Query via semantic search API
- Combine with keyword search for hybrid results

### Phase 4c — Workers AI for Edge Inference

**What**: Run lightweight AI models directly on Cloudflare's edge for latency-sensitive operations.

**Why**: Some AI tasks (classification, summarization, embeddings) don't need Groq's large models. Running them at the edge reduces latency to <50ms.

**Use cases**:
- Task categorization
- Notification prioritization
- Quick expense classification
- Embedding generation for Vectorize

---

## Implementation Priority

| Phase | What | Impact | Effort | Dependencies |
|-------|------|--------|--------|-------------|
| **1a** | Neon Pooler | High | Trivial | None (env var) |
| **1b** | Hyperdrive | High | Complete | Active binding + config drift tests |
| **1c** | AI Gateway | High | Low | Gateway dashboard setup |
| **2a** | Xero Token KV | High | Medium | KV namespace creation |
| **2b** | Xero Report KV | High | Medium | 2a |
| **2c** | Session KV | Medium | Medium | KV namespace creation |
| **3** | Queues | Medium | Medium | Queue creation |
| **4a** | Durable Objects | High | High | DO class + migration |
| **4b** | Vectorize | Medium | High | Vectorize index + Workers AI |
| **4c** | Workers AI | Medium | Medium | AI Gateway |

---

## Environment Variables Reference

### New variables for Phase 1

| Variable | Purpose | Example |
|----------|---------|---------|
| `DATABASE_URL` | Neon pooler connection string | `postgresql://...@ep-xxxx-pooler.../db` |
| `AI_GATEWAY_URL` | Cloudflare AI Gateway endpoint for Groq | `https://gateway.ai.cloudflare.com/v1/{account}/{gateway}/groq` |

### New variables for Phase 2+

| Variable | Purpose | Example |
|----------|---------|---------|
| (KV binding) | `XERO_CACHE` KV namespace | Configured in `wrangler.toml` |
| (Queue binding) | `JOBS_QUEUE` queue | Configured in `wrangler.toml` |
| (Hyperdrive binding) | `HYPERDRIVE` connection | Configured in `wrangler.toml` |

---

## Cloudflare Dashboard Setup Checklist

### Phase 1
- [ ] Update `DATABASE_URL` to use Neon `-pooler` hostname
- [x] Confirm Hyperdrive config id `900b4b74ec41462cbbabebd0aa8775aa` is bound in the Pages app.
- [x] Confirm DB-writing standalone Workers use the same `HYPERDRIVE` binding id.
- [x] Add config drift tests for Hyperdrive bindings and documentation status.
- [ ] Create AI Gateway: Dashboard → AI → AI Gateway → Create
- [ ] Set `AI_GATEWAY_URL` environment variable in Pages settings
- [ ] Enable AI Gateway caching (TTL: 3600s) and rate limiting (100 req/min)

### Phase 2
- [ ] Create KV namespace: `npx wrangler kv namespace create XERO_CACHE`
- [ ] Copy KV namespace ID into `wrangler.toml`
- [ ] Deploy updated code with KV caching logic

### Phase 3
- [ ] Create queue: `npx wrangler queues create agency-jobs`
- [ ] Add queue bindings to `wrangler.toml`
- [ ] Deploy queue consumer worker

### Phase 4
- [ ] Create Durable Object class and migration
- [ ] Create Vectorize index
- [ ] Configure Workers AI models

---

## Files Modified (Phase 1)

| File | Change |
|------|--------|
| `server/utils/db.ts` | Hyperdrive binding support with `DATABASE_URL` fallback |
| `server/utils/groqClient.ts` | AI Gateway `baseURL` routing |
| `server/api/ai/cashflow-insights.post.ts` | Refactored to use shared `groqClient.ts` |
| `nuxt.config.ts` | Added `aiGatewayUrl` runtime config |
| `wrangler.toml` | Active Hyperdrive binding for the Pages app |
| `.env.example` | New environment variable documentation |
| `docs/cloudflare-optimization-plan.md` | This document |
