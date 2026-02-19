/**
 * Create Approval Request
 * POST /api/agency/client-portal/approvals
 *
 * Body:
 * - projectId: Project ID
 * - taskId: Optional task ID
 * - invoiceId: Optional invoice ID
 * - approvalType: Type of approval
 * - title: Approval title
 * - description: Optional description
 * - attachments: Optional attachments array
 * - dueDate: Optional due date
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { sendClientApprovalRequestEmail } from '~~/server/utils/email'
import { randomBytes } from 'crypto'

interface CreateApprovalBody {
  projectId: string
  taskId?: string
  invoiceId?: string
  approvalType: 'deliverable' | 'milestone' | 'design' | 'content' | 'budget_change' | 'scope_change' | 'invoice'
  title: string
  description?: string
  attachments?: Array<{ name: string; url: string; type: string }>
  dueDate?: string
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody<CreateApprovalBody>(event)

  const { projectId, approvalType, title } = body

  if (!projectId || !approvalType || !title) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Project ID, approval type, and title are required'
    })
  }

  try {
    // Verify project exists and get client
    const project = await queryOne(`
      SELECT
        p.id,
        p.name,
        p.client_id,
        c.name as client_name
      FROM projects p
      JOIN agency_clients c ON p.client_id = c.id
      WHERE p.id = $1
    `, [projectId])

    if (!project) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Project not found'
      })
    }

    // Generate approval token (valid for 72 hours by default)
    const approvalToken = randomBytes(32).toString('hex')
    const tokenExpiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000)

    // Create approval with token
    const approval = await queryOne(`
      INSERT INTO client_approvals (
        approval_type,
        project_id,
        task_id,
        invoice_id,
        title,
        description,
        attachments,
        due_date,
        requested_by,
        approval_token,
        token_expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      approvalType,
      projectId,
      body.taskId || null,
      body.invoiceId || null,
      title,
      body.description || null,
      JSON.stringify(body.attachments || []),
      body.dueDate || null,
      user.id,
      approvalToken,
      tokenExpiresAt.toISOString()
    ])

    // Build the public approval URL
    const config = useRuntimeConfig()
    const baseUrl = config.public?.appUrl || process.env.NUXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const approvalUrl = `${baseUrl}/approve/${approvalToken}`

    // Get client users who can approve
    const approvers = await queryOne(`
      SELECT
        cu.id,
        cu.email,
        cu.name
      FROM client_users cu
      WHERE cu.client_id = $1
        AND cu.status = 'active'
        AND cu.can_approve_work = true
      LIMIT 1
    `, [project.client_id])

    // Create notification for client users
    if (approvers) {
      await queryOne(`
        INSERT INTO client_notifications (
          client_user_id,
          type,
          title,
          message,
          action_url,
          project_id,
          approval_id
        ) VALUES ($1, 'approval_requested', $2, $3, $4, $5, $6)
      `, [
        approvers.id,
        `Approval Required: ${title}`,
        `${user.name} has requested your approval for ${approvalType} on ${project.name}`,
        `/client-portal/approvals/${approval.id}`,
        projectId,
        approval.id
      ])

      // Send email with public approval link
      try {
        await sendClientApprovalRequestEmail({
          to: approvers.email,
          clientName: approvers.name,
          approvalTitle: title,
          projectName: project.name,
          approvalType,
          requesterName: user.name || 'A team member',
          description: body.description,
          dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
          approvalUrl,
          expiresAt: tokenExpiresAt
        })
      } catch (emailError) {
        console.error('Failed to send approval request email:', emailError)
      }
    }

    return {
      success: true,
      approval: {
        id: approval.id,
        approvalType: approval.approval_type,
        title: approval.title,
        description: approval.description,
        attachments: approval.attachments,
        status: approval.status,
        dueDate: approval.due_date,
        requestedAt: approval.requested_at,
        projectId: project.id,
        projectName: project.name,
        clientId: project.client_id,
        clientName: project.client_name,
        approvalUrl,
        tokenExpiresAt: tokenExpiresAt.toISOString()
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to create approval:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create approval'
    })
  }
})
