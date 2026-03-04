import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event)

  const { templateId, name, clientId } = body

  if (!templateId) {
    throw createError({ statusCode: 400, statusMessage: 'templateId is required' })
  }

  // Verify template exists
  const template = await queryOne(`
    SELECT id, name, width, height, variables
    FROM banner_custom_templates WHERE id = $1
  `, [templateId])
  if (!template) {
    throw createError({ statusCode: 404, statusMessage: 'Template not found' })
  }

  // Build default variable values from template
  const variables = typeof template.variables === 'string'
    ? JSON.parse(template.variables)
    : (template.variables || [])
  const defaultValues: Record<string, string> = {}
  for (const v of variables) {
    defaultValues[v.name] = v.default || ''
  }

  const instanceName = name || `${template.name} Copy`

  const row = await queryOne(`
    INSERT INTO banner_custom_instances
      (template_id, name, variable_values, width, height, client_id, created_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id, template_id AS "templateId", name,
      variable_values AS "variableValues",
      width, height, is_published AS "isPublished",
      created_at AS "createdAt"
  `, [
    templateId,
    instanceName,
    JSON.stringify(defaultValues),
    template.width,
    template.height,
    clientId || null,
    user.id,
  ])

  return row
})
