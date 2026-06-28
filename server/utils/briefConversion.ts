/**
 * Brief → Project Conversion
 * Shared utility used by both the convert endpoint and auto-convert on approval.
 */

import { queryOne, queryRows, execute, transaction } from '~~/server/utils/db'
import { findBestMatch } from '~~/server/utils/rateCardMatcher'
import { pickDepartmentId, resolveTaskAssignee } from '~~/server/utils/briefConversion/assignment'
import { applyFieldMapping } from '~~/server/utils/briefConversion/fieldMapping'
import { deriveBriefAllocations } from '~~/server/utils/briefConversion/budgetAllocations'
import { validateBriefForConversion, type GatekeeperResult } from '~~/server/utils/briefConversion/gatekeeper'
import { briefToMondayCampaignType, isMondayMappableTemplate } from '~~/server/utils/briefCampaignType'
import { notifyTaskAssigned } from '~~/server/utils/notifications'

interface ConvertBriefOptions {
  briefId: string
  userId: string
  projectTemplateId?: string | null
  projectName?: string | null
  startDate?: string | null
  clientId?: string | null
}

interface ConvertBriefResult {
  project: { id: string; name: string }
  tasksCreated: number
  /** P2: count of proposed budget allocations carried from the brief (surfaced for AM confirm). */
  budgetAllocationsCreated?: number
  /** P2: brief→job gatekeeper result (gaps + AI-proposed fills; non-blocking). */
  gatekeeper?: GatekeeperResult
}

/** brief_field_values.value is JSONB; tolerate the common { value } wrapper + raw scalars. */
function unwrapFieldValue(v: unknown): unknown {
  if (v && typeof v === 'object' && !Array.isArray(v) && 'value' in (v as Record<string, unknown>)) {
    return (v as Record<string, unknown>).value
  }
  return v
}

/** field_mapping is JSONB (object) but tolerate a stringified value from any driver. */
function coerceMapping(v: unknown): Record<string, string> | null {
  if (!v) return null
  if (typeof v === 'string') {
    try { return JSON.parse(v) } catch { return null }
  }
  return typeof v === 'object' ? (v as Record<string, string>) : null
}

