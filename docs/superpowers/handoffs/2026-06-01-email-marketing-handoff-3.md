# Email Marketing — Session Handoff #3 (2026-06-01)

**Branch:** `feat/email-marketing` · **PR #20 + #37–#39 + #41–#44 all MERGED to `main`**
**Email tip merged:** `b304f4cd` · **Production deploy:** `ade707b7` (agency-dashboard-6cm.pages.dev)
**Supersedes:** `2026-05-31-email-marketing-handoff-2.md` (that one ended at Phase 3, code-complete-but-unverified). This one: **everything through Phase 5 is built, reviewed, merged, and deployed to production.**

> ⚠️ **READ FIRST — the one hard rule that still holds:**
> **Campaign sending is behind a HARD GATE.** Real email only leaves when an operator sets `EMAIL_SENDING_ENABLED=true` on the deployed env. It is OFF and was never touched this session. **Never** flip it, call `/send` or `/test-send` live, enable the campaign-dispatch cron, or send a double-opt-in confirm against real recipients without explicit user sign-off.

---

## TL;DR — where we are

The **email-marketing module is feature-complete and live in production** (gated). Phases 1–5 are all merged to `main` and deployed. Nothing sends. The only remaining work is the **operator go-live checklist** (below) and a **full browser eyeball pass** (never done — no Chrome extension available across these sessions).

---

## What shipped this session (newest first)

| PR | What |
|---|---|
| **#44** | **Phase 5 — audience segmentation.** `segment.ts` (TDD) + mig **142** `campaigns.filter_rules JSONB` + in-app filter at materialize + `SegmentBuilder.vue` "Audience" editor. |
| **#43** | **Phase 5 — composer ↔ campaign wiring.** `EdmFlyhubBuilder` `?campaign=<id>` mode loads/saves a campaign's body; "Design" button on CampaignsPanel. |
| **#42** | **Phase 5 — marketing-page sync.** Email Campaigns/Builder/Subscriber Lists in the Communication category + 3 `/features/email-*` detail pages + MarketingNav. |
| **#41** | **Phase 5 — Templates Manager.** Templates tab on `/agency/email` (`TemplatesPanel.vue`) over the existing `edm_templates` CRUD. |
| **#39** | **Turnstile** on the public subscribe form (`turnstile.ts` + `EmailPublicTurnstile.client.vue`). Inert until keys set. |
| **#38** | Build fix: Tailwind v4 can't `@apply bg-muted` in `<style scoped>` — use `var(--ui-bg-muted)`. |
| **#37** | **Phase 4 review fixes** — 5 consent/security bugs (see below). |
| **#20** | Phase 1–4 (the big merge; also fast-forwarded CRM/tracking/GA4 onto `main`). |

