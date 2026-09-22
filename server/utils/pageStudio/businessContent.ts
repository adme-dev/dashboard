import { CmsConsumerError, createCmsConsumerService, type CmsConsumerDependencies } from './cmsConsumers'
import { z } from 'zod'
import { queryOneFresh } from '~~/server/utils/db'
import { pageStudioContentAuthoritySql } from './contentAuthoritySql'
import type { PageStudioLoginSession } from './loginSessions'
import {
  PageStudioBusinessContentSchema,
  PageStudioContentEditSchema,
  PageStudioContentRevisionSchema,
  PageStudioContentScopeSchema,
  samePageStudioContentScope,
  type PageStudioContentScope,
  type PageStudioContentState
} from '~~/shared/pageStudio/businessContent'

export class PageStudioBusinessContentError extends Error {
  constructor(readonly code: string, readonly statusCode: number, message: string) {
    super(message)
    this.name = 'PageStudioBusinessContentError'
  }
}

// Construct actors only after requireAgencyPageStudioAccess / requireClientAuth.
export type PageStudioContentActor = { actorId: string } & (
  | { role: 'agency', tenantId: string, canEdit: boolean }
  | { role: 'client', clientId: string }
)
export interface ScopeRow {
  cms_state?: string | null
  plan_metadata?: unknown
  native_user_role?: string | null
  collection_capacity?: boolean
  portal_creation_enabled?: boolean
  tenant_id: string
  client_id: string
  site_status: string
  entitlement_status: string
  entitlement_effective: boolean
  native_can_view: boolean
  native_can_edit: boolean
  membership_role?: string | null
}
export interface ContentAuthorityDependencies {
  /** Internal locked authority recheck: no consumer selection or adoption-state gate. */
  policyOnly?: boolean
  cms?: CmsConsumerDependencies
  query?: (sql: string, params: unknown[]) => Promise<ScopeRow | null>
}
export interface ContentAuthorityRequest {
  collectionAccess?: boolean
  login: PageStudioLoginSession
  actor: PageStudioContentActor
  siteId: string
  env: Record<string, unknown>
}
interface ContentService {
  readContent: (scope: PageStudioContentScope) => Promise<unknown>
  writeContent: (request: unknown) => Promise<unknown>
}
const NativeLogin = z.object({ role: z.enum(['agency', 'client']), userId: z.string().min(1), tokenHash: z.string().regex(/^[a-f0-9]{64}$/), issuedAt: z.date(), expiresAt: z.date() }).strict()
const unavailable = () => new PageStudioBusinessContentError('CONTENT_NOT_CONFIGURED', 503, 'Business content setup is pending')

export async function authorizePageStudioBusinessContent(request: ContentAuthorityRequest, writing: boolean, dependencies: ContentAuthorityDependencies) {
  const { actor, siteId } = request
  const login = NativeLogin.safeParse(request.login)
  if (!login.success || login.data.role !== actor.role || login.data.userId !== actor.actorId) {
    throw new PageStudioBusinessContentError('CONTENT_ACCESS_DENIED', 403, 'Business content access denied')
  }
  if (!z.string().uuid().safeParse(siteId).success) {
    throw new PageStudioBusinessContentError('INVALID_SITE', 400, 'Invalid website ID')
  }
  if (!actor.actorId || (actor.role === 'agency' ? !actor.tenantId : !actor.clientId)) {
    throw new PageStudioBusinessContentError('CONTENT_ACCESS_DENIED', 403, 'Business content access denied')
  }
  const query = dependencies.query ?? ((sql, params) => queryOneFresh<ScopeRow>(sql, params))
  const portal = actor.role === 'client'
  const native = pageStudioContentAuthoritySql(!portal)
  const row = await query(`
    SELECT ${dependencies.policyOnly ? 'NULLIF($7::text, $7::text)' : '(SELECT cms.state FROM page_studio_cms_scopes cms WHERE cms.tenant_id=site.tenant_id AND cms.client_id=site.client_id AND cms.business_id=site.client_id AND cms.site_id=site.id AND cms.environment=$7)'} AS cms_state, ${native.select}, ${request.collectionAccess
      ? `entitlement.plan_metadata, entitlement.portal_creation_enabled,
      (entitlement.active_site_limit > 0 AND (SELECT count(*) FROM page_studio_sites counted WHERE counted.tenant_id=site.tenant_id AND counted.client_id=site.client_id AND counted.status<>'archived') <= entitlement.active_site_limit) AS collection_capacity,
      ${portal ? 'owner.role' : 'owner.user_role'} AS native_user_role,`
      : ''} site.tenant_id, site.client_id, site.status AS site_status,
           entitlement.status AS entitlement_status,
           (entitlement.effective_from <= clock_timestamp()
            AND (entitlement.effective_until IS NULL OR entitlement.effective_until > clock_timestamp())) AS entitlement_effective
           ${portal
              ? `, (SELECT membership.role FROM page_studio_site_memberships membership
                WHERE membership.tenant_id = site.tenant_id AND membership.client_id = site.client_id
                  AND membership.site_id = site.id AND membership.user_id = owner.id) AS membership_role`
              : ''}
      FROM page_studio_sites site
      JOIN agency_clients client ON client.id = site.client_id AND client.is_active = TRUE
      JOIN page_studio_entitlements entitlement
        ON entitlement.tenant_id = site.tenant_id AND entitlement.client_id = site.client_id
       AND entitlement.id = site.entitlement_id
      ${native.joins}
     WHERE site.${portal ? 'client_id' : 'tenant_id'} = $1 AND site.id = $2`,
  [portal ? actor.clientId : actor.tenantId, siteId, actor.actorId, login.data.tokenHash, login.data.issuedAt, login.data.expiresAt, request.env.PAGE_STUDIO_CONTENT_ENVIRONMENT])
  if (!row || (portal ? row.client_id !== actor.clientId : row.tenant_id !== actor.tenantId)) throw new PageStudioBusinessContentError('SITE_NOT_FOUND', 404, 'Website not found')
  if (!['draft', 'active'].includes(row.site_status)
    || !['trial', 'active'].includes(row.entitlement_status) || row.entitlement_effective !== true
    || (writing ? row.native_can_edit !== true : row.native_can_view !== true)
    || (writing && actor.role === 'agency' && !actor.canEdit)
    || (portal && !(writing ? ['editor'] : ['editor', 'viewer']).includes(row.membership_role ?? ''))) {
    throw new PageStudioBusinessContentError('CONTENT_ACCESS_DENIED', 403, 'Business content access denied')
  }
  if (!dependencies.policyOnly && row.cms_state && row.cms_state !== 'managed') throw new PageStudioBusinessContentError('CMS_ADOPTION_IN_PROGRESS', 409, 'Content setup is in progress. Your changes have not been saved.')
  const environment = request.env.PAGE_STUDIO_CONTENT_ENVIRONMENT
  let service = request.env.PAGE_STUDIO_CONTENT_ROUTER as ContentService | undefined
  if ((environment !== 'staging' && environment !== 'production')
    || !service || (!dependencies.policyOnly && row.cms_state !== 'managed' && (typeof service.readContent !== 'function' || typeof service.writeContent !== 'function'))) throw unavailable()
  const scope = PageStudioContentScopeSchema.safeParse({
    tenantId: row.tenant_id, clientId: row.client_id, businessId: row.client_id, siteId, environment
  })
  if (!scope.success) throw unavailable()
  if (!dependencies.policyOnly && row.cms_state === 'managed') service = createCmsConsumerService(request, scope.data, dependencies.cms)
  return { scope: scope.data, service, collectionPolicy: row, canEdit: actor.role === 'agency' ? actor.canEdit && row.native_can_edit : row.membership_role === 'editor' && row.native_can_edit }
}

