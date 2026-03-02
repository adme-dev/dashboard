import { readMultipartFormData } from 'h3'
import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { uploadBannerExport } from '~~/server/utils/bannerStorage'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  const formData = await readMultipartFormData(event)
  if (!formData || formData.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No file uploaded' })
  }

  const file = formData.find(f => f.name === 'file')
  const projectIdField = formData.find(f => f.name === 'projectId')
  const formatKeyField = formData.find(f => f.name === 'formatKey')

  if (!file || !file.data) {
    throw createError({ statusCode: 400, statusMessage: 'Missing file field' })
  }

  const projectId = projectIdField?.data?.toString()
  const formatKey = formatKeyField?.data?.toString()

  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: 'projectId is required' })
  }

  if (!formatKey) {
    throw createError({ statusCode: 400, statusMessage: 'formatKey is required' })
  }

  try {
    const project = await queryOne('SELECT id FROM banner_projects WHERE id = $1', [projectId])
    if (!project) {
      throw createError({ statusCode: 404, statusMessage: 'Project not found' })
    }

    const buffer = Buffer.from(file.data)
    const { key, url, size } = await uploadBannerExport(buffer, projectId, file.filename || 'export.zip')

    const row = await queryOne(`
      INSERT INTO banner_exports (project_id, format_key, r2_key, url, file_size, exported_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING
        id,
        project_id AS "projectId",
        format_key AS "formatKey",
        r2_key AS "r2Key",
        url,
        file_size AS "fileSize",
        exported_by AS "exportedBy",
        exported_at AS "exportedAt"
    `, [projectId, formatKey, key, url, size, user.id])

    return row
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to upload banner export:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to upload banner export' })
  }
})
