import { PageStudioAiUsageRequestSchema } from '~~/shared/pageStudio/aiUsage'
import { PageStudioContentScopeSchema } from '~~/shared/pageStudio/businessContent'
import { PageStudioAiUsageError, updatePageStudioAiUsageLedger } from './aiUsage'
import { withCmsCommitAuthority } from './cmsCommitAuthority'
import type { ContentAuthorityRequest } from './businessContent'
import type { EmailTemplateGenerationExecution } from './emailTemplateGeneration'

type UsageAdapters = Pick<EmailTemplateGenerationExecution, 'reserve' | 'settle'>
type Dependencies = NonNullable<Parameters<typeof withCmsCommitAuthority>[2]>
const denied = () => new PageStudioAiUsageError('AI_USAGE_DENIED', 403, 'AI usage access denied')

/** Uses the ordinary, verified CMS login. Never creates/relabels an editor
 * session. Native customer-user preview is intentionally not this principal. */
export function createPortalEmailTemplateUsage(request: ContentAuthorityRequest, dependencies: Dependencies = {}): UsageAdapters {
  const update = async (operation: Parameters<UsageAdapters['reserve']>[0], outcome?: 'succeeded' | 'failed') => {
    const { authority } = operation
    const scope = PageStudioContentScopeSchema.parse(authority.scope)
    const key = JSON.stringify([request.actor.role, request.actor.actorId, request.actor.role === 'client' ? request.actor.clientId : null, scope.businessId, scope.clientId, scope.tenantId])
    if (!authority.canEdit || authority.actorId !== request.actor.actorId || authority.authorityKey !== key
      || scope.siteId !== request.siteId || !['staging', 'production'].includes(scope.environment) || operation.kind !== 'model') throw denied()
    const body = PageStudioAiUsageRequestSchema.parse({ operationId: operation.operationId, fingerprint: operation.fingerprint, kind: 'model',
      ...(outcome ? { action: 'settle', outcome } : { action: 'reserve' }) })
    return withCmsCommitAuthority({ scope, principal: { source: 'native-login', request }, mutation: 'email-generation' }, async (db) => {
      // The guard already holds site → shared usage advisory → authority locks,
      // and rechecks the exact live login/membership immediately before commit.
      const site = (await db.query<{ entitlement_id: string, monthly_ai_operation_limit: number }>(`SELECT site.entitlement_id, entitlement.monthly_ai_operation_limit
        FROM page_studio_sites site JOIN page_studio_entitlements entitlement
          ON entitlement.id=site.entitlement_id AND entitlement.tenant_id=site.tenant_id AND entitlement.client_id=site.client_id
        WHERE site.tenant_id=$1 AND site.client_id=$2 AND site.id=$3`, [scope.tenantId, scope.clientId, scope.siteId])).rows[0]
      // Match model:invoke policy for existing receipts too. A retained charge is
      // not permission to keep using a revoked AI entitlement.
      if (!site || !Number.isSafeInteger(site.monthly_ai_operation_limit) || site.monthly_ai_operation_limit <= 0) throw denied()
      return updatePageStudioAiUsageLedger(db, body, scope, { id: request.actor.actorId, role: request.actor.role,
        loginIdentity: `cms-login:${request.login.tokenHash}` }, site.entitlement_id)
    }, dependencies)
  }
  return { reserve: operation => update(operation), settle: operation => update(operation, operation.outcome) }
}
