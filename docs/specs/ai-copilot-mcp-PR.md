# PR — MCP Server Phase 1: activate + document + Phase-2 design

**Branch:** `fix/video-studio-inspector-overflow` → `main`
**Scope of this PR doc:** the MCP-related commits below. ⚠️ This branch also carries other dormant
work (observe-and-learn, visuals→knowledge, video studio). If opening a single PR from the branch it
will include those; to ship MCP alone, cherry-pick the three commits onto a clean branch first.

## Commits
| Hash | What |
|---|---|
| `f61ccc55` | Activate MCP Phase 1 via `wrangler.toml [vars]` (not CF dashboard) |
| `7b5e5757` | Connect AI Assistants page + `my-tools` endpoint + marketing sync |
| `f49a1559` | MCP Server Phase 2 spec (design only) |

## Summary

MCP Phase 1 (read-only, role-scoped tool access for external AI hosts) was built dormant in a prior
session. This work **activates it in production, documents it for staff and the marketing site, and
specs Phase 2** (actions + generation). No write or generation tool is exposed — Phase 1 stays
read-only; Phase 2 is design only.

## What changed

### 1. Activation (`f61ccc55`)
- Root-caused why the server stayed `503 "MCP server disabled"` after the operator set the env vars:
  prod is **Direct-Upload Pages with `nitro.cloudflare.deployConfig: true`**, so `wrangler.toml [vars]`
  is baked into the deploy config and **replaces dashboard plaintext vars on every deploy** (encrypted
  secrets survive). Dashboard-set flags were silently wiped each deploy.
- Fix: `MCP_SERVER_ENABLED` + `MCP_WORKER_ORIGIN` now live in `wrangler.toml [vars]`;
  `MCP_INTERNAL_SECRET` + `MCP_HANDSHAKE_SECRET` set as Pages **secrets** via `wrangler pages secret put`.
- A full clean build then kept MCP live natively (no dist patching) — activation is now self-sustaining.

### 2. Documentation (`7b5e5757`)
- **In-app:** `/agency/ai/connectors` ("Connect AI Assistants", staff AI→Tools nav) — connector URL +
  copy, live Active/Unavailable badge, per-host setup tabs (Claude/Cursor/ChatGPT), a **live
  role-scoped list of the signed-in user's read-only tools**, and a plain-language safety section.
- **New endpoint:** `GET /api/agency/ai/mcp/my-tools` — `requireAuth` → `projectReadOnlyTools`;
  informational only, never executes a tool.
- **Marketing (Front-Facing Page Sync, all 4 surfaces):** features index AI-category entry,
  `features/[slug]` `ai-connectors` detail (4 sections), MarketingNav AI mega-menu link.

### 3. Phase-2 spec (`f49a1559`)
- `docs/specs/ai-copilot-mcp-server-phase2.md` — generation-led actions + `propose_*` writes over MCP.
  See the companion task list `ai-copilot-mcp-phase2-tasks.md`. Design only; nothing enabled.

## Verification (live, prod deploy `f23ec4f0`)
- MCP `authorize` → `400` (flag on, validating); `internal/tools` (secret + userId) → `200`;
  wrong secret → `401`. Role-scoped read-only projection: owner **19** tools / Account-Manager **8**,
  **0 write tools** — Phase-1 invariant holds.
- New page `/agency/ai/connectors` → `200`; `my-tools` (unauth) → `401`; `/features/ai-connectors` → `200`.
- Claude Pro connector added by operator — confirmed it lists **only read tools**.
- ESLint clean on all new files (pre-existing MarketingNav lint debt untouched).

## Config / deploy notes (required for any environment)
- `wrangler.toml [vars]`: `MCP_SERVER_ENABLED="true"`, `MCP_WORKER_ORIGIN="https://mcp-server.adme-dev.workers.dev"`.
- Pages **secrets**: `MCP_INTERNAL_SECRET`, `MCP_HANDSHAKE_SECRET` (must match the `mcp-server` Worker's).
- Worker `mcp-server` deployed separately (see `workers/mcp-server/DEPLOYMENT.md`).
- Deploy from a clean checkout (`.worktrees/deploy-prod`) — Direct-Upload bakes `wrangler.toml`.

## Out of scope
- Phase-2 writes/generation (separate sign-off, per the spec).
- Client/portal MCP server; consuming external MCP servers.

## Reviewer checklist
- [ ] Read path still hard-blocks `mutates` tools (Phase-1 invariant)
- [ ] `my-tools` endpoint is read-only and role-derived server-side
- [ ] No secret values committed (only the connector origin + boolean flag in `wrangler.toml`)
- [ ] Marketing pages render in dark mode
- [ ] Aware the branch bundles unrelated dormant work
