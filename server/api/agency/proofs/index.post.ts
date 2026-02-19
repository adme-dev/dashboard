/**
 * Create Creative Proof
 * POST /api/agency/proofs
 */

import { queryOne, queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

interface ProofAsset {
  fileName: string
  fileType?: string
  fileSize?: number
  fileUrl: string
  thumbnailUrl?: string
  sortOrder?: number
}

interface ProofApprover {
  type: 'team_member' | 'client_contact' | 'email'
  teamMemberId?: string
  clientContactId?: string
  email?: string
  name?: string
  role?: string
}

interface CreateProofBody {
  projectId: string
  taskId?: string
  name: string
  description?: string
  proofType?: string
  dueDate?: string
  isUrgent?: boolean
  requiresAllApprovers?: boolean
  allowComments?: boolean
  allowAnnotations?: boolean
  assets?: ProofAsset[]
  approvers?: ProofApprover[]
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody<CreateProofBody>(event)

  // Validation
  if (!body.projectId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Project ID is required'
    })
  }

  if (!body.name?.trim()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Proof name is required'
    })
  }

  try {
    // Verify project exists
    const project = await queryOne(`
      SELECT id FROM projects WHERE id = $1
    `, [body.projectId])

    if (!project) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Project not found'
      })
    }

    // Create proof
    const proof = await queryOne(`
      INSERT INTO creative_proofs (
        project_id,
        task_id,
        created_by,
        name,
        description,
        proof_type,
        due_date,
        is_urgent,
        requires_all_approvers,
        allow_comments,
        allow_annotations,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'draft')
      RETURNING *
    `, [
      body.projectId,
      body.taskId || null,
      user.id,
      body.name.trim(),
      body.description || null,
      body.proofType || 'design',
      body.dueDate || null,
      body.isUrgent || false,
      body.requiresAllApprovers || false,
      body.allowComments ?? true,
      body.allowAnnotations ?? true
    ])

    // Add assets
    const assets: any[] = []
    if (body.assets && body.assets.length > 0) {
      for (let i = 0; i < body.assets.length; i++) {
        const asset = body.assets[i]!
        const created = await queryOne(`
          INSERT INTO proof_assets (
            proof_id,
            file_name,
            file_type,
            file_size,
            file_url,
            thumbnail_url,
            sort_order
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING *
        `, [
          proof.id,
          asset.fileName,
          asset.fileType || null,
          asset.fileSize || null,
          asset.fileUrl,
          asset.thumbnailUrl || null,
          asset.sortOrder ?? i
        ])
        assets.push(created)
      }
    }

    // Add approvers
    const approvers: any[] = []
    if (body.approvers && body.approvers.length > 0) {
      for (const approver of body.approvers) {
        // Generate access token
        const accessToken = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')

        const created = await queryOne(`
          INSERT INTO proof_approvers (
            proof_id,
            approver_type,
            team_member_id,
            client_contact_id,
            email,
            name,
            role,
            access_token
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *
        `, [
          proof.id,
          approver.type,
          approver.teamMemberId || null,
          approver.clientContactId || null,
          approver.email || null,
          approver.name || null,
          approver.role || null,
          accessToken
        ])
        approvers.push(created)
      }
    }

    // Log activity
    await queryOne(`
      INSERT INTO proof_activities (
        proof_id,
        actor_type,
        team_member_id,
        activity_type,
        description
      ) VALUES ($1, 'team_member', $2, 'created', 'Proof created')
    `, [proof.id, user.id])

    return {
      success: true,
      proof: {
        id: proof.id,
        name: proof.name,
        description: proof.description,
        proofType: proof.proof_type,
        version: proof.version,
        status: proof.status,
        dueDate: proof.due_date,
        isUrgent: proof.is_urgent,
        projectId: proof.project_id,
        taskId: proof.task_id,
        settings: {
          requiresAllApprovers: proof.requires_all_approvers,
          allowComments: proof.allow_comments,
          allowAnnotations: proof.allow_annotations
        },
        createdAt: proof.created_at
      },
      assets: assets.map(a => ({
        id: a.id,
        fileName: a.file_name,
        fileType: a.file_type,
        fileSize: a.file_size,
        fileUrl: a.file_url,
        thumbnailUrl: a.thumbnail_url
      })),
      approvers: approvers.map(a => ({
        id: a.id,
        type: a.approver_type,
        teamMemberId: a.team_member_id,
        clientContactId: a.client_contact_id,
        email: a.email,
        name: a.name,
        role: a.role,
        status: a.status
      }))
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to create proof:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create proof'
    })
  }
})
