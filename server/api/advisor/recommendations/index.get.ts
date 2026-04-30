/**
 * GET /api/advisor/recommendations
 *
 * Lists Financial Advisor recommendations for the active tenant.
 * Filters: status, priority, client_id, period (source report period_key),
 * assigned_to. Default: open + in_progress, high priority first.
 */

import { createError } from 'h3'
import { queryRows } from '~~/server/utils/db'
import { getSelectedTenant } from '~~/server/utils/session'
import { requireAuth } from '~~/server/utils/auth'
import { CATEGORIES } from '~~/server/utils/advisorCategories'

const ALLOWED_STATUS = new Set(['open', 'in_progress', 'done', 'dismissed'])
const ALLOWED_PRIORITY = new Set(['low', 'medium', 'high'])
const ALLOWED_CATEGORY = new Set<string>(CATEGORIES as readonly string[])
const ALLOWED_SOURCE = new Set(['ai', 'manual'])

// Statuses that should hide future-snoozed rows by default. The user
// can opt back in via ?include_snoozed=1 or by selecting a closed
// status (done/dismissed) — closed work isn't really "snoozed" anyway.
const ACTIVE_STATUSES = new Set(['open', 'in_progress'])

export default eventHandler(async (event) => {
  await requireAuth(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  }

  const q = getQuery(event)
  const statusParam = typeof q.status === 'string' ? q.status : null
  const priorityParam = typeof q.priority === 'string' ? q.priority : null
  const clientId = typeof q.client_id === 'string' ? q.client_id : null
  const period = typeof q.period === 'string' ? q.period : null
  const assignedTo = typeof q.assigned_to === 'string' ? q.assigned_to : null
  const categoryParam = typeof q.category === 'string' ? q.category : null
  const sourceParam = typeof q.source === 'string' ? q.source : null
  const includeSnoozed = q.include_snoozed === '1' || q.include_snoozed === 'true'
  const limit = Math.min(parseInt(typeof q.limit === 'string' ? q.limit : '100', 10) || 100, 500)
  const offset = Math.max(parseInt(typeof q.offset === 'string' ? q.offset : '0', 10) || 0, 0)

  const where: string[] = ['r.tenant_id = $1']
  const params: any[] = [tenantId]
  let idx = 2

  if (statusParam) {
    // Support comma-separated list: status=open,in_progress
    const statuses = statusParam.split(',').map((s) => s.trim()).filter((s) => ALLOWED_STATUS.has(s))
    if (statuses.length === 0) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid status filter' })
    }
    where.push(`r.status = ANY($${idx}::text[])`)
    params.push(statuses)
    idx++
  } else {
    // Default view: hide dismissed + done
    where.push(`r.status IN ('open', 'in_progress')`)
  }

  if (priorityParam) {
    if (!ALLOWED_PRIORITY.has(priorityParam)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid priority filter' })
    }
    where.push(`r.priority = $${idx}`)
    params.push(priorityParam)
    idx++
  }

  if (clientId === 'agency') {
    // Sentinel for "the agency's own books" (null client_id)
    where.push(`r.client_id IS NULL`)
  } else if (clientId) {
    where.push(`r.client_id = $${idx}`)
    params.push(clientId)
    idx++
  }

  if (period) {
    where.push(`far.period_key = $${idx}`)
    params.push(period)
    idx++
  }

  if (assignedTo === 'unassigned') {
    where.push(`r.assigned_to IS NULL`)
  } else if (assignedTo) {
    where.push(`r.assigned_to = $${idx}`)
    params.push(assignedTo)
    idx++
  }

  if (categoryParam === 'none') {
    where.push(`r.category IS NULL`)
  } else if (categoryParam) {
    if (!ALLOWED_CATEGORY.has(categoryParam)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid category filter' })
    }
    where.push(`r.category = $${idx}`)
    params.push(categoryParam)
    idx++
  }

  if (sourceParam) {
    if (!ALLOWED_SOURCE.has(sourceParam)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid source filter' })
    }
    where.push(`r.source = $${idx}`)
    params.push(sourceParam)
    idx++
  }

  // Snooze visibility: when the requested status set is exclusively
  // active (open / in_progress), hide future-snoozed rows unless the
  // caller opts in via ?include_snoozed=1. Closed-status views always
  // show snoozed rows because "done while snoozed" isn't a thing.
  const requestedStatuses = statusParam
    ? statusParam.split(',').map((s) => s.trim()).filter(Boolean)
    : ['open', 'in_progress']
  const onlyActive = requestedStatuses.every((s) => ACTIVE_STATUSES.has(s))
  if (onlyActive && !includeSnoozed) {
    where.push(`(r.snoozed_until IS NULL OR r.snoozed_until <= CURRENT_DATE)`)
  }

  params.push(limit, offset)

  const rows = await queryRows<any>(
    `SELECT
       r.id,
       r.tenant_id,
       r.client_id,
       r.source_report_id,
       r.title,
       r.action,
       r.impact,
       r.priority,
       r.target_metric,
       r.baseline_metric_value,
       r.target_direction,
       r.status,
       r.due_date,
       r.assigned_to,
       r.acted_at,
       r.outcome_notes,
       r.category,
       r.effort,
       r.snoozed_until,
       r.source,
       r.created_by,
       r.created_at,
       r.updated_at,
       far.period_key,
       far.period_label,
       ac.name AS client_name,
       tm.name AS assignee_name,
       tm.avatar_url AS assignee_avatar_url,
       creator.name AS created_by_name,
       creator.avatar_url AS created_by_avatar_url,
       COUNT(c.id) FILTER (WHERE c.deleted_at IS NULL)::int AS comment_count
     FROM recommendations r
     LEFT JOIN financial_advisor_reports far ON far.id = r.source_report_id
     LEFT JOIN agency_clients ac ON ac.id = r.client_id
     LEFT JOIN team_members tm ON tm.id = r.assigned_to
     LEFT JOIN team_members creator ON creator.id = r.created_by
     LEFT JOIN recommendation_comments c ON c.recommendation_id = r.id
     WHERE ${where.join(' AND ')}
     GROUP BY r.id, far.period_key, far.period_label, ac.name, tm.name, tm.avatar_url, creator.name, creator.avatar_url
     ORDER BY
       CASE r.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
       r.created_at DESC
     LIMIT $${idx} OFFSET $${idx + 1}`,
    params
  )

  return { recommendations: rows, total: rows.length }
})
