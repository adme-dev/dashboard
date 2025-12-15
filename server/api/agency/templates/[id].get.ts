/**
 * Get Template Details
 * GET /api/agency/templates/:id
 */

import { queryOne, queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Template ID is required'
    })
  }

  try {
    // Get template
    const template = await queryOne(`
      SELECT
        pt.*,
        tm.name as created_by_name,
        d.name as department_name
      FROM project_templates pt
      LEFT JOIN team_members tm ON pt.created_by = tm.id
      LEFT JOIN departments d ON pt.department_id = d.id
      WHERE pt.id = $1
    `, [id])

    if (!template) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Template not found'
      })
    }

    // Get phases
    const phases = await queryRows(`
      SELECT *
      FROM template_phases
      WHERE template_id = $1
      ORDER BY sort_order
    `, [id])

    // Get tasks
    const tasks = await queryRows(`
      SELECT
        tt.*,
        d.name as department_name
      FROM template_tasks tt
      LEFT JOIN departments d ON tt.default_department_id = d.id
      WHERE tt.template_id = $1
      ORDER BY tt.phase_id NULLS FIRST, tt.sort_order
    `, [id])

    // Get roles
    const roles = await queryRows(`
      SELECT
        tr.*,
        d.name as department_name,
        tm.name as default_member_name
      FROM template_roles tr
      LEFT JOIN departments d ON tr.department_id = d.id
      LEFT JOIN team_members tm ON tr.default_member_id = tm.id
      WHERE tr.template_id = $1
      ORDER BY tr.sort_order
    `, [id])

    // Get documents
    const documents = await queryRows(`
      SELECT *
      FROM template_documents
      WHERE template_id = $1
      ORDER BY sort_order
    `, [id])

    return {
      template: {
        id: template.id,
        name: template.name,
        description: template.description,
        category: template.category,
        tags: template.tags,
        defaultBudgetType: template.default_budget_type,
        defaultBudgetAmount: Number(template.default_budget_amount || 0),
        estimatedDurationDays: template.estimated_duration_days,
        estimatedHours: Number(template.estimated_hours || 0),
        defaultHourlyRate: Number(template.default_hourly_rate || 0),
        defaultBillingMethod: template.default_billing_method,
        isActive: template.is_active,
        isPublic: template.is_public,
        timesUsed: template.times_used,
        lastUsedAt: template.last_used_at,
        createdByName: template.created_by_name,
        departmentName: template.department_name,
        departmentId: template.department_id,
        createdAt: template.created_at,
        updatedAt: template.updated_at
      },
      phases: phases.map(p => ({
        id: p.id,
        name: p.name,
        description: p.description,
        sortOrder: p.sort_order,
        durationDays: p.duration_days,
        budgetPercentage: Number(p.budget_percentage || 0),
        deliverables: p.deliverables,
        requiresClientApproval: p.requires_client_approval
      })),
      tasks: tasks.map(t => ({
        id: t.id,
        phaseId: t.phase_id,
        parentTaskId: t.parent_task_id,
        title: t.title,
        description: t.description,
        sortOrder: t.sort_order,
        estimatedHours: Number(t.estimated_hours || 0),
        startDayOffset: t.start_day_offset,
        durationDays: t.duration_days,
        defaultRole: t.default_role,
        defaultDepartmentId: t.default_department_id,
        departmentName: t.department_name,
        priority: t.priority,
        taskType: t.task_type,
        dependsOnTaskIds: t.depends_on_task_ids,
        checklist: t.checklist,
        tags: t.tags,
        billable: t.billable
      })),
      roles: roles.map(r => ({
        id: r.id,
        roleName: r.role_name,
        description: r.description,
        estimatedHours: Number(r.estimated_hours || 0),
        hourlyRate: Number(r.hourly_rate || 0),
        requiredSkills: r.required_skills,
        departmentId: r.department_id,
        departmentName: r.department_name,
        defaultMemberId: r.default_member_id,
        defaultMemberName: r.default_member_name,
        allocationPercentage: Number(r.allocation_percentage || 100)
      })),
      documents: documents.map(d => ({
        id: d.id,
        name: d.name,
        description: d.description,
        documentType: d.document_type,
        fileUrl: d.file_url,
        includeOnCreation: d.include_on_creation
      }))
    }
  } catch (error: any) {
    console.error('Failed to fetch template:', error)
    if (error.statusCode) throw error
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch template'
    })
  }
})
