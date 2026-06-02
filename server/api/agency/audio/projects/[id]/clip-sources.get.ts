import { requireAuth } from '~~/server/utils/auth'
import { getProjectWithCurrentTimeline } from '~~/server/utils/audio/projects'
import { collectClipKeys } from '~~/server/utils/audio/clipSources'
import { TimelineStateSchema } from '~~/server/utils/audio/timelineSchema'
import { getPresignedDownloadUrl, isStorageConfigured } from '~~/server/utils/storage'

const PRESIGN_TTL = 60 * 60 // 1 hour, matches asset playback URLs

// Mint short-lived GET URLs for exactly the r2_keys in THIS project's current
// timeline (org-scoped via the gateway). Never presigns an arbitrary key → no
// IDOR/SSRF. A single bad key is omitted (the client treats a missing buffer as a
// hard load error — a partial mix would be wrong).
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
    if (!isStorageConfigured()) { sources[key] = `/api/_uploads/${key}`; continue }
    try {
      sources[key] = await getPresignedDownloadUrl(key, PRESIGN_TTL)
    } catch {
      // omit a bad/missing key — never sink the whole response
    }
  }
  return { sources }
})
