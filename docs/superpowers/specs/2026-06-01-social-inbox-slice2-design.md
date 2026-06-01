# Social Suite — Slice 2: Engagement Inbox + Reviews (Design Spec)

**Date:** 2026-06-01
**Status:** Design approved; ready for implementation planning.
**Depends on:** Slice 1 (Organic Publishing) — shipped + deployed. Reuses `social_accounts`, the `social-providers/*` registry, the companion-Worker cron pattern, Durable Objects real-time, and `notifications.ts`.
**Predecessor spec:** `docs/superpowers/specs/2026-06-01-social-publishing-design.md`
**Port source (read-only reference):** `/Users/paulgiurin/Documents/Projects/promotion-knoxgwmhaval` (`social_conversations`/`social_messages`, `UnifiedInbox*` components, webhook processors, review automation).

---

## 1. Goal

A unified social **engagement inbox + reviews manager** on the dashboard: comments on published posts, DMs, @mentions, and reviews across all six networks (Facebook, Instagram, LinkedIn, TikTok, YouTube, Google Business), with a configurable AI automation spectrum (manual → suggest → approval → auto-pilot), full agency team-workflow (assignment, status, saved replies, SLA), and full client-portal participation (read + approve).

This spec designs the **complete architecture**. The build is **phased** (§11) so the first shippable increment avoids the heavy permission gate.

## 2. Scope decisions (from brainstorming)

| Decision | Choice |
|----------|--------|
| MVP boundary | **Design the full thing**; phase the build. |
| AI depth | **Full auto-pilot**, configurable per-client/per-channel down to suggest/approval/off. |
| Portal scope | **Full client participation** — clients read their inbox/reviews AND approve responses (per-rule). |
| Team workflow | **All** — assignment + status + saved replies + internal notes + **SLA tracking**. |
| Ingestion backbone | **Approach A** — hybrid push (webhook) / pull (poll) through one normalization layer. |
| Data model | **Unified** `social_conversations` + `social_messages` spanning comments/DMs/mentions/reviews. |
| AI execution | **Queued** on the cron Worker (never inline at ingestion); guardrails + audit + approval gate. |

## 3. Per-network capability matrix

The inbox degrades to what each network's API actually supports. `channel_type`s a network doesn't support simply never appear for it.

| Network | Comments (on your posts) | DMs | @Mentions | Reviews | Ingest |
|---|---|---|---|---|---|
| **Facebook** (Page) | ✓ read+reply | ✓ Messenger (webhook+send) | ✓ page tagged | ✓ recommendations read+reply | webhook |
| **Instagram** (Business) | ✓ read+reply | ✓ (webhook+send) | ✓ @ + story mentions | ✗ | webhook |
| **LinkedIn** (Org) | ✓ read+reply | ✗ (no org DM API) | partial | ✗ | poll |
| **YouTube** | ✓ read+reply (Data API `commentThreads`) | ✗ | ✗ | ✗ | poll |
| **TikTok** | ◑ read+reply (limited API) | ✗ | ✗ | ✗ | poll |
| **Google Business** | n/a | ◑ Messages (deprecating — best-effort) | ✗ | ✓ read+reply | poll |

