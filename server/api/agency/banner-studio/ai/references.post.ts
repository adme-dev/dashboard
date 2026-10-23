import { createError, defineEventHandler, getHeader, readMultipartFormData } from 'h3'
import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { queryOneFresh } from '~~/server/utils/db'
import { requireSocialClientScope } from '~~/server/utils/social/clientAccess'
import { createDesignReference, MAX_DESIGN_REFERENCE_BYTES } from '~~/server/utils/banner/designReferences'

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const length = Number(getHeader(event, 'content-length') || 0)
  if (length > MAX_DESIGN_REFERENCE_BYTES + 64000) throw createError({ statusCode: 413, statusMessage: 'Reference uploads must be 5 MB or smaller' })
  const form = await readMultipartFormData(event)
  const files = form?.filter(part => part.name === 'file') || []
  const projects = form?.filter(part => part.name === 'projectId') || []
  if (files.length !== 1 || projects.length !== 1 || form?.some(part => !['file', 'projectId'].includes(part.name || ''))) throw createError({ statusCode: 400, statusMessage: 'Provide exactly one reference file and projectId' })
  const parsed = z.string().uuid().safeParse(projects[0]!.data.toString('utf-8'))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'A valid projectId is required' })
  const project = await queryOneFresh<{ client_id: string | null }>('SELECT client_id FROM banner_projects WHERE id = $1', [parsed.data])
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Banner project not found' })
  await requireSocialClientScope(event, project.client_id ?? undefined)
  try {
    const reference = await createDesignReference(event, { projectId: parsed.data, clientId: project.client_id, userId: user.id, file: files[0]! })
    return { reference }
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error
    throw createError({ statusCode: 502, statusMessage: 'Reference upload or analysis failed; please try again' })
  }
})
