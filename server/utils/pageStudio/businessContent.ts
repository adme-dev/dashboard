import { z } from 'zod'
import { queryOneFresh } from '~~/server/utils/db'
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
interface ScopeRow {
  tenant_id: string
  client_id: string
  site_status: string
  entitlement_status: string
  entitlement_effective: boolean
  membership_role?: string | null
}
interface Dependencies {
  query?: (sql: string, params: unknown[]) => Promise<ScopeRow | null>
}
interface Request {
  actor: PageStudioContentActor
  siteId: string
  env: Record<string, unknown>
}
interface ContentService {
  readContent: (scope: PageStudioContentScope) => Promise<unknown>
  writeContent: (request: unknown) => Promise<unknown>
}
const BindingsSchema = z.array(z.object({
  scope: PageStudioContentScopeSchema,
  bindingName: z.string().regex(/^[A-Z][A-Z0-9_]{2,80}$/)
}).strict()).max(500)
const unavailable = () => new PageStudioBusinessContentError('CONTENT_NOT_CONFIGURED', 503, 'Business content setup is pending')

async function authorise(request: Request, writing: boolean, dependencies: Dependencies) {
  const { actor, siteId } = request
  if (!z.string().uuid().safeParse(siteId).success) {
    throw new PageStudioBusinessContentError('INVALID_SITE', 400, 'Invalid website ID')
  }
  const query = dependencies.query ?? ((sql, params) => queryOneFresh<ScopeRow>(sql, params))
  const portal = actor.role === 'client'
  const row = await query(`
    SELECT site.tenant_id, site.client_id, site.status AS site_status,
           entitlement.status AS entitlement_status,
           (entitlement.effective_from <= NOW()
            AND (entitlement.effective_until IS NULL OR entitlement.effective_until > NOW())) AS entitlement_effective
           ${portal
              ? `, (SELECT membership.role FROM page_studio_site_memberships membership
                WHERE membership.tenant_id = site.tenant_id AND membership.client_id = site.client_id
                  AND membership.site_id = site.id AND membership.user_id = $3) AS membership_role`
              : ''}
      FROM page_studio_sites site
      JOIN page_studio_entitlements entitlement
        ON entitlement.tenant_id = site.tenant_id AND entitlement.client_id = site.client_id
       AND entitlement.id = site.entitlement_id
     WHERE site.${portal ? 'client_id' : 'tenant_id'} = $1 AND site.id = $2`,
  portal ? [actor.clientId, siteId, actor.actorId] : [actor.tenantId, siteId])
  if (!row) throw new PageStudioBusinessContentError('SITE_NOT_FOUND', 404, 'Website not found')
  if (!['draft', 'active'].includes(row.site_status)
    || !['trial', 'active'].includes(row.entitlement_status) || row.entitlement_effective !== true
    || (writing && actor.role === 'agency' && !actor.canEdit)
    || (portal && !(writing ? ['editor'] : ['editor', 'viewer']).includes(row.membership_role ?? ''))) {
    throw new PageStudioBusinessContentError('CONTENT_ACCESS_DENIED', 403, 'Business content access denied')
  }
  let bindings: z.infer<typeof BindingsSchema>
  try {
    const raw = request.env.PAGE_STUDIO_CONTENT_BINDINGS
    if (typeof raw !== 'string' || raw.length > 250_000) throw unavailable()
    bindings = BindingsSchema.parse(JSON.parse(raw))
  } catch { throw unavailable() }
  const matches = bindings.filter(binding => binding.scope.tenantId === row.tenant_id
    && binding.scope.clientId === row.client_id && binding.scope.siteId === siteId
    && binding.scope.environment === 'preview')
  if (matches.length !== 1) throw unavailable()
  const binding = matches[0]!
  const service = Object.hasOwn(request.env, binding.bindingName) ? request.env[binding.bindingName] : null
  if (!service || typeof service !== 'object' || !('readContent' in service) || !('writeContent' in service)
    || typeof service.readContent !== 'function' || typeof service.writeContent !== 'function') throw unavailable()
  return { scope: binding.scope, service: service as ContentService, canEdit: actor.role === 'agency' ? actor.canEdit : row.membership_role === 'editor' }
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
    if (writing && error instanceof Error && error.message === 'Content revision conflict') {
      throw new PageStudioBusinessContentError('CONTENT_CONFLICT', 409, 'Content changed in another session. Reload before saving again.')
    }
    throw new PageStudioBusinessContentError('CONTENT_SERVICE_UNAVAILABLE', 502, 'Business content service is unavailable')
  }
}

export async function readPageStudioBusinessContent(request: Request, dependencies: Dependencies = {}): Promise<PageStudioContentState & { canEdit: boolean }> {
  const { scope, service, canEdit } = await authorise(request, false, dependencies)
  const result = await callService(() => service.readContent(scope))
  return result === null ? { content: null, revision: 0, actorId: null, createdAt: null, canEdit } : { ...decode(result, scope), canEdit }
}

export async function writePageStudioBusinessContent(request: Request & { body: unknown }, dependencies: Dependencies = {}) {
  const { scope, service } = await authorise(request, true, dependencies)
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
  return result
}
