import { createError } from 'h3'
import { z } from 'zod'
import { transaction } from '~~/server/utils/db'
import type { RunPageStudioTransaction } from '~~/server/utils/pageStudio/sites'

const Count = z.number().int().min(0).max(2147483647)
const Bytes = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
const Timestamp = z.string().datetime({ offset: true }).transform(value => new Date(value).toISOString())
export const PAGE_STUDIO_ACCESS_MODULES = ['business-content', 'bookings', 'enquiries', 'catalogue', 'delivery', 'inventory', 'orders'] as const

export const PageStudioEntitlementGrantBody = z.object({
  requestId: z.string().uuid(),
  clientId: z.string().uuid(),
  planKey: z.string().trim().min(2).max(80).regex(/^[a-z][a-z0-9._-]+$/),
  status: z.enum(['trial', 'active']),
  effectiveFrom: Timestamp,
  effectiveUntil: Timestamp.nullable(),
  portalCreationEnabled: z.boolean(),
  allowedModules: z.array(z.enum(PAGE_STUDIO_ACCESS_MODULES)).min(1).max(7)
    .refine(value => value.includes('business-content') && new Set(value).size === value.length, 'Select business content and avoid duplicate modules')
    .transform(value => [...value].sort()),
  siteLimit: Count,
  pagesPerSiteLimit: Count.min(1),
  storageBytesLimit: Bytes,
  domainLimit: Count,
  aiOperationLimit: Count,
  buildLimit: Count,
  trafficBytesLimit: Bytes,
  reason: z.string().trim().min(3).max(1000)
}).strict().superRefine((value, context) => {
  if (value.status === 'trial' && !value.effectiveUntil) {
    context.addIssue({ code: 'custom', path: ['effectiveUntil'], message: 'Trial access requires an end date' })
  }
  if (value.effectiveUntil && value.effectiveUntil <= value.effectiveFrom) {
    context.addIssue({ code: 'custom', path: ['effectiveUntil'], message: 'Access must end after it starts' })
  }
})

const Receipt = z.object({
  id: z.string().uuid(), tenantId: z.string(), clientId: z.string().uuid(),
  planKey: z.string(), status: z.enum(['trial', 'active'])
})
type GrantReceipt = z.infer<typeof Receipt>

/** Manual access only. Financial subscriptions and provider charges are separate. */
export async function grantPageStudioEntitlement(
  input: { actorId: string, tenantId: string, body: unknown },
  runTransaction: RunPageStudioTransaction = transaction,
  now = new Date()
): Promise<{ entitlement: GrantReceipt, replayed: boolean }> {
  const parsed = PageStudioEntitlementGrantBody.safeParse(input.body)
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid website access terms' })
  const request = parsed.data
  return runTransaction(async (db) => {
    // Every grant for this client takes the same lock, including requests that
    // arrive concurrently before an entitlement exists. Scope remains tenant-bound.
    const client = await db.query('SELECT id FROM agency_clients WHERE id = $1 AND is_active = true FOR UPDATE', [request.clientId])
    if (!client.rows[0]) throw createError({ statusCode: 404, statusMessage: 'Active client not found' })

    const audit = await db.query<{ actor_id: string, metadata: { request: unknown, entitlement: unknown } }>(`
      SELECT actor_id, metadata FROM billing_entitlement_audit
      WHERE client_id = $1 AND feature_key = 'page_studio.access'
        AND source = 'page_studio_entitlements' AND action = 'grant_created'
        AND metadata->>'tenantId' = $2 AND metadata->>'requestId' = $3
      LIMIT 2`, [request.clientId, input.tenantId, request.requestId])
    if (audit.rows.length) {
      const saved = audit.rows[0]!
      const previous = PageStudioEntitlementGrantBody.safeParse(saved.metadata?.request)
      const receipt = Receipt.safeParse(saved.metadata?.entitlement)
      if (audit.rows.length !== 1 || saved.actor_id !== input.actorId || !previous.success
        || JSON.stringify(previous.data) !== JSON.stringify(request) || !receipt.success
        || receipt.data.tenantId !== input.tenantId || receipt.data.clientId !== request.clientId) {
        throw createError({ statusCode: 409, statusMessage: 'This access request was already used with different terms' })
      }
      return { entitlement: receipt.data, replayed: true }
    }
    if (request.effectiveUntil && Date.parse(request.effectiveUntil) <= now.getTime()) {
      throw createError({ statusCode: 400, statusMessage: 'The access end date must be in the future' })
    }
    const existing = await db.query(`SELECT id FROM page_studio_entitlements
      WHERE tenant_id = $1 AND client_id = $2 AND status <> 'cancelled'
      FOR UPDATE`, [input.tenantId, request.clientId])
    if (existing.rows.length) throw createError({ statusCode: 409, statusMessage: 'This client already has website access. Review the existing subscription before replacing it.' })

    const inserted = await db.query<GrantReceipt>(`INSERT INTO page_studio_entitlements (
      tenant_id, client_id, status, plan_key, active_site_limit, pages_per_site_limit,
      storage_bytes_limit, custom_domain_limit, monthly_ai_operation_limit,
      monthly_build_limit, monthly_traffic_bytes_limit, portal_creation_enabled,
      effective_from, effective_until, plan_metadata, created_by
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16)
    RETURNING id, tenant_id AS "tenantId", client_id AS "clientId", plan_key AS "planKey", status`, [
      input.tenantId, request.clientId, request.status, request.planKey,
      request.siteLimit, request.pagesPerSiteLimit, request.storageBytesLimit,
      request.domainLimit, request.aiOperationLimit, request.buildLimit,
      request.trafficBytesLimit, request.portalCreationEnabled,
      request.effectiveFrom, request.effectiveUntil,
      JSON.stringify({ allowedModules: request.allowedModules, managedBy: 'agency' }), input.actorId
    ])
    const entitlement = Receipt.parse(inserted.rows[0])
    await db.query(`INSERT INTO billing_entitlement_audit (
      client_id, feature_key, action, next_status, actor_id, source, metadata
    ) VALUES ($1, 'page_studio.access', 'grant_created', $2, $3, 'page_studio_entitlements', $4::jsonb)`, [
      request.clientId, request.status, input.actorId,
      JSON.stringify({ tenantId: input.tenantId, requestId: request.requestId, request, entitlement })
    ])
    return { entitlement, replayed: false }
  })
}
