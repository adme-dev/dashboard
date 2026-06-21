# Handoff — MCP Server (Phase 1 + Phase 2a/2c) — 2026-06-21

Resume point for a new session. Pairs with the auto-loaded memory `mcp-server-phase1.md` and the
specs/task-list below. **Read this + the task list first.**

## TL;DR — what's live, what's dormant
| Capability | State | Flag |
|---|---|---|
| MCP **Phase 1** read tools (role-scoped, read-only) | 🟢 **Live in prod** | `MCP_SERVER_ENABLED=true` |
| MCP **Phase 2a** generation (voiceover/music + status) | 🟢 **Live in prod**, rate-limited | `MCP_GEN_TOOLS_ENABLED=true` |
| Per-actor generation rate limit (F5) | 🟢 Live (20/10min, audit-ledger count) | — |
| MCP **Phase 2c** writes (non-financial confirm-tier) | ✅ Built + merged, **DORMANT** | `MCP_WRITE_TOOLS_ENABLED` (off) |
| 2c **financial** writes (budget/quote/EOM/expense) | 🛑 Excluded — held for **D4** | — |
| 2b **video** generation over MCP | 🛑 Not built — needs design | — |
| 2d **banner** render over MCP | 🛑 Not built — needs banner async-ification | — |

Standalone Worker: `mcp-server.adme-dev.workers.dev` (live; proxies every manifest tool to the app's
`/api/internal/mcp/call`). Pages prod app: `agency-dashboard-6cm.pages.dev`.

## Deployment status (as of this handoff)
- Latest fully-verified prod deploy: `c14b4dbd` (Phase 1 + 2a + F5).
- **2c dormant deploy was in-flight** at handoff time — confirm it completed (`/tmp/mcp-2c-deploy.log`
  or `wrangler pages deployment list --project-name agency-dashboard`). 2c is flag-off, so even if that
  deploy didn't finish, prod behavior is unchanged; just redeploy `main` from the clean worktree.
- `main` (`origin/main`) == production line. Migrations 189 already applied to prod DB.

## How prod deploys work here (CRITICAL — cost a long debug this session)
- Prod is **Cloudflare Pages Direct-Upload** with `nitro.cloudflare.deployConfig:true`. The build bakes
  `wrangler.toml [vars]` into `dist/_worker.js/wrangler.json`, and that **REPLACES dashboard plaintext
  env vars on every deploy** (encrypted **secrets** survive).
  ⇒ **Non-secret flags/origins MUST live in `wrangler.toml [vars]`**, NOT the CF dashboard.
  ⇒ **Secrets** (`MCP_INTERNAL_SECRET`, `MCP_HANDSHAKE_SECRET`) via `wrangler pages secret put … --project-name agency-dashboard`.
- **Deploy from the clean worktree** `.worktrees/deploy-prod` (the main tree carries unrelated WIP):
  `git -C .worktrees/deploy-prod checkout --detach origin/main && (cd .worktrees/deploy-prod && pnpm deploy:production)`.
  Build needs ~9 GB heap (set in package.json). Fast-path activation without a 16 GB rebuild: patch
  `dist/_worker.js/wrangler.json` vars + re-run only `wrangler --cwd dist pages deploy …`.
- **git main was 87 commits behind production earlier** — reconciled via PR #148. Branch new work off
  `origin/main` and don't let main fall behind again. Pushes use the `adme-dev` gh account.

## Architecture (where the code is)
- Read projection + guard: `server/utils/ai/mcp/project.ts` (`projectReadOnlyTools`, `executeReadOnlyTool` — hard-blocks `mutates`).
- Generation: `server/utils/ai/mcp/generationTools.ts` (pure descriptors + `executeGenerationTool`) + `generationRunner.ts` (wraps audio engines via `ctx.event`).
- Rate limit: `server/utils/ai/mcp/rateLimit.ts`.
- Writes (2c): `server/utils/ai/mcp/writeTools.ts` (`projectWriteTools`, `executeWriteConfirm`).
- Internal endpoints: `server/api/internal/mcp/{tools,call,exchange}.post.ts` — `tools` = manifest (read+gen+write, each flag-gated); `call` routes read/gen/write-propose/`confirm_action`. Auth `x-mcp-secret` + `MCP_SERVER_ENABLED`.
- OAuth bounce: `server/api/mcp/authorize.get.ts` + `server/utils/ai/mcp/{assertion,consent}.ts`.
- In-app connector page: `app/pages/agency/ai/connectors.vue` + `GET /api/agency/ai/mcp/my-tools`.
- Worker: `workers/mcp-server/` (no change needed for 2a/2c — proxies all manifest tools to `/call`).

### 2c mechanism (the migration approach)
Mig **189**: `ai_pending_actions.conversation_id` nullable + `source` column. `proposeAction(ctx, conversationId|null, …)` stamps `ctx.source`. `ToolContext.source?:'chat'|'mcp'`. The 7 non-financial propose-handlers run under `source='mcp'` (conv_id NULL) — **reusing their resolution**. `confirm_action` atomically claims `UPDATE … WHERE id AND user_id AND status='proposed' AND source='mcp' AND not expired RETURNING …` → dispatches the existing executor. Financial writes excluded at projection AND confirm.

## Open decisions (BLOCK further work — operator's call)
1. **D4** — do external AI hosts ever get **financial** write actions (budget_change / quote / eom_generate / budget_alert / expense_*), or hold to in-app only? Until decided they're excluded everywhere.
2. **2b video** — worth building over MCP given it requires a `projectId` + existing timeline (+ separate `VIDEO_GENERATION_ENABLED`, compliance, advisory-locked budget)? Awkward for a chat host.
3. **2d banner** — only after async-ifying `banner-studio/export-video` (changes live sync behavior + needs a status table/migration).

## Activation checklists (NEVER flip a flag without operator sign-off)
- **Activate 2c writes:** uncomment `MCP_WRITE_TOOLS_ENABLED="true"` in `wrangler.toml` → deploy from clean worktree → e2e from Claude: `propose_create_task` → `confirm_action(proposalId)` → confirm task created + `ai_action_audit` row (`source='mcp'`).
- **2a e2e still outstanding (operator):** generate a voiceover/music from the Claude connector → confirm R2 asset + audit row.

## Tests
`npx vitest run test/ai/` → **577 passing** (incl. mcpProject 10, mcpGenerationTools 10, mcpRateLimit 3, mcpWriteTools 13, mcpAssertion 5, mcpConsent). New MCP files lint-clean; `pendingActions.ts` carries pre-existing lint debt (trailing-comma/`any`).

## Reference docs
- Spec: `docs/specs/ai-copilot-mcp-server-phase1.md`, `docs/specs/ai-copilot-mcp-server-phase2.md`
- **Task list (start here):** `docs/specs/ai-copilot-mcp-phase2-tasks.md`
- PR narrative: `docs/specs/ai-copilot-mcp-PR.md`
- Worker deploy: `workers/mcp-server/DEPLOYMENT.md`
