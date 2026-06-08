# Video V1.4 — Export / Distribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Get a finished render out of the studio — download it, publish it to social, send it to the client portal for review, and save it as a reusable asset — over one shared URL foundation.

**Architecture:** A render's MP4 variants live as private R2 keys in `media_render_jobs.variants`. Slice 4a adds the URL foundation: an authed redirect endpoint (re-presigns per hit; serves download + portal) and an HMAC-signed public link (`renderLinks.ts`) that survives scheduled social posts. 4b drafts a `social_posts` row pre-filled with the public link + deep-links the existing composer (and fixes the dispatcher's image-only media typing so video actually publishes). 4c adds a dedicated `video_reviews` table + portal pages mirroring the shipped approvals flow. 4d adds a `video_assets` library mirroring `audio_assets`.

**Tech Stack:** Nuxt 4 / Nitro, Neon Postgres, Cloudflare R2, HMAC (Web Crypto), Nuxt UI v4, Vitest. Builds on the V1.3 AV editor (branch `feat/video-studio-v1-3`).

**Conventions (every task):**
- Worktree root: `/Users/paulgiurin/Documents/Projects/dashboard/.claude/worktrees/video-studio-v1-3`. Tests: `pnpm exec vitest run <path>`; if `~~/` alias errors, run `pnpm exec nuxt prepare` once.
- Server imports `~~/server/...`; app imports `~~/app/...` or `~/...`.
- Migrations: run via `export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-); psql "$DATABASE_URL" -f server/database/migrations/<file>.sql` (additive, `IF NOT EXISTS`-guarded). `.env` lives in the main checkout — if absent in the worktree, copy the command's DATABASE_URL from `../../../.env` (the main repo root) or ask the operator. The new tables are dormant (no reads until the UI is reached).
- Gating: the render endpoints are already behind `VIDEO_STUDIO_ENABLED`. New endpoints that EXPOSE render output stay org/tenant-scoped + auth'd; the social/asset WRITE actions live in the gated AV editor. The public token endpoint is unauth'd by design (token-gated).

---

## File Structure

**Slice 4a — foundation + download**
- `server/utils/audio/renderLinks.ts` *(new)* — pure HMAC sign/verify + `renderPublicUrl`.
- `server/utils/audio/projects.ts` *(modify)* — add `getRenderJob(jobId)` if not present.
- `server/api/agency/audio/projects/[id]/renders/[jobId]/[format].get.ts` *(new)* — authed redirect.
- `server/api/public/renders/[token].get.ts` *(new)* — token redirect.
- `nuxt.config.ts` *(modify)* — `renderLinkSecret` private runtime config.
- `app/pages/agency/audio/projects/[id].vue` *(modify)* — jobs-panel download buttons → authed endpoint.

**Slice 4b — publish to social**
- `server/utils/socialPublishing.ts` *(modify)* — media type detection (video vs image).
- `server/api/agency/audio/projects/[id]/renders/[jobId]/publish-social.post.ts` *(new)* — create draft post w/ public link.
- `app/composables/useMediaProjectEditor.ts` *(modify)* — `publishToSocial(jobId, format)` action.
- `app/pages/agency/audio/projects/[id].vue` *(modify)* — "Publish to Social" control + client guard.

**Slice 4c — client portal review**
- `server/database/migrations/173_video_reviews.sql` *(new)*.
- `server/utils/video/reviews.ts` *(new)* — pure-ish CRUD (create/list/get/respond) + `mapRow`.
- `server/api/agency/audio/projects/[id]/renders/[jobId]/send-to-portal.post.ts` *(new)* — agency creates a review.
- `server/api/portal/video-reviews/index.get.ts`, `[id].get.ts`, `[id]/respond.post.ts` *(new)*.
- `app/pages/portal/video-reviews/index.vue`, `[id].vue` *(new)*.
- `app/types/index.ts` *(modify)* — `VideoReview` type.

**Slice 4d — asset library**
- `server/database/migrations/174_video_assets.sql` *(new)*.
- `server/utils/video/assets.ts` *(new)* — `createVideoAssetFromRender`, `listVideoAssets`, `mapRow`.
- `server/api/agency/video/assets/index.get.ts` *(new)*, `server/api/agency/audio/projects/[id]/renders/[jobId]/save-asset.post.ts` *(new)*.
- `app/types/index.ts` *(modify)* — `VideoAsset` type.
- `app/components/media/MediaVideoLibrary.vue` *(new)* + wire into the editor + 4b.

---

# SLICE 4a — Foundation + Download

## Task 1: renderLinks.ts — HMAC sign/verify (pure, TDD)

**Files:**
- Create: `server/utils/audio/renderLinks.ts`
- Test: `test/audio/renderLinks.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { signRenderToken, verifyRenderToken } from '~~/server/utils/audio/renderLinks'

const SECRET = 'test-secret-0123456789'

describe('renderLinks token', () => {
  beforeEach(() => { process.env.RENDER_LINK_SECRET = SECRET; process.env.NODE_ENV = 'test' })
  afterEach(() => { delete process.env.RENDER_LINK_SECRET })

  it('round-trips a valid token', async () => {
    const t = await signRenderToken({ jobId: 'job-1', format: 'reels_9x16' })
    expect(await verifyRenderToken(t)).toEqual({ jobId: 'job-1', format: 'reels_9x16' })
  })

  it('rejects a tampered token', async () => {
    const t = await signRenderToken({ jobId: 'job-1', format: 'reels_9x16' })
    const tampered = t.slice(0, -2) + (t.endsWith('a') ? 'b' : 'a')
    expect(await verifyRenderToken(tampered)).toBeNull()
  })

  it('rejects a token signed with a different secret', async () => {
    const t = await signRenderToken({ jobId: 'job-1', format: 'reels_9x16' })
    process.env.RENDER_LINK_SECRET = 'a-different-secret'
    expect(await verifyRenderToken(t)).toBeNull()
  })

  it('fails closed in production when the secret is unset', async () => {
    delete process.env.RENDER_LINK_SECRET
    process.env.NODE_ENV = 'production'
    await expect(signRenderToken({ jobId: 'j', format: 'square_1x1' })).rejects.toThrow()
    process.env.NODE_ENV = 'test'
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run test/audio/renderLinks.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `server/utils/audio/renderLinks.ts`:

```ts
// server/utils/audio/renderLinks.ts — PURE-ish. HMAC-signed tokens for public render links
// so a stable URL (no embedded expiry) can sit in social media_urls and survive scheduled
// posts. Mirrors the email-marketing links signer. Web Crypto (works on CF Workers + Node).

