/**
 * Get brief templates with optional filtering
 */

import { queryRows } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)

  const categoryId = query.categoryId as string | undefined
  const categorySlug = query.categorySlug as string | undefined
  const departmentId = query.departmentId as string | undefined
  const includeFields = query.includeFields === 'true'
  const isPublic = query.isPublic === 'true' ? true : undefined
  const isActive = query.isActive !== 'false' // Default to true

  try {
    let whereClause = 'WHERE 1=1'
    const params: any[] = []
    let paramIdx = 1

    if (categoryId) {
      whereClause += ` AND bt.category_id = $${paramIdx}`
      params.push(categoryId)
      paramIdx++
    }

    if (categorySlug) {
      whereClause += ` AND bc.slug = $${paramIdx}`
      params.push(categorySlug)
      paramIdx++
    }

    if (departmentId) {
      whereClause += ` AND (bt.department_id = $${paramIdx} OR bt.department_id IS NULL)`
      params.push(departmentId)
      paramIdx++
    }

    if (isPublic !== undefined) {
      whereClause += ` AND bt.is_public = $${paramIdx}`
      params.push(isPublic)
      paramIdx++
    }

    if (isActive) {
      whereClause += ' AND bt.is_active = true'
    }

    const templates = await queryRows(`
      SELECT
        bt.id,
        bt.category_id,
        bt.department_id,
        bt.name,
        bt.slug,
        bt.description,
        bt.icon,
        bt.requires_approval,
        bt.auto_assign_to,
        bt.auto_assign_department,
        bt.default_priority,
        bt.is_multi_step,
        bt.show_progress,
        bt.allow_drafts,
        bt.allow_attachments,
        bt.max_attachments,
        bt.is_public,
        bt.require_client_link,
        bt.is_active,
        bt.sort_order,
        bt.created_by,
        bt.created_at,
        bt.updated_at,
        -- Category
        bc.name AS category_name,
        bc.slug AS category_slug,
        bc.icon AS category_icon,
        bc.color AS category_color,
        -- Department
        d.name AS department_name,
        d.color AS department_color,
        -- Counts
        (SELECT COUNT(*) FROM brief_template_fields btf WHERE btf.template_id = bt.id) AS field_count,
        (SELECT COUNT(*) FROM briefs b WHERE b.template_id = bt.id) AS brief_count
      FROM brief_templates bt
      JOIN brief_categories bc ON bt.category_id = bc.id
      LEFT JOIN departments d ON bt.department_id = d.id
      ${whereClause}
      ORDER BY bt.sort_order ASC, bt.name ASC
    `, params)

    const result = templates.map(t => ({
      id: t.id,
      categoryId: t.category_id,
      departmentId: t.department_id,
      name: t.name,
      slug: t.slug,
      description: t.description,
      icon: t.icon,
      requiresApproval: t.requires_approval,
      autoAssignTo: t.auto_assign_to,
      autoAssignDepartment: t.auto_assign_department,
      defaultPriority: t.default_priority,
      isMultiStep: t.is_multi_step,
      showProgress: t.show_progress,
      allowDrafts: t.allow_drafts,
      allowAttachments: t.allow_attachments,
      maxAttachments: t.max_attachments,
      isPublic: t.is_public,
      requireClientLink: t.require_client_link,
      isActive: t.is_active,
      sortOrder: t.sort_order,
      createdBy: t.created_by,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
      category: {
        id: t.category_id,
        name: t.category_name,
        slug: t.category_slug,
        icon: t.category_icon,
        color: t.category_color
      },
      department: t.department_id ? {
        id: t.department_id,
        name: t.department_name,
        color: t.department_color
      } : null,
      fieldCount: Number(t.field_count) || 0,
      briefCount: Number(t.brief_count) || 0
    }))

    // Optionally include fields
    if (includeFields) {
      for (const template of result) {
        const fields = await queryRows(`
          SELECT
            id, field_key, field_label, field_type, placeholder, help_text,
            default_value, is_required, validation_rules, options, conditional_logic,
            step_number, step_title, section, width, sort_order,
            show_in_preview, show_in_list, created_at
          FROM brief_template_fields
          WHERE template_id = $1
          ORDER BY step_number ASC, sort_order ASC
        `, [template.id])

        template.fields = fields.map(f => ({
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
    }

    return result
  } catch (error: any) {
    console.error('Failed to fetch brief templates:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch brief templates'
    })
  }
})
