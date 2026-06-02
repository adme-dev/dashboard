# Session Handoff — 2026-06-02 (Audio Studio go-live + GA4 funnel + social deploy)

**TL;DR:** Audio Studio Phases 1–3 are all **shipped to prod**; making music+render actually *run* is **parked on Docker** (daemon wouldn't launch). Social #67/#68/#69 were **deployed to prod** (dormant/gated). The GA4 funnel was **cleanly extracted from the mis-scoped #19 → PR #88, merged + deploying**.

Memory is the source of truth and is current: `audio-studio.md`, `social-suite.md`, plus `MEMORY.md` index. This doc consolidates the cross-stream state.

---

## 1. Audio Studio — BUILT & SHIPPED (Phases 1–3), go-live PARKED on Docker

All three phases are **code-live on production**:

| Phase | PR (squash) | Prod deploy | Status |
|---|---|---|---|
| 1 — Voiceover | #62 `12ab7bef` | `a4414b05` | live + working (voiceover functional) |
| 2 — Music gen | #64 `3607bbe3` | `376d1ca6` | code-live, **dormant** (operator-gated) |
| 3 — Render tier | #66 `1060b3bf` | `f5609bb9` | code-live, **dormant** (operator-gated) |
| (fix) instance_type | #67 `fb0a79a6` | (in social deploy) | standard→standard-1 |

- **Surface:** `/agency/audio` (Voiceover + Music tabs). Generated audio flows into Banner Studio's asset picker. Marketing synced.
- **Architecture:** music gen + render run in a **dedicated `audio-jobs` companion Worker** (`workers/audio-jobs/`) — the Pages worker can't consume queues or reach AI/R2 (wrap-worker exports only fetch+scheduled). Music: `minimax/music-2.6` (CF AI) → URL → fetch → R2. Render: **`RenderContainer`** (CF Container, ffmpeg) does 2-pass loudnorm per channel (social −14 / radio −24 LUFS). `render.ts` is pure+tested; `container/render.mjs` is its JS port — **keep in sync**.
- **Tests:** 41/41 audio unit tests green.

### 🔴 GO-LIVE: STARTED + PARKED 2026-06-02 (Docker would not launch)

Owner chose the full deploy; Docker Desktop never came up across ~30 min (no `Docker.app` process — `open -a Docker` no-op'd; try **`open -a "Docker Desktop"`**).

**Already done (do NOT repeat):**
- ✅ Queues `music-gen` + `music-gen-dlq` **created**
- ✅ Worker validated — `wrangler deploy --dry-run` bundles clean (289 KiB)
- ✅ Worker deps installed (`pnpm install --ignore-workspace` in `workers/audio-jobs/`; untracked `pnpm-lock.yaml` left there)
- ✅ `instance_type` standard→standard-1 fix merged (#67)

**Remaining 3 steps (needs Docker running first):**
1. From `workers/audio-jobs/`: `pnpm exec wrangler deploy -c wrangler.toml`
   *(the `-c` matters — a stale root `.wrangler/deploy/config.json` from Pages deploys otherwise confuses wrangler.)* Builds the ffmpeg container + deploys worker + registers the `RenderContainer` DO + binds the `music-gen` consumer.
2. `echo "$DATABASE_URL" | pnpm exec wrangler secret put DATABASE_URL` (worker must exist first; same Neon string as Pages).
3. **Dashboard (CANNOT be CLI'd):** agency-dashboard Pages → Settings → Bindings → **Queue producer `MUSIC_QUEUE` → `music-gen`** → redeploy Pages. *This is the activation* — until it, `POST /api/agency/audio/music/generate` returns **503** by design. Voiceover is unaffected throughout.
4. **E2E:** sign in → `/agency/audio` Music tab → generate **with channels**. Verifies the placeholder `MUSIC_MODEL` = `@cf/minimax/music-2.6` AI.run string + response field (if wrong, asset shows `failed` w/ error → fix `MUSIC_MODEL`/`extractAudioUrl` in `workers/audio-jobs/src/musicWorker.ts` + redeploy worker, fast) AND the render loudness on real audio.

No-Docker fallback exists (`--containers-rollout=none` → music-only, render skipped via the `env.RENDER` guard) but owner chose the full deploy.

Full runbook: `workers/audio-jobs/DEPLOYMENT.md`.

---

## 2. Social Suite — #67/#68/#69 DEPLOYED to prod (dormant/gated)

This session deployed `origin/main` to prod (deploy `adcdcce8`), shipping merged-but-undeployed work:
- **#68 D2 OAuth (Meta FB+IG)** — connect-a-Page flow + endpoints live, but **inert** until operator sets `META_APP_ID/SECRET` + `META_WEBHOOK_VERIFY_TOKEN` + `SOCIAL_OAUTH_REDIRECT_BASE` and registers scopes/redirect/webhook in the Meta app.
- **#69 Social Inbox 2c** — assignment, SLA, saved replies, analytics (schema mig 152 already on prod DB).
- **#65 reply automation (2b)** — still behind `SOCIAL_AUTOMATION_ENABLED` (**a deploy does NOT flip it**).

⚠️ **Never flip `SOCIAL_AUTOMATION_ENABLED` or trigger a live reply send without explicit go-ahead.**
⚠️ Known: dual-mig-148 collision on main (`148_social_inbox` #61 + `148-crm-data-quality` #63) — additive + live, flag for cleanup.

---

## 3. GA4 funnel — extracted clean from #19 → #88 MERGED + deploying

**Don't merge #19** — investigation found its branch bundles **3 features** (GA4 funnel + AI Xero reconciliation + GA4 auto-map), an explicit **`wip(leads)`** commit, and a **migration-122 collision** (`122-client-xero-contacts` vs main's `122-agency-client-logo-url`). The funnel *backend* had also already landed on main via earlier GA4 PRs.

**What was done:** extracted ONLY the net-new agency funnel view → **PR #88** (squash `148879e5`), merged + **deployed to prod `44d81353`** (verified: `/agency/analytics`→200, funnel endpoint→401, audio unaffected):
- `app/components/analytics/FunnelChart{,Data}.client.vue` + `app/utils/funnelView.ts` (8 tests)
- `funnel.get.ts`: additive `previous.totals`; page swap `PortalFunnelChart` → `AnalyticsFunnelChart`
- No migration, no collision, no WIP.

**Open follow-ups:**
- ⚠️ **Unverified render** — #88 swaps the funnel component on `/agency/analytics`; the math is unit-tested but the actual UI render wasn't eyeballed (needs login + a GA4-connected client). Worth a 30-sec look; clean revert if off.
- **Close #19** as superseded (its value is in #88). Not closed unilaterally — it's another author's PR.

---

## Production state & open items

- **Prod tracks `origin/main`** as of this session — latest deploy **`44d81353`** (social `adcdcce8` → funnel `44d81353`). All verified green.
- **Other open PRs** (triaged, not actioned): **#59** (Meta spend-sync queue completion — clean, mergeable), **#11** (Virtual Office 1b/1c — **29 conflicts, 336 behind main, stale**; needs a dedicated rebase session).
- Pre-existing repo quirk: the `feat/ga4-agency-funnel` branch is a symptom of "[local main diverged from origin]" — branches cut from a diverged local main bundle ~23 unpushed commits. Watch for this on other old branches.

## Worktrees in play
- `.worktrees/audio-studio-p1` — used all session (own node_modules + worker deps). Currently on `docs/handoff-audio-funnel-0602`. The audio + funnel branches are all merged.
- A separate `.worktrees/handoff` exists on `docs/session-handoff-2026-06-02` (concurrent session).

## Immediate next actions (pick up here)
1. **Eyeball the funnel render** on `/agency/analytics` for a GA4-connected client (deploy `44d81353` is live + endpoint-verified, but the UI render wasn't visually checked). Clean revert if off.
2. **Audio go-live** when Docker's sorted — the 3 steps above (`workers/audio-jobs/DEPLOYMENT.md`).
3. Optionally **close #19**; consider **#59**; defer **#11** to its own session.
