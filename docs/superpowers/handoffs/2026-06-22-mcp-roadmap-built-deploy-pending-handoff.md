# Handoff — "Build the other missing MCPs" roadmap BUILT · deploy pending · 2026-06-22

Resume point for a fresh session. The full MCP roadmap (#1, #2a, #2b, #3) is **built, reviewed, committed, and pushed
to a feature branch** — but **not on main, not deployed, not activated** (all new features dormant behind flags). The
remaining work is a **production deploy** that is blocked on (a) wrangler auth lacking `pages:write` and (b) a CF
dashboard env-var audit. **Read this first.**

## TL;DR — what exists now
| Sub-project | What | State | Flag (default) |
|---|---|---|---|
| **#1** Read-coverage | 6 read tools (search_crm, get_crm_pipeline, get_leads, get_social_listening, get_social_inbox, get_email_campaign_performance) auto-projected over MCP + in-app chat | ✅ built, per-task reviewed, **verified vs live endpoint shapes** | rides `MCP_SERVER_ENABLED` (already on) |
| **#2a** Async banner render pipeline | Replaces the prod-broken synchronous ffmpeg MP4 export with enqueue→`banner_render_jobs`→`BANNER_RENDER_QUEUE`→audio-jobs Chromium/ffmpeg container→R2+`banner_exports`; modal polls | ✅ built, per-task + opus whole-branch reviewed, fix-waved; **migration 190 applied to prod DB** | needs queue+container activation |
| **#2b** Banner over MCP | `list_banner_projects` + `propose_banner_render` + `get_banner_render_status` + `bannerDispatch` confirm hook over #2a | ✅ built, per-task + opus whole-branch reviewed, fix-waved | `MCP_BANNER_TOOLS_ENABLED="false"` |
| **#3** Financial writes (D4) | All 6 financial proposers over MCP, confirm-tier, `ack` enforced on the 3 money-movers | ✅ built, per-task reviewed + **controller cross-cutting verified**; ⚠️ **opus whole-branch review DEFERRED** | `MCP_FINANCIAL_TOOLS_ENABLED="false"` |

Full `test/ai/` suite: **698 passing** at HEAD. No new migration except **190** (#2a, already applied to prod).

## Git / remote state
- Branch **`feat/mcp-phase2b-video`** @ `d979f746`, **pushed to `origin` (adme-dev/dashboard)** — 28 commits ahead of `origin/main`.
- **NOT merged to main. NOT deployed.** `origin/main` is still at `7f432cbe` (pre-session audit).
- Upstream was repointed to `origin/feat/mcp-phase2b-video` (was `origin/main` — a bare `git push` would have hit main).
- Pushes use the **`adme-dev` gh account** (active); Paul008 gets 403.
- Commit map (`git log --oneline origin/main..HEAD`): #1 = `b0511a4d`(spec)`0614d00e`(plan)`b7b4905e..014ef132`(7) · #2a = `7f9f2562`(spec)`ef39d334`(plan)`6b4f78f8..698fc9f7`(6) · #2b = `89ae7b6c`/`41f15d69`(spec)`0337cfc3`(plan)`6328349e..796b5205`(4) · #3 = `3fc0562e`(spec)`d32b0ed9`(plan)`ed75e584..d979f746`(2).

## ▶ Next action: DEPLOY — blocked on 2 things
The user asked to "deploy to production and get this all locked." Deploy = `pnpm deploy:production`
(`pnpm build` [16 GB heap nuxt build, ~9 GB peak] → `wrangler --cwd dist pages deploy --project-name agency-dashboard --branch main`).
Run it from the clean **`.worktrees/deploy-prod`** worktree.

**Blocker 1 — wrangler auth lacks `pages:write`.** Current OAuth token (paul@adme.net.au) has only `account:read` +
email scopes; wrangler warns scopes are missing. **Cannot deploy or read Pages config with it.** Fix: user runs
`wrangler login` (interactive — opens browser OAuth; agent can't click it), OR drop a CF API token with
`pages:write`+`account:read` into `.env` as `CLOUDFLARE_API_TOKEN`. Account ID `a5b299b3ad15c1b5b895dc66f9357b17`.

**Blocker 2 — the env-var-wipe footgun (CRITICAL).** Direct-Upload deploy bakes `wrangler.toml [vars]` and **REPLACES
all CF-dashboard plaintext env vars** (encrypted *secrets* survive). Current baked `[vars]` (~9): `APP_NAME, NODE_VERSION,
EMAIL_FROM, MCP_SERVER_ENABLED=true, MCP_WORKER_ORIGIN, MCP_GEN_TOOLS_ENABLED=true, MCP_VIDEO_TOOLS_ENABLED=true,
MCP_BANNER_TOOLS_ENABLED=false, MCP_FINANCIAL_TOOLS_ENABLED=false`. **Before deploying**, audit the live CF dashboard
(Pages → agency-dashboard → Settings → Env Vars → Production) for any operational *plaintext* var NOT in that list
(suspects: `ANOMALY_NOTIFY_ALLOWLIST`, `APP_BASE_URL`, `SOCIAL_OAUTH_REDIRECT_BASE`, `META_APP_ID`, `R2_PUBLIC_URL` if
plaintext, `EMAIL_SENDING_ENABLED`) — **move any into `wrangler.toml [vars]` first**, or the deploy silently breaks those
live features. (`AI_TOOLS_ENABLED` is safe — baked from `.env` at build via `nuxt.config:91`, not a dashboard var.)
Once authed with `account:read`, read them via
`GET https://api.cloudflare.com/client/v4/accounts/<acct>/pages/projects/agency-dashboard` →
`result.deployment_configs.production.env_vars`.

### Deploy sequence (once both blockers clear)
1. `wrangler login` (or set `CLOUDFLARE_API_TOKEN`).
2. Env-var audit → add any missing operational plaintext vars to `wrangler.toml [vars]`, commit.
3. Merge `feat/mcp-phase2b-video` → main (so prod matches git). Push main (adme-dev account).
4. Deploy from clean worktree: `git -C .worktrees/deploy-prod checkout --detach origin/main && (cd .worktrees/deploy-prod && pnpm install --frozen-lockfile && pnpm deploy:production)`. **All four new flags stay OFF** → ships dormant ("locked", nothing activated).
5. Verify prod (`agency-dashboard-6cm.pages.dev`): `/agency/ai/connectors` 200, internal MCP endpoints 401-gated, existing features intact (anomaly/social/leads — confirms env vars survived).

## Activation (LATER — each needs explicit owner sign-off; do NOT flip without go-ahead)
- **#2a banner render live:** create `banner-render` + `banner-render-dlq` queues; deploy the updated `workers/audio-jobs/` Worker + container image (now includes `bannerCapture.mjs`); then in-app MP4 export works (verify-live one render).
- **#2b banner over MCP:** flip `MCP_BANNER_TOOLS_ENABLED="true"` **+ #2a activated**; verify-live `propose_banner_render → confirm → poll → asset` from a Claude host.
- **#3 financial over MCP:** ⚠️ **run the deferred opus whole-branch review FIRST** (it caught real Criticals on #2a AND #2b that per-task reviews missed; #3's was skipped for context budget). Then flip `MCP_FINANCIAL_TOOLS_ENABLED="true"`. Highest stakes — external hosts can propose live ad-budget changes + client invoices (human-confirmed; money-movers require `ack`).
- (Pre-existing, separate) video generation: still needs tenant + cap + funded AI-Gateway credits + `MCP_VIDEO_GEN_ENABLED`/`VIDEO_GENERATION_ENABLED`.

## Specs / plans (all committed on the branch)
- #1: `docs/superpowers/specs/2026-06-22-mcp-read-coverage-expansion-design.md` + `plans/2026-06-22-mcp-read-coverage-expansion.md`
- #2a: `specs/2026-06-22-banner-render-async-pipeline-design.md` + `plans/2026-06-22-banner-render-async-pipeline.md`
- #2b: `specs/2026-06-22-mcp-banner-render-2b-design.md` (§8 impl map) + `plans/2026-06-22-mcp-banner-render-2b.md`
- #3: `specs/2026-06-22-mcp-financial-writes-d4-design.md` (§8 impl map) + `plans/2026-06-22-mcp-financial-writes-d4.md`
- SDD progress ledger (gitignored scratch): `.superpowers/sdd/progress.md` — full per-task review trail.

## Key gotchas (learned this session)
- **opus whole-branch review earns its cost:** caught 3 real Criticals on #2a (missing queue consumer, Dockerfile didn't COPY `bannerCapture.mjs`, unbound `R2_PUBLIC_URL`→bare-key URLs) and 2 on #2b (`canvas_data` mis-parsed → dead propose path; `confirm_action` missing from banner-only manifest) — all invisible to mocked per-task tests. **Run it for #3 before activating financial.**
- **`canvas_data` is FLAT** (`Record<formatKey,{layers}>`), not wrapped in `.artboards`/`.formats`.
- **`buildBannerHTML(format, layers, options)`** — format first.
- **Offline test baseline:** the *full* `npx vitest run` shows ~129 failures, ALL environmental (`NeonDbError: fetch failed` — sandbox can't reach Neon); only DB-backed suites. Pure/mocked tests (`test/ai/`, `test/banner/`) are the real offline signal and are green. Don't re-panic.
- Build heap is set inside the `build` script (`--max-old-space-size=16384`); Nitro bundle OOMs ≤ 8 GB.
- New `mcp/*.ts` + tool files carry the dir's pre-existing `@stylistic`/`no-explicit-any` lint baseline (videoTools fails identically) — not new debt.

## Recommended order for the resumer
1. `wrangler login` (or token) → env-var audit (Blocker 2) → bake any missing vars into `wrangler.toml`.
2. Merge to main → deploy from clean worktree (flags off). Verify prod intact.
3. (Optional, when ready to use) activate per-feature with sign-off; **#3 opus review before the financial flag**.
