# Handoff — MCP 2b live (reads) · Workflows direction · payment · 2026-06-22

Resume point for a new session. Supersedes the 2026-06-21 handoff for everything below. **Read this +
the roadmap (`docs/superpowers/TODO-mcp-and-task-execution.md`) + the guide (`docs/mcp-server-guide.md`) first.**

## TL;DR — what's LIVE vs DORMANT in prod
| Capability | Prod state | Flag |
|---|---|---|
| MCP Phase 1 reads (role-scoped) | 🟢 Live | `MCP_SERVER_ENABLED` |
| MCP 2a generation (voiceover/music) | 🟢 Live, rate-limited | `MCP_GEN_TOOLS_ENABLED` |
| **MCP 2b video READS** (discovery + status) | 🟢 **Live (deployed 2026-06-22)** | `MCP_VIDEO_TOOLS_ENABLED="true"` |
| MCP 2b video GENERATION (propose/confirm) | 🔴 Dormant | `MCP_VIDEO_GEN_ENABLED` (off) + base `VIDEO_GENERATION_ENABLED` (off) + no tenant |
| MCP 2c writes (non-financial) | 🔴 Built, dormant | `MCP_WRITE_TOOLS_ENABLED` (off) |
| In-app AI assistant (tool-calling chat) | 🟢 Live | `AI_TOOLS_ENABLED` (baked from `.env`, verified) |
| AI personas (Slice 1.5, 6 personas) | 🟢 Live + marketing-synced | rides `AI_TOOLS_ENABLED` |
| Voice Admin AI | 🟡 Code deployed (rides `AI_TOOLS_ENABLED`), **never live-mic UAT'd** | — |

Prod deploy: `agency-dashboard-6cm.pages.dev`, branch `main`. Latest verified deploy = the Phase-1 video-reads
deploy (`bd3e984a`, flag baked, internal endpoints 401-gated/confirmed live).

## This session's deltas
- **2b video suite BUILT** (7 TDD tasks + 7-test integration battle-test; 626 `test/ai/` green; ESLint + tsc clean;
  no migration). Merged to `main`. **Phase 1 (reads) deployed + live.** Phase 2 (generation) staged, dormant.
- **Cloudflare Workflows** adopted as the enterprise durable-execution direction; **video-gen → Workflow
  migration spec** written (awaiting go/no-go).
- **Payment** investigated: agency→provider = CF AI Gateway prepaid credits (operator says billing connected);
  client→agency billing (Layer 2) = unbuilt, needs a billing-model decision.
- **M1** marketing/connector copy synced; **KB-ACL** `defaultCanSee` fail-open locked in with tests; personas
  confirmed already built (1 copy-accuracy fix).

## Deploy state nuance
`main` (`8d5f8357`) is **ahead of the live deploy** by docs + the M1/persona **copy** changes — these are
**not deployed** (functional code IS live from prior deploys; only copy is pending). No need to redeploy for
copy alone; it'll ride the next deploy (e.g. Phase 2).

⚠️ **Deploy gotcha (still true):** the Direct-Upload deploy bakes `wrangler.toml [vars]` (7 vars) and
**replaces dashboard plaintext vars** (secrets survive). Audit the CF dashboard for any operational plaintext
var (e.g. `ANOMALY_NOTIFY_ALLOWLIST`) that needs moving into `wrangler.toml`. `AI_TOOLS_ENABLED` is safe
(baked from `.env`).

## What's testable NOW (no further deploy)
- **In-app AI chat** `/agency/ai/chat` — tool-calling + persona picker (Finance/Marketing/Sales/Media Buyer/
  Account Management/general).
- **MCP connector** from Claude/Cursor: Phase-1 reads + **2a audio generation** (creative role) + **2b video
  discovery** (`list_av_projects`/`list_video_models`/`list_video_generations`/`get_video_generation_status`).
  *Operator: confirm the 4 video tools render in your connector / on `/agency/ai/connectors`.*
- **NOT testable yet:** video *generation* (Phase 2 — needs tenant + cap + flag flip + redeploy).

## Doc index
- **Whole-platform verified backlog (start here for "what's left across everything"):** `docs/superpowers/PLATFORM-BACKLOG-2026-06-22.md`
- Guide: `docs/mcp-server-guide.md` · Roadmap/TODO: `docs/superpowers/TODO-mcp-and-task-execution.md`
- 2b: `…/specs/2026-06-21-mcp-phase2b-video-generation-design.md` + `…/plans/2026-06-21-mcp-phase2b-video-generation.md`
- Workflows: `…/specs/2026-06-21-cloudflare-workflows-enterprise-task-execution-design.md` + `…/specs/2026-06-22-video-gen-workflow-migration-design.md`
- Code: `server/utils/ai/mcp/{videoTools,videoRunner,writeTools,generationTools,project}.ts`, `server/api/internal/mcp/{tools,call}.post.ts`

## To-dos later (all in the roadmap; all gated on operator)
1. **2b Phase 2** — pick tenant + cap → flip `MCP_VIDEO_GEN_ENABLED` + `VIDEO_GENERATION_ENABLED` + enable tenant → redeploy → live-verify first real job.
2. **Workflows migration** — go/no-go on the spec; if go, write the plan + build (non-financial first).
3. **Payment Layer-2** — decide billing model → brainstorm → build (financial; ties to D4).
4. **2c writes** activate · **D4** financial-over-MCP decision · **Voice AI** live-mic UAT.
5. **Deploy hygiene** — dashboard env audit → move operational vars into `wrangler.toml`.
6. **finalize.ts** — stream R2 upload before enabling large/high-res video models (currently buffers in memory).

## Recommendation (next session / operator)
1. **Validate the live foundation first** — play with the in-app chat + personas, and connect a Claude host to
   exercise reads + audio gen + video discovery. Confirm the connector shows the video tools.
2. **Then a small Phase-2 internal generation test** — enable the agency tenant at a low cap ($20–50), flip the
   gen flags, redeploy, run ONE real `propose→confirm→poll`. This is the first time the full billable video path
   runs live — watch it closely (finalize memory + provider mapping).
3. **Hold the big builds** (Workflows migration, payment Layer-2) until the live foundation is validated — both
   are well-specced; decide deliberately.
4. **Quick win:** deploy-hygiene env audit (removes the per-deploy var-wipe footgun).
