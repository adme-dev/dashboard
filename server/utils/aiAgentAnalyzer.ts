/**
 * AI Agent Analyzers
 * 8 parallel analysis functions that scan for actionable findings
 */

import { queryRows } from '~~/server/utils/db'

export interface AnalysisFinding {
  severity: 'info' | 'warning' | 'critical'
  title: string
  description: string
  entityId?: string
  entityUrl?: string
}

export interface AnalysisResult {
  type: string
  findings: AnalysisFinding[]
  count: number
}

/**
 * Tasks with due_date in the past and not completed/skipped
 */
export async function analyzeOverdueTasks(orgId?: string): Promise<AnalysisResult> {
  const rows = await queryRows(`
    SELECT t.id, t.title, t.due_date, t.priority,
           tm.name as assignee_name,
           d.name as board_name
    FROM tasks t
    LEFT JOIN team_members tm ON t.assignee_id = tm.id
    LEFT JOIN departments d ON t.department_id = d.id
    WHERE t.due_date < NOW()
      AND t.status NOT IN ('complete', 'completed', 'skipped', 'done', 'cancelled')
      AND t.parent_task_id IS NULL
    ORDER BY t.due_date ASC
    LIMIT 20
  `)

  const findings: AnalysisFinding[] = rows.map(row => {
    const daysOverdue = Math.floor((Date.now() - new Date(row.due_date).getTime()) / (1000 * 60 * 60 * 24))
    const severity: AnalysisFinding['severity'] = daysOverdue > 7 ? 'critical' : daysOverdue > 3 ? 'warning' : 'info'

    return {
      severity,
      title: `"${row.title}" is ${daysOverdue} day${daysOverdue === 1 ? '' : 's'} overdue`,
      description: `Assigned to ${row.assignee_name || 'unassigned'} on board ${row.board_name || 'unknown'}. Priority: ${row.priority || 'none'}.`,
      entityId: row.id,
      entityUrl: `/agency/tasks/${row.id}`
    }
  })

  return { type: 'overdue_tasks', findings, count: findings.length }
}

/**
 * Briefs not updated in 7+ days with active status
 */
export async function analyzeStaleBriefs(orgId?: string): Promise<AnalysisResult> {
  const rows = await queryRows(`
    SELECT b.id, b.title, b.status, b.updated_at,
           c.name as client_name,
           tm.name as assignee_name
    FROM briefs b
    LEFT JOIN clients c ON b.client_id = c.id
    LEFT JOIN team_members tm ON b.assignee_id = tm.id
    WHERE b.updated_at < NOW() - INTERVAL '7 days'
      AND b.status NOT IN ('completed', 'approved', 'cancelled', 'archived')
    ORDER BY b.updated_at ASC
    LIMIT 20
  `)

  const findings: AnalysisFinding[] = rows.map(row => {
    const daysSinceUpdate = Math.floor((Date.now() - new Date(row.updated_at).getTime()) / (1000 * 60 * 60 * 24))

    return {
      severity: daysSinceUpdate > 14 ? 'critical' : 'warning',
      title: `Brief "${row.title}" has not been updated in ${daysSinceUpdate} days`,
      description: `Client: ${row.client_name || 'unknown'}. Assigned to ${row.assignee_name || 'unassigned'}. Status: ${row.status}.`,
      entityId: row.id,
      entityUrl: `/agency/briefs/${row.id}`
    }
  })

  return { type: 'stale_briefs', findings, count: findings.length }
}

/**
 * Tasks with blocked status or is_blocked = true
 */
export async function analyzeBlockedItems(orgId?: string): Promise<AnalysisResult> {
  const rows = await queryRows(`
    SELECT t.id, t.title, t.updated_at, t.priority,
           tm.name as assignee_name,
           d.name as board_name
    FROM tasks t
    LEFT JOIN team_members tm ON t.assignee_id = tm.id
    LEFT JOIN departments d ON t.department_id = d.id
    WHERE (t.status = 'blocked' OR t.is_blocked = true)
      AND t.parent_task_id IS NULL
    ORDER BY t.updated_at ASC
    LIMIT 20
  `)

  const findings: AnalysisFinding[] = rows.map(row => {
    const daysBlocked = Math.floor((Date.now() - new Date(row.updated_at).getTime()) / (1000 * 60 * 60 * 24))

    return {
      severity: daysBlocked > 5 ? 'critical' : daysBlocked > 2 ? 'warning' : 'info',
      title: `"${row.title}" has been blocked for ${daysBlocked} day${daysBlocked === 1 ? '' : 's'}`,
      description: `Board: ${row.board_name || 'unknown'}. Assigned to ${row.assignee_name || 'unassigned'}. Priority: ${row.priority || 'none'}.`,
      entityId: row.id,
      entityUrl: `/agency/tasks/${row.id}`
    }
  })

  return { type: 'blocked_items', findings, count: findings.length }
}

