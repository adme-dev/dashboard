# Platform Backlog — verified audit · 2026-06-22

A repo-grounded inventory of everything outstanding across the platform (produced by a 7-cluster
read-only audit). **Confidence:** statuses are verified against `origin/main` code, `wrangler.toml`/
`nuxt.config.ts` flags, and worktrees. Anything requiring **prod / Cloudflare-dashboard / external-API**
state is marked 🔧 **operator-verify** — the audit cannot see it.

**Legend:** ✅ live on main · 🟡 built-but-dormant (flag off) · 🔶 WIP-unmerged (branch/worktree) ·
❓ not built / gap · ⛔ external-blocked · 🔧 operator-verify

---

## 1. Live in prod (verified on main)
Read tools + 2a audio gen + **2b video reads** (MCP); in-app **AI tool-calling agent** (`AI_TOOLS_ENABLED` baked
from `.env`) + **6 personas** + **voice STT/TTS** (built); **anomaly detection** + **recommendations**;
**Social** publishing/calendar/AI-captions, inbox comments+replies, team workflow/SLA/saved-replies,
client-portal inbox, realtime SSE, reporting (metrics/dashboard/portal), **listening** (7 sources, enrichment,
alerts); **CRM** core (people/companies/opps/activities/portal/custom-objects engine/verticals/health/adoption
— the old "deploy failed" was stale); **Audio Studio** P1–P3; **Video Studio** V1.1–V1.4; **spend sync**
(Meta/Google) + deterministic pacing + "Analyze with AI" + Google recs passthrough; **Xero** + **EOM engine** +
**get-out/True-Position AGI** + cashflow forecast; **Leads** (Google + generic + CSV); **Notifications/Smart Watch**;
**EDM** email campaigns; **GA4** sync + funnel backend.

## 2. Built but DORMANT — flag-gated, ready to activate (operator decision)
| Feature | Flag (state) | To activate |
|---|---|---|
| MCP 2b video **generation** | `MCP_VIDEO_GEN_ENABLED` + base `VIDEO_GENERATION_ENABLED` (off) + no tenant | tenant + cap → flip flags → redeploy → live-verify |
| MCP 2c **writes** (non-financial) | `MCP_WRITE_TOOLS_ENABLED` (off) | flip + e2e propose→confirm |
| Social **reply automation** | `SOCIAL_AUTOMATION_ENABLED` (off) | flip (guardrails built) |
| Social **DMs + mentions** | `SOCIAL_DM_ENABLED` (off) | ⛔ Meta App Review (`pages_messaging`,`instagram_manage_messages`) → flip → reconnect |
| Social **scheduled PDF reports** | `SOCIAL_REPORTS_ENABLED` (off) | flip + CF cron trigger + worker secrets |
| **Google Business** publishing | `GOOGLE_BUSINESS_PUBLISHING_ENABLED` (off) | ⛔ Google API approval + OAuth secrets → flip |
| **Budget-WRITE to live Meta/Google budgets** | in-DB `liveBudgetChangesEnabled` + per-platform (off) | ⚠️ **writes real ad money** — arm per-tenant deliberately + UAT one low-budget campaign |
| **CRM AI** (next-best-action, draft-followup) | `CRM_AI_ENABLED` (off) | flip + Groq key |
| **CRM comms bridge** (leads/email → CRM timeline) | `CRM_COMMS_BRIDGE_ENABLED` (off) | flip |
| AI **memory distillation** | `AI_MEMORY_DISTILL_ENABLED` (off) | flip + UAT |
| AI **Observe & Learn** (routine distill) | `AI_OBSERVE_ENABLED` (off) + proactive `AI_OBSERVE_PROACTIVE_ENABLED` (doubly off) | flip + daily cron + UAT; proactive needs sign-off |
| AI **L2 multi-domain controller** | `AI_CONTROLLER_L2_ENABLED` (off) | flip + UAT (latency/cost) |
| AI **portal co-pilot** (Tier 1 read) + Tier 2 writes | `AI_PORTAL_ENABLED` (off) + `AI_PORTAL_WRITES_ENABLED` (doubly off) | flip + staging UAT (tenant isolation) |
| **Visuals → Knowledge** (image→KB caption) | `VISUALS_TO_KNOWLEDGE_ENABLED` (off) | flip + UAT |