export interface RenderTokenPayload { jobId: string; format: string }

function getSecret(): string {
  const s = process.env.RENDER_LINK_SECRET
  if (s) return s
  // Fail closed in production; permit a dev-only fixed secret locally so the feature is testable.
  if (process.env.NODE_ENV === 'production') {
    throw new Error('RENDER_LINK_SECRET is not set — refusing to sign render links in production')
  }
  return 'dev-insecure-render-link-secret'
}

function b64urlEncode(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function hmac(data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(getSecret()),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  return new Uint8Array(sig)
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!
  return diff === 0
}

/** token = base64url(JSON payload) + '.' + base64url(HMAC(payload)) */
export async function signRenderToken(payload: RenderTokenPayload): Promise<string> {
  const body = b64urlEncode(new TextEncoder().encode(JSON.stringify(payload)))
  const sig = b64urlEncode(await hmac(body))
  return `${body}.${sig}`
}

export async function verifyRenderToken(token: string): Promise<RenderTokenPayload | null> {
  const dot = token.indexOf('.')
  if (dot < 1) return null
  const body = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  let expected: Uint8Array
  try { expected = await hmac(body) } catch { return null }
  let given: Uint8Array
  try { given = b64urlDecode(sig) } catch { return null }
  if (!timingSafeEqual(expected, given)) return null
  try {
    const p = JSON.parse(new TextDecoder().decode(b64urlDecode(body)))
    if (p && typeof p.jobId === 'string' && typeof p.format === 'string') return { jobId: p.jobId, format: p.format }
    return null
  } catch { return null }
}

/** Build the public, stable render URL that goes into social media_urls. */
export async function renderPublicUrl(jobId: string, format: string, baseUrl: string): Promise<string> {
  const token = await signRenderToken({ jobId, format })
  return `${baseUrl.replace(/\/$/, '')}/api/public/renders/${token}`
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run test/audio/renderLinks.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/utils/audio/renderLinks.ts test/audio/renderLinks.test.ts
git commit -m "feat(video): HMAC-signed render link tokens (stable public URLs for social)"
```

---

## Task 2: getRenderJob helper + RENDER_LINK_SECRET config

**Files:**
- Modify: `server/utils/audio/projects.ts` (add `getRenderJob` if absent)
- Modify: `nuxt.config.ts` (private `renderLinkSecret`)
- Test: `test/audio/getRenderJob.test.ts` (only if `getRenderJob` is newly added and unit-testable with a mock db; otherwise skip the test and verify by reading)

- [ ] **Step 1: Check for an existing single-job getter**

Read `server/utils/audio/projects.ts`. It has `listRenderJobs(projectId)` and `createRenderJob`/`markRenderJobDone`/`markRenderJobFailed`. If a `getRenderJob(jobId)` (returning the `MediaRenderJob` row mapped, or null) does NOT exist, add it next to `listRenderJobs`, mirroring that function's row mapping:

```ts
export async function getRenderJob(jobId: string): Promise<MediaRenderJob | null> {
  const row = await queryOne(`SELECT * FROM media_render_jobs WHERE id = $1`, [jobId])
  return row ? mapRenderJobRow(row) : null
}
```

Use whatever the file's existing row-mapper is named (e.g. `mapRenderJobRow`); if `listRenderJobs` maps inline, extract a `mapRenderJobRow(row)` helper and use it in both. Keep `listRenderJobs` behavior identical.

- [ ] **Step 2: Add the private secret to runtimeConfig**

In `nuxt.config.ts`, in the PRIVATE `runtimeConfig` block (NOT `public`), near the other secrets, add:

```ts
    // Secret for signing public render links (V1.4). Unset → public render links fail closed in prod.
    renderLinkSecret: process.env.RENDER_LINK_SECRET || '',
```

- [ ] **Step 3: Verify**

Run: `pnpm exec nuxt prepare` → completes.
If you added a `getRenderJob` test, run it. Otherwise re-read the function and confirm it mirrors `listRenderJobs`'s mapping exactly.

- [ ] **Step 4: Commit**

```bash
git add server/utils/audio/projects.ts nuxt.config.ts test/audio/getRenderJob.test.ts 2>/dev/null; git add server/utils/audio/projects.ts nuxt.config.ts
git commit -m "feat(video): getRenderJob helper + RENDER_LINK_SECRET config"
```

---

## Task 3: Authed render redirect endpoint

**Files:**
- Create: `server/api/agency/audio/projects/[id]/renders/[jobId]/[format].get.ts`

- [ ] **Step 1: Implement the endpoint**

Create the file:

```ts
// Authed render-variant redirect: 302 → a fresh presigned URL for the rendered MP4.
// Re-presigns each hit (stable URL, no expiry). Serves download + (later) portal viewing.
import { requireAuth } from '~~/server/utils/auth'
import { getProjectWithCurrentTimeline, getRenderJob } from '~~/server/utils/audio/projects'
import { getPresignedDownloadUrl, getPublicUrl, isStorageConfigured } from '~~/server/utils/storage'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const jobId = getRouterParam(event, 'jobId')!
  const format = getRouterParam(event, 'format')!

  // org-scoped: getProjectWithCurrentTimeline applies the tenant gateway
  const project = await getProjectWithCurrentTimeline(id)
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })

  const job = await getRenderJob(jobId)
  if (!job || job.projectId !== id) throw createError({ statusCode: 404, statusMessage: 'Render job not found' })

  const key = (job.variants ?? {})[format]
  if (!key) throw createError({ statusCode: 404, statusMessage: 'Render variant not available' })

  const url = isStorageConfigured()
    ? (getPublicUrl(key) ?? await getPresignedDownloadUrl(key, 60 * 60))
    : `/api/_uploads/${key}`
  return sendRedirect(event, url, 302)
})
```

- [ ] **Step 2: Verify**

Run: `pnpm exec nuxt prepare` → completes (route registered). Confirm imports resolve (`getRenderJob` from Task 2).

- [ ] **Step 3: Commit**

```bash
git add server/api/agency/audio/projects/\[id\]/renders/\[jobId\]/\[format\].get.ts
git commit -m "feat(video): authed render-variant redirect endpoint"
```

---

## Task 4: Public token render endpoint

**Files:**
- Create: `server/api/public/renders/[token].get.ts`

- [ ] **Step 1: Implement**

```ts
// Public, token-gated render redirect — for social platforms fetching media_urls
// unauthenticated (incl. scheduled posts). Only valid HMAC tokens resolve; bucket stays private.
import { verifyRenderToken } from '~~/server/utils/audio/renderLinks'
import { getRenderJob } from '~~/server/utils/audio/projects'
import { getPresignedDownloadUrl, getPublicUrl, isStorageConfigured } from '~~/server/utils/storage'

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')!
  const payload = await verifyRenderToken(token)
  if (!payload) throw createError({ statusCode: 403, statusMessage: 'Invalid render link' })

  const job = await getRenderJob(payload.jobId)
  const key = job?.variants?.[payload.format]
  if (!key) throw createError({ statusCode: 404, statusMessage: 'Render not available' })

  const url = isStorageConfigured()
    ? (getPublicUrl(key) ?? await getPresignedDownloadUrl(key, 60 * 60))
    : `/api/_uploads/${key}`
  return sendRedirect(event, url, 302)
})
```

- [ ] **Step 2: Verify** — `pnpm exec nuxt prepare` completes.

- [ ] **Step 3: Commit**

```bash
git add server/api/public/renders/\[token\].get.ts
git commit -m "feat(video): public token-gated render redirect (for social ingestion)"
```

---

## Task 5: Download buttons → authed endpoint

**Files:**
- Modify: `app/pages/agency/audio/projects/[id].vue` (the render-jobs panel)

- [ ] **Step 1: Repoint the variant buttons**

In the jobs panel, the per-variant button currently uses `:to="`/api/_uploads/${key}`"`. Replace the inner loop so each format links to the authed redirect (which works whether or not storage is configured):

```vue
            <div class="ml-auto flex gap-2">
              <UButton
                v-for="(key, fmt) in (job.variants || {})" :key="fmt"
                :label="String(fmt)" size="xs" variant="soft" color="neutral"
                :to="`/api/agency/audio/projects/${projectId}/renders/${job.id}/${fmt}`"
                target="_blank"
              />
            </div>
