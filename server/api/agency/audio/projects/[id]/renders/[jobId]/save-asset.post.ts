import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { getProjectWithCurrentTimeline, getRenderJob } from '~~/server/utils/audio/projects'
import { createVideoAsset } from '~~/server/utils/video/assets'
import { videoFormatFor } from '~~/server/utils/audio/videoProfiles'
import { withGodModeLedger } from '~~/server/utils/video/godModeStudioMutations'

const BodySchema = z.object({ format: z.string().min(1), title: z.string().max(200).nullish() })

// Owners (God mode) run this under the execution ledger; staff run it directly.
export default defineEventHandler(event => withGodModeLedger(event, 'renderSaveAsset', async ({ reservedId }) => {
  if (process.env.VIDEO_STUDIO_ENABLED !== 'true') throw createError({ statusCode: 404, statusMessage: 'Not found' })
  const user = await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')!
  const jobId = getRouterParam(event, 'jobId')!
  const { format, title } = BodySchema.parse(await readBody(event))

  const project = await getProjectWithCurrentTimeline(id)
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  // mapProjectRow maps snake_case client_id → camelCase clientId on MediaProject
  const clientId = project.project.clientId ?? null

  const job = await getRenderJob(jobId)
  const key = job && job.projectId === id ? job.variants?.[format] : undefined
  if (!key) throw createError({ statusCode: 404, statusMessage: 'Render variant not available' })

  const profile = videoFormatFor(format)
  const asset = await createVideoAsset({
    id: reservedId,
    clientId, createdBy: user.id, title: title ?? null, sourceProjectId: id, sourceJobId: jobId,
    r2Key: key, format, width: profile?.width ?? null, height: profile?.height ?? null, durationSec: null
  })
  return { asset }
}))
