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
      │  service secret + signed one-time exact-request claim
      ▼
agency-dashboard (Pages app)
   /api/internal/mcp/{tools,call}       ← the single, audited, RBAC-enforcing execution authority
```

The Worker is a **thin proxy**: it does OAuth and MCP framing, then calls the app's internal endpoints.
**All authorization, role-scoping, auditing, and execution happen in the app** — never in the Worker.
Every call resolves current database authority (an asserted role is never trusted). The signed claim binds
the OAuth user, scopes, exchange owner evidence, path, method, tool, body digest, expiry, and unique nonce.
Pages validates every binding and current authority before atomically consuming the nonce and beginning
projection/execution. Claims, service secrets, and raw payloads are never audit content.

## 2. Connecting a host

1. In your MCP host, add the server URL: `https://mcp-server.adme-dev.workers.dev`.
2. The host opens an **OAuth** flow → you're bounced to the XeroFlow login (`/api/mcp/authorize`).
3. On confirmed login the app mints a short-lived **HMAC assertion** of your `userId`; the Worker
   exchanges it for your identity and completes authorization.
4. Every `tools/list` is fetched fresh from Pages. Ordinary users receive the role/scope/flag-governed
   catalog; active owners receive current owner behavior only after a fresh database check.

**In-app view of your tools:** `/agency/ai/connectors` (or `GET /api/agency/ai/mcp/my-tools`) shows the
tools your account can currently call over MCP.

## 3. Capability groups & flags

Each group is gated independently by an env var in `wrangler.toml [vars]` (NOT the CF dashboard — the
Direct-Upload deploy bakes `[vars]` and **replaces** dashboard plaintext vars; secrets survive). Activating
a group is **uncomment + redeploy**, and is always an **operator decision** for ordinary users. Active
owner projection bypasses application role, suite, catalog, department, and personal governance only
after current owner revalidation. The signed OAuth scope remains transport authority: a token without
`mcp:write` cannot discover or execute registered writes.

| Group | Flag | Default | What it adds |
|---|---|---|---|
| Server master switch | `MCP_SERVER_ENABLED` | **on** | Without it every internal endpoint 503s |
| **Phase 1** reads | (always on when server on) | **on** | Read-only, role-scoped business data |
| **2a** generation | `MCP_GEN_TOOLS_ENABLED` | **on** | Owned image/voiceover/music generation |
| **2c** writes | `MCP_WRITE_TOOLS_ENABLED` | off | Non-financial propose→confirm writes |
| **2b** video reads | `MCP_VIDEO_TOOLS_ENABLED` | **on** | Video discovery + status (no spend) |
| **2b** video gen | `MCP_VIDEO_GEN_ENABLED` | off | `propose_video_generation` + `create_video_project` |

Secrets: Pages requires `MCP_INTERNAL_SECRET`, `MCP_REQUEST_SIGNING_SECRET`,
`GOD_MODE_INTERNAL_EXECUTION_SECRET`, and `MCP_HANDSHAKE_SECRET`; the standalone Worker requires only
`MCP_INTERNAL_SECRET` and `MCP_REQUEST_SIGNING_SECRET`. The internal-execution secret is Pages-only and
must never reach the Worker, a client, logs, `[vars]`, or source.

## 4. Tool catalog

### 4.1 Phase 1 — reads (role-scoped, read-only) · always on
Business data, filtered to the caller's role. Representative set:
`get_tasks`, `get_briefs`, `get_project_status`, `get_client_overview`, `get_client_profitability`,
`get_finance_snapshot`, `get_budget_health`, `get_campaign_breakdown`, `get_adspend_pacing`,
`get_ad_breakdown`, `get_ad_creative_text`, `get_search_terms`,
`get_social_performance`, `get_capacity`, `get_my_creative_queue`, `get_open_anomalies`,
`monitor_retainer_burn`, `flag_over_servicing`, `forecast_revenue`, `search_knowledge`.
Reads can never mutate — the read guard hard-blocks any `mutates` tool.