```

(`projectId` is the page's computed project id. `fmt` is the format key; the value `key` is no longer used directly.)

- [ ] **Step 2: Verify** — `pnpm exec nuxt prepare` completes; `pnpm exec vitest run test/audio/ test/video/` stays green.

- [ ] **Step 3: Commit**

```bash
git add app/pages/agency/audio/projects/\[id\].vue
git commit -m "feat(video): jobs-panel download via authed render endpoint"
```

---

# SLICE 4b — Publish to Social

## Task 6: Dispatcher media-type detection (video vs image)

The social dispatcher hardcodes `type: 'image'` for every media URL, so a rendered MP4 would be sent as an image. Detect video by extension. The FB/IG providers already branch on `type === 'video'`.

**Files:**
- Modify: `server/utils/socialPublishing.ts` (the `.map(url => ({ url, type: 'image' }))` line, ~line 101)
- Test: `test/social/mediaType.test.ts` (new — extract + test the pure classifier)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { mediaTypeForUrl } from '~~/server/utils/socialPublishing'

describe('mediaTypeForUrl', () => {
  it('classifies common video URLs as video', () => {
    expect(mediaTypeForUrl('https://x/y.mp4')).toBe('video')
    expect(mediaTypeForUrl('https://x/y.mov')).toBe('video')
    expect(mediaTypeForUrl('https://x/api/public/renders/abc.def')).toBe('video') // render links are video
  })
  it('classifies images as image', () => {
    expect(mediaTypeForUrl('https://x/y.jpg')).toBe('image')
    expect(mediaTypeForUrl('https://x/y.png')).toBe('image')
  })
})
```

> Note the render-link case: the public render URL has no extension, so the classifier must also treat `/renders/` (and `/api/_uploads/...mp4`) paths as video. Keep the test honest with the implementation below.

- [ ] **Step 2: Run it to verify it fails** — `pnpm exec vitest run test/social/mediaType.test.ts` → FAIL (not exported).

- [ ] **Step 3: Implement**

In `server/utils/socialPublishing.ts`, add an exported classifier near the top:

```ts
/** Classify a media URL as video or image for provider dispatch. Render links + .mp4/.mov → video. */
export function mediaTypeForUrl(url: string): 'video' | 'image' {
  const u = url.toLowerCase()
  if (/\.(mp4|mov|webm|m4v)(\?|$)/.test(u) || u.includes('/api/public/renders/') || u.includes('/renders/')) return 'video'
  return 'image'
}
```

Then change the media mapping (the `media: resolved.mediaUrls.map(url => ({ url, type: 'image' as const }))` line) to:

```ts
        media: resolved.mediaUrls.map(url => ({ url, type: mediaTypeForUrl(url) })),
```

- [ ] **Step 4: Run tests** — `pnpm exec vitest run test/social/mediaType.test.ts` PASS. Then `pnpm exec vitest run test/social/ 2>/dev/null; pnpm exec vitest run test/audio/ test/video/` — confirm no regression (the social suite may have pre-existing env failures; the mediaType test + audio/video must pass).

- [ ] **Step 5: Commit**

```bash
git add server/utils/socialPublishing.ts test/social/mediaType.test.ts
git commit -m "feat(video): dispatcher detects video media URLs (renders publish as video, not image)"
```

