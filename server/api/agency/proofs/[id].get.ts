/**
 * Get Creative Proof Details
 * GET /api/agency/proofs/:id
 */

import { queryOne, queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const proofId = getRouterParam(event, 'id')

  if (!proofId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Proof ID is required'
    })
  }

  try {
    // Get proof with related data
    const proof = await queryOne(`
      SELECT
        cp.*,
        p.name AS project_name,
        c.id AS client_id,
        c.name AS client_name,
        t.title AS task_name,
        tm.name AS created_by_name
      FROM creative_proofs cp
      LEFT JOIN projects p ON cp.project_id = p.id
      LEFT JOIN agency_clients c ON p.client_id = c.id
      LEFT JOIN tasks t ON cp.task_id = t.id
      LEFT JOIN team_members tm ON cp.created_by = tm.id
      WHERE cp.id = $1
    `, [proofId])

    if (!proof) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Proof not found'
      })
    }

    // Get assets
    const assets = await queryRows(`
      SELECT * FROM proof_assets
      WHERE proof_id = $1
      ORDER BY sort_order
    `, [proofId])

    // Get approvers
    const approvers = await queryRows(`
      SELECT
        pa.*,
        tm.name AS team_member_name,
        tm.email AS team_member_email,
        cc.name AS contact_name,
        cc.email AS contact_email
      FROM proof_approvers pa
      LEFT JOIN team_members tm ON pa.team_member_id = tm.id
      LEFT JOIN client_users cc ON pa.client_contact_id = cc.id
      WHERE pa.proof_id = $1
      ORDER BY pa.created_at
    `, [proofId])

    // Get comments (non-internal only for now, could add flag)
    const comments = await queryRows(`
      SELECT
        pc.*,
        tm.name AS team_member_name,
        cc.name AS contact_name,
        resolver.name AS resolved_by_name
      FROM proof_comments pc
      LEFT JOIN team_members tm ON pc.team_member_id = tm.id
      LEFT JOIN client_users cc ON pc.client_contact_id = cc.id
      LEFT JOIN team_members resolver ON pc.resolved_by = resolver.id
      WHERE pc.proof_id = $1 AND pc.is_internal = false
      ORDER BY pc.created_at
    `, [proofId])

    // Get recent activity
    const activities = await queryRows(`
      SELECT
        pa.*,
        tm.name AS team_member_name,
        cc.name AS contact_name
      FROM proof_activities pa
      LEFT JOIN team_members tm ON pa.team_member_id = tm.id
      LEFT JOIN client_users cc ON pa.client_contact_id = cc.id
      WHERE pa.proof_id = $1
      ORDER BY pa.created_at DESC
      LIMIT 20
    `, [proofId])

    // Get version history
    const versions = await queryRows(`
      SELECT
        cp.id,
        cp.version,
        cp.status,
        cp.created_at,
        tm.name AS created_by_name,
        (SELECT COUNT(*) FROM proof_comments WHERE proof_id = cp.id) AS comment_count
      FROM creative_proofs cp
      LEFT JOIN team_members tm ON cp.created_by = tm.id
      WHERE cp.id = $1 OR cp.parent_proof_id = $1
         OR cp.parent_proof_id = (SELECT parent_proof_id FROM creative_proofs WHERE id = $1)
      ORDER BY cp.version DESC
    `, [proofId])

    // Update view count
    await queryOne(`
      UPDATE creative_proofs
      SET view_count = view_count + 1, last_viewed_at = NOW()
      WHERE id = $1
    `, [proofId])

    return {
      proof: {
        id: proof.id,
        name: proof.name,
        description: proof.description,
        proofType: proof.proof_type,
        version: proof.version,
        status: proof.status,
        dueDate: proof.due_date,
        isUrgent: proof.is_urgent,
        project: {
          id: proof.project_id,
          name: proof.project_name
        },
        task: proof.task_id ? {
          id: proof.task_id,
          name: proof.task_name
        } : null,
        client: proof.client_id ? {
          id: proof.client_id,
          name: proof.client_name
        } : null,
        createdBy: proof.created_by ? {
          id: proof.created_by,
          name: proof.created_by_name
        } : null,
        settings: {
          requiresAllApprovers: proof.requires_all_approvers,
          allowComments: proof.allow_comments,
          allowAnnotations: proof.allow_annotations,
          passwordProtected: proof.password_protected
        },
        sharing: {
          shareToken: proof.share_token,
          shareExpiresAt: proof.share_expires_at,
          publicLinkEnabled: proof.public_link_enabled
        },
        viewCount: proof.view_count,
        lastViewedAt: proof.last_viewed_at,
        createdAt: proof.created_at,
        updatedAt: proof.updated_at
      },
      assets: assets.map(a => ({
        id: a.id,
        fileName: a.file_name,
        fileType: a.file_type,
        fileSize: a.file_size,
        fileUrl: a.file_url,
        thumbnailUrl: a.thumbnail_url,
        sortOrder: a.sort_order,
        pageCount: a.page_count,
        durationSeconds: a.duration_seconds,
        dimensions: a.dimensions,
        processingStatus: a.processing_status
      })),
      approvers: approvers.map(a => ({
        id: a.id,
        type: a.approver_type,
        teamMember: a.team_member_id ? {
          id: a.team_member_id,
          name: a.team_member_name,
          email: a.team_member_email
        } : null,
        clientContact: a.client_contact_id ? {
          id: a.client_contact_id,
          name: a.contact_name,
          email: a.contact_email
        } : null,
        email: a.email,
        name: a.name,
        role: a.role,
        status: a.status,
        decisionAt: a.decision_at,
        decisionComment: a.decision_comment,
        invitedAt: a.invited_at,
        lastAccessedAt: a.last_accessed_at
      })),
      comments: comments.map(c => ({
        id: c.id,
        assetId: c.asset_id,
        parentCommentId: c.parent_comment_id,
        author: {
          type: c.author_type,
          teamMemberId: c.team_member_id,
          teamMemberName: c.team_member_name,
          clientContactId: c.client_contact_id,
          contactName: c.contact_name,
          guestName: c.guest_name,
          guestEmail: c.guest_email
        },
        content: c.content,
        annotation: c.annotation_type ? {
          type: c.annotation_type,
          data: c.annotation_data
        } : null,
        timestamp: c.timestamp_start ? {
          start: c.timestamp_start,
          end: c.timestamp_end
        } : null,
        isResolved: c.is_resolved,
        resolvedBy: c.resolved_by ? {
          id: c.resolved_by,
          name: c.resolved_by_name
        } : null,
        resolvedAt: c.resolved_at,
        createdAt: c.created_at
      })),
      activities: activities.map(a => ({
        id: a.id,
        actorType: a.actor_type,
        teamMemberName: a.team_member_name,
        contactName: a.contact_name,
        guestName: a.guest_name,
        activityType: a.activity_type,
        description: a.description,
        metadata: a.metadata,
        createdAt: a.created_at
      })),
      versions: versions.map(v => ({
        id: v.id,
        version: v.version,
        status: v.status,
        createdByName: v.created_by_name,
        commentCount: Number(v.comment_count),
        createdAt: v.created_at,
        isCurrent: v.id === proofId
      }))
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to fetch proof:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch proof'
    })
  }
})