## 3. WIP-unmerged — finish or drop (worktree/branch)
| Worktree / branch | What | Recommendation |
|---|---|---|
| `feat/media-studio-sp2b` + `sp2c` | real audio-engine + full editor (undo/autosave/waveforms) | **finish** — review + merge (largest near-done UI work) |
| `feat/virtual-office-1b-media` | Office floor-plan UI (API already on main, 42 endpoints) | **finish** — UI merge + enable office crons |
| `feat/tracking-hardening` | rate-limiter DO + origin/IP caps (mig 139) | **review** — policy sign-off + merge |
| `feature/meta-google-pacing-review` | budget-control toggle UI (core pacing already on main) | **review** — confirm what's on main vs follow-up |
| `hotfix/social-pacing-prod-import` | pacing apply/import fixes | 🔧 **confirm** if deployed to prod → backport/merge or archive |
| `feat/paypal-finance-route` | PayPal connection (client-creds + mig 177); **no routes/UI yet**, branch stale | **park** until payment sprint |
| CRM **meeting action-items bridge** (P4.3b, mig 159, in paypal worktree) | office meetings → CRM tasks | **finish** — extract + PR |
| `spike/video-composite-render` | render cost spike (done) | **archive** |
| `publish-video-ai-producer-harness` | already merged to main | **archive/delete** |
| `docs/handoff-audio-funnel-0602` | docs-only | **delete** |

## 4. Not built / genuine gaps
- **CRM Automotive vertical pack (Phase C)** — only generic + retail verticals exist; the client base is heavily automotive → revenue gap. Needs PRD → templates.
- **Video-gen spend → client billing** — *confirmed* no link from `video_generation_jobs.actual_cost_cents` to EOM/Xero today. Needs a **billing-model decision** then build (Payment Layer-2).
- **GA4 Phase-3 UI** (ask box, internal benchmarks, blend presets, export-token) — backend is live; UI not started. The old `feat/ga4-agency-funnel*` branches look stale/divergent — **start clean from the plan doc**, don't resurrect them.
- **EDM postcards builder** — core email is live; "postcards" scope/phase unclear — confirm if it's a real future phase.

## 5. External-blocked
- **Meta App Review** → Social DMs/mentions + full Meta lead ingestion (`leads_retrieval`).
- **Google API approval** → Google Business Profile publishing.
- **AI Gateway credits** → video generation spend (operator says billing connected — 🔧 confirm balance/auto-top-up).

## 6. Ops to verify / enable (🔧 operator — audit can't see CF/prod)
- **Cron triggers** actually firing in the CF dashboard: **anomaly-detection**, CRM (task-reminders/score-decay/dormancy/health), GA4 sync, office assistant/retention, social metrics/reports/listening. (Some may be wired via the `pages-cron` companion worker — verify, don't assume broken.)
- **Deploy-hygiene env audit** — the deploy bakes 7 `wrangler.toml [vars]` and **replaces dashboard plaintext vars** (secrets survive). Audit the dashboard for operational plaintext vars (e.g. `ANOMALY_NOTIFY_ALLOWLIST`) and move them into `wrangler.toml`.
- **Voice AI live-mic UAT** — code built + deployed (rides `AI_TOOLS_ENABLED`), never UAT'd.
- **EDM / GA4 browser UAT/eyeball**, **budget-write** per-tenant arm state, **Xero** prod connection.

---

## Recommended priority order
1. **Validate the live foundation** (free): play with AI chat + personas; connect a host for reads + audio gen + video discovery; confirm the video tools render.
2. **Ops hygiene + safety** (low-effort, high-value): 🔧 verify the cron triggers are firing (esp. anomaly), and do the dashboard env-var audit. These are silent-failure risks.
3. **Video Phase-2 internal test**: agency tenant + small cap → flip gen flags → one real generation.
4. **Finish the near-done WIP**: Virtual Office UI, Media Studio SP2b/SP2c (merge), tracking-hardening (review) — they're accumulating as debt.
5. **Cheap activations + UAT**: Voice AI UAT; then decide on the dormant AI cluster (Observe&Learn, memory distill, L2, portal) one at a time with UAT.
6. **Deliberate, decision-first**: budget-write-to-live-budgets rollout (real ad money — careful); Social automation/DMs (Meta review); CRM AI + comms bridge; payment Layer-2 (billing model) + automotive vertical (PRD); Workflows migration (go/no-go on its spec).

> **Caveat:** §6 + the 🔧 items are inferences the read-only audit could not confirm against the live
> Cloudflare/prod/external state. Treat them as "verify," not "broken." Everything in §1–§4 is repo-verified.
