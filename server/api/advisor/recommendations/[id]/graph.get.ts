/**
 * GET /api/advisor/recommendations/:id/graph
 *
 * Relationship graph rooted at the recommendation. Returns enough data
 * for a small node-edge viz in the drawer: client → report → rec →
 * (metric, outcomes, events, assignee, similar recs).
 *
 * The shape mirrors a generic graph-viz contract so the client can
 * render with Unovis, d3, or a hand-rolled SVG without us re-shaping.
 */

import { createError } from 'h3'
import { queryOne, queryRows } from '~~/server/utils/db'
import { getSelectedTenant } from '~~/server/utils/session'
import { requireAuth } from '~~/server/utils/auth'
import { searchSimilarAdvisor } from '~~/server/utils/advisorEmbedder'

type NodeType =
  | 'recommendation'
  | 'client'
  | 'report'
  | 'metric'
  | 'outcome'
  | 'event'
  | 'assignee'
  | 'similar'

type GraphNode = {
  id: string
  type: NodeType
  label: string
  sublabel?: string
  meta?: Record<string, any>
}

type GraphEdge = {
  from: string
  to: string
  type: string
  label?: string
}

export default eventHandler(async (event) => {
  await requireAuth(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  }

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Recommendation ID required' })
  }

  const rec = await queryOne<any>(
    `SELECT
       r.id, r.tenant_id, r.title, r.action, r.impact, r.priority, r.status,
       r.target_metric, r.baseline_metric_value, r.target_direction,
       r.client_id, r.source_report_id, r.assigned_to, r.vector_id,
       far.period_key, far.period_label, far.grade AS report_grade,
       ac.name AS client_name,
       tm.name AS assignee_name, tm.avatar_url AS assignee_avatar_url
     FROM recommendations r
     LEFT JOIN financial_advisor_reports far ON far.id = r.source_report_id
     LEFT JOIN agency_clients ac ON ac.id = r.client_id
     LEFT JOIN team_members tm ON tm.id = r.assigned_to
     WHERE r.id = $1 AND r.tenant_id = $2`,
    [id, tenantId]
  )
  if (!rec) {
    throw createError({ statusCode: 404, statusMessage: 'Recommendation not found' })
  }

  const [events, outcomes] = await Promise.all([
    queryRows<any>(
      `SELECT e.id, e.event_type, e.created_at, tm.name AS actor_name
       FROM recommendation_events e
       LEFT JOIN team_members tm ON tm.id = e.actor_id
       WHERE e.recommendation_id = $1
       ORDER BY e.created_at DESC
       LIMIT 6`,
      [id]
    ),
    queryRows<any>(
      `SELECT id, measured_at, days_after_action, metric_value, metric_delta
       FROM recommendation_outcomes
       WHERE recommendation_id = $1
       ORDER BY measured_at ASC`,
      [id]
    ),
  ])

  // Pull up to 3 semantically similar recs via Vectorize — gives the
  // viz something interesting when the rec has little direct linkage.
  let similar: Array<{ id: string; score: number; metadata: Record<string, any> }> = []
  try {
    const text = [
      rec.client_name ? `Client: ${rec.client_name}` : 'Scope: agency books',
      rec.period_label ? `Period: ${rec.period_label}` : '',
      `Title: ${rec.title}`,
      `Action: ${rec.action}`,
      rec.impact ? `Impact: ${rec.impact}` : '',
    ].filter(Boolean).join('\n')
    similar = await searchSimilarAdvisor(event, text, tenantId, 3, rec.vector_id ?? `advisor-rec:${rec.id}`)
  } catch {
    /* silent */
  }

  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []

  // Root
  nodes.push({
    id: `rec:${rec.id}`,
    type: 'recommendation',
    label: rec.title,
    sublabel: rec.status,
    meta: { priority: rec.priority, status: rec.status, action: rec.action, impact: rec.impact },
  })

  if (rec.client_id) {
    nodes.push({
      id: `client:${rec.client_id}`,
      type: 'client',
      label: rec.client_name ?? 'Client',
    })
    edges.push({ from: `client:${rec.client_id}`, to: `rec:${rec.id}`, type: 'scoped_to' })
  } else {
    nodes.push({ id: 'client:agency', type: 'client', label: 'Agency books' })
    edges.push({ from: 'client:agency', to: `rec:${rec.id}`, type: 'scoped_to' })
  }

  if (rec.source_report_id) {
    nodes.push({
      id: `report:${rec.source_report_id}`,
      type: 'report',
      label: rec.period_label ?? 'Report',
      sublabel: rec.report_grade ? `Grade ${rec.report_grade}` : undefined,
      meta: { period_key: rec.period_key },
    })
    edges.push({ from: `report:${rec.source_report_id}`, to: `rec:${rec.id}`, type: 'generated' })
  }

  if (rec.target_metric) {
    nodes.push({
      id: `metric:${rec.id}`,
      type: 'metric',
      label: rec.target_metric,
      sublabel: rec.baseline_metric_value != null ? `baseline ${rec.baseline_metric_value}` : undefined,
      meta: { target_direction: rec.target_direction },
    })
    edges.push({ from: `rec:${rec.id}`, to: `metric:${rec.id}`, type: 'tracks' })
  }

  if (rec.assigned_to) {
    nodes.push({
      id: `assignee:${rec.assigned_to}`,
      type: 'assignee',
      label: rec.assignee_name ?? 'Assignee',
      meta: { avatar_url: rec.assignee_avatar_url },
    })
    edges.push({ from: `rec:${rec.id}`, to: `assignee:${rec.assigned_to}`, type: 'assigned_to' })
  }

  for (const o of outcomes) {
    nodes.push({
      id: `outcome:${o.id}`,
      type: 'outcome',
      label: `Day ${o.days_after_action ?? '?'}`,
      sublabel: o.metric_value != null ? `${o.metric_value}${o.metric_delta != null ? ` (${o.metric_delta > 0 ? '+' : ''}${o.metric_delta})` : ''}` : undefined,
    })
    edges.push({ from: `rec:${rec.id}`, to: `outcome:${o.id}`, type: 'measured' })
  }

  for (const e of events) {
    nodes.push({
      id: `event:${e.id}`,
      type: 'event',
      label: e.event_type,
      sublabel: e.actor_name ?? 'System',
    })
    edges.push({ from: `rec:${rec.id}`, to: `event:${e.id}`, type: 'logged' })
  }

  for (const s of similar) {
    const sid = s.metadata?.recommendation_id
    if (!sid || sid === rec.id) continue
    nodes.push({
      id: `similar:${sid}`,
      type: 'similar',
      label: String(s.metadata?.title ?? 'Similar advice').slice(0, 80),
      sublabel: `${(s.score * 100).toFixed(0)}% match`,
      meta: { recommendation_id: sid, score: s.score, period_label: s.metadata?.period_label },
    })
    edges.push({ from: `rec:${rec.id}`, to: `similar:${sid}`, type: 'related', label: 'similar' })
  }

  return { nodes, edges }
})
