import type { User } from '~~/server/utils/auth'
import { getProjectWithCurrentTimeline } from '~~/server/utils/audio/projects'

export async function requireVideoProjectWriteAccess(
  user: User,
  projectId: string,
  avRequiredMessage: string
) {
  const existing = await getProjectWithCurrentTimeline(projectId)
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  if (existing.project.mediaType !== 'av') {
    throw createError({ statusCode: 400, statusMessage: avRequiredMessage })
  }
  if (user.role !== 'admin' && user.role !== 'owner' && existing.project.createdBy !== user.id) {
    throw createError({ statusCode: 403, statusMessage: 'Access denied to this project' })
  }
  return existing
}
