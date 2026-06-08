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
  // mapProjectRow maps snake_case client_id → camelCase clientId on MediaProject
  const clientId = project.project.clientId ?? null
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
