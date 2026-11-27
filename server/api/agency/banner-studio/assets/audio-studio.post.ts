import { z } from 'zod'
import { requireAudioLibraryProject, reuseAudioStudioTrack } from '~~/server/utils/banner/audioStudioLibrary'

const inputSchema = z.object({ projectId: z.string().uuid(), assetId: z.string().uuid() }).strict()

export default defineEventHandler(async (event) => {
  const input = inputSchema.safeParse(await readBody(event))
  if (!input.success) throw createError({ statusCode: 400, statusMessage: 'A valid project and audio track are required' })
  const project = await requireAudioLibraryProject(event, input.data.projectId)
  setHeader(event, 'Cache-Control', 'private, no-store')
  return { asset: await reuseAudioStudioTrack(event, input.data.assetId, project) }
})
