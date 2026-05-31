# Email Marketing — Session Handoff #2 (2026-05-31)

**Branch:** `feat/email-marketing` · **PR #20** (open against `main`) · **origin tip `b00749f`**
**Supersedes:** `2026-05-31-email-marketing-handoff.md` (that one ended at 2a-ii-1; this covers through Phase 3).

> ⚠️ **READ FIRST — two hard rules:**
> 1. **Sending is behind a HARD GATE.** Real email only leaves when an operator sets `EMAIL_SENDING_ENABLED=true` on the deployed env. **Never** set that flag, call `/send` or `/test-send` live, or enable the `campaign-dispatch` cron trigger without explicit user sign-off.
> 2. **Nothing built after 2a-ii-1 has had a browser/live eyeball.** It's all build-verified (tests + lint + manifest) but UNVERIFIED in a running app. See the Deferred Verification checklist below before trusting it.

---

## TL;DR — where we are

The **email-marketing module is code-complete through Phase 3** (lists → editor → campaigns → gated sender → cron dispatcher → delivery/engagement webhooks). All on `feat/email-marketing`, pushed, 61 email unit tests green, lint clean. **Next is Phase 4** (public subscribe/unsubscribe RFC 8058 pages).

**The catch:** this session shipped 7 phases back-to-back without a single browser pass (no Chrome extension available) and without a clean live HTTP probe (the dev server reliably crashes with `EMFILE: too many open files` — see Environment Notes). So the **highest-value next action is a verification pass**, not more building.

---

## What shipped this session (commits, newest first)

| Commit | Phase | What |
|---|---|---|
| `b00749f` | 3 | Resend webhook receiver `/api/webhooks/resend` (svix sig verify + idempotent ingest) |
| `a2255fd` | 3 | `resendEvents.ts` — event map + handler (tracking + bounce/complaint suppression) |
| `6cc1073` | 2b-2b | cron dispatcher + `/api/cron/campaign-dispatch` (dormant, gated) |
| `59512f6` | 2b-2b | SKIP LOCKED chunk claim + 429 backoff + stale-claim watchdog (**mig 137**) |
| `ad0cbeb` | 2b-2a | campaign send/pause/cancel/test UI controls + gate-disabled state |
| `0328b09` | 2b-2a | send/pause/cancel/test-send/config endpoints (gate-enforced) |
| `7dac1da` | 2b-2a | gated send engine — merge tags, batch payload, chunked sender |
| `934212d` | 2b-1 | Campaigns tab + `CampaignsPanel.vue` |
| `481c92f` | 2b-1 | campaign API (list/create/get/patch/lists/materialize — no send) |
| `eb15bc3` | 2b-1 | `campaigns.ts` DB util (CRUD + materialize) |
| `b9ffe02` | 2b-1 | campaigns schema (**mig 136**) + send-gate/chunk helpers |
| `0528f74`–`a03cc62` | 2a-ii-4 | editor toolbar: undo/redo, Preview/HTML, save/load templates + Compose link |
| `c0e82a4` | 2a-ii-3 | `BlockSettingsPanel.vue` inspector (10 block types, UFormField) |
| `6331415`–`94e7b04` | 2a-ii-2 | canvas: EdmBlockRenderer / EditorBlockWrapper / Container / Columns + `edmBlocks.ts` palette |

(`5a75f4b fix(ga4)` interleaved from a concurrent session — not ours, harmless, leave it.)

---

## Architecture / key files

**DB (Neon, all RAN):** mig **132** core (email_subscribers/email_lists/subscriber_lists), **133** edm_templates, **136** campaigns/campaign_lists/campaign_recipients/email_events/suppression_list, **137** campaign_recipients.claimed_at.

**Editor (client-only SPA, `/agency/email/compose`):** `app/components/email/builder/` — `EdmFlyhubBuilder.client.vue` (shell: toolbar + 3-pane canvas + Preview/HTML + Save), `EdmBlockRenderer`, `EditorBlockWrapper`, `ContainerBlockRenderer`, `ColumnsContainerRenderer`, `BlockSettingsPanel`, `EmailLayoutSettings`. Store = singleton composable `app/composables/useEdmBuilder.ts` (**NOT Pinia**). Shared palette/defaults: `app/utils/edmBlocks.ts`. Render is server-side pure-TS (`server/utils/email-marketing/render/`).

**Campaigns + sender (server):**
- `server/utils/email-marketing/campaigns.ts` — CRUD + `setCampaignLists` + `materializeRecipients` (dedup, exclude unsubscribed/suppressed/disabled) + `setCampaignStatus` (stamps started/finished).
- `campaignSend.ts` — **pure, tested** helpers: chunk, canTransition, bodyHasUnsubscribe, **canEnterSending** (send gate), merge-tag substitution, batch-payload builder, isRateLimitError, parseRetryAfter.
- `campaignSender.ts` — **gated I/O**: `isCampaignSendingEnabled()` (the hard gate), SKIP-LOCKED `claimPendingChunk`, `sendCampaignChunk` (Resend Batch API, 429→release claim), `runCampaignSend` (capped paced loop), `releaseStaleClaims` (watchdog), `dispatchCampaigns()` (cron tick: promote scheduled + drain sending).
- `resendEvents.ts` — `RESEND_EVENT_MAP` + `handleResendEvent` (idempotent on svix-id).
- Endpoints: `server/api/email/campaigns/{index.get,index.post,[id].get,[id].patch}`, `[id]/{lists.put,materialize.post,send.post,pause.post,cancel.post,test-send.post}`, `config.get`; `server/api/cron/campaign-dispatch.post.ts`; `server/api/webhooks/resend.post.ts`.

