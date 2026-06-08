# Video V1.4 — Export / Distribution design

**Status:** Approved design — 2026-06-09
**Slice:** V1.4 of the Video V1 roadmap — the last assembly-tier phase. Get a finished render *out* of the studio.
**Builds on:** V1.3 AV editor (renders enqueue to `media_render_jobs`, output variants are R2 keys per format) + the shipped Social Suite publishing (`social_posts.media_urls[]`) + the client portal + the email HMAC signed-link pattern (`server/utils/email-marketing/links.ts`).
**Stacks on branch `feat/video-studio-v1-3`** (V1.3 is not merged to main; V1.4 needs the AV editor + render-jobs).

---

## 1. Goal & scope

Turn a completed render (`media_render_jobs.variants = { <format>: <r2_key> }`) into something useful:

**In scope (all four targets — user-confirmed), built as slices over one shared URL foundation:**
- **4a — Download** the rendered MP4(s).
- **4b — Publish to Social** (draft a `social_posts` row pre-filled with the rendered video + deep-link the composer).
- **4c — Client portal review** (surface the render for client review/approval).
- **4d — Reusable asset library** (a `video_assets` table so renders are reusable across projects/posts).

**Out (later):** AI generation (V2), transitions/scene grouping (V3), generalizing audio+video into one unified asset model, multi-render-version diffing.

**Gating:** everything that exposes a render stays consistent with V1.3 — the AV editor + `render-video` are already behind `VIDEO_STUDIO_ENABLED`. The new endpoints follow suit where they expose render output (the authed redirect can stay ungated since it 404s on missing jobs and is org-scoped; the social/asset write actions gate with the editor). Decide per-endpoint in each slice's plan.

---

## 2. The shared foundation (lands in slice 4a) — render-output URL layer

The architectural keystone: rendered variants are private R2 keys. Four consumers need URLs with different auth/longevity:
- download → authed agency user, short-lived ok
- portal → authed client session
- social → the platform's servers fetch `media_urls` **unauthenticated**, possibly **days later** for scheduled posts
- asset library → a stored reference reused by the above

**Decision (user-approved): stable proxy endpoint + HMAC-signed public link.**

### 2.1 Authed redirect endpoint
`GET /api/agency/audio/projects/[id]/renders/[jobId]/[format]`
- `requireAuth(event)`.
- Load the job via the gateway (org-scoped) — `listRenderJobs(projectId)` / a `getRenderJob(jobId)` helper; verify `job.projectId === id`.
- Look up `job.variants[format]` → R2 key; 404 if absent (not rendered / unknown format).
- `302`-redirect to a fresh `getPresignedDownloadUrl(key, 60*60)` (or `/api/_uploads/<key>` when storage unconfigured).
- Re-presigns on every hit → stable URL, no expiry problem. Serves **download** + **portal** (authed viewers).

### 2.2 HMAC public link (for social)
- Pure `server/utils/audio/renderLinks.ts`: `signRenderToken({ jobId, format })` / `verifyRenderToken(token)` — HMAC-SHA256 over `jobId|format` with a `RENDER_LINK_SECRET` (mirror `email-marketing/links.ts`: base64url payload + signature; **fail closed in production if the secret is unset**, inert in dev). TDD.
- `renderPublicUrl(jobId, format)` → `<appUrl>/api/public/renders/<token>`.
- `GET /api/public/renders/[token]` (no auth): verify token → look up the job's `variants[format]` key → `302` to a fresh presign. Only valid signed tokens resolve, so the bucket stays private; the platform fetches at publish time through this stable URL.

---

## 3. Slices

