import { requireAuth } from '~~/server/utils/auth'
import { getProjectWithCurrentTimeline } from '~~/server/utils/audio/projects'
import { collectClipKeys } from '~~/server/utils/audio/clipSources'
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

  for (const key of collectClipKeys(res.timeline)) {
    if (!isStorageConfigured()) { sources[key] = `/api/_uploads/${key}`; continue }
    try {
      sources[key] = await getPresignedDownloadUrl(key, PRESIGN_TTL)
    } catch {
      // omit a bad/missing key — never sink the whole response
    }
  }
  return { sources }
})
