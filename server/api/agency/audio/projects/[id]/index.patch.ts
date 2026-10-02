import { z } from 'zod'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'
import { canUseVideoGenerationProject } from '~~/server/utils/video-generation/timelineStillSource'
import { getProjectWithCurrentTimeline } from '~~/server/utils/audio/projects'
import { requireWriteAccess } from '~~/server/utils/auth'
import { executeGodModeMediaProjectUpdate } from '~~/server/utils/audio/godModeMutations'
import { getProjectWithCurrentTimelineIn, updateProjectIn } from '~~/server/utils/audio/projects'

// PATCH /api/agency/audio/projects/:id — rename / re-home a project.
const BodySchema = z.object({
  title: z.string().trim().max(200).nullable().optional(),
  clientId: z.string().uuid().nullable().optional()
}).refine(body => body.title !== undefined || body.clientId !== undefined, { message: 'Nothing to update' })

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')!
  const body = BodySchema.parse(await readBody(event))
  const existing = await getProjectWithCurrentTimeline(id)
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  if (!canUseVideoGenerationProject(user, existing.project)) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  if (existing.project.clientId) await requireSocialClientAccess(event, existing.project.clientId)
  if (body.clientId) await requireSocialClientAccess(event, body.clientId)

  const project = await executeGodModeMediaProjectUpdate(
    event,
    async (db) => {
      const updated = await updateProjectIn(db, id, { title: body.title, clientId: body.clientId })
      if (!updated) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
      return updated
    },
    async (db, resultReference) => {
      const replayed = await getProjectWithCurrentTimelineIn(db, resultReference)
      if (!replayed) throw createError({ statusCode: 409, statusMessage: 'Updated project no longer exists' })
      return replayed.project
    }
  )
  return { project }
})
