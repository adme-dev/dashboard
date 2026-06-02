# Session handoff — Audio go-live + Listening + main reconcile (2026-06-02)

**Branch:** `main` (synced with `origin/main`). **Author:** Claude (Opus 4.8) for paul@adme.net.au.

This session: reconciled `main`, deployed the **audio-jobs worker to production**, verified the MiniMax model integration, let the concurrent session's **Social Listening Slice 4** land, designed **Slice 4e**, and merged/deployed the doc work. One operator step remains to make music generation live.

---

## 1. What shipped this session

- ✅ **`main` fully reconciled** with `origin/main` (0/0). Rebased + pushed the 4a/4b/4c/4d planning-doc commits that were stranded on the local checkout; no force-push, no disruption to the concurrent session.
- ✅ **audio-jobs Worker deployed to production** (`audio-jobs.adme-dev.workers.dev`) — `music-gen` consumer registered, `RenderContainer` (ffmpeg) image built + pushed, bindings AI + AUDIO_BUCKET (`agency-files`) + HYPERDRIVE (`900b4b74…`) + RENDER, `DATABASE_URL` secret set. Cleared **6 distinct deploy blockers** (now documented in `workers/audio-jobs/DEPLOYMENT.md`).
- ✅ **MiniMax model integration verified** — `@cf/minimax/music-2.6` is the correct id per CF docs; output is `{ result: { audio: "<URL>" } }`; `extractAudioUrl` handles it; inputs match the schema. The "verify before relying" placeholder is resolved.
- ✅ **Doc PRs merged:** #100 (audio deploy runbook rewrite), #102 (Slice 4e design note).
- ✅ **Production Pages deploy** — see §6 for result.
- ℹ️ **Social Listening Slice 4 (4a–4d) shipped by the concurrent session** (#91/#94/#97/#99) — the entire listening feature is merged. I stood off its worktree to avoid corruption and contributed the 4e follow-on design instead.

---

## 2. 🔴 THE ONE REMAINING STEP — make music generation live (operator, dashboard)

Music currently returns **503 ("not enabled yet")** because the producer side isn't wired. The worker (consumer) is fully deployed; only the Pages **producer binding** is missing.

1. CF dashboard → `agency-dashboard` Pages → Settings → Bindings → **Production** tab → add a **Queue producer** binding: variable **`MUSIC_QUEUE`** (exact — code reads `event.context.cloudflare.env.MUSIC_QUEUE`) → queue `music-gen`.
2. **Redeploy Production** (a queue-producer binding only attaches on the next deployment).
3. Verify: `wrangler queues info music-gen` should flip to **Producers: 1** (Pages bindings do increment this — `leads-delivery-queue` shows ≥1).
4. E2E: sign in → `/agency/audio` → **Music** tab → generate an instrumental → asset should go `processing` → `done`. A 503 means the binding isn't on the **Production** environment yet (Production/Preview split is the usual miss).

Everything worker/container/model/secret-side is done and verified. This is the only thing between you and live music.

---

## 3. Audio — post-activation follow-ups (after step 2)

- **Validate render loudness on real audio** — the −14 LUFS (social) / −24 (radio) profiles in `server/utils/audio/profiles.ts` are unit-tested but never measured on actual ffmpeg output. Generate a track with channels, measure the variants.
- **AI Gateway** — route the worker's `AI` binding through AI Gateway for per-tenant cost telemetry (standing enterprise-readiness item).
- **Optional hardening** — the worker got a public `workers.dev` URL by wrangler default; it has no `fetch` handler (queue consumer only), so benign. Set `workers_dev = false` in `workers/audio-jobs/wrangler.toml` to remove it.
- **Radio LUFS target** — confirm −24 against the actual delivering network's spec (overridable per call, no redeploy).
- `server/utils/audio/render.ts` (tested) and `container/render.mjs` (its JS port) must be **kept in sync** — only render.ts is unit-tested.

---

## 4. Social Listening — Slice 4 done; Slice 4e designed, not built

- **Slice 4 (4a–4d) complete and merged.** Adapters: reddit, news/RSS, youtube, bluesky, mastodon + owned-signal projection + enrichment + alerting (gated `SOCIAL_LISTENING_ALERTS_ENABLED`) + portal. All gated/dormant until an operator sets per-source keys.
- **Slice 4e — source expansion (designed, PR #102 merged, NOT implemented):** `docs/superpowers/specs/2026-06-02-social-listening-slice4e-source-expansion.md`. Recommended build order:
  1. **4e-1** Hacker News (free, no key, highest ROI for B2B) + Lemmy — drop-in adapters, no data-model change.
  2. **4e-2** generic **`feeds`** adapter (RSS **+** Atom) → unlocks Google Alerts (whole-web) + App Store reviews; needs `feed_urls TEXT[]` on the query.
  3. **4e-3** reviews/reputation axis (Yelp + Google Places) — needs a per-client `monitored_targets JSONB`; star-rating → sentiment (skip Groq).
  4. **4e-4** niche keyed (GitHub, Stack Exchange, ListenNotes, Tumblr).
- **Listening activation (operator, when wanted):** set per-source keys (`REDDIT_CLIENT_ID/SECRET`, `YOUTUBE_API_KEY`, `SOCIAL_LISTENING_BLUESKY_ENABLED`, `SOCIAL_LISTENING_MASTODON_INSTANCES`), deploy the `social-listening-cron` companion worker + `CRON_SECRET`, and — only with sign-off — `SOCIAL_LISTENING_ALERTS_ENABLED=true`.

---

## 5. Gated / dormant in production (do NOT flip without sign-off)

- `SOCIAL_LISTENING_ALERTS_ENABLED` (listening alerts)
- `SOCIAL_AUTOMATION_ENABLED`, `SOCIAL_DM_ENABLED` (Slice 2 reply automation / DMs)
- `SOCIAL_REPORTS_ENABLED` (scheduled PDF reports)
- `EMAIL_SENDING_ENABLED` (email-marketing campaign send)
- Music generation — gated by the absence of the `MUSIC_QUEUE` binding (§2), not a flag.

---

## 6. Production deploy result

✅ **`pnpm deploy:production` succeeded** (exit 0) — deployment `ddd66388`, 705 files + Worker bundle uploaded, built from the `main` checkout at `d341654e`. Ships listening Slice 4d (#99) + CRM P4.3 (#101) + the doc PRs to production.

**Smoke test (agency-dashboard-6cm.pages.dev):**
- `/` → 200, `/agency/audio` → 200, `/agency/social/listening` → 200
- `/pricing` `/features` `/sign-in` → 308 → **200** (trailing-slash normalization — healthy; no prerender 500s, which have bitten prior deploys)
- `POST /api/agency/audio/music/generate` → 401 (auth-gated, as expected — still 503 *after* auth until the §2 binding is added)

---

## 7. Process note — multiple concurrent sessions

This session ran alongside ≥1 other Claude session on the same repo (CRM Phase 4 + Social Listening 4a–4d, both live). That caused real collision hazards — I nearly committed another agent's half-edited files in a shared worktree, and `main` kept drifting. **Recommendation: one active session per repo**, or strict one-worktree-per-session with no shared-`main` commits. All cross-session work this session was done in isolated worktrees + PRs to avoid it.

---

## 8. Quick reference

- **Audio worker redeploy** (the 6 gotchas): see `workers/audio-jobs/DEPLOYMENT.md` — in-repo build, move `.wrangler/deploy/config.json` aside, `pnpm install --ignore-workspace`, `docker pull` for cold buildkit, `docker builder prune -af` for the apt error.
- **Pages production deploy:** `pnpm deploy:production` (builds the working tree → `wrangler pages deploy dist/`). Deploy from the **main checkout** (real node_modules), not a symlinked-nm worktree (prerender cache hazard).
- **Memory updated:** `audio-studio.md` reflects the deployed worker + gotchas + verified model.