**Paid-media diagnostics (`MEDIA_BUYING`):** `get_campaign_breakdown` adds provider serving status/reasons and a
Google Search impression-share block. `get_ad_breakdown` adds Google/Meta approval and policy issues plus Meta ad-set
learning state, frequency, and CPM. `get_search_terms` returns campaign-scoped Google queries sorted by cost or clicks;
Search/Shopping coverage is full, Performance Max is explicitly limited, and other platforms/types are unsupported.
`get_ad_creative_text` returns synced Google headlines/descriptions and Meta primary text. Every diagnostic family has
its own `asOf`, `dataStatus`, and unavailable reason. Provider errors remain platform-scoped; results are read-only,
cursor-paginated where applicable, and source caps/truncation are declared.

### 4.2 2a — generation (`MCP_GEN_TOOLS_ENABLED`, CREATIVE role) · rate-limited 20/10min
- `generate_banner_image` — synchronous text-to-image; returns a ready Banner Studio asset and seed.
- `generate_voiceover` — synchronous; returns a finished, licence-clear audio asset.
- `start_music_generation` — async; returns a `jobId` (poll `get_generation_status`).
- `get_generation_status(jobId)` — poll an async generation job.

### 4.3 2c — ordinary-user writes (`MCP_WRITE_TOOLS_ENABLED`) · two-step propose→confirm
`propose_create_task`, `propose_assign_task` (`assign_task`), `propose_status_change`,
`propose_brief_convert`, `propose_opportunity`, `log_crm_activity`, `propose_proof_status`,
`propose_team_memory`, `propose_knowledge_article`, `propose_schedule_post` → each returns a `proposalId`;
**`confirm_action(proposalId)`** executes it. Financial writes (budget/quote/EOM/expense) are **excluded**
(held for decision D4).

`propose_schedule_post` is **not** available to ordinary staff (including leads/project managers and
admins without owner God mode): it is withheld from their catalog, a direct call returns
`review_required`, and `confirm_action` refuses — and restores untouched — any retained ordinary-MCP
`propose_schedule_post` proposal. Ordinary staff prepare social posts through the reviewed draft suite
(§4.5), so no MCP path can create a legacy post its own requester could approve. Owner God mode and the
in-app (browser/chat) legacy flows are unchanged.

For ordinary users, this confirmation behavior is unchanged. For a freshly revalidated active owner,
registered write tools execute through the direct audited owner coordinator and do not require a second
`confirm_action` or rich acknowledgement. Authentication, tenant/client validation, schemas, provider
availability, durable idempotency, and immutable attempt/outcome audit remain mandatory.

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

### 4.5 Reviewed social drafts (staff `social_draft` grant) · Facebook, Instagram, LinkedIn organic posts
Available to ordinary staff whose operator-owned `MCP_MARKETING_STAFF_GRANTS` entry includes
`social_draft`, for their **assigned** clients (fresh MANAGEMENT/ADMIN staff: active clients). Grants,
assignments, role policy and active status are re-read on every list, call and replay.

**Reads:** `list_social_publishing_accounts(clientId)` (connected accounts + readiness, never tokens),
`list_social_media_assets(clientId, kind?, limit?, cursor?)` (client-owned banner/video assets),
`get_social_post_status(postId)`.

**Local writes (signed `mcp:write` + writable role; durably idempotent per MCP request):**
`create_social_post_draft`, `update_social_post_draft`, `submit_social_post_for_review`.

Semantics:
- A draft targets **exact** client-owned accounts. Media are typed asset references, never URLs.
  `scheduledAt` is only the requested time — nothing is scheduled by the staff tool.
- `submit_social_post_for_review` freezes an immutable revision (content, ordered targets and options,
  overrides, link, hashtags, first comment, schedule/timezone, campaign/package, and the stored ETag/size of
  every media file) with a SHA-256 fingerprint. Instagram needs JPEG image or video media; Facebook and
  LinkedIn reject media mixes their providers would drop.
- A **different**, currently active owner/admin approves or rejects that exact revision in XeroFlow
  (Social → Approvals). The requester and draft creator can never review it; leads/project managers are
  not reviewers. News drafts additionally need the client-portal decision on the **same** revision.
