# Audio Studio — Phase 1 (Voiceover) Handoff

**Date:** 2026-06-01 · **Status:** Built, reviewed, green, **deployed to PREVIEW &
wiring-verified** — NOT merged to main, NOT on production.

## TL;DR

Phase 1 of the Audio Studio (owned AI voiceover) is fully implemented on an
isolated branch and **deployed to the Pages `preview` branch** (clean build, no
prerender regression). All automated gates pass and the deployed wiring is
verified. The ONLY remaining unverified step is the authenticated live
generate→R2→playback round-trip (needs a logged-in session + Workers AI inference)
— deliberately deferred per owner decision. Nothing is merged to `main`; production
is untouched.

## Preview deployment (2026-06-01)

- **URL:** https://preview.agency-dashboard-6cm.pages.dev (deployment
  `ff86a2a1.agency-dashboard-6cm.pages.dev`)
- Deployed from the `.worktrees/audio-studio-p1` worktree (own `node_modules`) →
  **no prerender/importNotDefined regression** (the cache-collision trap avoided).
- **Verified on preview:** `/agency/audio` → 200 (no 500); `POST
  /api/agency/audio/voiceover` (unauth) → 401 (wired, not 404); `GET
  /api/agency/audio/assets` (unauth) → 401; `/features/audio-studio/` → 200 and
  renders the detail content; features index lists it.
- **NOT yet done:** authenticated live generate (script → TTS → R2 → playback →
  Banner layer). Owner chose to stop at wiring-verified. This is the one thing to
  click through (on preview, logged in) before merging to production.

## Where the work lives

- **Branch:** `feat/audio-studio-phase1`
- **Worktree:** `.worktrees/audio-studio-p1` (has its OWN `node_modules` —
  installed fresh to avoid the shared build-cache collision; safe to `pnpm dev`/
  test in isolation).
- **Base:** branched from `origin/main` @ `c955eb06` (which already includes the
  committed design spec + plan).

## Commits (12)

```
cd8e0cd1 feat(audio): surface Audio Studio on marketing pages + lint clean
413629f4 feat(audio): add Audio Studio voiceovers to Banner Studio asset picker
a5705e76 feat(audio): Audio Studio page — voiceover form + library
1f00b463 fix(audio): address code review — guard match, presign degradation, KV blocklist
64b455e3 feat(audio): list audio assets endpoint
9e55374f feat(audio): synchronous voiceover generation endpoint
db915e38 feat(audio): voiceGen — guard + TTS orchestration
1a1c8ebb feat(audio): asset spine — assets.ts (DB + R2 gateway)
7e336def feat(audio): artist-mimicry guard (musicGuard)
91b7ddd7 feat(audio): add AudioAsset type
6a2257a2 feat(audio): migration 147 — audio_assets spine table
c955eb06 docs(audio): Phase 1 (Voiceover) implementation plan   ← also on main lineage
```

Design spec: `docs/superpowers/specs/2026-06-01-audio-studio-design.md`
Plan:        `docs/superpowers/plans/2026-06-01-audio-studio-phase1-voiceover.md`

## What was built

- **Migration 147** `audio_assets` — the durable asset spine (voiceover now,
  music later). **Already run against the prod Neon DB** (table + indexes + FK to
  `agency_clients` verified). Additive/idempotent.
- **`server/utils/audio/`** — `musicGuard.ts` (artist-mimicry guard, KV-backed
  blocklist + inline fallback), `assets.ts` (SOLE gateway to the table + R2 keys),
  `voiceGen.ts` (guard advisory + `aiVoice.textToSpeech`).
- **Endpoints** — `POST /api/agency/audio/voiceover` (sync generate),
  `GET /api/agency/audio/assets` (library list). Both `requireWriteAccess`.
- **UI** — `/agency/audio` page (`VoiceoverForm` + `AssetLibrary`),
  `useAudioStudio` composable.
- **Banner Studio** — `AssetsPanel.client.vue` gained an "Audio Studio" section
  that drops a voiceover onto a creative as an audio layer (mirrors the existing
  audio-layer shape; zero banner-engine changes).
