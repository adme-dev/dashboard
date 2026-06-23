# TODO / Roadmap — MCP + Task Execution (consolidated)

**Updated:** 2026-06-22 · **Owner legend:** 🧑 operator (Paul) · 🤖 agent (build) · ⛔ blocked
**Source threads:** MCP Phase 1/2 handoff, MCP 2b build + **Phase-1 go-live** (2026-06-22), Cloudflare Workflows direction, video-gen **payment method**.

> Scannable backlog/roadmap of everything in flight or decided across MCP and the platform's task-execution layer.
> Nothing here flips a financial flag, enables a tenant, or moves money without explicit 🧑 sign-off.

---

## A. MCP Phase 2b — Video generation suite (BUILT ✅ · Phase-1 LIVE 🟢 · Phase-2 staged)
Spec: `…/specs/2026-06-21-mcp-phase2b-video-generation-design.md` · Plan: `…/plans/2026-06-21-mcp-phase2b-video-generation.md`
Guide: `docs/mcp-server-guide.md` · Merged to `main` (`a8edd3ac`) · deployed `2026-06-22`.

**Build — done.** 7 TDD tasks, 618 `test/ai/` tests green (incl. 7-test integration battle-test of the full
propose→persist→claim→confirm→dispatch flow), ESLint + tsc clean. No migration.

**Phase 1 (reads) — 🟢 LIVE in prod (2026-06-22).** `MCP_VIDEO_TOOLS_ENABLED="true"` baked + deployed;
internal endpoints verified 401-gated (server enabled). The 4 discovery/status tools are live; **zero spend path**.
- [x] 🤖 Build + verify + merge + deploy Phase 1.
- [ ] 🧑 Confirm the 4 tools render for your role: `/agency/ai/connectors` (browser) **or** `tools/list` from your Claude connector.
- [ ] 🤖 M1 marketing/docs sync: connector page + `features/ai-connectors` (still say read-only/audio-gen).

**Phase 2 (generation — BILLABLE) — ⛔ blocked on 🧑 decisions + payment (see §A2).** Nothing flipped yet.
- [ ] ⛔🧑 Choose **which tenant/client** to enable + a **monthly cap** (suggest $20–50 for the first live run).
- [ ] ⛔🧑 Confirm a **funded payment method / AI Gateway credits** exists (see §A2) — hard prerequisite to actually pay for a generation.
- [ ] 🤖 Flip `MCP_VIDEO_GEN_ENABLED` + base `VIDEO_GENERATION_ENABLED` + enable the chosen tenant at the cap → redeploy from clean worktree.
- [ ] 🧑 Live-verify (first real job, watch closely — the engine itself has never had a full live e2e):
      `list_video_models` → `propose_video_generation` (t2v) → review cost → `confirm_action` → poll
      `get_video_generation_status` → asset finalize + budget decrement + `ai_action_audit` rows.

## A2. Video generation — PAYMENT METHOD (NEW workstream · 🔬 investigate)
Two distinct layers — both must be answered before/around Phase 2.

**Layer 1 — Agency → provider (how WE pay for the compute). Hard Phase-2 prerequisite.**
- Active path: **Cloudflare AI Gateway** (`server/utils/video-generation/providers/aiGatewayProvider.ts`),
  partner models billed via **AI Gateway Unified Billing credits (prepaid)**. Legacy `muapiProvider.ts` (MuAPI) also present.
- [ ] 🧑/🔬 **Confirm the CF AI Gateway account is funded** (prepaid credit balance) and which account/key the prod
      Worker uses — *no credits → the first real generation fails to pay.* This is THE blocker for Phase 2.