- Approval is single-use and expires (24h for immediate posts, one hour after the slot for scheduled ones);
  an expired approval returns the post to draft instead of publishing late. Any edit supersedes the review.
- Publishing runs through the existing dispatcher (manual publish by an owner/admin, scheduled workflow or
  cron). Immediately before the provider call it re-checks the requester's grant/assignment, the
  reviewer's authority, the approved revision hash, every target account's client binding and the reviewed
  media bytes; providers fetch content-pinned links that refuse replaced files.
- Statuses: `draft`, `awaiting_client`, `awaiting_review`, `rejected`, `approved`, `scheduled`,
  `publishing`, `accepted`, `published`, `partially_published`, `failed`, `unknown`. `unknown` means the
  request may have reached the provider without a definitive answer: it is held for read-back, never
  retried automatically, and cannot be edited or resubmitted. A `failed` dispatch had no successful
  provider effect and may be edited and resubmitted for a new review.
- There is no staff publish, schedule or confirm tool. Connecting Claude/ChatGPT does not connect any social
  account: provider OAuth stays in the XeroFlow dashboard. TikTok, YouTube, Google Business, paid social and
  inbox replies are not part of this suite.

## 5. Using it — an ordinary-user video generation walk-through

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

For an ordinary user, the propose→confirm split means **a human approves the spend** before any budget is
reserved, and the cost + compliance verdict are shown up front. A current active owner invokes the
registered direct tool instead; the same cost, compliance, cap, tenant, idempotency, and audit boundaries
still apply without a second confirmation call.

## 6. Safety model

- **Two independent Worker→Pages controls**: the internal service secret and a short-lived HMAC claim.
- **Exact one-time binding**: user, scopes, owner evidence, audience, method, path, tool, canonical body
  digest, expiry, and cryptographically random JTI; the JTI is consumed atomically before work begins.
- **Fresh authority**: current active-owner database state outranks the signed exchange evidence. A
  downgrade rejects a claimed-owner request; a newly active owner receives current owner behavior.
- **Stable operation idempotency**: OAuth session identity plus the MCP SDK JSON-RPC request ID, exact
  tool, and canonical operation-body digest; never JTI. Reusing one protocol ID for a different tool or
  body produces a different execution key rather than replaying or suppressing the wrong operation.
- **Ordinary users retain HITL**: proposal/confirmation and scope/RBAC/suite controls remain unchanged.
- **Owners execute directly**: registered writes bypass application governance, not authentication,
  tenant/client boundaries, input validation, durable execution coordination, or immutable auditing.
- **Per-actor rate limit** (20 / 10 min) on generation + video propose/create; cheap polls exempt.
- **Compliance + hard per-tenant budget cap** enforced by the existing engine on every video generation.
- **Audit**: ordinary calls continue to use `ai_action_audit` with `source='mcp'` and arg **keys** only;
  owner calls use immutable God-mode attempt/outcome events, plus the `mcp` execution ledger for writes.
- **Ordinary financial governance**: financial writes retain their dedicated flag, scope, acknowledgement,
  and confirmation controls. A current owner reaches only registered financial executors through the
  direct audited coordinator; missing providers or target authorization still fail.

## 7. Activation (operator) & live-verify

Initial activation requires a coordinated maintenance window. Stop MCP traffic, set the identical
`MCP_REQUEST_SIGNING_SECRET` on Pages and the standalone Worker, and set the dedicated
`GOD_MODE_INTERNAL_EXECUTION_SECRET` on Pages only. Deploy the Worker first. Its current secure token
loader ensures every existing connector whose props lack `oauthSessionId` is rejected and fails closed, so force
all existing OAuth connectors to reconnect at Worker activation before traffic reopens. Verify a safe read
from a reconnected session against the existing Pages release, deploy Pages enforcement, verify again,
then reopen traffic. Never describe this initial rollout as availability-safe or zero-downtime.

The current single-key verifier cannot rotate without an availability break. Use a coordinated
maintenance window: stop MCP traffic, replace the secret on both sides, deploy/restart both, reconnect
sessions that predate `oauthSessionId`, verify a safe read, then reopen traffic. Mismatched-key requests
fail closed; zero-downtime rotation is not supported until overlapping current/next verification keys are
implemented.

