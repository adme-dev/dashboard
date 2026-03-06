/**
 * Update Brief Template → Project Template Mapping
 * PUT /api/agency/briefs/templates/:id/mapping
 *
 * Body:
 * - projectTemplateId?: UUID | null
 * - fieldMapping?: Record<string, string>
 * - autoConvertOnApproval?: boolean
 */

import { queryOne, execute } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireRole(event, ['admin', 'project_manager'])

  const templateId = getRouterParam(event, 'id')

  if (!templateId) {
    throw createError({ statusCode: 400, statusMessage: 'Template ID is required' })
  }

  const body = await readBody(event)
  const { projectTemplateId, fieldMapping, autoConvertOnApproval } = body

  try {
    // Verify brief template exists
    const template = await queryOne('SELECT id FROM brief_templates WHERE id = $1', [templateId])
    if (!template) {
      throw createError({ statusCode: 404, statusMessage: 'Brief template not found' })
    }

    // Validate project template exists if provided
    if (projectTemplateId) {
      const pt = await queryOne('SELECT id FROM project_templates WHERE id = $1', [projectTemplateId])
      if (!pt) {
        throw createError({ statusCode: 404, statusMessage: 'Project template not found' })
      }
    }

    // Build dynamic update
    const updates: string[] = ['updated_at = NOW()']
    const params: any[] = [templateId]
    let paramIdx = 2

    if (projectTemplateId !== undefined) {
      updates.push(`project_template_id = $${paramIdx}`)
      params.push(projectTemplateId || null)
      paramIdx++
    }

    if (fieldMapping !== undefined) {
      updates.push(`field_mapping = $${paramIdx}`)
      params.push(JSON.stringify(fieldMapping))
      paramIdx++
    }

    if (autoConvertOnApproval !== undefined) {
      updates.push(`auto_convert_on_approval = $${paramIdx}`)
      params.push(!!autoConvertOnApproval)
      paramIdx++
    }

    if (updates.length === 1) {
      throw createError({ statusCode: 400, statusMessage: 'No fields to update' })
    }

    await execute(`
      UPDATE brief_templates
      SET ${updates.join(', ')}
      WHERE id = $1
    `, params)

    // Return updated template
    const updated = await queryOne(`
      SELECT
        bt.id,
        bt.project_template_id,
        bt.field_mapping,
        bt.auto_convert_on_approval,
        pt.name AS project_template_name
      FROM brief_templates bt
      LEFT JOIN project_templates pt ON bt.project_template_id = pt.id
      WHERE bt.id = $1
    `, [templateId])

    return {
      id: updated.id,
      projectTemplateId: updated.project_template_id,
      projectTemplateName: updated.project_template_name,
      fieldMapping: updated.field_mapping,
      autoConvertOnApproval: updated.auto_convert_on_approval
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('[Brief Template] Mapping update failed:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update template mapping'
    })
  }
})
