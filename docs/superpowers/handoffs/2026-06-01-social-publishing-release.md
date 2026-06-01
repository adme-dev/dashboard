# Social Publishing (Slice 1) — Release Runbook

**Branch:** `feat/social-publishing` (worktree off `origin/main`)
**Status at handoff:** Backend + frontend built & tested (52 social unit/integration tests green). OAuth connect/callback (D2) intentionally deferred as an operator-activated unit. Live publishing, visual QA, and deploy are operator steps below.

> **Do NOT auto-run any of this.** Deploying, flipping crons, and setting OAuth credentials are deliberate operator actions.

---

## What shipped

- **Migrations 144–146** (`social_accounts`, `social_posts` w/ `platform_overrides`+`tags`, `social_slot_schedules`/`social_post_templates`/`social_post_metrics`) — already run + verified against the Neon dev DB. They are additive with `IF NOT EXISTS` guards, so re-running on prod is safe.
- **Provider layer** — 6 publish providers (FB/IG/LinkedIn/TikTok/YouTube/Google Business) + registry + `PLATFORM_LIMITS`.
- **Publish core** — `socialPublishing.ts` (`resolvePlatformContent`, `stampUtms`, `publishPost`).
- **API** under `server/api/agency/social/publishing/**` — accounts (list/delete), posts CRUD, manual publish, slots, queue, approvals, calendar, analytics.
- **Dispatcher** — `POST /api/cron/publish-social-posts` (idempotent claim) + companion Worker `workers/social-dispatch-cron` (`*/2 * * * *`).
- **Frontend** — `/agency/social/publishing` calendar hub + compose / queue / planner / approvals / accounts / analytics. Nav group under "Social" (Creative-gated). Marketing pages synced.

## Route namespace note

`/agency/social` is the **existing ad-spend module** (`index.vue`, `spend.vue`, `[platform].vue`). The publishing UI is therefore namespaced under **`/agency/social/publishing/*`** (mirrors the API path). Don't move it back to `/agency/social`.

---

## Release steps (operator)

### 1. Deploy the app

Deploy from a **full `pnpm install` checkout** (not a symlinked-`node_modules` worktree — that shares the Nuxt build cache and breaks prerender; see project memory). Migrations 144–146 apply implicitly on first DB hit (additive). If deploying from this worktree, it already has its own real `node_modules`.

```bash
pnpm deploy:production
```

Smoke after deploy:
```bash
curl -s -o /dev/null -w '%{http_code}\n' https://agency-dashboard-6cm.pages.dev/agency/social/publishing   # 200 (after auth) / 302 to login
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://agency-dashboard-6cm.pages.dev/api/cron/publish-social-posts   # 401 (no secret)
```

### 2. Deploy the dispatcher Worker

```bash
cd workers/social-dispatch-cron
wrangler deploy
wrangler secret put CRON_SECRET     # MUST equal the Pages project's CRON_SECRET
```

The Worker fires `POST /api/cron/publish-social-posts` every 2 minutes with `x-cron-secret`. Until accounts are connected and posts scheduled, every tick is a cheap no-op (`{ processed: 0 }`).

Verify with the secret:
```bash
curl -s -X POST https://agency-dashboard-6cm.pages.dev/api/cron/publish-social-posts \
  -H "x-cron-secret: $CRON_SECRET"     # 200 {"processed":0,"results":[]}
```

### 3. (Deferred) Wire OAuth connect/callback — D2

This was intentionally not built because no flow could be verified without live credentials. To activate publishing:

1. For each network, register an OAuth app + a redirect URI pointing at `/api/agency/social/publishing/accounts/callback` (or per-network callback you implement).
2. Set the per-network client id/secret + scopes as Pages env vars. Required publishing scopes (not the spend-side scopes):
   - **Facebook/Instagram:** `pages_manage_posts`, `pages_read_engagement`, `instagram_basic`, `instagram_content_publish`, `business_management`.
   - **LinkedIn:** `w_member_social` / `w_organization_social`.
   - **YouTube:** `https://www.googleapis.com/auth/youtube.upload`.
   - **TikTok:** `video.publish` / `video.upload`.
   - **Google Business:** `https://www.googleapis.com/auth/business.manage`.
3. Implement `connect.get` / `callback.get` under `accounts/` (model on `server/api/agency/social/ga4/{connect,callback}.get.ts`), upserting into `social_accounts` with `ON CONFLICT (platform, platform_account_id) DO UPDATE`. **SSRF note:** these callbacks only call the platform token endpoints — never fetch a user-supplied URL.
4. Until then, the Accounts page shows networks as "Connect" (disabled) with an info banner; rows can also be inserted manually for testing.

### 4. First live test

1. Connect (or manually insert) one `social_accounts` row for a test client.
2. Compose a post → Request approval → Approve → "Schedule" a minute out.
3. Watch the Worker logs (`wrangler tail social-dispatch-cron`) for the claim + publish, and `social_posts.platform_results` for the per-network outcome.

---

## Known follow-ups (documented cuts, not bugs)

- **OAuth connect/callback (D2)** — operator-activated, above.
- **Banner Studio picker + AI caption/image** in the composer — the composer accepts media URLs today; the Banner Studio `BulkCreativePicker` embed and `ai/generate-{caption,image}` endpoints (rewired to Groq) are a fast-follow.
- **AI week planner** — the Planner manages slots today; auto-generating a week of posts is a fast-follow.
- **Dedicated IG / Google Business previews** — IG currently reuses the Meta feed preview; GBP uses a simple card.
- **Client-portal approvals** — internal approvals ship first; external approver is architected to drop in.
- **Drag-and-drop queue reorder** — currently up/down buttons (persist via `queue/reorder`).

## Type-hygiene note

`nuxt typecheck` shows the repo's ~60 pre-existing `index.d.ts` errors. The social slice adds none of its own (verified). The ported providers' strict-null spots were guarded. Type errors do not block `nuxt build` (rollup transpiles, no typecheck) — consistent with how the repo already deploys.

## Rollback

- **Stop publishing:** disable the `social-dispatch-cron` Worker trigger (or `wrangler delete`). The UI still works (reads persisted rows).
- **Migrations** 144–146 are additive — safe to leave even if the feature is reverted.
