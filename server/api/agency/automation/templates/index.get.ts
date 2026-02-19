/**
 * List Email Templates
 * GET /api/agency/automation/templates
 *
 * Query params:
 * - category: Filter by category
 * - isActive: Filter by active status
 * - search: Search by name/description
 */

import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const query = getQuery(event)

  try {
    const conditions: string[] = []
    const params: any[] = []
    let idx = 1

    if (query.category) {
      conditions.push(`category = $${idx++}`)
      params.push(query.category)
    }

    if (query.isActive !== undefined) {
      conditions.push(`is_active = $${idx++}`)
      params.push(query.isActive === 'true')
    }

    if (query.search) {
      conditions.push(`(name ILIKE $${idx} OR description ILIKE $${idx})`)
      params.push(`%${query.search}%`)
      idx++
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : ''

    const templates = await queryRows(`
      SELECT
        et.id,
        et.name,
        et.description,
        et.category,
        et.subject_template,
        et.body_template,
        et.plain_text_template,
        et.available_variables,
        et.is_system,
        et.is_active,
        et.created_by,
        tm.name AS created_by_name,
        et.created_at,
        et.updated_at
      FROM email_templates et
      LEFT JOIN team_members tm ON et.created_by = tm.id
      ${whereClause}
      ORDER BY et.is_system DESC, et.category, et.name
    `, params)

    // Group by category
    const byCategory = new Map<string, number>()
    for (const t of templates) {
      const count = byCategory.get(t.category) || 0
      byCategory.set(t.category, count + 1)
    }

    return {
      templates: templates.map(t => ({
        id: t.id,
        name: t.name,
        description: t.description,
        category: t.category,
        subjectTemplate: t.subject_template,
        bodyTemplate: t.body_template,
        plainTextTemplate: t.plain_text_template,
        availableVariables: t.available_variables,
        isSystem: t.is_system,
        isActive: t.is_active,
        createdBy: t.created_by ? {
          id: t.created_by,
          name: t.created_by_name
        } : null,
        createdAt: t.created_at,
        updatedAt: t.updated_at
      })),
      summary: {
        total: templates.length,
        byCategory: Object.fromEntries(byCategory)
      }
    }
  } catch (error) {
    console.error('Failed to fetch email templates:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch email templates'
    })
  }
})