**Activate a group** (after sign-off): uncomment its flag in `wrangler.toml [vars]` → deploy from the
clean worktree (`pnpm deploy:production`).

**2b is doubly-dormant:** a live video generation **also** needs the base `VIDEO_GENERATION_ENABLED=true`
baked into `[vars]` and a tenant with video-gen enabled — otherwise the engine 404s.

**Live-verify checklists:**
- *Owner:* call one registered write directly, confirm there is no `confirm_action`, verify one durable
  execution identity plus immutable attempt/outcome, then downgrade the account and retry to prove denial.
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
| `401 Invalid or expired MCP request assertion` | `MCP_REQUEST_SIGNING_SECRET` drifted, claim expired, or claim malformed; verify both deployment-side secret names without printing values |
| `409 MCP request assertion already consumed` | A one-time claim was replayed; the Worker must mint a new claim while retaining the same logical idempotency key for a transport retry |
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
- Reviewed social drafts: `server/utils/ai/mcp/socialTools.ts` (+ `socialToolNames.ts`), services in
  `server/utils/socialPublishing/{drafts,revisions,mediaAssets,dispatch}.ts`, reviewer authority in
  `server/utils/ai/marketing/reviewAuthority.ts`, migration `483_social_post_revision_review.sql`
- Video (2b): `server/utils/ai/mcp/videoTools.ts` + `videoRunner.ts`
- Rate limit: `server/utils/ai/mcp/rateLimit.ts`
- Internal endpoints: `server/api/internal/mcp/{tools,call,exchange}.post.ts`
- OAuth bounce: `server/api/mcp/authorize.get.ts` + `server/utils/ai/mcp/{assertion,consent}.ts`
- In-app connector page: `app/pages/agency/ai/connectors.vue` + `GET /api/agency/ai/mcp/my-tools`
- Worker: `workers/mcp-server/` (deploy: `workers/mcp-server/DEPLOYMENT.md`)

### Independently reviewed Ads and tracking proposals

Enrolled staff with `ads_plan` can inspect assigned Google Ads accounts and prepare
immutable plans. Ordinary management/admin MCP users use the same independent
review requirement: legacy propose/confirm/automatic tools cannot self-approve
campaign changes. A different active owner/admin reviews and executes the exact
plan at `/agency/marketing/reviews/google-ads`. Owner direct execution remains
separate. `reporting` also permits scoped Ads reads; every local mutation requires
signed `mcp:write` and current role/client access.

With `tracking_plan`, staff inspect assigned GTM site inventories, record
ownership evidence and prepare local binding/workspace/installation/publish/
rollback proposals. Provider workspace creation and publication require separate
reviews at `/agency/marketing/reviews/gtm`. The bounded Google tag, GA4 event and
Google Ads conversion templates exclude raw HTML/JavaScript, arbitrary variables
and unknown settings. Native DriveAgent accepted enquiries retain their supported
server delivery. See [the review runbook](runbooks/marketing-ads-tracking-review.md)
for exact capabilities, uncertain outcomes and provider acceptance requirements.

### Social operation readiness

Staff social tools create/edit local drafts, submit an exact revision for independent review, and read
scoped accounts/media/status. They do not expose live publishing, comment sending or inbox sending.
Provider adapter presence is separate from connector coverage: account readiness intersects current
staff grants, signed scope, assigned clients, actual provider grants and account health. Missing grant
evidence is unavailable, never inferred from a connection badge. Paid reporting uses existing scoped
reporting tools and advertiser connections; Meta/LinkedIn/TikTok paid mutations are unsupported.

TikTok Direct Post implementation retains accepted processing receipts and bounded status reconciliation,
but production publishing remains unavailable pending actual product eligibility, app audit/scopes,
verified media delivery and live acceptance. Internal team upload utilities are excluded by TikTok's
published guidelines. See [TikTok activation boundaries](runbooks/tiktok-publishing-activation.md).
LinkedIn video is referenced in a Posts call only after its Videos API reports `AVAILABLE`; ambiguous
publication outcomes remain held and cannot be blindly retried.
