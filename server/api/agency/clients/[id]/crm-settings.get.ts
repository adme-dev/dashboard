import { queryOne, queryRows } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import {
  deriveCrmAccessPolicy,
  type EntitlementStatus,
  type LeadCaptureMode
} from '~~/server/utils/leads/crmAccessPolicy'

interface ClientRow {
  id: string
  lead_capture_mode: LeadCaptureMode
}

interface EntitlementRow {
  feature_key: 'crm.core' | 'crm.external'
  status: EntitlementStatus
}

export default defineEventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.CLIENTS)
  const clientId = getRouterParam(event, 'id')
  if (!clientId) {
    throw createError({ statusCode: 400, statusMessage: 'Client ID is required' })
  }

  const client = await queryOne<ClientRow>(
    `SELECT id, lead_capture_mode
       FROM agency_clients
      WHERE id = $1`,
    [clientId]
  )
  if (!client) {
    throw createError({ statusCode: 404, statusMessage: 'Client not found' })
  }

  const rows = await queryRows<EntitlementRow>(
    `SELECT feature_key, status
       FROM client_feature_entitlements
      WHERE client_id = $1
        AND feature_key IN ('crm.core', 'crm.external')`,
    [clientId]
  )
  const entitlements = Object.fromEntries(
    rows.map(row => [row.feature_key, row.status])
  ) as Partial<Record<'crm.core' | 'crm.external', EntitlementStatus>>

  return {
    leadCaptureMode: client.lead_capture_mode || 'capture_only',
    crmCoreStatus: entitlements['crm.core'] || 'suspended',
    crmExternalStatus: entitlements['crm.external'] || 'suspended',
    policy: deriveCrmAccessPolicy(client.lead_capture_mode || 'capture_only', entitlements)
  }
})
