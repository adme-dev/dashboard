/**
 * Client Portal - List public brief templates grouped by category
 * GET /api/portal/briefs/templates
 */

import { queryRows } from '~~/server/utils/db'
import { requireClientAuth } from '~~/server/utils/clientAuth'

export default defineEventHandler(async (event) => {
  await requireClientAuth(event)

  try {
    // Get active, public templates with category info
    const templates = await queryRows(`
      SELECT
        bt.id,
        bt.category_id,
        bt.name,
        bt.slug,
        bt.description,
        bt.icon,
        bt.requires_approval,
        bt.default_priority,
        bt.is_multi_step,
        bt.show_progress,
        bt.allow_drafts,
        bt.allow_attachments,
        bt.max_attachments,
        bt.is_public,
        bt.require_client_link,
        bt.sort_order,
        bc.name AS category_name,
        bc.slug AS category_slug,
        bc.icon AS category_icon,
        bc.color AS category_color,
        bc.sort_order AS category_sort_order
      FROM brief_templates bt
      JOIN brief_categories bc ON bt.category_id = bc.id
      WHERE bt.is_active = true AND bt.is_public = true
      ORDER BY bc.sort_order ASC, bt.sort_order ASC
    `, [])

    if (templates.length === 0) {
      return { categories: [] }
    }

    // Fetch fields for all templates in one query
    const templateIds = templates.map(t => t.id)
    const fields = await queryRows(`
      SELECT
        id, template_id, field_key, field_label, field_type, placeholder, help_text,
        default_value, is_required, validation_rules, options, conditional_logic,
        step_number, step_title, section, width, sort_order,
        show_in_preview, show_in_list, created_at
      FROM brief_template_fields
      WHERE template_id = ANY($1)
      ORDER BY step_number ASC, sort_order ASC
    `, [templateIds])

    // Group fields by template
    const fieldsByTemplate = new Map<string, any[]>()
    for (const f of fields) {
      const list = fieldsByTemplate.get(f.template_id) || []
      list.push({
        id: f.id,
        templateId: f.template_id,
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
      })
      fieldsByTemplate.set(f.template_id, list)
    }

    // Group templates by category
    const categoryMap = new Map<string, any>()
    for (const t of templates) {
      if (!categoryMap.has(t.category_id)) {
        categoryMap.set(t.category_id, {
          id: t.category_id,
          name: t.category_name,
          slug: t.category_slug,
          icon: t.category_icon,
          color: t.category_color,
          sortOrder: t.category_sort_order,
          templates: []
        })
      }

      categoryMap.get(t.category_id)!.templates.push({
        id: t.id,
        categoryId: t.category_id,
        name: t.name,
        slug: t.slug,
        description: t.description,
        icon: t.icon,
        requiresApproval: t.requires_approval,
        defaultPriority: t.default_priority,
        isMultiStep: t.is_multi_step,
        showProgress: t.show_progress,
        allowDrafts: t.allow_drafts,
        allowAttachments: t.allow_attachments,
        maxAttachments: t.max_attachments,
        isPublic: t.is_public,
        requireClientLink: t.require_client_link,
        sortOrder: t.sort_order,
        fields: fieldsByTemplate.get(t.id) || []
      })
    }

    return {
      categories: Array.from(categoryMap.values()).sort((a, b) => a.sortOrder - b.sortOrder)
    }
  } catch (error: any) {
    console.error('Failed to fetch portal brief templates:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch brief templates' })
  }
})