- **Marketing sync** — features index + `[slug]` detail (Creative Production) +
  MarketingNav Creative column.

## Verification status

- ✅ **11/11** unit tests (`pnpm exec vitest run test/audio`) — guard (incl. 2
  review-regression tests), assets pure fns, voiceGen.
- ✅ **0 new eslint errors** vs baseline (marketing files: identical 15/12/21
  pre-existing counts before and after my edits). Remaining `any` usages match
  `db.ts`/`aiVoice.ts` codebase conventions.
- ✅ **0 new type errors.** The one `TS2322` the typecheck reports in
  `AssetsPanel.client.vue` is PRE-EXISTING (`STYLE_COLORS[s.style]` UBadge color —
  on baseline before my edits, just line-shifted).
- ✅ **Two-stage review done** (backend): spec-compliance = COMPLIANT; code-quality
  found 2 blocking bugs — both fixed in `1f00b463`:
  1. Guard bare-name regex was unanchored/unescaped → `'sia'` matched inside
     `'Russia'`. Fixed with whole-word lookarounds + regex-escape.
  2. `streamUrlFor` could throw AFTER the DB row was committed (orphan + 500) and
     sink an entire list via `Promise.all`. Now degrades to `undefined`.
  Plus wired `loadBlocklist(CACHE)` into the live path (realizes the spec's
  KV-maintainable-without-deploy intent).

## ⚠️ The one thing NOT verified

A real **authenticated generate → R2 → playback** round-trip. `aiVoice.textToSpeech`
needs the Cloudflare **Workers AI binding** AND a logged-in session
(`requireWriteAccess`). The branch is now on the Pages `preview` URL (see above) —
to finish: sign in on preview, open `/agency/audio`, generate a voiceover, confirm
it plays and drops into a Banner Studio audio layer. Locally the endpoint correctly
returns `503` (graceful degradation, no binding).

## To resume / finish

1. **Final whole-impl review** (optional) — the subagent-driven flow's last gate
   over all 12 commits as a unit.
2. **Open a PR** via the finishing-a-development-branch skill. ⚠️ Pushing to
   `adme-dev/dashboard` needs the `adme-dev` gh account + `gh auth setup-git`
   (Paul008 → 403). Repo has Issues disabled — track follow-ups via PR comments.
3. **Preview deploy** to do the live round-trip. Deploy from a checkout with a
   real `pnpm install` (this worktree qualifies) — NOT a symlinked-node_modules
   worktree (prerender cache collision). Migration 147 is already applied to prod
   DB, so it's a no-op on deploy.
4. **Merge** only after the round-trip is eyeballed.

## Deferred (own spec/plan each — do NOT scope-creep into Phase 1)

- **Phase 2 — Music generation:** Queue (`music-gen` + DLQ) + `MusicJob` Durable
  Object + an `audio-jobs` companion Worker (Pages has no `scheduled()`; mirror
  the social-dispatch-cron pattern). Music model IDs are PLACEHOLDERS — verify
  before relying. Migration 145-equivalent (next free number at that time).
- **Phase 3 — FFmpeg render tier:** the only new infra. Host (Cloudflare
  Containers vs Sydney VPS) decided via a benchmarking spike. Per-channel LUFS
  profiles — radio = network spec, social ≈ -14 to confirm.
- **Enterprise readiness (portal phase):** AI Gateway in front of every
  `AI.run` (cost telemetry), per-client budget caps + quotas, per-tenant rate
  limiting, retention + client right-to-deletion, a dedicated scoped stream
  route. v1 is internal staff-only by design (client_id is a tag, not an ACL).

## Fast-follow notes (non-blocking, from code review)

- `idempotency_key` column exists but isn't set on create — no retry path in v1,
  but a deterministic key (hash of createdBy+text+voice) would prevent accidental
  double-submits. Add when wiring Phase 2 retries.
- `status` enum has both `done` and `ready` as terminal states — collapse before
  Phase 2/3 code branches on status.
