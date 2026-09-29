import { transactionWithoutRetry } from '~~/server/utils/db'
import { samePageStudioContentScope } from '~~/shared/pageStudio/businessContent'
import { authorizePageStudioBusinessContent, type ContentAuthorityRequest, type ScopeRow } from './businessContent'
import { withCmsCommitAuthority } from './cmsCommitAuthority'
import type { PageStudioControlQueryClient } from './controlStore'
import { ImageCreditError } from './imageCredits'
import { readImageGenerationConfig } from './imageQuotes'

type RunTransaction = <T>(work: (db: PageStudioControlQueryClient) => Promise<T>) => Promise<T>
const denied = () => new ImageCreditError('IMAGE_GENERATION_DENIED', 403, 'Image generation access denied')

async function currentContext(db: PageStudioControlQueryClient, request: ContentAuthorityRequest, writing: boolean) {
  const admitted = await authorizePageStudioBusinessContent({ ...request, collectionAccess: true }, writing, {
    policyOnly: true,
    query: async (sql, params) => (await db.query<ScopeRow>(sql, params)).rows[0] ?? null
  })
  const scope = admitted.scope
  // Keep the same package-level model permission as hosted editor sessions.
  // Prepaid credits do not consume or replace the existing monthly quota ledger.
  const allowance = (await db.query<{ enabled: boolean }>(`SELECT entitlement.monthly_ai_operation_limit>0 AS enabled
    FROM page_studio_sites site JOIN page_studio_entitlements entitlement ON entitlement.id=site.entitlement_id
      AND entitlement.tenant_id=site.tenant_id AND entitlement.client_id=site.client_id
    WHERE site.tenant_id=$1 AND site.client_id=$2 AND site.id=$3`, [scope.tenantId, scope.clientId, scope.siteId])).rows[0]
  let config: ReturnType<typeof readImageGenerationConfig> | null = null
  try {
    config = readImageGenerationConfig(request.env, scope)
  } catch (error) {
    if (writing) throw error
  }
  const canGenerate = admitted.canEdit && allowance?.enabled === true && config !== null
  if (writing && !canGenerate) throw denied()
  return {
    scope,
    actor: { actorId: request.actor.actorId, actorRole: request.actor.role },
    config,
    canGenerate,
    // Portal billing ownership is separate from per-site editor membership.
    // Agency billing admission is not implied by PAGE_STUDIO_EDIT.
    canPurchase: request.actor.role === 'client' && admitted.collectionPolicy.native_user_role === 'admin'
  }
}
export type ImageGenerationContext = Awaited<ReturnType<typeof currentContext>>

/** Native browser authority. Work contains bounded SQL only, never provider I/O.
 * Mutations reuse the existing current-login/entitlement/role locks, with a final
 * wall-clock recheck. Reads revalidate before returning scoped account data. */
export async function withImageGenerationAuthority<T>(
  request: ContentAuthorityRequest,
  writing: boolean,
  work: (db: PageStudioControlQueryClient, context: ImageGenerationContext) => Promise<T>,
  dependencies: { runTransaction?: RunTransaction } = {}
): Promise<T> {
  const run = dependencies.runTransaction ?? (callback => transactionWithoutRetry(db => callback(db as unknown as PageStudioControlQueryClient)))
  return run(async (db) => {
    const initial = await currentContext(db, request, writing)
    const perform = async () => {
      const current = await currentContext(db, request, writing)
      if (!samePageStudioContentScope(initial.scope, current.scope)) throw denied()
      const result = await work(db, current)
      const after = await currentContext(db, request, writing)
      if (!samePageStudioContentScope(current.scope, after.scope) || (current.canPurchase && !after.canPurchase)) throw denied()
      return result
    }
    if (!writing) return perform()
    return withCmsCommitAuthority({ scope: initial.scope, principal: { source: 'native-login', request }, mutation: 'business-content' },
      perform, { runTransaction: callback => callback(db) })
  })
}
