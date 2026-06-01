# PAUL Session Handoff

**Session:** 2026-06-02 — Social Suite **Slice 2d (part 1 portal + part 2 real-time)**
**Status:** Both workstreams MERGED to `origin/main`. Only the App-Review-gated 2d channels (DMs + mentions) remain.

---

## TL;DR

Resumed from the inbox-arc-complete handoff and built the two **fully-testable** halves of Slice 2d as separate PRs, both reviewed → fixed → merged:

| PR | Workstream | Merge commit | Migration |
|----|------------|--------------|-----------|
| #71 | 2d-1 — client-portal inbox surface (read + approve) | `21b93ef3` | none |
| #72 | 2d-2 — Durable-Object real-time (SSE → polling) | `c6387c64` | none |

Operator decision this session (AskUserQuestion): **"Portal + real-time first"** — defer the gated DMs/mentions channels (can't be verified live until Meta App Review). No migrations added (both reuse existing tables), so **no migration-collision risk** this session.

171 social tests green; 0 new type errors on each PR (full `nuxt typecheck`, large heap); adversarial review **SHIP** on both (each PR's one MEDIUM fixed in-PR).

---

## What shipped

### PR #71 — client-portal inbox surface
- **`server/utils/socialInbox/portal.ts`** (injected-DB, 9 unit tests) — the client-facing data layer. Three cardinal rules in one place: tenant isolation (every query scoped to the **session** `client.clientId`, never input), **internal notes excluded** from client reads, approvals limited to `approver_type='client'`. SELECTs deliberately omit staff-only columns.
- **Endpoints** `server/api/client-portal/social/**` (`requireClientAuth`): list conversations, get conversation+messages (404 on cross-tenant), list client-routed pending queue, approve, reject. approve/reject gated on `canApproveWork`; both use an **atomic conditional claim** (`pending→sending` / `pending→rejected`) so concurrent requests can't double-dispatch an irreversible send (adds a transient `sending` status). approve mirrors agency approve — NOT behind the autopilot gate; structurally dormant (queue empty until Meta+automation).
- **Frontend** — `usePortalSocialInbox`, `/portal/social-inbox` (Inbox tab reuses `SocialInbox{Sidebar,Thread}` read-only; Approvals tab editable + gated), `SocialInboxPortalApprovalCard`, "Social" portal nav link.

### PR #72 — Durable-Object real-time
- **`server/utils/socialInbox/events.ts`** — per-client in-memory bus + `streamInboxEvents` SSE helper (DO-relay in prod / in-memory subscribe in dev). **Events carry NO content** (`{type, conversationId, actorId, timestamp}`); clients refetch via the scoped APIs (defence-in-depth). Cold-start self-heal: a stale-ahead client re-syncs to the DO's reset counter.
- **NEW worker `workers/social-inbox-rooms/`** — port of `board-events`, SSE-relay only. One `InboxRoom` per `client_id`; `POST /emit`, `GET /events?since=`.
- **SSE endpoints** — agency `?clientId=` (`requireAuth`, all-clients), portal session-scoped (`requireClientAuth`, can't stream another tenant).
- **Emit wiring** — new inbound (meta webhook + poll cron, on `inserted`), reply sent (agency reply + portal approve), assignment/status/snooze (PATCH — NOT pure mark-read, to avoid refresh loops). `dispatchReply` now returns `clientId`.
- **Client** — `useSocialInboxRealtime` (SSE→polling, error budget, SSR-guarded, cleans up timers/EventSource on unmount, reconnects on endpoint change). Wired into agency + portal pages.

---

## Operator activation (unchanged Meta steps + ONE new one)

All the prior Meta steps still apply (app config + `META_APP_ID/SECRET` + `META_WEBHOOK_VERIFY_TOKEN` + `SOCIAL_OAUTH_REDIRECT_BASE`; deploy; `social-inbox-cron` Worker + `CRON_SECRET`). **New for real-time:**

- Deploy the new worker: `pnpm --dir workers/social-inbox-rooms deploy` (watch the repo-root `.wrangler/deploy/config.json` redirect gotcha — deploy sub-workers from an isolated copy outside the repo tree, per the social-suite memory).
- Add the **`SOCIAL_INBOX_ROOMS`** Durable Object binding to the `agency-dashboard` Pages project in the CF dashboard (Pages can't bind DOs in `wrangler.toml`).
- Until both are done, real-time **degrades to polling** — no functional loss.

⚠️ Still **DORMANT** until Meta is activated. ⚠️ **NEVER flip `SOCIAL_AUTOMATION_ENABLED` / trigger a live reply send without explicit go-ahead.**

---

## Next build options

1. **Slice 2d remaining — DMs + mentions** (the only inbox piece left). App-Review-gated Meta channels. The unified model + UI already support `channel_type` `dm`/`mention`; what's missing: webhook change-handling for messaging events, provider `fetchInbox`/`reply` for DMs, and the messaging-grade OAuth scopes (same posture as leads `leads_retrieval`). Spec §3/§5 in `docs/superpowers/specs/2026-06-01-social-inbox-slice2-design.md`. Code-buildable but unverifiable-live until App Review — best done when the operator is ready to submit for review.
2. **Slice 3 (Reporting) / Slice 4 (Listening)** — separate slices, not yet designed.
3. **Other modules** — CRM Phase C (automotive pack), audio/email follow-ups.

## Loose ends (carried, neither is mine to fix unilaterally)
- **Dual migration-148 on main** (`148_social_inbox.sql` #61 + `148-crm-data-quality.sql` #63) — still open; both additive + live; investigate the migration runner before renumbering.
- **Marketing-page sync** for the inbox arc (incl. 2d portal) still deferred — consistent across 2a–2d; add a "Team Inbox / Client Portal Social" feature entry when doing a sync pass.

## Key facts for whoever resumes
- **No migrations** were added in 2d portal/realtime — both reuse existing tables. Audio took 149/150; social automation 151; 2c 152. Next free is **153** — still re-check `ls server/database/migrations | grep -oE '^[0-9]+' | sort -n | tail -1` at exec time.
- **Inbox endpoints use bare `requireAuth`**; agency CREATIVE staff are **not** client-scoped (verified repeatedly). Do NOT add `client_team_assignments` scoping to social endpoints. Portal endpoints are correctly scoped to the **session** clientId.
- **Worktree** `.worktrees/social-inbox-2d` (symlinked node_modules + `nuxt prepare`). For a real deploy use a full `pnpm install` checkout to avoid the shared-build-cache prerender break.
- **Subagent file-writes are denied here** — built inline; subagents used for review only.

---

*Handoff created 2026-06-02. Resume: read this file; the only inbox work left is the App-Review-gated DMs/mentions (option 1 above).*
