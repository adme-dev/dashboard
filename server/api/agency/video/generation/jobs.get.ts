import { requireVideoGenerationEnabled } from '~~/server/utils/video-generation/feature'
import { requireWriteAccess } from '~~/server/utils/auth'
import { getProjectWithCurrentTimeline } from '~~/server/utils/audio/projects'
import { listVideoGenerationJobsForProject } from '~~/server/utils/video-generation/jobs'
import { canUseVideoGenerationProject } from '~~/server/utils/video-generation/timelineStillSource'

function displayError(status: string, detail: string | null): string | null {
  if (status === 'blocked') return 'The generation policy blocked this request. Review the subject and source image.'
  if (status === 'unknown') return 'The provider has not confirmed the outcome. Check this job before submitting again.'
  if (status !== 'failed') return null
  if (detail?.startsWith('Provider rejected generated audio.')) return 'The provider rejected the generated audio. Revise the prompt or choose another model.'
  if (detail?.startsWith('Dispatch preparation failed before queue acceptance:')) return 'The request could not be prepared for the generation queue.'
  if (detail?.startsWith('Dispatch failed before queue acceptance:')) return 'The generation queue did not accept this request.'
  if (detail === 'provider_missing') return 'The generation provider was unavailable. Choose another model or try again later.'
  if (detail === 'provider_failed') return 'The provider reported a failure and returned no clip.'
  if (detail?.startsWith('source resolution failed:')) return 'The source image could not be loaded. Select it again before retrying.'
  if (detail?.startsWith('Dispatch timeout:')) return 'Generation timed out in the queue before a worker picked it up.'
  return 'Generation failed. No further details are available.'
}

export default defineEventHandler(async (event) => {
  requireVideoGenerationEnabled(event)
  const user = await requireWriteAccess(event)
  const projectId = String(getQuery(event).projectId ?? '')
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) {
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
  const jobs = await listVideoGenerationJobsForProject(projectId)
  return { jobs: jobs.map(job => ({ ...job, errorMessage: displayError(job.status, job.errorMessage) })) }
})