**Permission gating:** Comments + reviews work with the lighter page tokens (same family Slice 1 publishing needs). **DMs + mentions** require messaging-grade OAuth scopes + **Meta App Review** — treated as activate-later (same posture as Slice 1's deferred D2 OAuth). The model and UI are built for these channels but they stay dark until the scopes are granted.

## 4. Data model (new migrations 147–149, additive, `IF NOT EXISTS`)

> Verify the max migration number at execution time; 147–149 assumed free after Slice 1's 144–146.

All tables are `client_id`-scoped (FK `agency_clients(id) ON DELETE CASCADE`), mirroring Slice 1.

### `social_conversations`
One row per thread / comment-thread / review.
- `id UUID PK`, `client_id`, `social_account_id` (FK `social_accounts`), `platform TEXT`, `channel_type TEXT` (`comment｜dm｜mention｜review`),
- `platform_conversation_id TEXT` (idempotency key per account+channel), `permalink TEXT`,
- `participant_id TEXT`, `participant_name TEXT`, `participant_handle TEXT`,
- `status TEXT DEFAULT 'open'` (`open｜snoozed｜closed`), `snoozed_until TIMESTAMPTZ`, `priority TEXT`,
- `assigned_to TEXT`, `assigned_at TIMESTAMPTZ`,
- `last_message_at TIMESTAMPTZ`, `last_message_preview TEXT`, `last_message_direction TEXT` (`in｜out`),
- `unread_count INT DEFAULT 0`, `message_count INT DEFAULT 0`,
- `sentiment NUMERIC`, `rating INT` (reviews only), `tags TEXT[]`,
- `sla_due_at TIMESTAMPTZ`, `first_response_at TIMESTAMPTZ`, `sla_breached BOOLEAN DEFAULT FALSE`,
- `automation_state TEXT`, `metadata JSONB DEFAULT '{}'`, `created_at`, `updated_at`.
- Unique: `(social_account_id, channel_type, platform_conversation_id)`.

### `social_messages`
One row per message / comment / review-body / outbound reply / internal note.
- `id UUID PK`, `conversation_id` (FK ON DELETE CASCADE), `client_id`, `platform_message_id TEXT` (idempotency),
- `direction TEXT` (`in｜out`), `author_id TEXT`, `author_name TEXT`, `message_type TEXT` (`text｜image｜video｜comment｜review｜...`),
- `content TEXT`, `attachments JSONB DEFAULT '[]'`, `parent_message_id UUID` (threading),
- `is_internal_note BOOLEAN DEFAULT FALSE`, `sent_by_user_id TEXT`,
- `ai_generated BOOLEAN DEFAULT FALSE`, `ai_suggested BOOLEAN DEFAULT FALSE`, `ai_confidence NUMERIC`, `automation_rule_id UUID`,
- `platform_timestamp TIMESTAMPTZ`, `reactions JSONB`, `metadata JSONB DEFAULT '{}'`, `created_at`.
- Unique: `(conversation_id, platform_message_id)` (nullable platform_message_id for internal notes/outbound-pending).

### `social_saved_replies`
- `id`, `client_id` (nullable = org-wide), `name`, `category`, `content`, `platforms TEXT[]`, `variables JSONB`, `usage_count INT DEFAULT 0`, timestamps.

### `social_automation_rules`
- `id`, `client_id`, `platform`, `channel_type`, `mode TEXT` (`off｜suggest｜approval｜autopilot`),
- `conditions JSONB` (rating range, keyword/sentiment match, business-hours), `action JSONB` (saved-reply id *or* AI prompt),
- `approval_by TEXT` (`staff｜client｜none`), `rate_limit INT`, `priority INT`, `enabled BOOLEAN DEFAULT TRUE`, timestamps.

### `social_response_queue`
Automation + approval ledger and audit trail.
- `id`, `conversation_id`, `message_id` (the inbound being answered), `rule_id`, `draft_content TEXT`,
- `status TEXT` (`pending｜approved｜rejected｜sent｜failed`), `approver_type TEXT` (`staff｜client｜none`), `approved_by TEXT`, `approved_at TIMESTAMPTZ`,
- `error TEXT`, `created_at`, `updated_at`.

### `social_sla_policies`
- `id`, `client_id`, `channel_type`, `target_minutes INT`, `business_hours JSONB`, `enabled BOOLEAN`, timestamps.

### `social_sync_cursors`
Poll-path watermark, one row per account+channel.
- `id`, `social_account_id` (FK ON DELETE CASCADE), `channel_type TEXT`, `cursor TEXT` (platform page-token / ISO timestamp / last-id), `last_synced_at TIMESTAMPTZ`, `last_error TEXT`, timestamps.
- Unique: `(social_account_id, channel_type)`.

## 5. Ingestion + normalization

### Webhook path (push)
- `POST /api/webhooks/social/meta` — FB + IG comments, mentions, Messenger + IG DMs.
- `POST /api/webhooks/social/google-business` — GBP messages (best-effort; API deprecating).
- Each: **HMAC-verify** the signature, reject unsigned; route `platform_account_id → social_accounts → client_id`; call the shared `normalizeEvent(platform, channelType, raw)`; idempotent upsert conversation+message; publish real-time event; enqueue automation evaluation.
- Exempt from the global RBAC write-block (webhook exemption pattern, like Xero webhooks).

### Poll path (pull)
- Companion Worker **`social-inbox-cron`** (mirrors `social-dispatch-cron`/`meta-status-cron`) → `POST /api/cron/sync-social-inbox` with `x-cron-secret`.
- Per connected `social_account`, pull new **comments** (YouTube/TikTok/LinkedIn) + **reviews** (GBP/FB) since a per-account/per-channel **cursor** (dedicated `social_sync_cursors` table, see §4), through the *same* `normalizeEvent` path. Idempotent by `platform_message_id`.
- Suggested cadence: every 5 min (reviews can be longer); self-gates per account to respect rate limits.

### Normalization layer
- `server/utils/socialInbox/normalize.ts` — `normalizeEvent(platform, channelType, raw) → { conversation, message }`.
- Extend the **existing** `server/utils/social-providers/*` registry with `fetchInbox(account, cursor)` and `reply(account, conversation, content)` methods — do **not** create a parallel provider set.
- Idempotency everywhere keyed on `platform_message_id` / `platform_conversation_id`.

## 6. Automation engine

One engine, four per-rule modes (reconciles "auto-pilot" with "client approval"):

- **`off`** — manual.
- **`suggest`** — AI drafts (Groq `generateGroqInsight`, per-network tone + client context + thread); appears as one-click composer insert. Human sends.
- **`approval`** — AI drafts → `social_response_queue` row `pending` → routed to `approval_by` (`staff` or `client` via portal) → on approve, dispatched.
- **`autopilot`** — AI drafts → guardrails pass → dispatched automatically; logged `sent`.

**Execution (never inline at ingestion):** ingestion enqueues an *evaluation*; the `social-inbox-cron` tick runs the engine — matches rules by `priority`, applies `conditions`, then enforces **guardrails** before any autopilot send:
- per-rule + per-account **rate limits**;
- **confidence floor** (below threshold → downgrade to `approval`);
- **HARD SAFETY RULE (not a per-client toggle):** negative sentiment / complaint / legal-PR-risk keywords → force human (`approval`), never autopilot;
- **business-hours** gating;
- **idempotency** — exactly one auto-response per inbound message;
- every action written to `social_response_queue` (audit, reversible).
- Global kill-switch env **`SOCIAL_AUTOMATION_ENABLED`** (mirrors the email-sending gate) — auto-replies cannot fire until explicitly enabled.

The actual send uses each provider's new `reply()` method.

## 7. Team workflow + SLA

- **Assignment** — `assigned_to`; auto-assign defaults to **client-team membership** (`client_team_assignments`) with **round-robin fallback**; reassign; "mine/unassigned/all" filters.
- **Status** — `open｜snoozed(until)｜closed`; bulk actions; auto-reopen on new inbound.
- **Internal notes** — `is_internal_note` (staff-only, never sent); @mention teammates → `notifications.ts`.
- **Saved replies** — `social_saved_replies` with `{{variables}}`, per-network, usage tracking.
- **SLA** — `social_sla_policies` set `sla_due_at` on first inbound; `first_response_at` stamps on first outbound; breach flag + **breach alerts via `notifications.ts`**; metrics on the analytics tab (avg first-response, % within SLA, breaches).

## 8. Client portal surface

- **Read** — clients see own conversations/reviews read-only via `requireClientAuth`, client-scoped; reuse the portal `crmApiBase` provide/inject pattern from the CRM portal work.
- **Approve** — when a rule's `approval_by = client`, `pending` queue rows surface in the portal; client approves/rejects/edits → on approve, dispatched. (Builds the client-approval surface Slice 1 deferred.)
- **Reply** (optional per-client toggle) — let portal users post their own attributed replies; otherwise approve-only.
- All portal writes go through the same engine + audit log; nothing bypasses guardrails.

## 9. Real-time

Reuse existing **Durable Objects** (`chat-rooms`/`board-rooms` pattern) — a per-client inbox channel. Ingestion/reply/assignment publish fire-and-forget events (`conversation.upserted`, `message.added`, `assigned`, `status.changed`); UI subscribes for live list + thread updates. **Graceful degradation** to poll-refresh if the DO binding is unavailable. No new infra.

## 10. Surface (frontend + API)

### Frontend — namespaced `/agency/social/inbox/*` (sibling of `/publishing`)
- `inbox.vue` — hub: `InboxSidebar` (filters: network, channel_type, status, assignee, SLA, search) + `InboxThread` (timeline w/ threading) + `ThreadActionPanel` (assign, status, snooze, tags, link CRM record, SLA badge, internal notes).
- `InboxComposer` — per-network constraints, saved-reply picker, **"AI draft"** button, attachments, automation-mode badge.
- `reviews.vue` — review-centric view (rating distribution, filters, reply/AI-reply) over `channel_type='review'`.
- `automation.vue` — manage `social_automation_rules`; `approvals.vue` — staff `social_response_queue` surface.
- `analytics.vue` — response time / SLA / volume / automation-rate.
- Nav: extend the Creative-gated "Social" group (Inbox, Reviews, Automation, Approvals) alongside Publishing.
- Adapt sibling `UnifiedInbox*` components shadcn → **Nuxt UI v4**; apply the `frontend-design` skill to any forms.
- Portal: `portal/social/inbox` (read + approve), client-scoped.

### API — `server/api/agency/social/inbox/**`
`conversations` (list/get/patch status+assign), `conversations/[id]/messages` (get / post reply / post note), `conversations/[id]/ai-draft`, `saved-replies` CRUD, `automation-rules` CRUD, `response-queue` (list/approve/reject), `sla-policies` CRUD, `analytics/overview`, `accounts/sync` (manual poll trigger). Webhooks under `server/api/webhooks/social/**`. Cron `server/api/cron/sync-social-inbox`. Portal mirrors under `server/api/portal/social/**` with `requireClientAuth`.

## 11. Error handling & security

- **SSRF** — webhook/poll only call platform API hosts; never a user-supplied URL (matches Slice 1 + leads rules).
- **HMAC** verify on every webhook; reject unsigned.
- **RBAC** — agency endpoints `requireAuth` + Creative permission; portal `requireClientAuth` client-scoped; every query filtered by `client_id` (no IDOR).
- **Tokens** — per-account refresh; surface failures via `social_accounts.last_error`/`last_synced_at`; handle 429/expiry with backoff; partial-failure tolerant (like `publishPost`).
- **Automation** — autopilot sends idempotent + audited; `SOCIAL_AUTOMATION_ENABLED` global gate off by default.
- Server imports use `~~/server/utils/` (never `~/`).

## 12. Testing

- **Unit** — `normalizeEvent` per platform/channel; automation rule matching + **guardrail enforcement** (explicit negative-sentiment→human tests); SLA computation; idempotency.
- **Integration** — webhook→conversation upsert; poll cursor advance; approval-queue→send.
- Mirror Slice 1's vitest approach; target **0 new type errors**.

## 13. Phasing (build order within the slice)

1. **2a — Foundation + comments & reviews.** Data model + normalization + comments (poll + Meta webhook) + reviews (poll) + inbox/reviews UI + manual reply. *Ships on the lighter page tokens — no App Review.*
2. **2b — Automation.** Engine (suggest→approval→autopilot) + guardrails + approvals UI + `SOCIAL_AUTOMATION_ENABLED` gate.
3. **2c — Team workflow.** Assignment + SLA + saved replies + analytics.
4. **2d — Gated channels + portal + real-time.** DMs + mentions (App-Review-gated Meta channels) + client-portal approve surface + DO real-time.

Each phase is independently shippable; 2a delivers value without the heavy permission gate, mirroring how Slice 1 deferred OAuth.

## 14. Front-facing page sync

Per project rule: add Inbox / Reviews / Automation to `app/pages/features/index.vue` (+ detail `[slug]` pages) and `MarketingNav.vue` as the relevant phases land.

## 15. Out of scope (later slices / explicit cuts)

- **Social listening** / brand keyword monitoring across the web → **Slice 4 (Listening)**. This slice's "mentions" = direct @-tags of the connected accounts only.
- Organic performance reporting → **Slice 3 (Reporting)**.
- Paid/ad-comment moderation → folds in with the ad modules later.
