# Outstanding Work & Merge Backlog

**Created:** 2026-06-09
**Baseline:** `origin/main` = `6be8b385` (local `main` = origin = production, all identical).

This tracks everything **not yet on `main`** plus the finish-work on features already merged. Work through it top-to-bottom; each item says what it is, where it lives, why it isn't merged, and the steps to land it. Treat each as its own PR — do **not** bulk-merge (the leftover branches are stale/spike/blocked and would conflict or break prod).

## Already done (reference — no action)
- ✅ **Voice Admin AI** — merged (PR #134), deployed, live (gated `AI_TOOLS_ENABLED`).
- ✅ **Video Studio V1.3/V1.4** — merged (PR #136), deployed, dormant (gated `VIDEO_STUDIO_ENABLED`).
- ✅ **GA4 Agency Funnel** — merged (PR #88), deployed; stale `feat/ga4-agency-funnel` must not be merged directly because the clean extract is already on `main`.
- ✅ **Google Business Profile publishing** — merged dormant (PR #138), deployed with `GOOGLE_BUSINESS_PUBLISHING_ENABLED=false`; activation waits on Google API approval and production secrets.
- ✅ All previously-shipped features (audio studio, CRM, EDM, analytics/GA4 P3, anomalies, leads, media-studio sp0/1/2) — content is on `main`; their old branches only *look* unmerged due to squash-merge SHA divergence.

---

## A. Features to activate later

### A1. Google Business Profile (GBP) publishing activation
- [ ] **Code state:** dormant on `main` via PR #138, deployed with `GOOGLE_BUSINESS_PUBLISHING_ENABLED=false`.
- **Blocked by:** Google Business Profile API approval / quota, plus production secrets and account reconnects.
- **Activation steps:** confirm Google API approval → set GBP OAuth/client secrets in production → reconnect accounts → flip `GOOGLE_BUSINESS_PUBLISHING_ENABLED=true` → run focused publishing smoke tests → deploy.

### A2. GA4 Agency Funnel follow-ups
- [ ] **Code state:** clean agency funnel extract is on `main` via PR #88; stale `feat/ga4-agency-funnel` is historical only.
- **Follow-ups:** operator review of live data quality, client/property mapping coverage, and any UX refinements from actual agency use.

---

## B. Stale PRs — decide keep / rebuild / close

### B1. PR #11 — Virtual Office 1b/1c (media, knock-on-zone, populate)
- [ ] **Branch:** `feat/virtual-office-1b-media` (~34 new files, **670 commits behind**, CONFLICTING).
- **Recommendation:** too stale to rebase cleanly. **Re-cut fresh off `main`** (port only the still-wanted pieces) **or close**. Confirm the feature is still wanted before investing.

### B2. PR #59 — Spend: Meta sync to completion on the Queue + Connection Health UX
- [ ] **Branch:** `spend/meta-sync-queue-completion` (~13 files, **344 commits behind**, CONFLICTING).
- **Recommendation:** rebase on `main` + resolve, OR re-cut, OR close. Smaller than #11; assess if the Meta-sync improvement is still relevant.

---

## C. Cleanup (low risk; tidies the repo)

### C1. Delete the render spike
- [ ] `spike/video-composite-render` (~26 files) — **throwaway**; the real render shipped as Video V1.2. Delete the branch + worktree. (Useful gotchas already captured in memory: thenable-seek hang, `--disable-dev-shm-usage`.)

### C2. Prune stale worktrees (clears the macOS file-watcher / EMFILE limit)
- [ ] ~18 worktrees under `.worktrees/` and `.claude/worktrees/`. **Pruning removes only the folder — branches + commits survive.** Only worktrees with **uncommitted** changes are at risk; commit or skip those.
- Known **dirty** (do NOT prune without committing): `media-studio-sp2c`, `virtual-office-1b-media`, `audio-studio-p1`, `video-composite-render-spike`.
- Safe to prune (clean, content on main): `voice-admin-ai`, `main-sync`, `media-studio-sp0/1`, `video-studio-v1`, `video-studio-v1-3`, `ai-knowledge-acl`, `edm-postcards-builder`, etc. Keep the repo root and (optionally) `deploy-prod`.

### C3. Reconcile small-drift branches
- [ ] `feature/leads-engine-phase-1` (5), `feature/anomalies-overhaul` (3), `feat/analytics-phase3-ui` (1), `crm-engine-records` (1) — verify the residual files are superseded by what's on `main`, then **close the branches**. Don't merge blindly.

---

## D. Finish-work on already-merged features (to go from "merged" to "fully live")

### D1. Voice Admin AI
- [ ] **Live-mic UAT** (human at a mic): talk → see transcript → hear reply → spoken "confirm" on a write → result. UI render + session-start already browser-verified.
- [ ] **Rate-limit** `POST /api/agency/ai/chat/speak` + `/transcribe` before the feature is heavily used (the sibling `voice.post.ts` has a 12/60s limit; these don't).
- [ ] **Marketing sync** — update `/voice-ai` + `features/*` pages to the real hands-free/agentic capability (deferred from build).
- [ ] (Optional) streaming transport / wake-word — explicitly deferred in the design.

### D2. Video Studio (V1.3/V1.4)
- [ ] **Deeper `/code-review`** of the ~7k V1.3/V1.4 lines before flipping the flag (shipped dormant; merged with conflict-resolution + full test pass, but not feature-reviewed).
- [ ] **Operator activation:** create `video-render`{,-dlq} queues + `VIDEO_RENDER_QUEUE` binding + deploy the Chromium render container, then flip `VIDEO_STUDIO_ENABLED`.
- [ ] **Verify-live** a real render end-to-end (render output is unit/parity-tested only).
- [ ] **Marketing entry** for Video Studio (deferred).

---

## Suggested order
1. **C1 + C2 + C3** (cleanup — fast, low risk, fixes the local file-watcher pain).
2. **B1 + B2** decisions (close or schedule a re-cut).
3. **A1 (GBP activation)** only after Google approval + production secrets are ready.
4. **A2 / D1 / D2** finish-work to take the merged features fully live.

## Working rules (learned this session)
- `origin/main` is the **single source of truth**; keep local `main` **fast-forward-only** (never merge feature branches into local main directly — that caused the divergence we just untangled).
- Deploy from a clean checkout with **`AI_TOOLS_ENABLED=true VIDEO_STUDIO_ENABLED=false GOOGLE_BUSINESS_PUBLISHING_ENABLED=false pnpm deploy:production`** until Video/GBP are intentionally activated (flags are build-baked; keep them explicit on every deploy).
- Pushing needs the **`adme-dev`** gh account.