---

## Task 7: publish-social endpoint (create draft post w/ public link)

**Files:**
- Create: `server/api/agency/audio/projects/[id]/renders/[jobId]/publish-social.post.ts`

- [ ] **Step 1: Implement**

The endpoint signs the public render URL server-side (the client must never sign) and inserts a `social_posts` draft, returning the new post id.

```ts
// Create a social_posts DRAFT pre-filled with a rendered video's public link + the project's
// client, so the user can finish/schedule it in the composer. Server-signs the render link.
import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { getProjectWithCurrentTimeline, getRenderJob } from '~~/server/utils/audio/projects'
import { renderPublicUrl } from '~~/server/utils/audio/renderLinks'
import { queryOne } from '~~/server/utils/db'

const BodySchema = z.object({ format: z.string().min(1) })

export default defineEventHandler(async (event) => {
  if (process.env.VIDEO_STUDIO_ENABLED !== 'true') throw createError({ statusCode: 404, statusMessage: 'Not found' })
  const user = await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')!
  const jobId = getRouterParam(event, 'jobId')!
  const { format } = BodySchema.parse(await readBody(event))

  const project = await getProjectWithCurrentTimeline(id)
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  const clientId = (project.project as { clientId?: string | null }).clientId ?? null
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'This project has no client; assign one before publishing to social.' })

  const job = await getRenderJob(jobId)
  if (!job || job.projectId !== id) throw createError({ statusCode: 404, statusMessage: 'Render job not found' })
  if (!job.variants?.[format]) throw createError({ statusCode: 404, statusMessage: 'Render variant not available' })

  const config = useRuntimeConfig()
  const baseUrl = (config.public as { appUrl?: string }).appUrl || process.env.APP_URL || ''
  const mediaUrl = await renderPublicUrl(jobId, format, baseUrl)

  const row = await queryOne(
    `INSERT INTO social_posts (client_id, created_by, content, media_urls, status, metadata)
     VALUES ($1,$2,$3,$4,'draft',$5) RETURNING id`,
    [clientId, user.id, '', [mediaUrl], JSON.stringify({ source: 'video_studio', jobId, format })]
  )
  return { postId: (row as { id: string }).id, clientId }
})
```

> The project gateway returns `project.project` with a camelCase `clientId` (confirm by reading `getProjectWithCurrentTimeline`'s mapping; if it's `client_id`, use that). `social_posts.media_urls` is `TEXT[]` — pass a JS array.

- [ ] **Step 2: Verify** — `pnpm exec nuxt prepare` completes.

- [ ] **Step 3: Commit**

```bash
git add server/api/agency/audio/projects/\[id\]/renders/\[jobId\]/publish-social.post.ts
git commit -m "feat(video): publish-social endpoint drafts a post with the render's public link"
```

---

## Task 8: "Publish to Social" UI action

**Files:**
- Modify: `app/composables/useMediaProjectEditor.ts` (add `publishToSocial`)
- Modify: `app/pages/agency/audio/projects/[id].vue` (per-job action)

- [ ] **Step 1: Composable action**

Add to `useMediaProjectEditor.ts` (near `renderVideoAction`):

```ts
  /** Draft a social post from a rendered variant. Returns the new post id (for deep-link) or null. */
  async function publishToSocial(jobId: string, format: string): Promise<{ postId: string; clientId: string } | null> {
    try {
      return await $fetch(`/api/agency/audio/projects/${projectId}/renders/${jobId}/publish-social`, {
        method: 'POST', body: { format }
      })
    } catch (e: any) {
      throw e   // surfaced by the page toast (incl. the no-client 400)
    }
  }
```

Add `publishToSocial` to the returned object.

- [ ] **Step 2: Page action**

In the jobs panel, for each `done` job, add a "Publish to social" menu/button that picks a format from `Object.keys(job.variants)` and calls the action, then deep-links the composer. Add to `<script setup>`:

```ts
async function onPublishToSocial(job: any, format: string) {
  try {
    const res = await editor.publishToSocial(job.id, format)
    if (res) await navigateTo(`/agency/social/publishing/compose?edit=${res.postId}&client=${res.clientId}`)
  } catch (e: any) {
    toast.add({ title: 'Could not publish to social', description: e?.data?.statusMessage ?? '', color: 'error' })
  }
}
```

In the jobs-panel job row (only when `job.status === 'done'`), add a dropdown beside the download buttons:

```vue
              <UDropdownMenu
                v-if="job.status === 'done'"
                :items="[Object.keys(job.variants || {}).map((fmt) => ({ label: `Publish ${fmt}`, icon: 'i-lucide-share-2', onSelect: () => onPublishToSocial(job, fmt) }))]"
              >
                <UButton icon="i-lucide-share-2" size="xs" variant="ghost" color="primary" label="Publish" />
              </UDropdownMenu>
```

(`navigateTo` is auto-imported; `toast` already exists on the page.)

- [ ] **Step 3: Verify** — `pnpm exec nuxt prepare`; `pnpm exec vitest run test/audio/ test/video/` green.

- [ ] **Step 4: Commit**

```bash
git add app/composables/useMediaProjectEditor.ts app/pages/agency/audio/projects/\[id\].vue
git commit -m "feat(video): 'Publish to Social' action deep-links the composer with the render"
```

---

# SLICE 4c — Client Portal Review

## Task 9: video_reviews migration

**Files:**
- Create: `server/database/migrations/173_video_reviews.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 173_video_reviews.sql — client-portal review of a rendered video. Dedicated table (the
-- shipped client_approvals is project_id-centric and lacks client_id; media projects aren't
-- `projects` rows). Additive, dormant until the Video Studio portal surface is reached.
CREATE TABLE IF NOT EXISTS video_reviews (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  media_project_id UUID NOT NULL,
  job_id          UUID NOT NULL,
  format          TEXT NOT NULL,
  r2_key          TEXT NOT NULL,
  title           TEXT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','rejected','revision_requested')),
  response_notes  TEXT NULL,
  responded_by    UUID NULL,
  responded_at    TIMESTAMPTZ NULL,
  created_by      UUID NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_video_reviews_client_status ON video_reviews (client_id, status);
CREATE INDEX IF NOT EXISTS idx_video_reviews_created_at ON video_reviews (created_at DESC);
```

