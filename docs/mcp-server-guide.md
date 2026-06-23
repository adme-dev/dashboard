# XeroFlow MCP Server — Usage & Operator Guide

The canonical reference for the XeroFlow MCP server: what it exposes, how to connect, how to turn each
capability on, and how to use it. Pairs with the design specs (`docs/specs/ai-copilot-mcp-server-*.md`),
the worker deploy doc (`workers/mcp-server/DEPLOYMENT.md`), and the backlog (`docs/superpowers/TODO-mcp-and-task-execution.md`).

---

## 1. What it is

XeroFlow exposes selected platform capabilities to external AI hosts (**Claude, ChatGPT, Cursor**, any
MCP client) over the **Model Context Protocol**.

```
MCP host (Claude/ChatGPT/Cursor)
      │  MCP over HTTP + OAuth
      ▼
mcp-server.adme-dev.workers.dev        ← standalone Cloudflare Worker (OAuth + MCP transport only)
      │  x-mcp-secret + asserted userId
      ▼
agency-dashboard (Pages app)
   /api/internal/mcp/{tools,call}       ← the single, audited, RBAC-enforcing execution authority
```

The Worker is a **thin proxy**: it does OAuth and MCP framing, then calls the app's internal endpoints.
**All authorization, role-scoping, auditing, and execution happen in the app** — never in the Worker.
Every call is re-checked against the user's DB role (the asserted role is never trusted) and written to
`ai_action_audit` (arg **keys** only, never values).

## 2. Connecting a host

1. In your MCP host, add the server URL: `https://mcp-server.adme-dev.workers.dev`.
2. The host opens an **OAuth** flow → you're bounced to the XeroFlow login (`/api/mcp/authorize`).
3. On confirmed login the app mints a short-lived **HMAC assertion** of your `userId`; the Worker
   exchanges it for your identity and completes authorization.
4. The host calls `tools/list` → it receives exactly the tools **your role** is allowed (see §4), filtered
   by which capability flags are on.

**In-app view of your tools:** `/agency/ai/connectors` (or `GET /api/agency/ai/mcp/my-tools`) shows the
tools your account can currently call over MCP.

## 3. Capability groups & flags

Each group is gated independently by an env var in `wrangler.toml [vars]` (NOT the CF dashboard — the
Direct-Upload deploy bakes `[vars]` and **replaces** dashboard plaintext vars; secrets survive). Activating
a group is **uncomment + redeploy**, and is always an **operator decision**.

| Group | Flag | Default | What it adds |
|---|---|---|---|
| Server master switch | `MCP_SERVER_ENABLED` | **on** | Without it every internal endpoint 503s |
| **Phase 1** reads | (always on when server on) | **on** | Read-only, role-scoped business data |
| **2a** generation | `MCP_GEN_TOOLS_ENABLED` | **on** | Owned voiceover/music generation |
| **2c** writes | `MCP_WRITE_TOOLS_ENABLED` | off | Non-financial propose→confirm writes |
| **2b** video reads | `MCP_VIDEO_TOOLS_ENABLED` | off | Video discovery + status (no spend) |
| **2b** video gen | `MCP_VIDEO_GEN_ENABLED` | off | `propose_video_generation` + `create_video_project` |

Secrets (set via `wrangler pages secret put … --project-name agency-dashboard`, they survive deploys):
`MCP_INTERNAL_SECRET`, `MCP_HANDSHAKE_SECRET`.

## 4. Tool catalog

### 4.1 Phase 1 — reads (role-scoped, read-only) · always on
Business data, filtered to the caller's role. Representative set:
`get_tasks`, `get_briefs`, `get_project_status`, `get_client_overview`, `get_client_profitability`,
`get_finance_snapshot`, `get_budget_health`, `get_campaign_breakdown`, `get_adspend_pacing`,
`get_social_performance`, `get_capacity`, `get_my_creative_queue`, `get_open_anomalies`,
`monitor_retainer_burn`, `flag_over_servicing`, `forecast_revenue`, `search_knowledge`.
Reads can never mutate — the read guard hard-blocks any `mutates` tool.

### 4.2 2a — generation (`MCP_GEN_TOOLS_ENABLED`, CREATIVE role) · rate-limited 20/10min
- `generate_voiceover` — synchronous; returns a finished, licence-clear audio asset.
- `start_music_generation` — async; returns a `jobId` (poll `get_generation_status`).
- `get_generation_status(jobId)` — poll an async generation job.

### 4.3 2c — writes (`MCP_WRITE_TOOLS_ENABLED`) · two-step propose→confirm · non-financial only
`propose_create_task`, `propose_assign_task` (`assign_task`), `propose_status_change`,
`propose_brief_convert`, `propose_opportunity`, `log_crm_activity`, `propose_proof_status`,
`propose_team_memory`, `propose_knowledge_article`, `propose_schedule_post` → each returns a `proposalId`;
**`confirm_action(proposalId)`** executes it. Financial writes (budget/quote/EOM/expense) are **excluded**
(held for decision D4).

### 4.4 2b — video suite (`MCP_VIDEO_TOOLS_ENABLED` + `MCP_VIDEO_GEN_ENABLED`, CREATIVE role)
**Reads (gated `MCP_VIDEO_TOOLS_ENABLED`, no spend):**
- `list_av_projects` — AV projects you can generate into (`id`/`title`/`client`/`hasTimeline`).
- `list_video_models` — selectable models + each model's allowed modes/durations/aspect-ratios/
  resolutions/subject-types + the tenant monthly cap. **Use this to form a valid request.**
