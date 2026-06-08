# Video Studio V1 — Go-Live Runbook & Verify-Live Checklist

**Date:** 2026-06-09
**Goal:** Activate and **prove end-to-end** the Video Studio (V1.1→V1.4). The whole studio is built but has **never rendered a real video** — the V1.2 render path is unit/parity-tested only. This runbook turns "verify the render" into a short operator session and confirms the four V1.4 distribution flows.

**Code state:**
- V1.1 (AV schema) + V1.2 (render spine) — **merged to `main`** (PR #135).
- V1.3 (AV editor) + V1.4 (export/distribution) — on branch **`feat/video-studio-v1-3`** (worktree `.claude/worktrees/video-studio-v1-3`), reviewed SHIP, **not yet merged**. Deploy step below assumes you merge or deploy from this branch.
- Migrations **173 (`video_reviews`) + 174 (`video_assets`) already ran live on prod Neon** (additive, dormant). No further DB action.

**Everything is dormant** until both flags are set (`VIDEO_STUDIO_ENABLED`, `RENDER_LINK_SECRET`) AND the queues/container are deployed. Until then the AV editor render button is hidden/disabled and the render endpoints 404.

---

## Architecture recap (what you're activating)

```
AV editor (Pages) → render-video.post.ts → createRenderJob (media_render_jobs)
   → enqueue to `video-render` queue (binding VIDEO_RENDER_QUEUE on the Pages app)
        → audio-jobs Worker consumes `video-render` (wrangler.toml consumer, batch 1)
             → RenderContainer (`audio-render` container, Chromium-baked):
                  ffmpeg base (footage trim/scale + still zoompan) + audio bed
                  + Banner overlay (headless Chromium GSAP capture → alpha composite)
             → MP4 variants → R2 (agency-files) → media_render_jobs.variants{format: r2_key}
   → jobs panel polls render-jobs.get → Download / Publish-to-Social / Send-to-Portal / Save-to-Library
```
The `video-render` consumer + the `RenderContainer` (with Chromium for overlay capture) already exist in `workers/audio-jobs/wrangler.toml`. You must create the queues, deploy the worker+container, wire the producer binding, set the flags, deploy the app, then render one project and eyeball it.

---

## Step 1 — Create the CF Queues

```bash
npx wrangler queues create video-render
npx wrangler queues create video-render-dlq
```
(If they already exist, wrangler reports so — fine.) The worker's consumer + dead_letter_queue are already declared in `workers/audio-jobs/wrangler.toml`.

## Step 2 — Deploy the audio-jobs Worker + RenderContainer

The worker already consumes `video-render` and binds the Chromium-baked `RenderContainer`. Deploy it so the container image (which V1.2b extended with Chromium for overlay capture) is live:

```bash
cd workers/audio-jobs
npx wrangler deploy
```
This builds `./container/Dockerfile` (ffmpeg + Chromium) and registers the `video-render` consumer. Confirm in the deploy output that the `video-render` consumer and the `audio-render` container are both registered. (See `workers/audio-jobs/DEPLOYMENT.md` for the audio-side context — same worker.)

> If the container build is heavy/slow, that's expected (Chromium). `instance_type = "standard-1"`.

## Step 3 — Wire the `VIDEO_RENDER_QUEUE` producer binding on the Pages app

The Pages app produces to `video-render` via `event.context.cloudflare.env.VIDEO_RENDER_QUEUE`. This producer binding must be set on the **Pages** project.

⚠️ **Known gotcha (from the audio MUSIC_QUEUE lesson):** a queue producer binding set only in the Cloudflare **dashboard** can be **overridden** by the Direct-Upload `dist/` wrangler config at deploy time. Set the `VIDEO_RENDER_QUEUE → video-render` producer binding the **same way the existing `TIMELINE_RENDER_QUEUE`/`MUSIC_QUEUE` producer bindings are set** for this Pages project (check the deploy wrangler config / `wrangler.toml` used by `pnpm deploy:production`, not just the dashboard). Mirror whatever made `timeline-render`/`music-gen` work.

Verify after deploy: enqueue a render (Step 6) and confirm a row appears on the `video-render` queue / the worker logs consume it. A `502 "Failed to enqueue video render"` from `render-video.post.ts` means the producer binding is missing/misnamed.

## Step 4 — Set env vars on the Pages app (Production)

Workers & Pages → `agency-dashboard` → Settings → Environment Variables → **Production**:

- `VIDEO_STUDIO_ENABLED` = `true` — gates the render endpoints + the AV editor render button + publish/portal/save endpoints. (Read as `process.env.VIDEO_STUDIO_ENABLED` server-side and mirrored to the client as `public.videoStudioEnabled`.)
- `RENDER_LINK_SECRET` = a long random secret (e.g. `openssl rand -hex 32`) — signs the public render links used in social `media_urls`. **Public render links fail closed without it** (V1.4 `renderLinks.ts`), so social publishing of video won't work until this is set.

(Both are consumed by the **Pages app**, not the worker. The worker needs no new env — it has AI/R2/Hyperdrive/container bindings already.)

## Step 5 — Deploy the app

Merge `feat/video-studio-v1-3` to `main` first (recommended), or deploy the branch.

⚠️ **Deploy from a clean, FULL `pnpm install` checkout** — not a symlinked-node_modules worktree (a prior phase hit a `nuxt build` prerender error — `packageImportsResolve` through symlinked node_modules — that aborted the deploy). Use the `.worktrees/deploy-prod` worktree pattern: checkout the target commit there, `pnpm install --frozen-lockfile`, then:

```bash
pnpm deploy:production    # = pnpm build (NODE_OPTIONS=--max-old-space-size=16384) + wrangler pages deploy
```

(See CLAUDE.md → Deployment + Known Issues for the heap/build notes.)

## Step 6 — Verify-Live UAT (the real go/no-go)

Sign in as agency staff. The render is unproven — **this is the actual test.**

**A. Render an AV project end-to-end:**
1. Go to `/agency/audio/projects` → **New project** → type **Video** → open it.
2. **Add → Footage:** upload a short MP4 → a blue clip on the Video lane; the canvas preview shows the first frame.
3. **Add → Still:** upload an image → scrub the playhead → ken-burns motion animates in the preview.
4. **Add → Overlay:** pick a Banner project + format → fuchsia clip on the Overlay lane → scrub → the GSAP overlay animates in sync over the base.
5. **Add → Audio clip:** add a voiceover/music asset → press Play → audio plays, video + overlay advance together.
6. **Render video** → toast "Render queued"; a job row appears and polls `queued`→`rendering`→`done`. (If it sticks in `queued`, the producer binding/queue is wrong — Step 3. If `failed`, read `media_render_jobs.error` + the audio-jobs worker logs.)
7. **Download** each format → **eyeball the MP4**: base footage + ken-burns stills + the overlay composited on top + the audio bed, at the right aspect/letterboxing. **This is the V1 go/no-go.**

**B. Distribution flows (once a render is `done`):**
8. **Publish → Social** (pick a format) → a draft opens in the composer (`/agency/social/publishing/compose?edit=…`) pre-filled with the video. (Optionally schedule/post to a test page to confirm the platform ingests the `/api/public/renders/<token>` link as **video** — needs Meta connected.)
9. **Send → Portal** → sign into the client portal for that client → **Video reviews** (nav) → the review shows, the `<video>` plays → Approve/Request changes.
10. **Save → Library** → open the editor's **Library** → the asset appears with a preview → **Publish to social** from the library deep-links the composer.

**C. Regression sanity:** open an existing **audio** project → behaves exactly as before (no preview pane, single "Add clip", no render button).

If A.7 looks right, the studio is proven. B/C confirm the distribution + no-regression.

---

## Rollback

- **Disable rendering instantly:** set `VIDEO_STUDIO_ENABLED=false` (or unset) + redeploy the Pages app. Render endpoints 404; AV editor render button hides. Editor/data untouched.
- **Stop consumption:** pause/delete the `video-render` queue or roll back the audio-jobs worker. In-flight jobs go to `video-render-dlq`.
- **Migrations (173/174):** additive — safe to leave even if the feature is rolled back.
- Nothing here is destructive; the whole feature is dormant by construction.

---

## Notes / follow-ups (not blockers for go-live)

- **`auth.ts` portal-allowlist fix is NOT video-specific.** This branch adds `/api/portal/` to `server/middleware/auth.ts` `publicRoutes` — it was missing there (only `rbac.ts` had it), so the staff-auth middleware 401s **all** `/api/portal/*` before `requireClientAuth` runs. If the **client portal is (or will be) used independently of the video studio, cherry-pick this one-line fix to `main` on its own** — don't make the portal wait for the video studio to merge. (Safe: all 41 portal endpoints self-authenticate via `requireClientAuth`.)
- **Marketing:** the "AI Video Creation" coming-soon feature entry is still deferred — add it at launch (no coming-soon status pattern exists on the marketing pages yet; it must be invented).
- **Deferred cosmetic minors:** `video_reviews` has no `(job_id, format)` unique constraint (double "Send to portal" → duplicate pending rows); the portal respond endpoint doesn't require notes on reject/revision (the approvals endpoint does); saved `video_assets` store `duration_sec = null` (library shows no duration).
- **Still operator-verify-live regardless of this runbook:** the real ffmpeg/Chromium composite output (unit/parity-tested only) and the social-platform/portal ingestion of the public render link.