/**
 * Tasks due in 48hrs with incomplete dependencies or low progress
 */
export async function analyzeDeadlineRisks(orgId?: string): Promise<AnalysisResult> {
  const rows = await queryRows(`
    SELECT t.id, t.title, t.due_date, t.progress, t.priority,
           tm.name as assignee_name,
           d.name as board_name
    FROM tasks t
    LEFT JOIN team_members tm ON t.assignee_id = tm.id
    LEFT JOIN departments d ON t.department_id = d.id
    WHERE t.due_date BETWEEN NOW() AND NOW() + INTERVAL '48 hours'
      AND t.status NOT IN ('complete', 'completed', 'done', 'skipped', 'cancelled')
      AND t.parent_task_id IS NULL
    ORDER BY t.due_date ASC
    LIMIT 20
  `)

  const findings: AnalysisFinding[] = rows.map(row => {
    const hoursLeft = Math.floor((new Date(row.due_date).getTime() - Date.now()) / (1000 * 60 * 60))
    const progress = row.progress || 0

    return {
      severity: hoursLeft < 12 ? 'critical' : 'warning',
      title: `"${row.title}" is due in ${hoursLeft} hours (${progress}% complete)`,
      description: `Assigned to ${row.assignee_name || 'unassigned'} on board ${row.board_name || 'unknown'}. Priority: ${row.priority || 'none'}.`,
      entityId: row.id,
      entityUrl: `/agency/tasks/${row.id}`
    }
  })

  return { type: 'deadline_risks', findings, count: findings.length }
}

/**
 * Returns ad-spend anomalies from the persisted detection layer.
 * The actual detection logic lives in
 * server/utils/anomalyDetection/analysers/adspend.ts and runs via the cron
 * (Phase 3) or the manual scan endpoint.
 */
export async function analyzeAdSpendAnomalies(orgId?: string): Promise<AnalysisResult> {
  const rows = await queryRows<{
    id: string
    title: string
    description: string
    severity: string
    fingerprint: string
  }>(
    `SELECT id, title, description, severity, fingerprint
     FROM anomalies
     WHERE type = 'adspend' AND status NOT IN ('resolved','dismissed')
     ORDER BY first_detected_at DESC
     LIMIT 20`,
  )

  const findings: AnalysisFinding[] = rows.map(row => ({
    severity: row.severity === 'critical' ? 'critical' : 'warning',
    title: row.title,
    description: row.description,
    entityId: row.id,
    entityUrl: `/anomalies?focus=${row.id}`,
  }))

  return { type: 'ad_spend_anomalies', findings, count: findings.length }
}

/**
 * EOM runs with draft/review status approaching month end
 */
export async function analyzeEomStatus(orgId?: string): Promise<AnalysisResult> {
  const rows = await queryRows(`
    SELECT id, run_month, status, total_amount, invoice_count, created_at
    FROM eom_runs
    WHERE status IN ('draft', 'review')
    ORDER BY run_month DESC
    LIMIT 10
  `)

  const now = new Date()
  const daysUntilMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate()

  const findings: AnalysisFinding[] = rows.map(row => {
    const severity: AnalysisFinding['severity'] = daysUntilMonthEnd <= 3 ? 'critical' : daysUntilMonthEnd <= 7 ? 'warning' : 'info'

    return {
      severity,
      title: `EOM run for ${row.run_month} is still in "${row.status}" (${daysUntilMonthEnd} days until month end)`,
      description: `${row.invoice_count || 0} invoices totalling $${Number(row.total_amount || 0).toLocaleString()}. Created ${new Date(row.created_at).toLocaleDateString()}.`,
      entityId: row.id,
      entityUrl: `/agency/eom/${row.id}`
    }
  })

  return { type: 'eom_status', findings, count: findings.length }
}

/**
 * Team members with > 15 active tasks
 */
