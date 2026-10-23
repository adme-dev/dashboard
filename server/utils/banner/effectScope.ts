import { createError, type H3Event } from 'h3'
import { z } from 'zod'
import { queryOneFresh } from '~~/server/utils/db'
import { requireSocialClientScope } from '~~/server/utils/social/clientAccess'

export async function requireBannerEffectProject(event: H3Event, id: unknown) {
  const parsed = z.string().uuid().safeParse(id)
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'A valid projectId is required' })
  const project = await queryOneFresh<{ id: string, client_id: string | null, canvas_data: Record<string, { layers?: { id: number, type: string, text?: string, w?: number, h?: number }[] }> }>('SELECT id, client_id, canvas_data FROM banner_projects WHERE id=$1', [parsed.data])
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Banner project not found' })
  await requireSocialClientScope(event, project.client_id ?? undefined)
  return project
}
