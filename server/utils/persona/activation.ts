import { queryOne, queryRows, transaction } from '~~/server/utils/db'
import type { PersonaMetricsFilters } from '~~/server/utils/persona/metrics'
import { getCachedPersonaMetrics } from '~~/server/utils/persona/snapshots'

export type PersonaAudienceProvider = 'google_ads' | 'meta'
export type PersonaActivationAction = 'approve_privacy' | 'approve_live' | 'reject' | 'cancel'

interface ActivationRow {
  id: string
  clientId: string
  provider: PersonaAudienceProvider
  name: string
  filters: PersonaMetricsFilters
  estimatedSize: number
  minimumSize: number
  status: string
  blockedReason: string | null
  expiresAt: string
  createdBy: string
  approvedAt: string | null
  createdAt: string
  updatedAt: string
  privacyApprovedBy: string | null
  liveApprovedBy: string | null
}

function minimumAudienceSize(): number {
  const configured = Number(process.env.PERSONA_MIN_AUDIENCE_SIZE)
  return Number.isInteger(configured) && configured >= 100 ? configured : 1000
}

export async function listPersonaActivationRequests(clientId: string): Promise<ActivationRow[]> {
  return queryRows<ActivationRow>(
    `SELECT request.id,
            request.client_id AS "clientId",
            request.provider,
            request.name,
            request.filters,
            request.estimated_size AS "estimatedSize",
            request.minimum_size AS "minimumSize",
            CASE
              WHEN request.expires_at <= NOW()
               AND request.status NOT IN ('rejected', 'cancelled', 'expired')
                THEN 'expired'
              ELSE request.status
            END AS status,
            request.blocked_reason AS "blockedReason",
            request.expires_at AS "expiresAt",
            request.created_by AS "createdBy",
            request.approved_at AS "approvedAt",
            request.created_at AS "createdAt",
            request.updated_at AS "updatedAt",
            MAX(approval.approved_by::text) FILTER (
              WHERE approval.approval_kind = 'privacy'
            ) AS "privacyApprovedBy",
            MAX(approval.approved_by::text) FILTER (
              WHERE approval.approval_kind = 'live'
            ) AS "liveApprovedBy"
       FROM crm_persona_audience_activation_requests request
       LEFT JOIN crm_persona_audience_activation_approvals approval
         ON approval.client_id = request.client_id
        AND approval.request_id = request.id
      WHERE request.client_id = $1
      GROUP BY request.id
      ORDER BY request.created_at DESC
      LIMIT 100`,
    [clientId]
  )
}

export async function createPersonaActivationRequest(input: {
  clientId: string
  provider: PersonaAudienceProvider
  name: string
  filters: PersonaMetricsFilters
  expiresAt: string
  actorId: string
}) {
  const projection = await getCachedPersonaMetrics(input.clientId, input.filters)
  if (!projection.enabled || !projection.metrics) {
    throw createError({ statusCode: 409, statusMessage: 'Persona Identity is not enabled for this client' })
  }

  const estimatedSize = projection.metrics.totalPersonas
  const minimumSize = minimumAudienceSize()
  const blockedReason = estimatedSize < minimumSize
    ? `Cohort contains ${estimatedSize} personas; the privacy threshold is ${minimumSize}.`
    : null
  const status = blockedReason ? 'blocked' : 'pending_privacy'
  const row = await queryOne<{ id: string }>(
    `INSERT INTO crm_persona_audience_activation_requests (
       client_id, provider, name, filters, estimated_size, minimum_size,
       status, blocked_reason, expires_at, created_by
     ) VALUES (
       $1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9::timestamptz, $10
     )
     RETURNING id`,
    [
      input.clientId,
      input.provider,
      input.name,
      JSON.stringify(input.filters),
      estimatedSize,
      minimumSize,
      status,
      blockedReason,
      input.expiresAt,
      input.actorId
    ]
  )
  if (!row) throw new Error('Persona activation request was not created')

  await queryOne(
    `INSERT INTO crm_persona_audience_activation_audit (
       client_id, request_id, action, actor_id, reason, metadata
     ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     RETURNING id`,
    [
      input.clientId,
      row.id,
      blockedReason ? 'blocked' : 'created',
      input.actorId,
      blockedReason ?? 'Audience activation request created for privacy review',
      JSON.stringify({ provider: input.provider, estimatedSize, minimumSize })
    ]
  )
  return { id: row.id, status, estimatedSize, minimumSize, blockedReason }
}

