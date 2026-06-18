import { requireWriteAccess } from '~~/server/utils/auth'
import { getProjectWithCurrentTimeline } from '~~/server/utils/audio/projects'
import { listSelectableVideoGenerationModels } from '~~/server/utils/video-generation/modelRegistry'
import { loadTenantVideoGenerationPolicy } from '~~/server/utils/video-generation/policy'
import { canUseVideoGenerationProject } from '~~/server/utils/video-generation/timelineStillSource'
import { selectableVideoModelOptions } from '~~/app/utils/video/modelPresentation'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default defineEventHandler(async (event) => {
  if (process.env.VIDEO_GENERATION_ENABLED !== 'true') {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
  const user = await requireWriteAccess(event)
  const projectId = String(getQuery(event).projectId ?? '')
  if (!projectId) {
    return { models: selectableVideoModelOptions(listSelectableVideoGenerationModels()), policy: { enabled: true } }
  }
  if (!UUID_RE.test(projectId)) {
    throw createError({ statusCode: 400, statusMessage: 'Valid projectId required' })
  }
  const project = await getProjectWithCurrentTimeline(projectId)
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  if (project.project.mediaType !== 'av') {
    throw createError({ statusCode: 400, statusMessage: 'Video generation requires an AV project' })
  }
  if (!canUseVideoGenerationProject(user, project.project)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }
  const tenantId = project.project.clientId ?? 'agency'
  const policy = await loadTenantVideoGenerationPolicy(tenantId)
  return {
    models: policy.enabled ? selectableVideoModelOptions(listSelectableVideoGenerationModels()) : [],
    policy: { enabled: policy.enabled, monthlyCapCents: policy.monthlyCapCents },
  }
})
