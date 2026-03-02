import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event)

  const { projectId, name, category, description, tags } = body

  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: 'projectId is required' })
  }
  if (!name?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Template name is required' })
  }

  const VALID_CATEGORIES = ['automotive', 'real-estate', 'retail', 'food', 'finance', 'lifestyle', 'minimal', 'custom']
  const safeCategory = VALID_CATEGORIES.includes(category) ? category : 'custom'

  // Fetch project canvas data
  const project = await queryOne(
    'SELECT canvas_data AS "canvasData", thumbnail_url AS "thumbnailUrl" FROM banner_projects WHERE id = $1',
    [projectId]
  )
  if (!project) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  }

  // Extract format keys from canvas data
  const canvasData = typeof project.canvasData === 'string'
    ? JSON.parse(project.canvasData)
    : project.canvasData
  const formats = Object.keys(canvasData)

  const row = await queryOne(`
    INSERT INTO banner_templates (name, category, canvas_data, thumbnail_url, description, tags, formats, is_system, created_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE, $8)
    RETURNING
      id, name, category,
      canvas_data AS "canvasData",
      thumbnail_url AS "thumbnailUrl",
      preview_url AS "previewUrl",
      description,
      is_system AS "isSystem",
      tags, formats,
      usage_count AS "usageCount",
      created_by AS "createdBy",
      created_at AS "createdAt"
  `, [
    name.trim(),
    safeCategory,
    JSON.stringify(canvasData),
    project.thumbnailUrl || null,
    description || null,
    tags || [],
    formats,
    user.id,
  ])

  return row
})
