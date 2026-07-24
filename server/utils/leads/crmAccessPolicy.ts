import { queryRows } from '~~/server/utils/db'
import type { LeadCaptureMode } from '~~/server/utils/leads/acceptance'

export type EntitlementStatus
  = 'trial' | 'active' | 'grace' | 'capped' | 'overdue' | 'suspended' | 'cancelled'

export interface CrmAccessPolicy {
  mode: LeadCaptureMode
  captureLeads: boolean
  promoteInternally: boolean
  deliverExternally: boolean
  reason: string | null
}

const ACTIVE_STATUSES = new Set<EntitlementStatus>(['trial', 'active', 'grace'])

export function deriveCrmAccessPolicy(
  mode: LeadCaptureMode,
  entitlements: Partial<Record<'crm.core' | 'crm.external', EntitlementStatus>>
): CrmAccessPolicy {
  if (mode === 'analytics_only') {
    return { mode, captureLeads: false, promoteInternally: false, deliverExternally: false, reason: 'analytics_only' }
  }
  if (mode === 'capture_only') {
    return { mode, captureLeads: true, promoteInternally: false, deliverExternally: false, reason: null }
  }
  if (mode === 'external_crm') {
    const enabled = ACTIVE_STATUSES.has(entitlements['crm.external'] as EntitlementStatus)
    return {
      mode,
      captureLeads: true,
      promoteInternally: false,
      deliverExternally: enabled,
      reason: enabled ? null : 'external_crm_entitlement_inactive'
    }
  }
  const enabled = ACTIVE_STATUSES.has(entitlements['crm.core'] as EntitlementStatus)
  return {
    mode,
    captureLeads: true,
    promoteInternally: enabled,
    deliverExternally: false,
    reason: enabled ? null : 'crm_entitlement_inactive'
  }
}

export async function resolveCrmAccessPolicy(
  clientId: string,
  mode: LeadCaptureMode
): Promise<CrmAccessPolicy> {
  const rows = await queryRows<{ feature_key: 'crm.core' | 'crm.external', status: EntitlementStatus }>(
    `SELECT feature_key, status
       FROM client_feature_entitlements
      WHERE client_id = $1
        AND feature_key = ANY($2::text[])`,
    [clientId, ['crm.core', 'crm.external']]
  )
  const entitlements = Object.fromEntries(rows.map(row => [row.feature_key, row.status]))
  return deriveCrmAccessPolicy(mode, entitlements)
}