export async function transitionPersonaActivationRequest(input: {
  clientId: string
  requestId: string
  action: PersonaActivationAction
  reason: string
  actorId: string
}) {
  return transaction(async db => {
    const result = await db.query(
      `SELECT id, status, expires_at
         FROM crm_persona_audience_activation_requests
        WHERE id = $1 AND client_id = $2
        FOR UPDATE`,
      [input.requestId, input.clientId]
    )
    const request = result.rows?.[0] as {
      id: string
      status: string
      expires_at: string
    } | undefined
    if (!request) throw createError({ statusCode: 404, statusMessage: 'Activation request not found' })
    if (new Date(request.expires_at).getTime() <= Date.now()) {
      throw createError({ statusCode: 409, statusMessage: 'Activation request has expired' })
    }

    let nextStatus: string
    let approvalKind: 'privacy' | 'live' | null = null
    let auditAction: 'privacy_approved' | 'live_approved' | 'rejected' | 'cancelled'
    if (input.action === 'approve_privacy') {
      if (request.status !== 'pending_privacy') {
        throw createError({ statusCode: 409, statusMessage: 'Privacy approval is not available for this request' })
      }
      nextStatus = 'privacy_approved'
      approvalKind = 'privacy'
      auditAction = 'privacy_approved'
    } else if (input.action === 'approve_live') {
      if (request.status !== 'privacy_approved') {
        throw createError({ statusCode: 409, statusMessage: 'Privacy approval is required first' })
      }
      const privacyApprovalResult = await db.query(
        `SELECT approved_by
           FROM crm_persona_audience_activation_approvals
          WHERE client_id = $1
            AND request_id = $2
            AND approval_kind = 'privacy'
          LIMIT 1`,
        [input.clientId, input.requestId]
      )
      const privacyApprover = privacyApprovalResult.rows?.[0] as { approved_by: string } | undefined
      if (privacyApprover?.approved_by === input.actorId) {
        throw createError({
          statusCode: 409,
          statusMessage: 'A different owner or admin must provide live approval'
        })
      }
      nextStatus = 'approved'
      approvalKind = 'live'
      auditAction = 'live_approved'
    } else if (input.action === 'reject') {
      if (!['pending_privacy', 'privacy_approved'].includes(request.status)) {
        throw createError({ statusCode: 409, statusMessage: 'Request cannot be rejected in its current state' })
      }
      nextStatus = 'rejected'
      auditAction = 'rejected'
    } else {
      if (!['pending_privacy', 'privacy_approved', 'approved'].includes(request.status)) {
        throw createError({ statusCode: 409, statusMessage: 'Request cannot be cancelled in its current state' })
      }
      nextStatus = 'cancelled'
      auditAction = 'cancelled'
    }

    if (approvalKind) {
      await db.query(
        `INSERT INTO crm_persona_audience_activation_approvals (
           client_id, request_id, approval_kind, approved_by, reason
         ) VALUES ($1, $2, $3, $4, $5)`,
        [input.clientId, input.requestId, approvalKind, input.actorId, input.reason]
      )
    }
    await db.query(
      `UPDATE crm_persona_audience_activation_requests
          SET status = $3,
              approved_at = CASE WHEN $3 = 'approved' THEN NOW() ELSE approved_at END,
              updated_at = NOW()
        WHERE id = $1 AND client_id = $2`,
      [input.requestId, input.clientId, nextStatus]
    )
    await db.query(
      `INSERT INTO crm_persona_audience_activation_audit (
         client_id, request_id, action, actor_id, reason
       ) VALUES ($1, $2, $3, $4, $5)`,
      [input.clientId, input.requestId, auditAction, input.actorId, input.reason]
    )
    return { id: input.requestId, status: nextStatus, exportReady: nextStatus === 'approved' }
  })
}
