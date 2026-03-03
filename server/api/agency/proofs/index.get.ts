/**
 * List Creative Proofs
 * GET /api/agency/proofs
 *
 * Query params:
 * - projectId: Filter by project
 * - status: Filter by status
 * - proofType: Filter by type
 * - createdBy: Filter by creator
 * - search: Search by name
 */

import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const query = getQuery(event)

  try {
    const conditions: string[] = []
    const params: any[] = []
    let idx = 1

    if (query.projectId) {
      conditions.push(`cp.project_id = $${idx++}`)
      params.push(query.projectId)
    }

    if (query.status) {
      conditions.push(`cp.status = $${idx++}`)
      params.push(query.status)
    }

    if (query.proofType) {
      conditions.push(`cp.proof_type = $${idx++}`)
      params.push(query.proofType)
    }

    if (query.createdBy) {
      conditions.push(`cp.created_by = $${idx++}`)
      params.push(query.createdBy)
    }

    if (query.search) {
      conditions.push(`cp.name ILIKE $${idx++}`)
      params.push(`%${query.search}%`)
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : ''

    const proofs = await queryRows(`
      SELECT
        cp.id,
        cp.name,
        cp.description,
        cp.proof_type,
        cp.version,
        cp.status,
        cp.due_date,
        cp.is_urgent,
        cp.project_id,
        p.name AS project_name,
        cp.task_id,
        t.title AS task_name,
        c.id AS client_id,
        c.name AS client_name,
        cp.created_by,
        tm.name AS created_by_name,
        cp.share_token,
        cp.public_link_enabled,
        cp.view_count,
        cp.created_at,
        cp.updated_at,
        (SELECT COUNT(*) FROM proof_assets WHERE proof_id = cp.id) AS asset_count,
        (SELECT COUNT(*) FROM proof_approvers WHERE proof_id = cp.id) AS approver_count,
        (SELECT COUNT(*) FROM proof_approvers WHERE proof_id = cp.id AND status = 'approved') AS approved_count,
        (SELECT COUNT(*) FROM proof_approvers WHERE proof_id = cp.id AND status = 'changes_requested') AS changes_requested_count,
        (SELECT COUNT(*) FROM proof_comments WHERE proof_id = cp.id AND is_internal = false) AS comment_count,
        (SELECT COUNT(*) FROM proof_comments WHERE proof_id = cp.id AND is_resolved = false AND is_internal = false) AS unresolved_count
      FROM creative_proofs cp
      LEFT JOIN projects p ON cp.project_id = p.id
      LEFT JOIN agency_clients c ON p.client_id = c.id
      LEFT JOIN tasks t ON cp.task_id = t.id
      LEFT JOIN team_members tm ON cp.created_by = tm.id
      ${whereClause}
      ORDER BY cp.is_urgent DESC, cp.due_date, cp.created_at DESC
    `, params)

    // Group by status for summary
    const byStatus = new Map<string, number>()
    for (const proof of proofs) {
      const count = byStatus.get(proof.status) || 0
      byStatus.set(proof.status, count + 1)
    }

    return {
      proofs: proofs.map(p => ({
        id: p.id,
        name: p.name,
        description: p.description,
        proofType: p.proof_type,
        version: p.version,
        status: p.status,
        dueDate: p.due_date,
        isUrgent: p.is_urgent,
        project: {
          id: p.project_id,
          name: p.project_name
        },
        task: p.task_id ? {
          id: p.task_id,
          name: p.task_name
        } : null,
        client: p.client_id ? {
          id: p.client_id,
          name: p.client_name
        } : null,
        createdBy: p.created_by ? {
          id: p.created_by,
          name: p.created_by_name
        } : null,
        shareToken: p.share_token,
        publicLinkEnabled: p.public_link_enabled,
        viewCount: p.view_count,
        stats: {
          assets: Number(p.asset_count),
          approvers: Number(p.approver_count),
          approved: Number(p.approved_count),
          changesRequested: Number(p.changes_requested_count),
          comments: Number(p.comment_count),
          unresolvedComments: Number(p.unresolved_count)
        },
        createdAt: p.created_at,
        updatedAt: p.updated_at
      })),
      summary: {
        total: proofs.length,
        byStatus: Object.fromEntries(byStatus)
      }
    }
  } catch (error: any) {
    // If tables don't exist yet, return empty results
    if (error?.message?.includes('does not exist') || error?.message?.includes('relation')) {
      return {
        proofs: [],
        summary: { total: 0, byStatus: {} }
      }
    }
    console.error('Failed to fetch proofs:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch proofs'
    })
  }
})