export async function analyzeTeamWorkload(orgId?: string): Promise<AnalysisResult> {
  const rows = await queryRows(`
    SELECT tm.id, tm.name, tm.role,
           COUNT(t.id) as active_task_count
    FROM team_members tm
    JOIN tasks t ON t.assignee_id = tm.id
    WHERE t.status IN ('in_progress', 'not_started', 'working_on_it', 'pending', 'todo')
      AND t.parent_task_id IS NULL
      AND tm.is_active = true
    GROUP BY tm.id, tm.name, tm.role
    HAVING COUNT(t.id) > 15
    ORDER BY COUNT(t.id) DESC
    LIMIT 20
  `)

  const findings: AnalysisFinding[] = rows.map(row => ({
    severity: row.active_task_count > 25 ? 'critical' : 'warning',
    title: `${row.name} has ${row.active_task_count} active tasks`,
    description: `Role: ${row.role || 'member'}. Consider redistributing workload to prevent burnout and delays.`,
    entityId: row.id,
    entityUrl: `/agency/team`
  }))

  return { type: 'team_workload', findings, count: findings.length }
}

/**
 * Tasks created in last 7 days with no assignee
 */
export async function analyzeUnassignedWork(orgId?: string): Promise<AnalysisResult> {
  const rows = await queryRows(`
    SELECT t.id, t.title, t.created_at, t.priority, t.due_date,
           d.name as board_name
    FROM tasks t
    LEFT JOIN departments d ON t.department_id = d.id
    WHERE t.assignee_id IS NULL
      AND t.created_at >= NOW() - INTERVAL '7 days'
      AND t.status NOT IN ('complete', 'completed', 'done', 'skipped', 'cancelled')
      AND t.parent_task_id IS NULL
    ORDER BY t.created_at DESC
    LIMIT 20
  `)

  const findings: AnalysisFinding[] = rows.map(row => {
    const hasDueDate = !!row.due_date
    const isUrgent = hasDueDate && new Date(row.due_date).getTime() - Date.now() < 48 * 60 * 60 * 1000

    return {
      severity: isUrgent ? 'critical' : row.priority === 'high' || row.priority === 'urgent' ? 'warning' : 'info',
      title: `"${row.title}" is unassigned`,
      description: `Board: ${row.board_name || 'unknown'}. Priority: ${row.priority || 'none'}.${hasDueDate ? ` Due: ${new Date(row.due_date).toLocaleDateString()}.` : ''}`,
      entityId: row.id,
      entityUrl: `/agency/tasks/${row.id}`
    }
  })

  return { type: 'unassigned_work', findings, count: findings.length }
}

/**
 * Active team members who haven't submitted a timesheet for the most recent completed week
 */
export async function analyzeTimesheetGaps(orgId?: string): Promise<AnalysisResult> {
  const rows = await queryRows(`
    SELECT tm.id, tm.name, tm.role
    FROM team_members tm
    WHERE tm.is_active = true
      AND NOT EXISTS (
        SELECT 1 FROM timesheet_periods tp
        WHERE tp.user_id = tm.id
          AND tp.period_start >= date_trunc('week', NOW() - INTERVAL '7 days')
          AND tp.status IN ('submitted', 'approved')
      )
    ORDER BY tm.name
    LIMIT 20
  `)

  const findings: AnalysisFinding[] = rows.map(row => ({
    severity: 'warning' as const,
    title: `${row.name} has not submitted last week's timesheet`,
    description: `Role: ${row.role || 'member'}. No submitted or approved timesheet for the most recent week.`,
    entityId: row.id,
    entityUrl: '/agency/time/approvals',
  }))

  return { type: 'timesheet_gaps', findings, count: findings.length }
}

/**
 * Run all 9 analyzers in parallel with error resilience
 */
export async function runAllAnalyzers(orgId?: string): Promise<AnalysisResult[]> {
  const results = await Promise.allSettled([
    analyzeOverdueTasks(orgId),
    analyzeStaleBriefs(orgId),
    analyzeBlockedItems(orgId),
    analyzeDeadlineRisks(orgId),
    analyzeAdSpendAnomalies(orgId),
    analyzeEomStatus(orgId),
    analyzeTeamWorkload(orgId),
    analyzeUnassignedWork(orgId),
    analyzeTimesheetGaps(orgId)
  ])

  const analysisResults: AnalysisResult[] = []

  for (const result of results) {
    if (result.status === 'fulfilled') {
      analysisResults.push(result.value)
    } else {
      console.error('[AI Agent] Analyzer failed:', result.reason)
    }
  }

  return analysisResults
}