- [ ] 🔬 Confirm whether a **payment method is on file for auto top-up** (so credits don't run dry mid-month), and the burn rate vs the per-tenant caps.
- [ ] 🔬 Decide active provider for go-live (AI Gateway vs MuAPI) + verify each model's real `estimatedCostCents`/`costUnit` against live provider pricing (`server/utils/video-generation/costs.ts` + `modelRegistry.ts`).

**Layer 2 — Client → agency (how clients pay US for generations). Follow-on feature.**
- Today: spend is *tracked* per job (`video_generation_jobs.actual_cost_cents`) and capped per tenant, but **nothing
  bills the client** — no link from video-gen spend to invoices.
- Existing billing rails to build on: Xero invoicing (`xeroInvoiceWriter/Lines`), **EOM engine** (`eomEngine.ts`),
  in-progress **PayPal route** (`docs/superpowers/specs/2026-06-11-paypal-finance-route-design.md`, unmerged worktree).
- [ ] 🔬 Decide the **client-billing model**: passthrough at cost, cost + markup, or included in retainer/credits.
- [ ] 🤖 (later) Spec a **video-gen spend → EOM/Xero billable line** passthrough (one of the financial pipelines —
      pairs with the Workflows financial-last sequencing in §B). Held until the model is decided.
- [ ] 🔬 Note: this is **financial** territory — relates to decision **D4** (§C) on whether external AI hosts ever touch financial actions.

## B. Cloudflare Workflows — enterprise task-execution backbone (DIRECTION SET)
Doc: `docs/superpowers/specs/2026-06-21-cloudflare-workflows-enterprise-task-execution-design.md`

- [x] 🤖 Direction + caveats + rollout documented (verdict: adopt as durable-execution backbone, incremental, off real-time + financial paths until proven).
- [x] 🤖 **Migration spec written** → `docs/superpowers/specs/2026-06-22-video-gen-workflow-migration-design.md` (steps as pure fns, companion-Worker `workflows` binding, durable poll-loop replacing the reconcile cron, idempotency, retry/backoff, `VIDEO_GENERATION_USE_WORKFLOW` cutover + rollback, 2b one-line compose). **Awaiting 🧑 go/no-go review.**
- [ ] 🤖 Validate longest step vs the **30 min/step** ceiling (Chromium render path especially); decompose if needed.
- [ ] 🧑 Decide go/no-go on the video-gen Workflow migration after reviewing the spec.
- [ ] 🤖 (later) Then sync pipelines (spend, GA4); **financial pipelines (EOM/invoicing/spend-writes) LAST**, only after the pattern is proven.
- [ ] 🤖 Governance per migrated pipeline: idempotency keys, dead-letter handling, stuck/failed-run alerting, runbook. **Pure-step rule is non-negotiable.**
- [ ] — Do NOT adopt the full Agents SDK or migrate the real-time voice/chat loop (Workflows is not for real-time).

## C. Standing MCP decisions (BLOCK further write scope — 🧑 call)
From the Phase 1/2 handoff; unchanged this session.

- [ ] ⛔🧑 **D4** — do external hosts ever get **financial** writes (`budget_change` / `quote` / `eom_generate` / `budget_alert` / `expense_*`)? Held to in-app until decided. Until then excluded everywhere. *(Note: 2b video spend is its OWN confirm action under its own flags — explicitly NOT part of D4's Xero-financial set.)*
- [ ] 🧑 **Activate 2c writes** (non-financial, already built + dormant): uncomment `MCP_WRITE_TOOLS_ENABLED="true"` → deploy → e2e `propose_create_task` → `confirm_action`.
- [ ] ⛔🧑 **2d banner render** — only after async-ifying `banner-studio/export-video` (changes live sync behavior + needs a status table/migration). Needs go-ahead before building.

## D. Operator e2e checks (outstanding, none blocking)
- [ ] 🧑 **2a** — generate a voiceover + a music track from the Claude connector → confirm R2 asset + `ai_action_audit` row.
- [ ] 🧑 **2c** — once activated: propose→confirm a task + a schedule_post from an external host → confirm single execution + audit (`source='mcp'`).
- [ ] 🧑 **2b** — see §A live-verify.

## E. Cross-cutting reliability (surfaced by the Workflows review — pre-existing toil)
These are the hand-rolled-orchestration weak spots Workflows would consolidate; track independently in case Workflows slips.
- [ ] 🧑/🤖 Audit companion-Worker queue consumers are all wired (history: agency-jobs had no consumer; crons that never fired).
- [ ] 🧑/🤖 Confirm cron triggers fire in prod (anomaly/office/tracking/ga4-sync history).
- [x] ✅ `AI_TOOLS_ENABLED` is baked at build time from `.env` (`nuxt.config:91`, `.env` has `=true`; verified `aiToolsEnabled:true` in the deployed bundle) — survives deploys. The real gap is dashboard-only vars → see §G.

## F. AI assistance — what's left
- **Tool-calling agent:** 🟢 live (flag baked on). Polish remaining:
  - [ ] 🤖 KB-ACL fail-open check — `search_knowledge` should fail-open for docs lacking `visibility`/`ownerId` (validate + harden).
  - [ ] 🤖 Slice-1.5 **personas** (design-first → brainstorm → build) + marketing sync.
- **Voice Admin AI** (merged to `main`, so deployed behind `AI_TOOLS_ENABLED`; never had live-mic UAT):
  - [ ] 🧑 Live-mic UAT on `/agency/ai/chat` (hands-free loop, barge-in, spoken write-confirm).
  - [ ] 🧑 Go-live decision + marketing sync once UAT passes.
- **Observe & Learn / proactive AI:** phase-4 built but dormant, operator-gated — [ ] 🧑 decide activation.
- **AI cost/observability:** [ ] 🤖 (later) surface Groq + AI-Gateway spend in one place (ties into §B Workflows observability).

## G. Deploy hygiene — env-var persistence (NEW · surfaced 2026-06-22)
The prod deploy uses Direct-Upload `deployConfig`: it bakes `wrangler.toml [vars]` and **REPLACES dashboard
plaintext env vars** on every deploy (encrypted **secrets survive**). Current baked `[vars]` = 7:
`APP_NAME, EMAIL_FROM, MCP_GEN_TOOLS_ENABLED, MCP_SERVER_ENABLED, MCP_VIDEO_TOOLS_ENABLED, MCP_WORKER_ORIGIN, NODE_VERSION`.
- [ ] 🧑 **Audit the CF dashboard env vars** — any operational *plaintext* var set there (e.g. `ANOMALY_NOTIFY_ALLOWLIST`,
      `EMAIL_SENDING_ENABLED`, `APP_BASE_URL`, `SOCIAL_OAUTH_REDIRECT_BASE`, `META_APP_ID`) was cleared by the
      last deploy and needs re-adding. (Dormant feature flags being unset = correct.)
- [ ] 🤖 **Durable fix:** move the operational plaintext vars into `wrangler.toml [vars]` so deploys stop wiping them
      (needs the var list + values from 🧑). Stops the per-deploy whack-a-mole.

---
## Build order — what I can build now vs what's gated on you
**🤖 I can build now (safe, reversible, no operator decision):**
1. **M1** — marketing/connector docs sync to reflect live MCP capabilities incl. 2b video reads (§A).
2. **Workflows → video-gen migration spec** (§B next step) — design doc.
3. **KB-ACL fail-open** validation/hardening (§F).
4. **Deploy-hygiene** wrangler.toml var move (§G) — *once you give me the var list/values.*
5. Design-first features (**personas** §F, **payment Layer-2 passthrough** §A2) — start with a brainstorm/spec, then build.

**⛔ Needs your decision/credentials (I will not do autonomously):**
- 2b **Phase 2** flag flip + tenant + cap + deploy (billable) · 2c **activate** · **D4** financial · **Voice AI UAT** ·
  **client-billing model** (§A2 L2) · **dashboard env audit** (§G) · **Workflows go/no-go**.

**Immediate next decision (🧑):** to make internal video generation real — confirm credits funded + give a **tenant + cap**
(e.g. "enable agency tenant, $30 cap"); then 🤖 flips the gen flags + enables the tenant + redeploys + we live-verify.