### Slice 4a — Download (foundation + download UX)
- **New:** `renderLinks.ts` (pure, TDD), the authed redirect endpoint (§2.1), the public token endpoint (§2.2).
- **Change:** the AV editor jobs panel (`app/pages/agency/audio/projects/[id].vue`) format buttons → point at `renders/[jobId]/[format]` (replace V1.3's dev `/api/_uploads/<key>`), with a download affordance.
- **No migration.**

### Slice 4b — Publish to Social
- **Action:** per completed job, a "Publish to Social" control (pick which format) → create a `social_posts` draft with `client_id` = the media project's client, `media_urls = [renderPublicUrl(jobId, format)]`, `status:'draft'`, empty content/platforms; then deep-link to the composer (`/agency/social/publishing` — confirm the composer's open-a-specific-draft mechanism at build time; fall back to navigating to the publishing list).
- **Guard:** the project must have a `client_id` (media projects can be org-level). If none, prompt to choose one (or block with a clear message).
- **Reuse:** the existing `POST /api/agency/social/publishing/posts` (or a thin server action that calls the same insert). `media_urls` is `TEXT[]` (migration 145) — the HMAC public link slots straight in.
- **No migration.**
- **Discovery at build:** how the social dispatcher/composer resolves `media_urls` (does it re-fetch at send? our stable link handles it either way); the composer deep-link param.

### Slice 4c — Client portal review
- **Surface** the render in the client portal for review/approve. Stream via the §2.1 redirect (portal-session auth variant).
- **Reuse** the existing portal proofs/approvals surface if it generalizes to a video artifact; else a minimal "video review" entry + an approve flag.
- **Discovery at build:** the portal approvals data model + auth (portal session vs `requireAuth`); whether a tiny migration is needed for an approve flag. Likely no migration or a small additive one.

### Slice 4d — Reusable asset library
- **New table `video_assets`** (migration): `id, client_id (nullable), title, source_project_id, source_job_id, r2_key, format, width, height, duration_sec, created_by, created_at`. Dedicated table (NOT generalizing `audio_assets`) — additive, zero risk to the shipped audio library.
- **"Save to library"** action on a completed render → inserts a `video_assets` row.
- **Library list** (agency surface) + **"use from library"** wired into 4b (social) and 4c (portal) so a saved asset can be republished/reviewed without re-rendering.
- **Only slice with a migration.** Largest surface.

---

## 4. Data flow

```
render job done → variants{format: r2_key}
      │
      ├─ §2.1 authed redirect ──→ Download (4a) · Portal stream (4c)
      ├─ §2.2 HMAC public link ─→ social_posts.media_urls (4b)
      └─ video_assets row ──────→ reuse in 4b/4c (4d)
```

## 5. Key decisions (locked)
- **URL foundation:** stable authed proxy + HMAC public link (not public R2, not per-target presign) — secure, survives scheduled posts, decouples consumers from R2.
- **Asset shape:** dedicated `video_assets` (not unified `media_assets`).
- **Sliced delivery:** one design spec; per-slice implementation plans; build 4a → 4b → 4c → 4d. 4c/4d get deeper discovery when reached.

## 6. Testing
- **Pure/TDD:** `renderLinks` sign/verify (valid round-trips, tampered token rejected, fail-closed-in-prod when secret unset).
- **Endpoints:** auth + org-scoping + 404-on-missing-variant tests mirroring existing endpoint test patterns; the actual 302/presign + social-platform/portal ingestion are operator verify-live.
- **Zero regression** to the shipped Social Suite + client portal (4b reuses the existing post-create; 4c reuses approvals).

## 7. Risks
1. **Social URL longevity** — scheduled posts must have a media URL valid at send time. Mitigated by the stable HMAC link that re-presigns on each fetch (no embedded expiry). Confirm the dispatcher doesn't snapshot a presigned URL at draft time.
2. **Secret management** — `RENDER_LINK_SECRET` must be set in prod or the public link fails closed (no silent broken links). Inert/dev-permissive locally.
3. **Project-without-client (4b)** — handle gracefully (prompt/choose) rather than producing a clientless post.
4. **Portal approvals coupling (4c)** — discovery-dependent; keep the portal change minimal and reversible.
5. **Verify-live dependency** — the underlying render path itself is still operator verify-live (queues/container). V1.4 builds the distribution layer dormant; end-to-end needs the render activated.

## 8. Success criteria
- An operator opens a completed render and can: download each format; "Publish to Social" → a draft post appears in the Suite pre-filled with the video + client, ready to schedule; send it to the client portal for review; and save it to the video asset library for reuse — each slice shippable and behind the studio flag, with zero regression to audio/social/portal.
