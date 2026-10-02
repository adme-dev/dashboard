import { requireWriteAccess } from '~~/server/utils/auth'
import { getProjectWithCurrentTimeline } from '~~/server/utils/audio/projects'
import { canUseVideoGenerationProject } from '~~/server/utils/video-generation/timelineStillSource'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'
import { loadVideoClientProfile } from '~~/server/utils/video-generation/clientProfile'
import { videoFeatureEnabled } from '~~/server/utils/video-generation/features'
import { getTenantVideoGenerationSpendCents } from '~~/server/utils/video-generation/policy'
import { roleHasPermission } from '~~/server/utils/permissions'

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const projectId = String(getQuery(event).projectId ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) throw createError({ statusCode: 400, statusMessage: 'Valid projectId required' })
  const project = await getProjectWithCurrentTimeline(projectId)
  if (!project || project.project.mediaType !== 'av') throw createError({ statusCode: 404, statusMessage: 'Video project not found' })
  if (!canUseVideoGenerationProject(user, project.project)) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  const clientId = project.project.clientId
  if (clientId) await requireSocialClientAccess(event, clientId)
  return { clientId, profile: clientId ? await loadVideoClientProfile(clientId) : null,
    spentCents: clientId ? await getTenantVideoGenerationSpendCents(clientId) : 0,
    canManage: roleHasPermission(user.role, 'MANAGEMENT') || !!user.permissionGroups?.includes('MANAGEMENT'),
    harnessEnabled: videoFeatureEnabled('VIDEO_ASSET_HARNESS_ENABLED', event),
    studioEnabled: videoFeatureEnabled('VIDEO_STUDIO_ENABLED', event),
    generationEnabled: videoFeatureEnabled('VIDEO_GENERATION_ENABLED', event) }
})