**UI:** `app/pages/agency/email/index.vue` (Lists/Subscribers/**Campaigns** tabs) + `CampaignsPanel.vue` (create draft → set lists → materialize → Send/Pause/Cancel/Test, gate-aware).

**Design decisions worth knowing:**
- Leaf blocks render via our own `EdmBlockRenderer`, **not** `@flyhub/email-block-*` (keeps `@flyhub` out of the bundle).
- All automotive/dynamic-block cruft from the source project was **stripped**.
- 2b-2b uses a **cron-driven single-flight dispatcher**, not CF-Queue fan-out — the queue consumer (`processJob`) has no `event` so it can't re-enqueue; cron-driven is resumable + globally paced (≤2 req/s) and avoids the multi-consumer 429 self-DoS the spec warned about. CF-Queue fan-out only if throughput proves insufficient.

---

## ⛔ Deferred verification checklist (DO THIS BEFORE TRUSTING / MERGING)

1. **Browser eyeball the whole module** at `/agency/email` (clean env, logged-in agency session):
   - Compose: add Heading/Button/Image; select → inspector edits (text/color/font/padding) reflect live; move/dup/delete; insert "+" zones; Columns + Container add-child; Preview tab renders; HTML tab + copy; Save (creates `edm_templates` row); reload via `?id=`.
   - Campaigns tab: create draft, pick lists, see recipient count; Send button disabled with "sending disabled" alert (gate off).
2. **`USlider` model-value shape** — ported as a single number (`@update:model-value="updateStyle('fontSize', $event)"`). If Nuxt UI v4's slider emits an array, font-size/padding/columns-gap/border-radius sliders need `$event[0]`. **Check this first in the browser** — it affects the whole inspector + layout settings.
3. **Cron route live probe** — `curl -X POST /api/cron/campaign-dispatch` should be `401` without `x-cron-secret` (NOT 302). Blocked this session by EMFILE; route is in the Nitro manifest + mirrors `anomaly-detection`.
4. **Webhook live probe** — set `RESEND_WEBHOOK_SECRET`, point Resend's webhook at `/api/webhooks/resend`; a real event should `200` + insert an `email_events` row. Enable open/click tracking in the Resend dashboard.
5. **Migration 137 collision** — CRM PR #30 also uses `137-*.sql` (different table). Renumber whichever PR merges second (email→138 or CRM→138).
6. **Deploy config when going live** (all operator actions, with sign-off): `EMAIL_SENDING_ENABLED=true`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `CRON_SECRET`, `APP_URL`; enable the `campaign-dispatch` cron trigger in the CF dashboard (e.g. `* * * * *`); verify from-domain DKIM covers `List-Unsubscribe` headers (spec §4 blocker for Phase 4).

---

## NEXT — Phase 4, then 5

- **Phase 4 (public pages, RFC 8058):** build `/email/unsubscribe?c=<campaignId>&s=<subscriberId>` — the URL the sender already injects via the `{{unsubscribe_url}}` merge tag + `List-Unsubscribe` header. One-click unsubscribe (suppress instantly) + preference center; public subscribe form + double opt-in confirm. These pages are `public: true` / unauth — add to `auth.ts` publicRoutes and follow the marketing-page dark-mode rules. The sender's unsubscribe URL shape is in `campaignSend.ts:unsubscribeUrl()`.
- **Phase 5:** templates manager UI + segmentation + marketing-page sync (features/index, features/[slug], MarketingNav).
- **Loose thread:** composer Save targets `edm_templates`, not `campaigns`. To edit a campaign's body in the composer, wire the composer's save/load to `/api/email/campaigns/[id]` (body_source) — currently a campaign's body is only settable via campaign PATCH.

---

## Environment notes (important for whoever resumes)

- **EMFILE crashes:** this repo has 5+ live `git worktree`s (CRM, tracking, etc.) + this session symlinked `node_modules` into worktrees. Nitro's dev file-watcher recursively walks them and hits `EMFILE: too many open files`, crashing `pnpm dev` shortly after boot — even at `ulimit -n 65535`. To get a working dev server: run from a checkout with **fewer worktrees** / no recursive symlinks, or raise the OS file-descriptor limit higher, or `git worktree prune` stale ones first. A **zombie dev server on :3000** also skewed probes mid-session (kill with `lsof -ti :3000 | xargs kill -9`).
- **Concurrency:** multiple sessions share this repo and flip the shared working tree between branches. All email work this session was done in **isolated `git worktree`s** off the origin tip, pushed via `git push origin HEAD:feat/email-marketing` (fast-forward; always `git fetch` + FF-check first). The shared dir is currently on `feat/email-marketing@94e7b04` (behind origin `b00749f`) — a `git pull` there will fast-forward it.
- **Worktree recipe for resuming:** `git worktree add -b <name> .worktrees/<name> origin/feat/email-marketing` → `ln -s <repo>/node_modules <wt>/node_modules` → `pnpm exec nuxt prepare` (needed for vitest's `.nuxt/tsconfig`) → work → lint/test → `git push origin HEAD:feat/email-marketing` → remove worktree. Copy `.env` for DB/dev, delete before commit.
- **Push:** needs the `adme-dev` gh account (active). Migrations run via `psql "$DATABASE_URL"` (additive/`IF NOT EXISTS`).

Memory: `email-marketing-flyhub-phase2.md` has the full phase-by-phase detail; `MEMORY.md` index line is the one-liner.
