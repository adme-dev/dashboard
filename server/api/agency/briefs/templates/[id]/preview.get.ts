/**
 * Get full template + fields by ID for preview (no cache)
 */

import { queryOne, queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Template ID is required' })
  }

  try {
    const template = await queryOne(`
      SELECT
        bt.id, bt.category_id, bt.department_id, bt.name, bt.slug, bt.description,
        bt.icon, bt.requires_approval, bt.auto_assign_to, bt.auto_assign_department,
        bt.default_priority, bt.is_multi_step, bt.show_progress, bt.allow_drafts,
        bt.allow_attachments, bt.max_attachments, bt.is_public, bt.require_client_link,
        bt.is_active, bt.sort_order, bt.created_by, bt.created_at, bt.updated_at,
        bc.name AS category_name, bc.slug AS category_slug,
        bc.icon AS category_icon, bc.color AS category_color
      FROM brief_templates bt
      JOIN brief_categories bc ON bt.category_id = bc.id
      WHERE bt.id = $1
    `, [id])

    if (!template) {
      throw createError({ statusCode: 404, statusMessage: 'Template not found' })
    }

    const fields = await queryRows(`
      SELECT
        id, field_key, field_label, field_type, placeholder, help_text,
        default_value, is_required, validation_rules, options, conditional_logic,
        step_number, step_title, section, width, sort_order,
        show_in_preview, show_in_list, created_at
      FROM brief_template_fields
      WHERE template_id = $1
      ORDER BY step_number ASC, sort_order ASC
    `, [id])

    return {
      id: template.id,
      categoryId: template.category_id,
      departmentId: template.department_id,
      name: template.name,
      slug: template.slug,
      description: template.description,
      icon: template.icon,
      requiresApproval: template.requires_approval,
      autoAssignTo: template.auto_assign_to,
      autoAssignDepartment: template.auto_assign_department,
      defaultPriority: template.default_priority,
      isMultiStep: template.is_multi_step,
      showProgress: template.show_progress,
      allowDrafts: template.allow_drafts,
      allowAttachments: template.allow_attachments,
      maxAttachments: template.max_attachments,
      isPublic: template.is_public,
      requireClientLink: template.require_client_link,
      isActive: template.is_active,
      sortOrder: template.sort_order,
      createdBy: template.created_by,
      createdAt: template.created_at,
      updatedAt: template.updated_at,
      category: {
        id: template.category_id,
        name: template.category_name,
        slug: template.category_slug,
        icon: template.category_icon,
        color: template.category_color
      },
      fields: fields.map(f => ({
        id: f.id,
        templateId: template.id,
        fieldKey: f.field_key,
        fieldLabel: f.field_label,
        fieldType: f.field_type,
        placeholder: f.placeholder,
        helpText: f.help_text,
        defaultValue: f.default_value,
        isRequired: f.is_required,
        validationRules: f.validation_rules,
        options: f.options,
        conditionalLogic: f.conditional_logic,
        stepNumber: f.step_number,
        stepTitle: f.step_title,
        section: f.section,
        width: f.width || 'full',
        sortOrder: f.sort_order,
        showInPreview: f.show_in_preview,
        showInList: f.show_in_list,
        createdAt: f.created_at
      }))
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to fetch brief template preview:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch brief template' })
  }
})
