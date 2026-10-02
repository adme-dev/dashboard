import { requireAuth } from '~~/server/utils/auth'
import { getProjectWithCurrentTimeline } from '~~/server/utils/audio/projects'
import { canUseVideoGenerationProject } from '~~/server/utils/video-generation/timelineStillSource'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const res = await getProjectWithCurrentTimeline(id)
  if (!res) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  if (!canUseVideoGenerationProject(user, res.project)) throw createError({ statusCode: 403, statusMessage: 'Project access denied' })
  if (res.project.clientId) await requireSocialClientAccess(event, res.project.clientId)
  return { project: res.project, timeline: res.timeline }
})
