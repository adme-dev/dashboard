import { requireAuth } from '~~/server/utils/auth'
import { queryRows, queryOne } from '~~/server/utils/db'
import { buildReconcileCandidates } from '~~/server/utils/xeroReconcile'

/**
 * GET /api/agency/clients/reconcile/candidates
 * Active Xero customers not yet represented in agency_clients, with a
 * deterministic prefix-match to an existing client where possible.
 */
export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const customers = await queryRows<{ contact_id: string; name: string; tenant_id: string; receivable_outstanding_cents: string }>(
    `SELECT contact_id, name, tenant_id, receivable_outstanding_cents
     FROM xero_contacts_cache
     WHERE is_customer AND status = 'ACTIVE'`
  )
  const clients = await queryRows<{ id: string; name: string }>(
    `SELECT id, name FROM agency_clients WHERE is_active = true ORDER BY name`
  )
  const linked = await queryRows<{ xero_contact_id: string }>(`SELECT xero_contact_id FROM client_xero_contacts`)
  const linkedSet = new Set(linked.map((l) => l.xero_contact_id))

  const candidates = buildReconcileCandidates(
    customers.map((c) => ({
      contactId: c.contact_id, name: c.name, tenantId: c.tenant_id,
      receivableCents: Number(c.receivable_outstanding_cents) || 0
    })),
    clients,
    linkedSet
  )

  const lastSynced = await queryOne<{ last: string | null }>(`SELECT MAX(synced_at) AS last FROM xero_contacts_cache`)

  return {
    prefixMatched: candidates.filter((c) => c.matchedClientId),
    unresolved: candidates.filter((c) => !c.matchedClientId),
    clients,
    lastSyncedAt: lastSynced?.last ?? null
  }
})
