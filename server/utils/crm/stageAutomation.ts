// server/utils/crm/stageAutomation.ts
// On opportunity stage entry: record a queryable history row and create follow-up
// tasks from per-client automation rules. buildAutomationTasks is pure (TDD);
// recordStageChange does the DB I/O and idempotency.
import { queryRows, queryOne, execute } from '~~/server/utils/db'
import { recomputeIfScorable } from './scoreSignals'

export interface StageAutomationTemplate {
  title?: string
  task_type?: string
  priority?: string
  due_offset_days?: number
  assigned_to?: string | null
}

export interface StageAutomationRule {
  id: string
  client_id: string
  stage_id: string
  object_type: string
  action: 'create_task'
  task_template: StageAutomationTemplate
  is_active: boolean
}

export interface PlannedTask {
  title: string
  task_type: string
  priority: string
  due_at: string | null
  assigned_to: string | null
}

export interface AutomationOpp { id: string, owner_id: string | null }

// Pure: rule[] -> task payloads. Inactive / non-create_task rules are dropped.
export function buildAutomationTasks(rules: StageAutomationRule[], opp: AutomationOpp, now: Date): PlannedTask[] {
  return rules
    .filter(r => r.is_active && r.action === 'create_task')
    .map((r) => {
      const t = r.task_template ?? {}
      const due_at = typeof t.due_offset_days === 'number'
        ? new Date(now.getTime() + t.due_offset_days * 86400000).toISOString()
        : null
      return {
        title: t.title || 'Follow up',
        task_type: t.task_type || 'follow_up',
        priority: t.priority || 'medium',
        due_at,
        assigned_to: t.assigned_to ?? opp.owner_id ?? null,
      }
    })
}

// Called by both agency + portal move endpoints after a successful stage change.
// Best-effort: callers wrap in try/catch so an automation failure never rolls back
// the move itself. Idempotent by (opportunity + title) on open tasks.
export async function recordStageChange(opts: {
  clientId: string
  opportunityId: string
  fromStageId: string | null
  toStageId: string
  ownerId: string | null
  changedBy: string | null
  now?: Date
}): Promise<void> {
  const now = opts.now ?? new Date()

  await execute(
    `INSERT INTO crm_opportunity_stage_history (client_id, opportunity_id, from_stage_id, to_stage_id, changed_by)
     VALUES ($1,$2,$3,$4,$5)`,
    [opts.clientId, opts.opportunityId, opts.fromStageId, opts.toStageId, opts.changedBy],
  )

  // A stage change shifts open-opportunity intent — refresh the linked contact's score.
  const contacts = await queryOne<{ person_id: string | null, company_id: string | null }>(
    `SELECT person_id, company_id FROM crm_opportunities WHERE id = $1`,
    [opts.opportunityId],
  )
  if (contacts) {
    await recomputeIfScorable(opts.clientId, 'person', contacts.person_id, 'opportunity_stage')
    await recomputeIfScorable(opts.clientId, 'company', contacts.company_id, 'opportunity_stage')
  }

  const rules = await queryRows<StageAutomationRule>(
    `SELECT * FROM crm_stage_automations WHERE client_id = $1 AND stage_id = $2 AND is_active = true`,
    [opts.clientId, opts.toStageId],
  )
  if (!rules.length) return

  const planned = buildAutomationTasks(rules, { id: opts.opportunityId, owner_id: opts.ownerId }, now)
  for (const p of planned) {
    // Idempotency: don't stack a second open task with the same title for this opportunity.
    const existing = await queryOne(
      `SELECT id FROM crm_tasks
        WHERE client_id = $1 AND target_type = 'opportunity' AND target_id = $2
          AND title = $3 AND status IN ('pending','in_progress') AND deleted_at IS NULL
        LIMIT 1`,
      [opts.clientId, opts.opportunityId, p.title],
    )
    if (existing) continue
    await execute(
      `INSERT INTO crm_tasks
         (client_id, target_type, target_id, title, task_type, priority, due_at, assigned_to, created_by)
       VALUES ($1,'opportunity',$2,$3,$4,$5,$6,$7,$8)`,
      [opts.clientId, opts.opportunityId, p.title, p.task_type, p.priority, p.due_at, p.assigned_to, opts.changedBy],
    )
  }
}
