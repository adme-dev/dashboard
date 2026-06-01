# PAUL Session Handoff

**Session:** 2026-06-02 — Social Suite **Slice 2d (part 3): DMs + mentions** — completes Slice 2.
**Status:** MERGED to `origin/main` (PR #75, squash `79124d69`). **Slice 2 (Engagement Inbox + Reviews) is now fully built.**

---

## TL;DR

Continued from the 2d portal+realtime handoff and built the final inbox piece — the App-Review-gated **DMs + @mentions** channels. Ships **dormant**; no migration.

| PR | Workstream | Merge |
|----|------------|-------|
| #75 | 2d-3 — DMs + mentions (App-Review-gated) | `79124d69` |

The **entire Slice 2 inbox arc** is now merged: 2a (comments+reviews) → 2b (automation) → D2 (Meta OAuth) → 2c (team workflow) → 2d (portal + real-time + DMs/mentions).

184 social tests green; 0 new type errors; adversarial review **SHIP**.

---

## What shipped (PR #75)

- **Ingestion** (pure, unit-tested): `normalizeMetaMentionWebhook` (FB/IG `mention(s)` → `channel_type='mention'`) + `normalizeMetaMessageWebhook` (Messenger / IG-DM `entry.messaging[]` → `channel_type='dm'`, keyed by sender PSID). **Rejects echoes** (our own outbound reflected back — prevents an automation feedback loop), receipts, and bare reactions; handles attachment-only DMs. The webhook handler now routes `entry.changes[]` (comment→mention) **and** `entry.messaging[]` (DMs); unmatched account → `continue` (never 500s Meta).
- **Send** (Facebook Messenger): `buildMessengerSend` (pure) + channel-aware `facebookProvider.reply` (`dm` → Send API, else comment edge). `ReplyParams.channelType` threaded through `dispatchReply`; `resolveReplyTarget` already returns the PSID for `dm`.
- **Gating** (`socialOAuth/meta.ts`): `META_MESSAGING_SCOPES`, `isSocialDmEnabled()`, `metaScopeSet()`, `metaSubscribedFields()`; `buildMetaAuthUrl(+includeMessaging)` and `subscribePageWebhook(+fields)` add messaging **only** when `SOCIAL_DM_ENABLED=true`. Default unchanged (base scopes + `feed`), so the **live comments/publishing OAuth is untouched** pre-approval.

## Out of scope (documented follow-up)

- **IG DM send + IG comment reply** — the `instagram` provider has no `reply()` at all (a pre-existing gap, not introduced here). IG DM/mention **ingestion** works via the platform-agnostic normalizer; an IG reply degrades gracefully (`"instagram replies not supported"`, no crash). To add: an `instagram` provider `reply()` with the Send API + page-id resolution (IG messaging uses the linked Page id, stored in the IG account row's `metadata.via_page_id`).

## Operator activation (DMs/mentions — when ready to submit for App Review)

1. Submit the Meta app for **`pages_messaging`** + **`instagram_manage_messages`** review.
2. Once approved: set **`SOCIAL_DM_ENABLED=true`** on CF Pages.
3. Have operators **reconnect** each Meta Page (re-consents the messaging scopes + re-subscribes the Page to `feed,mention,messages`).
- Until all three: fully dormant, zero behaviour change to the live comments/reviews + publishing.

(This is **in addition to** the base Meta activation + the `social-inbox-rooms` worker / `SOCIAL_INBOX_ROOMS` binding from the prior 2d handoff.)

⚠️ **NEVER flip `SOCIAL_DM_ENABLED` / `SOCIAL_AUTOMATION_ENABLED` or trigger a live reply send without explicit go-ahead.**

---

## Slice 2 — final state

Everything below is **merged to `origin/main`** and **dormant until Meta is activated**:

| Phase | What | Migration |
|-------|------|-----------|
| 2a | comments + reviews (read + manual reply) | 148 |
| 2b | reply automation (4 modes + guardrails) | 151 |
| D2 | Meta FB+IG OAuth | none |
| 2c | team workflow (assign/SLA/saved-replies/analytics) | 152 |
| 2d-1 | client-portal inbox (read + approve) | none |
| 2d-2 | Durable-Object real-time (SSE → polling) | none |
| 2d-3 | DMs + mentions (App-Review-gated) | none |

## Next build options
1. **Slice 3 (Reporting)** — organic performance reporting. Not yet designed.
2. **Slice 4 (Listening)** — brand keyword monitoring across the web. Not yet designed.
3. **Follow-ups** — IG DM send + IG comment reply (above); marketing-page sync for the whole inbox arc (deferred consistently across 2a–2d).
4. **Other modules** — CRM Phase C (automotive pack), audio/email follow-ups.

## Loose ends (carried)
- **Dual migration-148 on main** (`148_social_inbox.sql` #61 + `148-crm-data-quality.sql` #63) — still open; both additive + live; investigate the runner before renumbering.
- **Marketing-page sync** for the inbox arc (incl. DMs/mentions) still deferred.

## Key facts for whoever resumes
- **No migrations** added across the entire 2d arc (portal/realtime/DMs all reuse existing tables). Next free migration = **153** — re-check at exec time.
- **Inbox endpoints use bare `requireAuth`**; agency CREATIVE staff are **not** client-scoped. Portal endpoints scope to the **session** clientId.
- **DM threads** are keyed by participant PSID; the `UNIQUE (social_account_id, channel_type, platform_conversation_id)` includes `channel_type`, so a DM can't collide with a comment/mention sharing an id.
- **Subagent file-writes denied here** — built inline; subagents for review only.

---

*Handoff created 2026-06-02. Resume: Slice 2 inbox is complete; next is Slice 3 (Reporting) or Slice 4 (Listening) — both need a design pass first.*