export async function convertBriefToProject(opts: ConvertBriefOptions): Promise<ConvertBriefResult> {
  const { briefId, userId } = opts

  // 1. Get brief with template info
  const brief = await queryOne(`
    SELECT
      b.id, b.title, b.client_id, b.status, b.converted_to_project_id,
      b.requested_deadline, b.budget_min, b.budget_max, b.budget_currency,
      b.quote_id, b.assigned_to,
      bt.project_template_id AS template_project_template_id,
      bt.slug AS template_slug,
      bt.field_mapping, bt.auto_convert_on_approval, bt.auto_assign_department
    FROM briefs b
    JOIN brief_templates bt ON b.template_id = bt.id
    WHERE b.id = $1
  `, [briefId])

  if (!brief) {
    throw createError({ statusCode: 404, statusMessage: 'Brief not found' })
  }

  // 2. Verify brief status
  if (!['approved', 'in_progress'].includes(brief.status)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Brief must be approved or in progress to convert'
    })
  }

  // 3. Verify not already converted
  if (brief.converted_to_project_id) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Brief has already been converted to a project'
    })
  }

  // 4. Resolve params
  const projectTemplateId = opts.projectTemplateId || brief.template_project_template_id
  const projectName = opts.projectName || brief.title || 'Untitled Project'
  const clientId = opts.clientId || brief.client_id
  const startDate = opts.startDate || new Date().toISOString().split('T')[0]

  if (!clientId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Client ID is required (either from brief or request body)'
    })
  }

  // Verify client exists
  const client = await queryOne('SELECT id, name FROM agency_clients WHERE id = $1', [clientId])
  if (!client) {
    throw createError({ statusCode: 404, statusMessage: 'Client not found' })
  }

  // 5. Create project (with or without template)
  if (projectTemplateId) {
    // --- P2: compute the brief carry-through BEFORE the transaction. These steps are optional
    // and additive; doing them mid-tx is unsafe because a caught error still aborts the whole
    // Postgres transaction (poisoning the core conversion). Reads here, writes after commit.
    const startDateObj = new Date(startDate)
    const month = `${startDateObj.getFullYear()}-${String(startDateObj.getMonth() + 1).padStart(2, '0')}`
    const isAdJob = isMondayMappableTemplate(brief.template_slug || '')
    let mappedDescription = ''
    let proposedAllocations: ReturnType<typeof deriveBriefAllocations> = []
    let gatekeeper: GatekeeperResult | undefined
    try {
      const fvRows = await queryRows(
        `SELECT tf.field_key, fv.value
           FROM brief_field_values fv
           JOIN brief_template_fields tf ON tf.id = fv.field_id
          WHERE fv.brief_id = $1`,
        [briefId],
      )
      const fields: Record<string, unknown> = {}
      for (const r of fvRows as any[]) fields[r.field_key] = unwrapFieldValue(r.value)

      // G3: honour field_mapping where set — a "From the brief" block on the project
      // description (no-op until a template configures a mapping, so zero regression).
      const { descriptionLines } = applyFieldMapping(coerceMapping(brief.field_mapping), fields)
      if (descriptionLines.length) mappedDescription = ['— From the brief —', ...descriptionLines].join('\n')

      // Structured budget: resolve the Monday campaign type, derive a *proposed* allocation.
      const campaignType = briefToMondayCampaignType({ templateSlug: brief.template_slug, fields })
      proposedAllocations = deriveBriefAllocations({
        budgetMin: brief.budget_min, budgetMax: brief.budget_max,
        currency: brief.budget_currency, campaignType, month,
      })

      // Gatekeeper (AI fills gaps, human confirms): compute gaps + proposals, never block.
      gatekeeper = validateBriefForConversion({
        templateSlug: brief.template_slug, isAdTemplate: isAdJob, campaignType,
        allocations: proposedAllocations, budgetMin: brief.budget_min, budgetMax: brief.budget_max,
        currency: brief.budget_currency, requestedDeadline: brief.requested_deadline, month,
      })
    } catch (err) {
      console.error('[Brief] P2 intake compute failed (non-fatal):', err)
    }

    // Use transaction for template-based creation
    const result = await transaction(async (txClient) => {
      // Get template
      const templateResult = await txClient.query(
        'SELECT * FROM project_templates WHERE id = $1 AND is_active = true',
        [projectTemplateId]
      )
      const template = templateResult.rows[0]

      if (!template) {
        throw createError({ statusCode: 404, statusMessage: 'Project template not found' })
      }

      const projectStartDate = new Date(startDate)
      const projectEndDate = new Date(projectStartDate)
      projectEndDate.setDate(projectEndDate.getDate() + (template.estimated_duration_days || 30))

      // Create project — description carries the brief's mapped intake (computed pre-tx above)
      const projectResult = await txClient.query(`
        INSERT INTO projects (
          name, client_id, status, budget_type, budget_amount,
          start_date, end_date, project_manager_id, description
        ) VALUES ($1, $2, 'active', $3, $4, $5, $6, $7, $8)
        RETURNING id, name
      `, [
        projectName,
        clientId,
        template.default_budget_type || 'time_materials',
        template.default_budget_amount || 0,
        projectStartDate.toISOString().split('T')[0],
        projectEndDate.toISOString().split('T')[0],
        brief.assigned_to || userId,
        mappedDescription || null
      ])
      const project = projectResult.rows[0]

      // Get template tasks
      const tasksResult = await txClient.query(`
        SELECT * FROM template_tasks
        WHERE template_id = $1
        ORDER BY phase_id NULLS FIRST, sort_order
      `, [projectTemplateId])
      const templateTasks = tasksResult.rows

      // Department fallback chain so every task is board-visible (tasks list INNER JOINs departments).
      const fallbackDeptResult = await txClient.query(
        `SELECT id FROM departments WHERE is_active = true ORDER BY sort_order NULLS LAST, created_at LIMIT 1`,
      )
      const fallbackDeptId: string | null = fallbackDeptResult.rows[0]?.id ?? null
      const projectManagerId: string | null = brief.assigned_to || userId
      const assignedForNotify: Array<{ taskId: string; assigneeId: string; title: string; dueDate: string }> = []

      // Fetch quote line items for auto-matching (if brief has a linked quote)
      let quoteLineItems: any[] = []
      if (brief.quote_id) {
        try {
          const qliResult = await txClient.query(`
            SELECT id, name, line_total, hourly_rate, estimated_hours
            FROM quote_line_items WHERE quote_id = $1
            ORDER BY sort_order
          `, [brief.quote_id])
          quoteLineItems = qliResult.rows.map((r: any) => ({
            id: r.id,
            serviceName: r.name,
            price: Number(r.line_total || 0),
            priceUnit: 'fixed',
            categoryName: '',
            hourlyRate: r.hourly_rate ? Number(r.hourly_rate) : null,
            estimatedHours: r.estimated_hours ? Number(r.estimated_hours) : null,
          }))
        } catch { /* non-critical */ }
      }

      // Create tasks from template
      let tasksCreated = 0
      for (const tt of templateTasks) {
        const dueDate = new Date(projectStartDate)
        dueDate.setDate(dueDate.getDate() + (tt.start_day_offset || 0) + (tt.duration_days || 1))

        // Try to match this template task to a quote line item
        let matchedLineItemId: string | null = null
        let budgetSource = 'brief'
        let estimatedCost: number | null = null
        let billingRate: number | null = null

        if (quoteLineItems.length > 0) {
          const match = findBestMatch(tt.title, quoteLineItems, 0.3)
          if (match) {
            matchedLineItemId = match.itemId
            budgetSource = 'quote'
            estimatedCost = match.price
            const matched = quoteLineItems.find(q => q.id === match.itemId)
            if (matched?.hourlyRate) billingRate = matched.hourlyRate
          }
        }

        const departmentId = pickDepartmentId([
          tt.default_department_id,
          brief.auto_assign_department,
          fallbackDeptId,
        ])
        if (!departmentId) {
          throw createError({
            statusCode: 422,
            statusMessage: 'Cannot convert: no department resolved for task (set default_department_id on the template task, auto_assign_department on the brief template, or ensure an active department exists)',
          })
        }
        const statusResult = await txClient.query(
          `SELECT id FROM task_statuses
           WHERE (department_id IS NULL OR department_id = $1) AND is_default = true
           ORDER BY department_id NULLS LAST LIMIT 1`,
          [departmentId],
        )
        const statusId: string | null = statusResult.rows[0]?.id ?? null
        if (!statusId) {
          throw createError({
            statusCode: 422,
            statusMessage: 'Cannot convert: no default task status for the resolved department',
          })
        }
        const { assigneeId } = resolveTaskAssignee({
          defaultAssigneeId: tt.default_assignee_id,
          defaultRole: tt.default_role,
          projectManagerId,
        })
        const dueDateStr = dueDate.toISOString().split('T')[0]

        const insertedTask = await txClient.query(`
          INSERT INTO tasks (
            project_id, department_id, status_id, title, description, priority,
            task_type, estimated_hours, due_date, reporter_id, assignee_id,
            brief_id, budget_source, quote_line_item_id,
            estimated_cost, billing_rate
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
          RETURNING id
        `, [
          project.id,
          departmentId,
          statusId,
          tt.title,
          tt.description,
          tt.priority || 'medium',
          tt.task_type || 'task',
          tt.estimated_hours,
          dueDateStr,
          userId,
          assigneeId,
          briefId,
          budgetSource,
          matchedLineItemId,
          estimatedCost,
          billingRate,
        ])
        tasksCreated++

        if (assigneeId && assigneeId !== userId) {
          assignedForNotify.push({ taskId: insertedTask.rows[0].id, assigneeId, title: tt.title, dueDate: dueDateStr })
        }
      }

      // Update template usage stats
      await txClient.query(`
        UPDATE project_templates
        SET times_used = COALESCE(times_used, 0) + 1, last_used_at = NOW()
        WHERE id = $1
      `, [projectTemplateId])

      // Update brief
      await txClient.query(`
        UPDATE briefs
        SET converted_to_project_id = $1, converted_at = NOW(), auto_project_created = true, updated_at = NOW()
        WHERE id = $2
      `, [project.id, briefId])

      // Log activity
      await txClient.query(`
        INSERT INTO brief_activities (brief_id, user_id, activity_type, new_value, content)
        VALUES ($1, $2, 'converted_to_project', $3, $4)
      `, [
        briefId,
        userId,
        JSON.stringify({ projectId: project.id, templateId: projectTemplateId }),
        `Converted to project "${project.name}" using template`
      ])

      return { project: { id: project.id, name: project.name }, tasksCreated, assignedForNotify }
    })

    const notified = new Set<string>()
    for (const a of result.assignedForNotify) {
      if (notified.has(a.assigneeId)) continue
      notified.add(a.assigneeId)
      notifyTaskAssigned({
        assigneeId: a.assigneeId,
        taskId: a.taskId,
        taskTitle: a.title,
        assignerId: userId,
        dueDate: a.dueDate,
      }).catch(err => console.error('[Brief] task-assigned notify failed:', err))
    }
    // P2: optional additive writes AFTER the core conversion has committed — a failure here
    // can never roll back the project/tasks (separate connections, each individually guarded).
    let budgetAllocationsCreated = 0
    try {
      for (const a of proposedAllocations) {
        await execute(`
          INSERT INTO job_budget_allocations
            (project_id, brief_id, campaign_type, platform, amount, currency, period, month, state, source, created_by)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `, [result.project.id, briefId, a.campaignType, a.platform, a.amount, a.currency, a.period, a.month, a.state, a.source, userId])
        budgetAllocationsCreated++
      }
    } catch (err) {
      console.error('[Brief] budget allocation insert failed (non-fatal):', err)
    }

    // Record the gatekeeper's gaps + proposals as a non-blocking brief note
    // (AI proposes, human confirms — the interactive confirm UI lands in the next slice).
    try {
      if (gatekeeper && (gatekeeper.gaps.length || gatekeeper.proposals.length)) {
        const parts: string[] = []
        if (gatekeeper.gaps.length) parts.push('gaps: ' + gatekeeper.gaps.map(g => `${g.field} (${g.severity})`).join(', '))
        if (gatekeeper.proposals.length) parts.push('AI-proposed: ' + gatekeeper.proposals.map(p => p.field).join(', '))
        await execute(`
          INSERT INTO brief_activities (brief_id, user_id, activity_type, content)
          VALUES ($1, $2, 'commented', $3)
        `, [briefId, userId, `Conversion gatekeeper — ${parts.join(' · ')}`])
      }
    } catch (err) {
      console.error('[Brief] gatekeeper note failed (non-fatal):', err)
    }

    return {
      project: result.project,
      tasksCreated: result.tasksCreated,
      budgetAllocationsCreated,
      gatekeeper,
    }
  } else {
    // Simple project creation (no template)
    const projectStartDate = new Date(startDate)
    const projectEndDate = new Date(projectStartDate)
    projectEndDate.setDate(projectEndDate.getDate() + 30)

    const project = await queryOne(`
      INSERT INTO projects (
        name, client_id, status, budget_type, budget_amount,
        start_date, end_date, project_manager_id
      ) VALUES ($1, $2, 'active', 'time_materials', 0, $3, $4, $5)
      RETURNING id, name
    `, [
      projectName,
      clientId,
      projectStartDate.toISOString().split('T')[0],
      projectEndDate.toISOString().split('T')[0],
      brief.assigned_to || userId
    ])

    // P2 (no-template path): still surface the brief budget as a proposed allocation.
    let budgetAllocationsCreated = 0
    try {
      const fvResult = await queryRows(
        `SELECT tf.field_key, fv.value
           FROM brief_field_values fv
           JOIN brief_template_fields tf ON tf.id = fv.field_id
          WHERE fv.brief_id = $1`,
        [briefId],
      )
      const fields: Record<string, unknown> = {}
      for (const r of fvResult as any[]) fields[r.field_key] = unwrapFieldValue(r.value)
      const campaignType = briefToMondayCampaignType({ templateSlug: brief.template_slug, fields })
      const month = `${projectStartDate.getFullYear()}-${String(projectStartDate.getMonth() + 1).padStart(2, '0')}`
      const allocs = deriveBriefAllocations({
        budgetMin: brief.budget_min, budgetMax: brief.budget_max,
        currency: brief.budget_currency, campaignType, month,
      })
      for (const a of allocs) {
        await execute(`
          INSERT INTO job_budget_allocations
            (project_id, brief_id, campaign_type, platform, amount, currency, period, month, state, source, created_by)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `, [project.id, briefId, a.campaignType, a.platform, a.amount, a.currency, a.period, a.month, a.state, a.source, userId])
        budgetAllocationsCreated++
      }
    } catch (err) {
      console.error('[Brief] budget allocation insert (no-template) failed (non-fatal):', err)
    }

    // Update brief
    await execute(`
      UPDATE briefs
      SET converted_to_project_id = $1, converted_at = NOW(), auto_project_created = false, updated_at = NOW()
      WHERE id = $2
    `, [project.id, briefId])

    // Log activity
    await execute(`
      INSERT INTO brief_activities (brief_id, user_id, activity_type, new_value, content)
      VALUES ($1, $2, 'converted_to_project', $3, $4)
    `, [
      briefId,
      userId,
      JSON.stringify({ projectId: project.id }),
      `Converted to project "${project.name}"`
    ])

    return { project: { id: project.id, name: project.name }, tasksCreated: 0, budgetAllocationsCreated }
  }
}
