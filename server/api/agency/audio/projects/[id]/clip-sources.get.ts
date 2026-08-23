import { requireAuth } from '~~/server/utils/auth'
import { getProjectWithCurrentTimeline } from '~~/server/utils/audio/projects'
import { collectClipKeys } from '~~/server/utils/audio/clipSources'
import { TimelineStateSchema } from '~~/server/utils/audio/timelineSchema'
import { isStorageConfigured } from '~~/server/utils/storage'

// Resolve a playable URL for exactly the r2_keys in THIS project's current
// timeline. URLs are same-origin (media.get.ts proxies R2) because presigned
// R2 URLs carry no CORS headers and cannot be drawn into the preview canvas.
// The proxy re-validates key membership on every request → no IDOR/SSRF.
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const res = await getProjectWithCurrentTimeline(id)
  if (!res) throw createError({ statusCode: 404, statusMessage: 'Project not found' })

  const sources: Record<string, string> = {}
  if (!res.timeline) return { sources }

  // The gateway returns the MediaTimeline wrapper; the TimelineState lives in `.state`
  // (typed unknown). Narrow it via the SP0 schema (mirrors render.post). An unparseable
  // timeline yields empty sources — the editor then surfaces a load error.
  const parsed = TimelineStateSchema.safeParse(res.timeline.state)
  if (!parsed.success) return { sources }

  for (const key of collectClipKeys(parsed.data)) {
    sources[key] = isStorageConfigured()
      ? `/api/agency/audio/projects/${encodeURIComponent(id)}/media?key=${encodeURIComponent(key)}`
      : `/api/_uploads/${key}`
  }
  return { sources }
})