- [ ] **Step 2: Run it**

```bash
export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2- 2>/dev/null || grep DATABASE_URL ../../../.env | cut -d= -f2-)
psql "$DATABASE_URL" -f server/database/migrations/173_video_reviews.sql
psql "$DATABASE_URL" -c "\d video_reviews" | head -20
```

Expected: table created; `\d` shows the columns. If `psql`/DATABASE_URL is unavailable in this environment, STOP and report so the operator runs it (the table is dormant; the rest of 4c can still be built).

- [ ] **Step 3: Commit**

```bash
git add server/database/migrations/173_video_reviews.sql
git commit -m "feat(video): video_reviews migration (portal review of renders)"
```

---

## Task 10: video reviews util (create/list/get/respond + mapRow)

**Files:**
- Create: `server/utils/video/reviews.ts`
- Modify: `app/types/index.ts` (add `VideoReview`)
- Test: `test/video/reviewsMapRow.test.ts`

- [ ] **Step 1: Write the failing test (pure mapRow)**

```ts
import { describe, it, expect } from 'vitest'
import { mapReviewRow } from '~~/server/utils/video/reviews'

describe('mapReviewRow', () => {
  it('maps snake_case db row to camelCase VideoReview', () => {
    const row = {
      id: 'r1', client_id: 'c1', media_project_id: 'p1', job_id: 'j1', format: 'reels_9x16',
      r2_key: 'media/x.mp4', title: 'Spot', status: 'pending', response_notes: null,
      responded_by: null, responded_at: null, created_by: 'u1',
      created_at: '2026-06-09T00:00:00Z', updated_at: '2026-06-09T00:00:00Z'
    }
    expect(mapReviewRow(row)).toMatchObject({
      id: 'r1', clientId: 'c1', mediaProjectId: 'p1', jobId: 'j1', format: 'reels_9x16',
      r2Key: 'media/x.mp4', title: 'Spot', status: 'pending', respondedBy: null
    })
  })
})
```

- [ ] **Step 2: Run it** → FAIL (module not found).

- [ ] **Step 3: Implement**

Create `server/utils/video/reviews.ts`:

```ts
// server/utils/video/reviews.ts — CRUD for portal video reviews. mapRow is pure (tested);
// the DB fns use queryOne/queryRows.
import { queryOne, queryRows } from '~~/server/utils/db'

export interface VideoReview {
  id: string; clientId: string; mediaProjectId: string; jobId: string; format: string
  r2Key: string; title: string | null
  status: 'pending' | 'approved' | 'rejected' | 'revision_requested'
  responseNotes: string | null; respondedBy: string | null; respondedAt: string | null
  createdBy: string; createdAt: string; updatedAt: string
}

export function mapReviewRow(row: any): VideoReview {
  return {
    id: row.id, clientId: row.client_id, mediaProjectId: row.media_project_id, jobId: row.job_id,
    format: row.format, r2Key: row.r2_key, title: row.title ?? null, status: row.status,
    responseNotes: row.response_notes ?? null, respondedBy: row.responded_by ?? null,
    respondedAt: row.responded_at ?? null, createdBy: row.created_by,
    createdAt: row.created_at, updatedAt: row.updated_at
  }
}

export async function createVideoReview(input: {
  clientId: string; mediaProjectId: string; jobId: string; format: string; r2Key: string; title: string | null; createdBy: string
}): Promise<VideoReview> {
  const row = await queryOne(
    `INSERT INTO video_reviews (client_id, media_project_id, job_id, format, r2_key, title, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [input.clientId, input.mediaProjectId, input.jobId, input.format, input.r2Key, input.title, input.createdBy]
  )
  return mapReviewRow(row)
}

export async function listVideoReviewsForClient(clientId: string): Promise<VideoReview[]> {
  const rows = await queryRows(`SELECT * FROM video_reviews WHERE client_id = $1 ORDER BY created_at DESC LIMIT 100`, [clientId])
  return rows.map(mapReviewRow)
}

export async function getVideoReviewForClient(id: string, clientId: string): Promise<VideoReview | null> {
  const row = await queryOne(`SELECT * FROM video_reviews WHERE id = $1 AND client_id = $2`, [id, clientId])
  return row ? mapReviewRow(row) : null
}

export async function respondVideoReview(id: string, clientId: string, action: 'approve' | 'reject' | 'revision_requested', notes: string | null, respondedBy: string): Promise<VideoReview | null> {
  const statusMap = { approve: 'approved', reject: 'rejected', revision_requested: 'revision_requested' } as const
  const row = await queryOne(
    `UPDATE video_reviews SET status=$1, response_notes=$2, responded_by=$3, responded_at=now(), updated_at=now()
     WHERE id=$4 AND client_id=$5 RETURNING *`,
    [statusMap[action], notes, respondedBy, id, clientId]
  )
  return row ? mapReviewRow(row) : null
}
```

Add to `app/types/index.ts` (near `AudioAsset`) a re-export-free duplicate type for the frontend:

```ts
export interface VideoReview {
  id: string; clientId: string; mediaProjectId: string; jobId: string; format: string
  r2Key: string; title: string | null
  status: 'pending' | 'approved' | 'rejected' | 'revision_requested'
  responseNotes: string | null; respondedBy: string | null; respondedAt: string | null
  createdBy: string; createdAt: string; updatedAt: string
}
```

- [ ] **Step 4: Run tests** → PASS. `pnpm exec nuxt prepare` completes.

- [ ] **Step 5: Commit**

```bash
git add server/utils/video/reviews.ts app/types/index.ts test/video/reviewsMapRow.test.ts
git commit -m "feat(video): video_reviews util + VideoReview type"
```

---

## Task 11: Agency "Send to client portal" endpoint + action

**Files:**
- Create: `server/api/agency/audio/projects/[id]/renders/[jobId]/send-to-portal.post.ts`
- Modify: `app/composables/useMediaProjectEditor.ts` + `app/pages/agency/audio/projects/[id].vue`

- [ ] **Step 1: Endpoint**

```ts
import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { getProjectWithCurrentTimeline, getRenderJob } from '~~/server/utils/audio/projects'
import { createVideoReview } from '~~/server/utils/video/reviews'

