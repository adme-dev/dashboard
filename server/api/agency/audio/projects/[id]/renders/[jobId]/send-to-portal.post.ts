// Send a rendered video variant to the client portal for review — creates a
// video_reviews row so the client can approve / reject from their portal.
// Mirrors publish-social.post.ts for project/clientId/job/variant resolution.
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
  // mapProjectRow maps snake_case client_id → camelCase clientId on MediaProject
  const clientId = project.project.clientId ?? null
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'Assign a client to this project before sending to the portal.' })

  const job = await getRenderJob(jobId)
  const key = job && job.projectId === id ? job.variants?.[format] : undefined
  if (!key) throw createError({ statusCode: 404, statusMessage: 'Render variant not available' })

  const review = await createVideoReview({ clientId, mediaProjectId: id, jobId, format, r2Key: key, title: title ?? null, createdBy: user.id })
  return { review }
})
