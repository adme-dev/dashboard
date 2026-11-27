import { z } from 'zod'
import { listAssets } from '~~/server/utils/audio/assets'
import { audioStudioPreviewUrl, requireAudioLibraryProject } from '~~/server/utils/banner/audioStudioLibrary'

const querySchema = z.object({
  projectId: z.string().uuid(),
  assetId: z.string().uuid().optional(),
  kind: z.enum(['music', 'voiceover']).optional(),
  search: z.string().trim().max(255).optional(),
  limit: z.coerce.number().int().min(1).max(25).default(13),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0)
})

export default defineEventHandler(async (event) => {
  const query = querySchema.safeParse(getQuery(event))
  if (!query.success) throw createError({ statusCode: 400, statusMessage: 'Invalid audio browser query' })
  setHeader(event, 'Cache-Control', 'private, no-store')
  const { projectId, assetId, kind, search, limit, offset } = query.data
  const { clientId } = await requireAudioLibraryProject(event, projectId)
  if (assetId) return sendRedirect(event, await audioStudioPreviewUrl(assetId, clientId), 302)
  const assets = await listAssets({ clientId, includeShared: true, includeVariants: false, playableOnly: true, kind, search, limit, offset })
  return {
    assets: assets.map(({ id, kind, title, durationSec, isInstrumental }) => ({
      id,
      kind,
      title,
      durationSec,
      isInstrumental,
      streamUrl: `/api/agency/banner-studio/assets/audio-studio?${new URLSearchParams({ projectId, assetId: id })}`
    }))
  }
})