const BodySchema = z.object({ format: z.string().min(1), title: z.string().max(200).nullish() })

export default defineEventHandler(async (event) => {
  if (process.env.VIDEO_STUDIO_ENABLED !== 'true') throw createError({ statusCode: 404, statusMessage: 'Not found' })
  const user = await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')!
  const jobId = getRouterParam(event, 'jobId')!
  const { format, title } = BodySchema.parse(await readBody(event))

  const project = await getProjectWithCurrentTimeline(id)
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  const clientId = (project.project as { clientId?: string | null }).clientId ?? null
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'Assign a client to this project before sending to the portal.' })

  const job = await getRenderJob(jobId)
  const key = job && job.projectId === id ? job.variants?.[format] : undefined
  if (!key) throw createError({ statusCode: 404, statusMessage: 'Render variant not available' })

  const review = await createVideoReview({ clientId, mediaProjectId: id, jobId, format, r2Key: key, title: title ?? null, createdBy: user.id })
  return { review }
})
```

- [ ] **Step 2: Composable + page action** — add `sendToPortal(jobId, format)` to the composable (mirror `publishToSocial`, POST to `send-to-portal`), and a "Send to portal" dropdown item next to "Publish" in the jobs panel that toasts success. (Same shape as Task 8's UI; reuse the dropdown — add an item `{ label: 'Send {fmt} to portal', icon: 'i-lucide-send', onSelect: () => onSendToPortal(job, fmt) }` and an `onSendToPortal` that toasts "Sent to client portal".)

- [ ] **Step 3: Verify + Commit**

```bash
pnpm exec nuxt prepare && pnpm exec vitest run test/audio/ test/video/
git add server/api/agency/audio/projects/\[id\]/renders/\[jobId\]/send-to-portal.post.ts app/composables/useMediaProjectEditor.ts app/pages/agency/audio/projects/\[id\].vue
git commit -m "feat(video): agency 'Send to client portal' creates a video review"
```

---

## Task 12: Portal endpoints (list / get / respond)

**Files:**
- Create: `server/api/portal/video-reviews/index.get.ts`, `[id].get.ts`, `[id]/respond.post.ts`

Mirror `server/api/portal/approvals/*` exactly (auth via `requireClientAuth`, tenant scope via the session `clientId`, `canApproveWork` gate on respond). For viewing the video, return a portal-authed stream URL — reuse the authed redirect by exposing a portal variant, or return a presigned URL directly from the review's `r2Key`.

- [ ] **Step 1: list** — `index.get.ts`:

```ts
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { listVideoReviewsForClient } from '~~/server/utils/video/reviews'

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  return { reviews: await listVideoReviewsForClient(client.clientId) }
})
```

- [ ] **Step 2: get (with a fresh presigned video URL)** — `[id].get.ts`:

```ts
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { getVideoReviewForClient } from '~~/server/utils/video/reviews'
import { getPresignedDownloadUrl, getPublicUrl, isStorageConfigured } from '~~/server/utils/storage'

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  const id = getRouterParam(event, 'id')!
  const review = await getVideoReviewForClient(id, client.clientId)
  if (!review) throw createError({ statusCode: 404, statusMessage: 'Review not found' })
  const videoUrl = isStorageConfigured()
    ? (getPublicUrl(review.r2Key) ?? await getPresignedDownloadUrl(review.r2Key, 60 * 60))
    : `/api/_uploads/${review.r2Key}`
  return { review, videoUrl }
})
```

- [ ] **Step 3: respond** — `[id]/respond.post.ts`:

```ts
import { z } from 'zod'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { respondVideoReview } from '~~/server/utils/video/reviews'

const BodySchema = z.object({ action: z.enum(['approve', 'reject', 'revision_requested']), notes: z.string().max(2000).nullish() })

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  if (!client.permissions?.canApproveWork) throw createError({ statusCode: 403, statusMessage: 'You do not have permission to approve work.' })
  const id = getRouterParam(event, 'id')!
  const { action, notes } = BodySchema.parse(await readBody(event))
  const updated = await respondVideoReview(id, client.clientId, action, notes ?? null, client.id)
  if (!updated) throw createError({ statusCode: 404, statusMessage: 'Review not found' })
  return { review: updated }
})
```

> Confirm `requireClientAuth`'s return shape (`clientId`, `id`, `permissions.canApproveWork`) by reading `server/utils/clientAuth.ts` before wiring.

- [ ] **Step 4: Verify + Commit**

```bash
pnpm exec nuxt prepare
git add server/api/portal/video-reviews/
git commit -m "feat(video): portal video-review endpoints (list/get/respond, tenant-scoped)"
```

---

## Task 13: Portal pages (list + detail with player)

**Files:**
- Create: `app/pages/portal/video-reviews/index.vue`, `app/pages/portal/video-reviews/[id].vue`

Mirror `app/pages/portal/approvals/index.vue` + `[id].vue` (same layout/middleware/portal session). The list fetches `/api/portal/video-reviews`; the detail fetches `/api/portal/video-reviews/[id]` and renders a `<video :src="videoUrl" controls>` plus Approve / Request changes / Reject buttons (gated on the review being `pending`) that POST to `…/respond` and refresh.

- [ ] **Step 1: list page** — model on `portal/approvals/index.vue`; render a card per review (title, status badge, created date) linking to the detail.

- [ ] **Step 2: detail page** — model on `portal/approvals/[id].vue`; replace the artifact area with:

```vue
<video :src="data.videoUrl" controls class="w-full rounded-lg bg-black" />
```

and the response form posting `{ action, notes }` to `/api/portal/video-reviews/${id}/respond`, disabling the actions once `review.status !== 'pending'`. Use `definePageMeta` matching the portal layout/middleware used by `portal/approvals/[id].vue`.

- [ ] **Step 3: Verify** — `pnpm exec nuxt prepare`; `pnpm exec vitest run test/audio/ test/video/` green.

- [ ] **Step 4: Commit**

```bash
git add app/pages/portal/video-reviews/
git commit -m "feat(video): client-portal video review pages (list + player + approve)"
```

---

# SLICE 4d — Reusable Asset Library

## Task 14: video_assets migration

**Files:**
- Create: `server/database/migrations/174_video_assets.sql`

- [ ] **Step 1: Write the migration** (mirrors `audio_assets` / mig 149)

```sql
-- 174_video_assets.sql — reusable rendered-video library (mirror of audio_assets). Additive.
CREATE TABLE IF NOT EXISTS video_assets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         UUID NULL REFERENCES agency_clients(id) ON DELETE SET NULL,
  created_by        UUID NOT NULL,
  title             TEXT NULL,
  source_project_id UUID NULL,
  source_job_id     UUID NULL,
  r2_key            TEXT NOT NULL,
  format            TEXT NOT NULL,
  width             INTEGER NULL,
  height            INTEGER NULL,
  duration_sec      NUMERIC NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_video_assets_client ON video_assets (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_video_assets_created_at ON video_assets (created_at DESC);
```

- [ ] **Step 2: Run it** (same psql pattern as Task 9; verify with `\d video_assets`). If unavailable, report for operator.

- [ ] **Step 3: Commit**

```bash
git add server/database/migrations/174_video_assets.sql
git commit -m "feat(video): video_assets migration (reusable render library)"
```

---

## Task 15: video assets util + VideoAsset type

**Files:**
- Create: `server/utils/video/assets.ts`
- Modify: `app/types/index.ts`
- Test: `test/video/assetsMapRow.test.ts`

- [ ] **Step 1: Failing test (pure mapRow)**

```ts
import { describe, it, expect } from 'vitest'
import { mapVideoAssetRow } from '~~/server/utils/video/assets'

describe('mapVideoAssetRow', () => {
  it('maps snake_case to camelCase', () => {
    const row = { id: 'a1', client_id: 'c1', created_by: 'u1', title: 'Spot', source_project_id: 'p1', source_job_id: 'j1', r2_key: 'k.mp4', format: 'reels_9x16', width: 1080, height: 1920, duration_sec: '12.5', created_at: 't', updated_at: 't' }
    expect(mapVideoAssetRow(row)).toMatchObject({ id: 'a1', clientId: 'c1', title: 'Spot', sourceJobId: 'j1', r2Key: 'k.mp4', format: 'reels_9x16', width: 1080, height: 1920, durationSec: 12.5 })
  })
})
```

- [ ] **Step 2: Run it** → FAIL.

- [ ] **Step 3: Implement** `server/utils/video/assets.ts`:

```ts
import { queryOne, queryRows } from '~~/server/utils/db'

export interface VideoAsset {
  id: string; clientId: string | null; createdBy: string; title: string | null
  sourceProjectId: string | null; sourceJobId: string | null
  r2Key: string; format: string; width: number | null; height: number | null
  durationSec: number | null; createdAt: string; updatedAt: string
}

export function mapVideoAssetRow(row: any): VideoAsset {
  return {
    id: row.id, clientId: row.client_id ?? null, createdBy: row.created_by, title: row.title ?? null,
    sourceProjectId: row.source_project_id ?? null, sourceJobId: row.source_job_id ?? null,
    r2Key: row.r2_key, format: row.format,
    width: row.width != null ? Number(row.width) : null, height: row.height != null ? Number(row.height) : null,
    durationSec: row.duration_sec != null ? Number(row.duration_sec) : null,
    createdAt: row.created_at, updatedAt: row.updated_at
  }
}

export async function createVideoAsset(input: {
  clientId: string | null; createdBy: string; title: string | null
  sourceProjectId: string | null; sourceJobId: string | null
  r2Key: string; format: string; width: number | null; height: number | null; durationSec: number | null
}): Promise<VideoAsset> {
  const row = await queryOne(
    `INSERT INTO video_assets (client_id, created_by, title, source_project_id, source_job_id, r2_key, format, width, height, duration_sec)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [input.clientId, input.createdBy, input.title, input.sourceProjectId, input.sourceJobId, input.r2Key, input.format, input.width, input.height, input.durationSec]
  )
  return mapVideoAssetRow(row)
}

export async function listVideoAssets(filter: { clientId?: string | null; limit?: number } = {}): Promise<VideoAsset[]> {
  const limit = Math.min(filter.limit ?? 100, 200)
  if (filter.clientId) {
    return (await queryRows(`SELECT * FROM video_assets WHERE client_id = $1 ORDER BY created_at DESC LIMIT $2`, [filter.clientId, limit])).map(mapVideoAssetRow)
  }
  return (await queryRows(`SELECT * FROM video_assets ORDER BY created_at DESC LIMIT $1`, [limit])).map(mapVideoAssetRow)
}
```

Add a parallel `VideoAsset` interface to `app/types/index.ts` (same fields).

- [ ] **Step 4: Run tests** → PASS; `pnpm exec nuxt prepare` completes.

- [ ] **Step 5: Commit**

```bash
git add server/utils/video/assets.ts app/types/index.ts test/video/assetsMapRow.test.ts
git commit -m "feat(video): video_assets util + VideoAsset type"
```

---

## Task 16: Save-to-library endpoint + list endpoint

**Files:**
- Create: `server/api/agency/audio/projects/[id]/renders/[jobId]/save-asset.post.ts`
- Create: `server/api/agency/video/assets/index.get.ts`

- [ ] **Step 1: save-asset endpoint**

```ts
import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { getProjectWithCurrentTimeline, getRenderJob } from '~~/server/utils/audio/projects'
import { createVideoAsset } from '~~/server/utils/video/assets'
import { videoFormatFor } from '~~/server/utils/audio/videoProfiles'

const BodySchema = z.object({ format: z.string().min(1), title: z.string().max(200).nullish() })

export default defineEventHandler(async (event) => {
  if (process.env.VIDEO_STUDIO_ENABLED !== 'true') throw createError({ statusCode: 404, statusMessage: 'Not found' })
  const user = await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')!
  const jobId = getRouterParam(event, 'jobId')!
  const { format, title } = BodySchema.parse(await readBody(event))

  const project = await getProjectWithCurrentTimeline(id)
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  const clientId = (project.project as { clientId?: string | null }).clientId ?? null

  const job = await getRenderJob(jobId)
  const key = job && job.projectId === id ? job.variants?.[format] : undefined
  if (!key) throw createError({ statusCode: 404, statusMessage: 'Render variant not available' })

  const profile = videoFormatFor(format)
  const asset = await createVideoAsset({
    clientId, createdBy: user.id, title: title ?? null, sourceProjectId: id, sourceJobId: jobId,
    r2Key: key, format, width: profile?.width ?? null, height: profile?.height ?? null, durationSec: null
  })
  return { asset }
})
```

- [ ] **Step 2: list endpoint** — `server/api/agency/video/assets/index.get.ts`:

```ts
import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { listVideoAssets } from '~~/server/utils/video/assets'

const QuerySchema = z.object({ clientId: z.string().uuid().optional(), limit: z.coerce.number().int().positive().max(200).optional() })

export default defineEventHandler(async (event) => {
  await requireWriteAccess(event)
  const q = QuerySchema.parse(getQuery(event))
  return { assets: await listVideoAssets({ clientId: q.clientId, limit: q.limit }) }
})
```

- [ ] **Step 3: Verify + Commit**

```bash
pnpm exec nuxt prepare
git add server/api/agency/audio/projects/\[id\]/renders/\[jobId\]/save-asset.post.ts server/api/agency/video/assets/index.get.ts
git commit -m "feat(video): save render to video_assets + list endpoint"
```

---

## Task 17: "Save to library" action + library surface + reuse

**Files:**
- Modify: `app/composables/useMediaProjectEditor.ts` (+ `saveAsset`)
- Modify: `app/pages/agency/audio/projects/[id].vue` (jobs-panel "Save to library" item)
- Create: `app/components/media/MediaVideoLibrary.vue` (list + "Publish from library")

- [ ] **Step 1: Composable** — add `saveAsset(jobId, format, title?)` (POST `save-asset`), and `listVideoAssets()` ($fetch `/api/agency/video/assets`). Add to the return.

- [ ] **Step 2: Jobs-panel item** — add `{ label: 'Save {fmt} to library', icon: 'i-lucide-bookmark', onSelect: () => onSaveAsset(job, fmt) }` to the per-job dropdown (from Tasks 8/11), with `onSaveAsset` toasting "Saved to library".

- [ ] **Step 3: Library component** — `MediaVideoLibrary.vue`: a `USlideover` (mirror `MediaOverlayPicker.vue`'s structure) listing `/api/agency/video/assets`, each with a `<video>` preview (via the authed redirect by job, or store a stream endpoint — for V1.4 use `:src` = a per-asset stream: a new `GET /api/agency/video/assets/[id]/stream` mirroring Task 3, OR reuse the render endpoint when `sourceJobId`/`sourceProjectId` exist). For reuse, emit `pick(asset)`; wire a "From library" entry in the AV editor's Add menu and/or the publish flow so a saved asset can be re-published to social (reuse Task 7's flow with the asset's `r2_key` via a signed link — extend `publish-social` to accept an `assetId` alternative if needed). Keep this task's reuse scope to: list + preview + "Publish to social from library" (the highest-value reuse).

> This task has the most UI surface; model every piece on existing components (`MediaOverlayPicker.vue` for the slideover, the jobs panel for actions). If the per-asset stream needs its own endpoint, add `server/api/agency/video/assets/[id]/stream.get.ts` mirroring Task 3 (authed → presign `asset.r2_key`).

- [ ] **Step 4: Verify** — `pnpm exec nuxt prepare`; `pnpm exec vitest run test/audio/ test/video/` green.

- [ ] **Step 5: Commit**

```bash
git add app/composables/useMediaProjectEditor.ts app/pages/agency/audio/projects/\[id\].vue app/components/media/MediaVideoLibrary.vue server/api/agency/video/assets/ 2>/dev/null; git add -A
git commit -m "feat(video): save-to-library action + video library surface + reuse"
```

---

## Task 18: Final review — regression, typecheck, self-review

- [ ] **Step 1: Full media/video/social suite**

Run: `pnpm exec vitest run test/audio/ test/video/ test/social/`
Expected: all pass (the broader suite has pre-existing env failures unrelated to this work — confirm any failing file is not one this branch touched, as in V1.3).

- [ ] **Step 2: Typecheck** — `pnpm exec nuxt prepare && pnpm exec vue-tsc --noEmit -p .nuxt/tsconfig.json 2>&1 | tail -20` — no NEW errors from V1.4 files.

- [ ] **Step 3: Self-review vs spec §8** — confirm each success criterion: download each format; Publish to Social drafts a pre-filled post + deep-links composer; video actually publishes (dispatcher fix); send-to-portal creates a review the client can approve; save-to-library + reuse. Zero regression to audio/social/portal.

- [ ] **Step 4: Migrations verified live** — `psql "$DATABASE_URL" -c "\dt video_reviews; \dt video_assets"` shows both tables (or report operator-run needed).

- [ ] **Step 5: Commit any fixes** and report.

---

## Notes / deferred
- **Verify-live:** the underlying render path is still operator-gated (queues/container + `VIDEO_STUDIO_ENABLED`); 4a-4d build the distribution layer dormant. End-to-end social/portal ingestion is verify-live once render is active + `RENDER_LINK_SECRET` is set in prod.
- **Marketing coming-soon** entry remains deferred to launch.
- **Asset reuse depth (4d):** Task 17 scopes reuse to "publish from library"; deeper reuse (insert a saved asset as footage, portal-from-library) is an additive follow-up.