function decode(result: unknown, scope: PageStudioContentScope) {
  const parsed = PageStudioContentRevisionSchema.safeParse(result)
  if (!parsed.success || !samePageStudioContentScope(parsed.data.content.scope, scope)) {
    throw new PageStudioBusinessContentError('CONTENT_RESPONSE_INVALID', 502, 'Business content response could not be verified')
  }
  return parsed.data
}

async function callService(operation: () => Promise<unknown>, writing = false) {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof PageStudioBusinessContentError) throw error
    if (error instanceof CmsConsumerError) throw new PageStudioBusinessContentError(error.code, error.statusCode, error.message)
    if (error instanceof Error && error.message === 'Content route is inactive') throw unavailable()
    if (writing && error instanceof Error && error.message === 'Content revision conflict') {
      throw new PageStudioBusinessContentError('CONTENT_CONFLICT', 409, 'Content changed in another session. Reload before saving again.')
    }
    throw new PageStudioBusinessContentError('CONTENT_SERVICE_UNAVAILABLE', 502, 'Business content service is unavailable')
  }
}

export async function readPageStudioBusinessContent(request: ContentAuthorityRequest, dependencies: ContentAuthorityDependencies = {}): Promise<PageStudioContentState & { canEdit: boolean }> {
  const { scope, service, collectionPolicy } = await authorizePageStudioBusinessContent(request, false, dependencies)
  const result = await callService(() => service.readContent(scope))
  // A remote read may outlive membership, entitlement or site ownership changes.
  const current = await authorizePageStudioBusinessContent(request, false, dependencies)
  if (!samePageStudioContentScope(scope, current.scope) || (collectionPolicy.cms_state ?? null) !== (current.collectionPolicy.cms_state ?? null)) {
    throw new PageStudioBusinessContentError('CONTENT_ACCESS_DENIED', 403, 'Business content access denied')
  }
  const { canEdit } = current
  return result === null ? { content: null, revision: 0, actorId: null, createdAt: null, canEdit } : { ...decode(result, scope), canEdit }
}

export async function writePageStudioBusinessContent(request: ContentAuthorityRequest & { body: unknown }, dependencies: ContentAuthorityDependencies = {}) {
  const { scope, service, collectionPolicy } = await authorizePageStudioBusinessContent(request, true, dependencies)
  const parsed = PageStudioContentEditSchema.safeParse(request.body)
  if (!parsed.success) throw new PageStudioBusinessContentError('CONTENT_INVALID', 400, 'Invalid business content')
  const proposed = PageStudioBusinessContentSchema.safeParse({ schemaVersion: 1, scope, collections: parsed.data.collections })
  if (!proposed.success) throw new PageStudioBusinessContentError('CONTENT_INVALID', 400, 'Invalid business content')
  const result = decode(await callService(() => service.writeContent({
    actorId: request.actor.actorId,
    content: proposed.data,
    expectedRevision: parsed.data.expectedRevision
  }), true), scope)
  if (result.revision !== parsed.data.expectedRevision + 1 || result.actorId !== request.actor.actorId
    || JSON.stringify(result.content) !== JSON.stringify(proposed.data)) {
    throw new PageStudioBusinessContentError('CONTENT_RESPONSE_INVALID', 502, 'Saved content response could not be verified. Reload to check the accepted revision.')
  }
  const current = await authorizePageStudioBusinessContent(request, true, dependencies)
  if (!samePageStudioContentScope(scope, current.scope) || (collectionPolicy.cms_state ?? null) !== (current.collectionPolicy.cms_state ?? null)) throw new PageStudioBusinessContentError('CONTENT_ACCESS_DENIED', 403, 'Business content access denied')
  return result
}
