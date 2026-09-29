import { createError } from 'h3'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { PageStudioFeatureRequestSchema, type PageStudioFeatureRequestResult } from '~~/shared/pageStudio/featureRequestRecovery'
import { PageStudioContentScopeSchema } from '~~/shared/pageStudio/businessContent'
import type { PageStudioControlQueryClient } from './controlStore'
import { assertPageStudioSessionAuthority } from './sessionAuthority'
import { PageStudioSessionClaimsSchema, type PageStudioSessionClaims } from './sessions'

type RunTransaction = <T>(work: (db: PageStudioControlQueryClient) => Promise<T>) => Promise<T>
type RequestRow = { request_id: string, checkpoint_id: string, checkpoint_digest: string, state: 'pending' | 'dismissed' }
const failure = (statusCode: number, code: string, message: string) => createError({ statusCode, data: { error: { code, message } } })
const conflict = () => failure(409, 'FEATURE_REQUEST_CONFLICT', 'Check or dismiss the previous component request before generating again')

/** Discovery is per native actor and site, independent of login/session nonce.
 * A successful claim is the only permission to dispatch a new generation. An
 * identical replay is discoverable but must never dispatch or reserve usage.
 * Site lock precedes live authority locks, matching other native writers. */
export async function updatePageStudioFeatureRequest(
  input: unknown,
  session: PageStudioSessionClaims,
  environment: unknown,
  dependencies: { runTransaction?: RunTransaction } = {}
): Promise<PageStudioFeatureRequestResult> {
  const parsed = PageStudioFeatureRequestSchema.safeParse(input)
  if (!parsed.success) throw failure(400, 'FEATURE_REQUEST_INVALID', 'Invalid component recovery request')
  const claims = PageStudioSessionClaimsSchema.parse(session)
  const scope = PageStudioContentScopeSchema.safeParse({ tenantId: claims.tenantId, clientId: claims.clientId,
    businessId: claims.clientId, siteId: claims.siteId, environment })
  if (!scope.success || !['staging', 'production'].includes(scope.data.environment)) {
    throw failure(503, 'FEATURE_REQUEST_UNAVAILABLE', 'Component recovery environment is unavailable')
  }
  const request = parsed.data
  const run = dependencies.runTransaction ?? (work => transactionWithoutRetry(db => work(db as unknown as PageStudioControlQueryClient)))
  return run(async (db) => {
    const siteKey = [claims.tenantId, claims.clientId, claims.siteId]
    const site = (await db.query<{ current_checkpoint_id: string | null }>(`SELECT current_checkpoint_id FROM page_studio_sites
      WHERE tenant_id=$1 AND client_id=$2 AND id=$3 FOR NO KEY UPDATE`, siteKey)).rows[0]
    const authorize = async () => {
      await assertPageStudioSessionAuthority(claims, 'model:invoke', { transaction: db })
      await assertPageStudioSessionAuthority(claims, 'workspace:checkpoint', { transaction: db })
    }
    await authorize()
    if (!site) throw failure(403, 'FEATURE_REQUEST_DENIED', 'Component recovery access denied')
    const key = [...siteKey, scope.data.environment, claims.role, claims.userId]
    const predicate = 'tenant_id=$1 AND client_id=$2 AND site_id=$3 AND environment=$4 AND actor_role=$5 AND actor_id=$6'
    const pending = (await db.query<RequestRow>(`SELECT request_id,checkpoint_id,checkpoint_digest,state
      FROM page_studio_feature_requests WHERE ${predicate} AND state='pending' FOR UPDATE`, key)).rows[0]
    let result: PageStudioFeatureRequestResult = { pending: pending
      ? {
          id: pending.request_id, checkpointId: pending.checkpoint_id, digest: pending.checkpoint_digest
        }
      : null, claimed: false }
    if (request.operation === 'claim') {
      if (pending) {
        if (pending.request_id !== request.receipt.id || pending.checkpoint_id !== request.receipt.checkpointId
          || pending.checkpoint_digest !== request.receipt.digest) throw conflict()
      } else {
        const old = (await db.query(`SELECT request_id FROM page_studio_feature_requests WHERE ${predicate} AND request_id=$7`, [...key, request.receipt.id])).rows[0]
        if (old || site.current_checkpoint_id !== request.receipt.checkpointId) throw conflict()
        const checkpoint = (await db.query<{ digest: string }>(`SELECT digest FROM page_studio_checkpoints
          WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3 AND id=$4`, [...siteKey, request.receipt.checkpointId])).rows[0]
        if (checkpoint?.digest !== request.receipt.digest) throw conflict()
        await db.query(`INSERT INTO page_studio_feature_requests
          (tenant_id,client_id,site_id,environment,actor_role,actor_id,request_id,checkpoint_id,checkpoint_digest)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [...key, request.receipt.id, request.receipt.checkpointId, request.receipt.digest])
        result = { pending: request.receipt, claimed: true }
      }
    } else if (request.operation === 'dismiss' && pending) {
      if (pending.request_id !== request.id) throw conflict()
      await db.query(`UPDATE page_studio_feature_requests SET state='dismissed',updated_at=clock_timestamp()
        WHERE ${predicate} AND request_id=$7 AND state='pending'`, [...key, request.id])
      result = { pending: null, claimed: false }
    }
    await authorize()
    return result
  })
}
