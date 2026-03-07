/**
 * Get task details by ID with all related data
 */

import { queryOne, queryRows } from '~~/server/utils/db'
import { resolveEffectiveRate } from '~~/server/utils/taskPricing'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Task ID is required'
    })
  }

  try {
    // Get task with all related info
    const task = await queryOne(`
      SELECT
        t.*,
        ts.name as status_name,
        ts.color as status_color,
        ts.category as status_category,
        ts.is_final as status_is_final,
        d.name as department_name,
        d.color as department_color,
        d.slug as department_slug,
        p.name as project_name,
        p.client_id,
        c.name as client_name,
        assignee.name as assignee_name,
        assignee.email as assignee_email,
        reporter.name as reporter_name,
        reporter.email as reporter_email,
        parent.title as parent_title
      FROM tasks t
      JOIN task_statuses ts ON t.status_id = ts.id
      JOIN departments d ON t.department_id = d.id
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN agency_clients c ON p.client_id = c.id
      LEFT JOIN team_members assignee ON t.assignee_id = assignee.id
      LEFT JOIN team_members reporter ON t.reporter_id = reporter.id
      LEFT JOIN tasks parent ON t.parent_task_id = parent.id
      WHERE t.id = $1
    `, [id])

    if (!task) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Task not found'
      })
    }

    // Compute actual cost from billable time entries if not explicitly set
    let computedActualCost: number | null = null
    try {
      const timeResult = await queryOne(`
        SELECT COALESCE(SUM(hours), 0)::numeric as billable_hours
        FROM time_entries WHERE task_id = $1 AND billable = true AND status != 'rejected'
      `, [id])
      const billableHours = Number(timeResult?.billable_hours || 0)
      if (task.actual_cost != null) {
        computedActualCost = Number(task.actual_cost)
      } else if (billableHours > 0 && task.billing_rate != null) {
        computedActualCost = billableHours * Number(task.billing_rate)
      }
    } catch {
      // time_entries table may not exist
    }

    // Resolve effective rate from hierarchy
    const effectiveRate = await resolveEffectiveRate(task)

    // Get labels
    const labels = await queryRows(`
      SELECT tl.id, tl.name, tl.color
      FROM task_label_assignments tla
      JOIN task_labels tl ON tla.label_id = tl.id
      WHERE tla.task_id = $1
      ORDER BY tl.name
    `, [id])

    // Get subtasks
    const subtasks = await queryRows(`
      SELECT
        t.id, t.title, t.priority, t.due_date, t.completed_at,
        ts.name as status_name, ts.color as status_color, ts.is_final,
        assignee.name as assignee_name
      FROM tasks t
      JOIN task_statuses ts ON t.status_id = ts.id
      LEFT JOIN team_members assignee ON t.assignee_id = assignee.id
      WHERE t.parent_task_id = $1
      ORDER BY t.sort_order, t.created_at
    `, [id])

    // Get dependencies
    const dependencies = await queryRows(`
      SELECT
        td.id as dependency_id,
        td.dependency_type,
        t.id, t.title,
        ts.name as status_name, ts.color as status_color, ts.is_final
      FROM task_dependencies td
      JOIN tasks t ON td.depends_on_task_id = t.id
      JOIN task_statuses ts ON t.status_id = ts.id
      WHERE td.task_id = $1
    `, [id])

    // Get dependents (tasks that depend on this task)
    const dependents = await queryRows(`
      SELECT
        td.id as dependency_id,
        td.dependency_type,
        t.id, t.title,
        ts.name as status_name, ts.color as status_color, ts.is_final
      FROM task_dependencies td
      JOIN tasks t ON td.task_id = t.id
      JOIN task_statuses ts ON t.status_id = ts.id
      WHERE td.depends_on_task_id = $1
    `, [id])

    // Get attachments
    const attachments = await queryRows(`
      SELECT
        ta.id, ta.file_name, ta.file_type, ta.file_size, ta.file_url,
        ta.created_at,
        tm.name as uploaded_by_name
      FROM task_attachments ta
      LEFT JOIN team_members tm ON ta.uploaded_by = tm.id
      WHERE ta.task_id = $1
      ORDER BY ta.created_at DESC
    `, [id])

    // Get recent activity (last 10)
    const recentActivity = await queryRows(`
      SELECT
        ta.id, ta.activity_type, ta.content, ta.old_value, ta.new_value,
        ta.created_at,
        tm.name as user_name
      FROM task_activities ta
      LEFT JOIN team_members tm ON ta.user_id = tm.id
      WHERE ta.task_id = $1
      ORDER BY ta.created_at DESC
      LIMIT 10
    `, [id])

    // Linked quote line item (budget source)
    let linkedQuoteLineItem: any = null
    let sharedTaskCount = 0
    if (task.quote_line_item_id) {
      try {
        linkedQuoteLineItem = await queryOne(`
          SELECT qli.id, qli.name, qli.line_total, qli.quantity, qli.unit, qli.unit_price,
                 qli.estimated_hours, qli.hourly_rate,
                 q.id AS quote_id, q.quote_number, q.title AS quote_title
          FROM quote_line_items qli
          JOIN quotes q ON qli.quote_id = q.id
          WHERE qli.id = $1
        `, [task.quote_line_item_id])

        const sharedResult = await queryOne(`
          SELECT COUNT(*)::int AS count FROM tasks WHERE quote_line_item_id = $1 AND id != $2
        `, [task.quote_line_item_id, id])
        sharedTaskCount = sharedResult?.count || 0
      } catch { /* graceful degradation */ }
    }

    // Linked brief (budget source)
    let linkedBrief: any = null
    if (task.brief_id) {
      try {
        linkedBrief = await queryOne(`
          SELECT id, title, reference_number FROM briefs WHERE id = $1
        `, [task.brief_id])
      } catch { /* graceful degradation */ }
    }

    return {
      id: task.id,
      projectId: task.project_id,
      departmentId: task.department_id,
      parentTaskId: task.parent_task_id,
      statusId: task.status_id,
      title: task.title,
      description: task.description,
      priority: task.priority,
      taskType: task.task_type,
      assigneeId: task.assignee_id,
      reporterId: task.reporter_id,
      dueDate: task.due_date,
      startDate: task.start_date,
      estimatedHours: task.estimated_hours ? Number(task.estimated_hours) : null,
      actualHours: task.actual_hours ? Number(task.actual_hours) : null,
      estimatedCost: task.estimated_cost != null ? Number(task.estimated_cost) : null,
      actualCost: task.actual_cost != null ? Number(task.actual_cost) : null,
      billingRate: task.billing_rate != null ? Number(task.billing_rate) : null,
      currency: task.currency || 'AUD',
      isBillable: task.is_billable ?? true,
      xeroInvoiceId: task.xero_invoice_id || null,
      invoicedAt: task.invoiced_at || null,
      computedActualCost,
      effectiveRate: effectiveRate.rate,
      effectiveRateSource: effectiveRate.source,
      quoteLineItemId: task.quote_line_item_id || null,
      briefId: task.brief_id || null,
      budgetSource: task.budget_source || 'manual',
      linkedQuoteLineItem: linkedQuoteLineItem ? {
        id: linkedQuoteLineItem.id,
        name: linkedQuoteLineItem.name,
        lineTotal: Number(linkedQuoteLineItem.line_total),
        quantity: Number(linkedQuoteLineItem.quantity),
        unit: linkedQuoteLineItem.unit,
        unitPrice: Number(linkedQuoteLineItem.unit_price),
        estimatedHours: linkedQuoteLineItem.estimated_hours ? Number(linkedQuoteLineItem.estimated_hours) : null,
        hourlyRate: linkedQuoteLineItem.hourly_rate ? Number(linkedQuoteLineItem.hourly_rate) : null,
        quoteId: linkedQuoteLineItem.quote_id,
        quoteNumber: linkedQuoteLineItem.quote_number,
        quoteTitle: linkedQuoteLineItem.quote_title,
      } : null,
      linkedBrief: linkedBrief ? {
        id: linkedBrief.id,
        title: linkedBrief.title,
        referenceNumber: linkedBrief.reference_number,
      } : null,
      sharedTaskCount,
      sortOrder: task.sort_order,
      isBlocked: task.is_blocked,
      blockedReason: task.blocked_reason,
      completedAt: task.completed_at,
      createdAt: task.created_at,
      updatedAt: task.updated_at,
      // Related data
      status: {
        id: task.status_id,
        name: task.status_name,
        color: task.status_color,
        category: task.status_category,
        isFinal: task.status_is_final,
      },
      department: {
        id: task.department_id,
        name: task.department_name,
        color: task.department_color,
        slug: task.department_slug,
      },
      project: task.project_id ? {
        id: task.project_id,
        name: task.project_name,
        clientId: task.client_id,
        clientName: task.client_name,
      } : null,
      assignee: task.assignee_id ? {
        id: task.assignee_id,
        name: task.assignee_name,
        email: task.assignee_email,
      } : null,
      reporter: task.reporter_id ? {
        id: task.reporter_id,
        name: task.reporter_name,
        email: task.reporter_email,
      } : null,
      parent: task.parent_task_id ? {
        id: task.parent_task_id,
        title: task.parent_title,
      } : null,
      labels,
      subtasks: subtasks.map(s => ({
        id: s.id,
        title: s.title,
        priority: s.priority,
        dueDate: s.due_date,
        completedAt: s.completed_at,
        status: {
          name: s.status_name,
          color: s.status_color,
          isFinal: s.is_final,
        },
        assigneeName: s.assignee_name,
      })),
      dependencies: dependencies.map(d => ({
        dependencyId: d.dependency_id,
        dependencyType: d.dependency_type,
        task: {
          id: d.id,
          title: d.title,
          status: {
            name: d.status_name,
            color: d.status_color,
            isFinal: d.is_final,
          },
        },
      })),
      dependents: dependents.map(d => ({
        dependencyId: d.dependency_id,
        dependencyType: d.dependency_type,
        task: {
          id: d.id,
          title: d.title,
          status: {
            name: d.status_name,
            color: d.status_color,
            isFinal: d.is_final,
          },
        },
      })),
      attachments: attachments.map(a => ({
        id: a.id,
        fileName: a.file_name,
        fileType: a.file_type,
        fileSize: a.file_size,
        fileUrl: a.file_url,
        uploadedByName: a.uploaded_by_name,
        createdAt: a.created_at,
      })),
      recentActivity: recentActivity.map(a => ({
        id: a.id,
        type: a.activity_type,
        content: a.content,
        oldValue: a.old_value,
        newValue: a.new_value,
        userName: a.user_name,
        createdAt: a.created_at,
      })),
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to fetch task:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch task'
    })
  }
})
