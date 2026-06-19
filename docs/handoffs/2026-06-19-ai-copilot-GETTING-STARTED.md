# Getting Started: AI Co-pilot Program

**Updated:** 2026-06-19
**Branch:** `feat/ai-copilot-phase0`
**For:** anyone (human or agent) picking this up cold.

This is the **front door**. It tells you what exists, how to run it, and where to go next. The autonomous build protocol lives in the sibling doc; the design lives in the PRD + specs.

---

## 1. What we're building (in one paragraph)

Every team member gets a personal AI co-pilot that knows them, understands the platform, and executes work within their permissions — built by **reusing** the existing agentic tool-calling layer, not rewriting it. Same engine for staff chat, the virtual office, and (isolated) the client portal. One write/approval/audit spine. RBAC is the hard ceiling everywhere. Full vision: [`docs/prd/personal-ai-copilot.md`](../prd/personal-ai-copilot.md).

## 2. The map (read in this order)

1. **PRD** — `docs/prd/personal-ai-copilot.md` (the whole thing, with citations).
2. **Phase 0 plan** — `docs/specs/ai-copilot-phase-0-plan.md` (the foundations being built now).
3. **Build loop** — `docs/handoffs/2026-06-19-ai-copilot-build-loop.md` (the ordered backlog + how to execute it autonomously).
4. Area specs as needed: memory, media-buyer, virtual-office, portal, traffic-controller, command-center, MCP ADR (all in `docs/specs/ai-copilot-*`).

## 3. What's built so far (on this branch)

| Commit | What |
|---|---|
| `b996d47f` | PRD + 7 specs |
| `b6682061` | **WS-B**: tool-executor registry — confirm endpoint is now generic; new write tools = one file |
| `cc4d356a` | **WS-C.1**: `ai_action_audit` ledger (mig 181, applied to prod) |
| `4f55589d` | **WS-C.2**: audit rows written on every confirmed action (pure mapper + fail-safe writer) |
| `44e5160c` | MCP ADR + build-loop handoff + locked decisions |

**Net:** the entire **write/approval/audit spine is done** — propose (`ai_pending_actions`) → confirm (generic executor dispatch) → audit (`ai_action_audit`). Every future write surface (skill-packs, portal, office, knowledge) plugs into this. 36/36 AI tests green. **Nothing deployed; no flags flipped; all writes dormant.**

## 4. Run it locally

```bash
# install (first time, full — not a symlinked worktree)
pnpm install

# the AI test suite (fast regression gate)
pnpm exec vitest run test/ai/

# whole suite
pnpm test:run

# dev server
pnpm dev
```
The co-pilot chat is at `/agency/ai/chat`; the agentic loop only fires when `AI_TOOLS_ENABLED=true` AND the intent is non-trivial.

## 5. How to continue

Open the **build loop** doc, take the top unchecked task in its §5 backlog, and follow its §4 protocol (TDD → verify → commit). Next up: **WS-A (per-user memory)** — mig 180, `server/utils/ai/memory/*`, the `remember` tool, retrieval wired into `aiChatEngine.ts`.

To run it hands-off: use `/loop` with the entry prompt in the build-loop doc §10.

## 6. The rules that matter most

- **RBAC is the ceiling.** Tools are RBAC-filtered before the model sees them; config narrows, never grants.
- **Writes are propose→confirm→audit.** The model never writes directly.
- **Memory ≠ Knowledge Base.** Memory auto-writes (private); the shared KB is propose→review→publish.
- **Tenant isolation in the portal is absolute** — separate registry, `clientScope` required.
- **Never** flip a write flag, deploy to prod, or merge to main without sign-off (full list: build-loop §8).
- Stage only co-pilot files when committing — the working tree has unrelated media WIP.

## 7. Open decisions still needing you

- Whether/when to flip `AI_TOOLS_ENABLED` on a real surface (currently a dormant capability).
- Memory residency (can inferred distillation run in prod?) — blocks enabling `AI_MEMORY_DISTILL_ENABLED`.
- Go-live branding for the portal assistant (default decided: neutral "Portal Assistant").

## 8. Status at a glance

✅ Design (PRD + 7 specs) · ✅ Phase 0 write/audit spine (WS-B, WS-C) · ⏭️ Phase 0 memory (WS-A) · ⏸️ skill-packs / portal / office / controller / command-center (queued) · 🚫 nothing deployed.
