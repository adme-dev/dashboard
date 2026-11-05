import { createError } from 'h3'
import { z } from 'zod'
import { transaction } from '~~/server/utils/db'
import type { RunPageStudioTransaction } from '~~/server/utils/pageStudio/sites'

const Count = z.number().int().min(0).max(2147483647)
const Request = z.object({
  requestId: z.string().uuid(),
  clientId: z.string().uuid(),
  expectedSiteLimit: Count,
  siteLimit: Count,
  reason: z.string().trim().min(3).max(1000)
}).strict().refine(value => value.siteLimit > value.expectedSiteLimit, 'Only capacity increases are supported')
const Receipt = z.object({
  id: z.string().uuid(), tenantId: z.string(), clientId: z.string().uuid(),
  previousSiteLimit: Count, siteLimit: Count
}).strict()

/** Adjust manually granted access only; never a subscription or provider charge. */
export async function increasePageStudioManualCapacity(
  input: { actorId: string, tenantId: string, entitlementId: string, body: unknown },
  runTransaction: RunPageStudioTransaction = transaction
) {
  const parsed = Request.safeParse(input.body)
  if (!parsed.success || !z.string().uuid().safeParse(input.entitlementId).success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid manual website capacity request' })
  }
  const request = parsed.data
  return runTransaction(async (db) => {
    // Match grant serialization, including requests for another entitlement of this client.
    const client = await db.query('SELECT id FROM agency_clients WHERE id=$1 AND is_active=true FOR UPDATE', [request.clientId])
    if (!client.rows.length) throw createError({ statusCode: 404, statusMessage: 'Active client not found' })
    const audit = await db.query<{ actor_id: string, metadata: { request: unknown, entitlement: unknown } }>(`
      SELECT actor_id, metadata FROM billing_entitlement_audit
      WHERE client_id=$1 AND feature_key='page_studio.access' AND source='page_studio_entitlements'
        AND action='manual_capacity_increased' AND metadata->>'tenantId'=$2 AND metadata->>'requestId'=$3
      LIMIT 2`, [request.clientId, input.tenantId, request.requestId])
    if (audit.rows.length) {
      const saved = audit.rows[0]!
      const previous = Request.safeParse(saved.metadata?.request)
      const receipt = Receipt.safeParse(saved.metadata?.entitlement)
      if (audit.rows.length !== 1 || saved.actor_id !== input.actorId || !previous.success || !receipt.success
        || JSON.stringify(previous.data) !== JSON.stringify(request) || receipt.data.id !== input.entitlementId
        || receipt.data.tenantId !== input.tenantId || receipt.data.clientId !== request.clientId
        || receipt.data.previousSiteLimit !== request.expectedSiteLimit || receipt.data.siteLimit !== request.siteLimit) {
        throw createError({ statusCode: 409, statusMessage: 'Capacity request was already used with different terms' })
      }
      return { entitlement: receipt.data, replayed: true }
    }
    // The original manual grant audit is required as well as current management metadata.
    // Platform/customer plans cannot be converted into manual plans through this route.
    const updated = await db.query<{ id: string }>(`UPDATE page_studio_entitlements AS entitlement
      SET active_site_limit=$4, updated_at=clock_timestamp()
      WHERE entitlement.id=$1 AND entitlement.tenant_id=$2 AND entitlement.client_id=$3
        AND entitlement.active_site_limit=$5 AND entitlement.status IN ('active','trial')
        AND entitlement.effective_from<=NOW() AND (entitlement.effective_until IS NULL OR entitlement.effective_until>NOW())
        AND entitlement.plan_metadata->>'managedBy'='agency'
        AND EXISTS (SELECT 1 FROM billing_entitlement_audit AS grant_audit
          WHERE grant_audit.client_id=entitlement.client_id AND grant_audit.feature_key='page_studio.access'
            AND grant_audit.source='page_studio_entitlements' AND grant_audit.action='grant_created'
            AND grant_audit.metadata->>'tenantId'=entitlement.tenant_id
            AND grant_audit.metadata->'entitlement'->>'id'=entitlement.id::text)
      RETURNING entitlement.id`, [input.entitlementId, input.tenantId, request.clientId, request.siteLimit, request.expectedSiteLimit])
    if (updated.rows.length !== 1) throw createError({ statusCode: 409, statusMessage: 'Active manual access or expected capacity no longer matches' })
    const entitlement = Receipt.parse({
      id: input.entitlementId, tenantId: input.tenantId, clientId: request.clientId,
      previousSiteLimit: request.expectedSiteLimit, siteLimit: request.siteLimit
    })
    await db.query(`INSERT INTO billing_entitlement_audit
      (client_id, feature_key, action, actor_id, source, metadata)
      VALUES ($1,'page_studio.access','manual_capacity_increased',$2,'page_studio_entitlements',$3::jsonb)`, [
      request.clientId, input.actorId,
      JSON.stringify({ tenantId: input.tenantId, requestId: request.requestId, request, entitlement })
    ])
    return { entitlement, replayed: false }
  })
}