- `list_video_generations(projectId)` — recent jobs for a project.
- `get_video_generation_status(jobId)` — status + output asset URL when ready.

**Confirm-tier (gated additionally by `MCP_VIDEO_GEN_ENABLED`, two-step, bills):**
- `propose_video_generation` — validates project/model/params, runs a **compliance + cost preview**, and
  returns `{ proposalId, estimatedCostCents, complianceClassification, resolvedModel/params }`. **Spends
  nothing.** Modes: `text-to-video` needs no source; `image-to-video`/`video-extension`/`lip-sync` need
  source asset ids registered in-app.
- `create_video_project` — propose creating a new empty AV project to generate into.
- **`confirm_action(proposalId)`** — reserves budget (hard per-tenant monthly cap) + starts the job, or
  returns `cap_exceeded` if the cap is hit. Then poll `get_video_generation_status`.

> Video spend is its **own** confirm action under its **own** flags — it is *not* part of the 2c financial
> set and is never reachable via `MCP_WRITE_TOOLS_ENABLED`.

## 5. Using it — a video generation walk-through (host side)

```
1. list_av_projects                    → pick a projectId (or call create_video_project → confirm_action)
2. list_video_models                   → pick modelId + a valid duration/aspectRatio
3. propose_video_generation { projectId, mode:'text-to-video', modelId, prompt,
                              durationSeconds, aspectRatio }
                                       → { proposalId, estimatedCostCents, complianceClassification }
4. (human reviews the cost + compliance)
5. confirm_action { proposalId }       → { jobId }   (budget reserved + job queued; or cap_exceeded)
6. get_video_generation_status { jobId } (poll)      → status → assetUrl when 'succeeded'
```

The propose→confirm split means **a human approves the spend** before any budget is reserved, and the cost
+ compliance verdict are shown up front.

## 6. Safety model

- **RBAC re-derived from the DB** on every call; the asserted role is never trusted.
- **Two-step HITL** for every write/spend (propose persists a single-use pending row; confirm atomically
  claims it — a double-confirm can't double-execute or double-bill).
- **Per-actor rate limit** (20 / 10 min) on generation + video propose/create; cheap polls exempt.
- **Compliance + hard per-tenant budget cap** enforced by the existing engine on every video generation.
- **Audit**: every call → `ai_action_audit` with `source='mcp'`, arg **keys** only.
- **Financial exclusion**: Xero-financial writes are excluded everywhere pending decision D4.

## 7. Activation (operator) & live-verify

**Activate a group** (after sign-off): uncomment its flag in `wrangler.toml [vars]` → deploy from the
clean worktree (`pnpm deploy:production`).

**2b is doubly-dormant:** a live video generation **also** needs the base `VIDEO_GENERATION_ENABLED=true`
baked into `[vars]` and a tenant with video-gen enabled — otherwise the engine 404s.

**Live-verify checklists:**
- *2a:* generate a voiceover + a music track from the Claude connector → confirm the R2 asset + an
  `ai_action_audit` row.
- *2c:* `propose_create_task` → `confirm_action` → confirm a single execution + audit row (`source='mcp'`).
- *2b:* `list_video_models` → `propose_video_generation` (t2v) → review cost → `confirm_action` → poll
  `get_video_generation_status` until `succeeded` → confirm asset finalize + budget decrement + audit rows.

## 8. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `503 MCP server disabled` | `MCP_SERVER_ENABLED` is off |
| `401 Unauthorized` on internal calls | `x-mcp-secret` ≠ `MCP_INTERNAL_SECRET` (secret drifted between Worker + Pages) |
| `{ code: 'disabled', error: 'Write tools are not enabled over MCP.' }` | `MCP_WRITE_TOOLS_ENABLED` off |
| `{ code: 'disabled', error: 'Video generation is not enabled over MCP.' }` | `MCP_VIDEO_GEN_ENABLED` off |
| Video tools missing from `tools/list` | `MCP_VIDEO_TOOLS_ENABLED` off, or your role lacks CREATIVE |
| Video propose succeeds but generation 404s on confirm | base `VIDEO_GENERATION_ENABLED` absent from `[vars]` |
| `{ code: 'cap_exceeded' }` on confirm | tenant monthly video budget cap reached |
| `{ code: 'rate_limited' }` | >20 generation/video-propose calls in 10 min for this actor |
| A flag set on the CF **dashboard** keeps reverting | non-secret flags MUST live in `wrangler.toml [vars]`; the deploy replaces dashboard plaintext vars |

## 9. Where the code lives

- Read projection + guard: `server/utils/ai/mcp/project.ts`
- Generation (2a): `server/utils/ai/mcp/generationTools.ts` + `generationRunner.ts`
- Writes (2c): `server/utils/ai/mcp/writeTools.ts`
- Video (2b): `server/utils/ai/mcp/videoTools.ts` + `videoRunner.ts`
- Rate limit: `server/utils/ai/mcp/rateLimit.ts`
- Internal endpoints: `server/api/internal/mcp/{tools,call,exchange}.post.ts`
- OAuth bounce: `server/api/mcp/authorize.get.ts` + `server/utils/ai/mcp/{assertion,consent}.ts`
- In-app connector page: `app/pages/agency/ai/connectors.vue` + `GET /api/agency/ai/mcp/my-tools`
- Worker: `workers/mcp-server/` (deploy: `workers/mcp-server/DEPLOYMENT.md`)
