import { transactionWithoutRetry } from '~~/server/utils/db'
import { PageStudioAiUsageRequestSchema, type PageStudioAiUsageReceipt } from '~~/shared/pageStudio/aiUsage'
import { PageStudioContentScopeSchema } from '~~/shared/pageStudio/businessContent'
import type { PageStudioControlQueryClient } from './controlStore'
import { assertPageStudioSessionAuthority } from './sessionAuthority'
import { PageStudioSessionClaimsSchema, type PageStudioSessionClaims } from './sessions'

type RunTransaction = <T>(work: (db: PageStudioControlQueryClient) => Promise<T>) => Promise<T>
type UsageRow = { site_id: string, business_id: string, actor_id: string, actor_role: string, fingerprint: string, kind: string, state: PageStudioAiUsageReceipt['state'] }
export class PageStudioAiUsageError extends Error {
  readonly data: { error: { code: string, message: string } }
  constructor(readonly code: string, readonly statusCode: number, message: string) {
    super(message)
    this.name = 'PageStudioAiUsageError'
    this.data = { error: { code, message } }
  }
}
const conflict = () => new PageStudioAiUsageError('AI_USAGE_CONFLICT', 409, 'AI operation identity conflicts with its durable reservation')

/** Exactly one current monthly allowance unit per model call, action test or
 * accepted action execution. This reserves usage only: it is not evidence of
 * accepted action membership, package execution capability or effect authority.
 * The later action coordinator must check those independently before dispatch. Never return
 * admitted=true for a replay, including unknown provider outcomes. Fingerprints
 * are computed by the trusted caller from canonical immutable request contents. */
export async function updatePageStudioAiUsage(
  input: unknown,
  session: PageStudioSessionClaims,
  environment: unknown,
  dependencies: { runTransaction?: RunTransaction } = {}
): Promise<PageStudioAiUsageReceipt> {
  const parsed = PageStudioAiUsageRequestSchema.safeParse(input)
  if (!parsed.success) throw new PageStudioAiUsageError('AI_USAGE_INVALID', 400, 'Invalid AI usage request')
  const claims = PageStudioSessionClaimsSchema.parse(session)
  const scope = PageStudioContentScopeSchema.safeParse({ tenantId: claims.tenantId, clientId: claims.clientId,
    businessId: claims.clientId, siteId: claims.siteId, environment })
  if (!scope.success || !['staging', 'production'].includes(scope.data.environment)) {
    throw new PageStudioAiUsageError('AI_USAGE_UNAVAILABLE', 503, 'AI usage environment is unavailable')
  }
  const request = parsed.data
  const runTransaction = dependencies.runTransaction ?? (work => transactionWithoutRetry(db => work(db as unknown as PageStudioControlQueryClient)))
  return runTransaction(async (db) => {
    const args = [claims.tenantId, claims.clientId, claims.siteId]
    const site = (await db.query<{ entitlement_id: string }>(`SELECT entitlement_id FROM page_studio_sites
      WHERE tenant_id=$1 AND client_id=$2 AND id=$3 FOR NO KEY UPDATE`, args)).rows[0]
    if (!site) throw new PageStudioAiUsageError('AI_USAGE_DENIED', 403, 'AI usage access denied')
    // Serialize across sites before acquiring authority's shared entitlement
    // locks. An upgrade from SHARE to UPDATE here would deadlock across sites.
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [JSON.stringify(['page-studio-ai-usage', claims.tenantId, claims.clientId])])
    const authorize = () => assertPageStudioSessionAuthority(claims, 'model:invoke', { transaction: db })
    await authorize()
    const key = [claims.tenantId, claims.clientId, scope.data.environment, request.operationId]
    const existing = (await db.query<UsageRow>(`SELECT site_id,business_id,actor_id,actor_role,fingerprint,kind,state
      FROM page_studio_ai_usage WHERE tenant_id=$1 AND client_id=$2 AND environment=$3 AND operation_id=$4 FOR UPDATE`, key)).rows[0]
    let state: PageStudioAiUsageReceipt['state'] = 'reserved'
    let admitted = false
    if (existing) {
      if (existing.site_id !== claims.siteId || existing.business_id !== claims.clientId || existing.actor_id !== claims.userId
        || existing.actor_role !== claims.role || existing.fingerprint !== request.fingerprint || existing.kind !== request.kind) throw conflict()
      state = existing.state
      if (request.action === 'settle') {
        if (state !== 'reserved' && state !== request.outcome) throw conflict()
        if (state === 'reserved') {
          await db.query(`UPDATE page_studio_ai_usage SET state=$5,settled_at=clock_timestamp()
            WHERE tenant_id=$1 AND client_id=$2 AND environment=$3 AND operation_id=$4`, [...key, request.outcome])
          state = request.outcome
        }
      }
    } else {
      if (request.action === 'settle') throw conflict()
      const budget = (await db.query<{ monthly_ai_operation_limit: number, period: string }>(`SELECT monthly_ai_operation_limit,
        date_trunc('month', clock_timestamp() AT TIME ZONE 'UTC')::date::text AS period
        FROM page_studio_entitlements WHERE tenant_id=$1 AND client_id=$2 AND id=$3 FOR SHARE`,
      [claims.tenantId, claims.clientId, site.entitlement_id])).rows[0]
      if (!budget || !Number.isSafeInteger(budget.monthly_ai_operation_limit) || budget.monthly_ai_operation_limit <= 0) {
        throw new PageStudioAiUsageError('AI_USAGE_DENIED', 403, 'AI usage access denied')
      }
      const used = (await db.query<{ used: string }>(`SELECT count(*)::text AS used FROM page_studio_ai_usage
        WHERE tenant_id=$1 AND client_id=$2 AND period_start=$3::date`, [claims.tenantId, claims.clientId, budget.period])).rows[0]
      if (!used || Number(used.used) >= budget.monthly_ai_operation_limit) {
        throw new PageStudioAiUsageError('AI_USAGE_EXHAUSTED', 429, 'The monthly AI allowance has been reached')
      }
      await db.query(`INSERT INTO page_studio_ai_usage(tenant_id,client_id,environment,operation_id,site_id,business_id,
        fingerprint,kind,actor_id,actor_role,session_nonce,entitlement_id,period_start)
        VALUES($1,$2,$3,$4,$5,$2,$6,$7,$8,$9,$10,$11,$12::date)`,
      [...key, claims.siteId, request.fingerprint, request.kind, claims.userId, claims.role, claims.nonce, site.entitlement_id, budget.period])
      admitted = true
    }
    await authorize()
    return { operationId: request.operationId, fingerprint: request.fingerprint, kind: request.kind,
      scope: scope.data, state, charged: true, admitted }
  })
}