**Phase 4 (public RFC 8058) review fixes (#37) — the important ones:**
1. `subscribePublic` (UNAUTH) no longer deletes a `global_unsubscribe` suppression — previously anyone could re-enable a victim who opted out.
2. `confirmSubscription` now lifts suppression on proven consent (else a genuine re-subscriber stayed unmailable).
3. `emailLinkSecret()` fails **closed** in production (was silently using a public dev default → forgeable tokens). **NOTE: on CF Pages, secrets come via the binding, not `process.env`** — it reads `getCachedBinding` (cfEnv middleware populates it).
4. `setListSubscription` resubscribe is now atomic (UPDATE + suppression DELETE in one txn).
5. `globalUnsubscribe` records the event/counter on first explicit unsubscribe even when a prior bounce/complaint suppression exists.

---

## Architecture / key files

**DB migrations (Neon, all RAN):** 132 core · 133 edm_templates · 136 campaigns/recipients/events/suppression · 137 claimed_at · **142 campaigns.filter_rules** (segmentation). Email dodged 138–141 (CRM 138/141, leads 140).

**Public surface (Phase 4, unauth, token-gated):**
- `server/utils/email-marketing/links.ts` — `signEmailToken`/`verifyEmailToken` (HMAC, purpose-scoped `unsub`/`confirm`, constant-time, fail-closed in prod), `emailLinkSecret()`.
- `server/utils/email-marketing/subscriptions.ts` — `globalUnsubscribe`, `setListSubscription`, `subscribePublic`, `confirmSubscription`, `getSubscriberWithLists`.
- `server/utils/turnstile.ts` — `turnstileVerdict` (pure), `verifyTurnstile`, `isTurnstileEnabled` (gated on `TURNSTILE_SECRET_KEY`).
- Endpoints: `server/api/public/email/{lookup.get,unsubscribe.post,preferences.post,confirm.post,subscribe.post}` + RFC 8058 mailbox one-click at `server/routes/email/unsubscribe.post.ts`.
- Pages: `app/pages/email/{unsubscribe,subscribe,confirm}.vue` + `app/components/email/public/{Shell,Turnstile.client}.vue`.
- Registered public: `/api/public/email/` (server `auth.ts`) + `/email/` (app `auth.global.ts`).

**Segmentation (Phase 5 #44):**
- `server/utils/email-marketing/segment.ts` — `evaluateSegment`/`resolveSubscriberField`/`isValidSegment`. Grammar **mirrors `server/utils/leads/filterEval.ts`** (eq/neq/gt/lt/gte/lte/contains/starts_with/ends_with/in/not_in/is_empty/is_not_empty). Pure — evaluated in-app over candidates (no JSONB→SQL, no injection).
- `campaigns.ts`: `Campaign.filter_rules`, create/update persist it, **`materializeRecipients` now REBUILDS the pending queue** (deletes pending first) and applies the segment as a surviving-id allowlist on the insert. Endpoints validate with `isValidSegment` (400 `invalid_segment`).
- `app/components/email/SegmentBuilder.vue` — "Audience" action on **draft** campaigns in `CampaignsPanel`; saves then re-materializes to show the matching count.

**Composer (`/agency/email/compose`):** `EdmFlyhubBuilder.client.vue` — `?id=<templateId>` edits a template; `?campaign=<id>` loads/saves a campaign's body (PATCH `/api/email/campaigns/<id>`). Reached via "Design" on CampaignsPanel.

**Admin UI:** `app/pages/agency/email/index.vue` tabs = Lists / Subscribers / **Templates** / Campaigns.

**Sender (gated, dormant):** `campaignSender.ts` — `isCampaignSendingEnabled()` (the gate), `sendCampaignChunk` (Resend Batch, signs unsub token per recipient), `dispatchCampaigns()` (cron tick). `/api/cron/campaign-dispatch.post.ts` exists but **no trigger wired**.

---

## ✅ Verified this session

- 74 email/turnstile/segment unit tests green; lint clean on all changed files.
- Phase 4 consent fix smoke-tested against the dev DB (rolled back): unauth subscribe keeps suppression; confirm clears it.
- Segmentation SQL EXPLAIN-validated; `campaigns.filter_rules` column confirmed live in the prod DB.
- Production HTTP smoke: homepage 200, `/email/{unsubscribe,subscribe,confirm}` 200 (render correct branches), `/api/public/email/lookup` bad-token → 403, RFC route no-params → 400, `/api/cron/campaign-dispatch` no-secret → 401, `/agency/email` + `/features/email-campaigns` → 200.
- `EMAIL_LINK_SECRET` **set on the prod `agency-dashboard` Pages project** (random 32-byte value, in CF only).

## ⛔ NOT verified (deferred)

- **Full pixel browser eyeball** of the whole module (editor canvas/inspector/preview/save, campaigns send controls, the 3 public pages, the SegmentBuilder, the Templates tab). No Chrome extension was available. HTTP + SSR-render + Vite-compile are green, but no human-eye visual pass.
- **Resend webhook live probe** (needs `RESEND_WEBHOOK_SECRET` + a real Resend event).
- **A real end-to-end send** — intentionally never done (gate off).

---

## 🚀 Operator go-live checklist (all need explicit sign-off)

1. **Turnstile:** create a widget in the CF dashboard → set `NUXT_PUBLIC_TURNSTILE_SITE_KEY` (public) + `TURNSTILE_SECRET_KEY` (secret) on the Pages project → redeploy. The subscribe form then enforces it (fails closed when enabled).
2. **Resend:** set `RESEND_API_KEY` + `RESEND_WEBHOOK_SECRET`; point a Resend webhook at `/api/webhooks/resend`; enable open/click tracking in the Resend dashboard.
3. **Confirm `EMAIL_LINK_SECRET`** is set (done) and `APP_URL` is correct (the unsubscribe/confirm links use it).
4. **Cron:** the `campaign-dispatch` tick needs to be driven by a companion Worker — **Pages has no `scheduled()` handler.** ⭐ A consolidated **`pages-cron` Worker already exists (PR #45, merged to main this day)** that drives HTTP `/api/cron/*` routes; the likely move is to **add `/api/cron/campaign-dispatch` to that Worker's route list** rather than build a new one. Verify it sends `x-cron-secret: $CRON_SECRET`.
5. **Then** flip `EMAIL_SENDING_ENABLED=true` and watch the first send carefully.
6. DKIM on the from-domain must cover the `List-Unsubscribe` headers.

---

## Environment notes / lessons (all in MEMORY.md too)

- **Concurrent sessions share this working tree** and reset its git HEAD mid-build (broke a deploy this session with a missing-file Rollup error). **Deploy from an isolated worktree:** `git worktree add --detach <dir> origin/main`.
- **A symlinked `node_modules` in a worktree shares the Nuxt build cache** (`node_modules/.cache/nuxt`) → a concurrent build poisons your prerender (`#internal/nuxt/paths is not defined` → every marketing page 500s). **Give the worktree its own `node_modules`** (`pnpm install --prefer-offline`, ~10s warm store). Don't `rm` the shared `.cache`.
- **`pnpm deploy:production` builds the WORKING TREE, not `main`** — push + merge before/right after deploying or prod silently diverges from main.
- **Tailwind v4** can't `@apply` semantic utilities in `<style scoped>` — use `var(--ui-bg-muted)` / `var(--ui-bg)`.
- **Push** needs the `adme-dev` gh account. **`main` is the production branch** (deploys target `--branch main`).

Memory: `email-marketing-flyhub-phase2.md` has the full phase-by-phase detail; `MEMORY.md` line has the one-liner.
