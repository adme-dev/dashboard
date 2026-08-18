import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { executeGodModeAgencyClientCrmSettingsUpdate } from '~~/server/utils/clients/godModeMutations'
import {
  deriveCrmAccessPolicy,
  type EntitlementStatus,
  type LeadCaptureMode
} from '~~/server/utils/leads/crmAccessPolicy'

const LEAD_CAPTURE_MODES = new Set<LeadCaptureMode>([
  'analytics_only',
  'capture_only',
  'lightweight_crm',
  'full_crm',
  'external_crm'
])

const ENTITLEMENT_STATUSES = new Set<EntitlementStatus>([
  'trial',
  'active',
  'grace',
  'capped',
  'overdue',
  'suspended',
  'cancelled'
])

export default defineEventHandler(async (event) => {
  await requireRole(event, [...PERMISSIONS.MANAGEMENT])
  const clientId = getRouterParam(event, 'id')
  if (!clientId) {
    throw createError({ statusCode: 400, statusMessage: 'Client ID is required' })
  }

  const body = await readBody(event)
  const leadCaptureMode = body?.leadCaptureMode as LeadCaptureMode
  const crmCoreStatus = body?.crmCoreStatus as EntitlementStatus
  const crmExternalStatus = body?.crmExternalStatus as EntitlementStatus

  if (!LEAD_CAPTURE_MODES.has(leadCaptureMode)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid lead capture mode' })
  }
  if (!ENTITLEMENT_STATUSES.has(crmCoreStatus)
    || !ENTITLEMENT_STATUSES.has(crmExternalStatus)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid CRM entitlement status' })
  }

  await executeGodModeAgencyClientCrmSettingsUpdate(event, async (client) => {
    const locked = await client.query(
      `SELECT id FROM agency_clients WHERE id = $1 FOR UPDATE`,
      [clientId]
    )
    if (locked.rowCount === 0) {
      throw createError({ statusCode: 404, statusMessage: 'Client not found' })
    }

    await client.query(
      `UPDATE agency_clients
          SET lead_capture_mode = $2,
              updated_at = NOW()
        WHERE id = $1`,
      [clientId, leadCaptureMode]
    )

    for (const [featureKey, status] of [
      ['crm.core', crmCoreStatus],
      ['crm.external', crmExternalStatus]
    ] as const) {
      await client.query(
        `INSERT INTO client_feature_entitlements (client_id, feature_key, status)
         VALUES ($1, $2, $3)
         ON CONFLICT (client_id, feature_key)
         DO UPDATE SET status = EXCLUDED.status, updated_at = NOW()`,
        [clientId, featureKey, status]
      )
    }
    return { id: clientId }
  }, async (client, resultReference) => {
    const replayed = await client.query(
      `SELECT id FROM agency_clients WHERE id = $1 AND id = $2`,
      [clientId, resultReference]
    )
    if (!replayed.rows[0]) throw new Error('Replayed client no longer exists')
    return { id: replayed.rows[0].id as string }
  })

  const entitlements = {
    'crm.core': crmCoreStatus,
    'crm.external': crmExternalStatus
  }
  return {
    ok: true,
    leadCaptureMode,
    crmCoreStatus,
    crmExternalStatus,
    policy: deriveCrmAccessPolicy(leadCaptureMode, entitlements)
  }
})
