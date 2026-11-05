import { createError, getCookie, getHeader, getQuery, setHeader, type H3Event } from 'h3'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { digestPortalSessionToken } from '~~/server/utils/portalSession'
import { requireAgencyPageStudioAccess } from './access'
import { resolvePortalTemplateTenant, resolveAgencyTemplateTenant, queryTemplateCatalogue } from './templateCatalogueAuthority'
import { readCustomerSession, readCustomerSetup } from './customerSignup'
import { resolveCustomerWorkspaceAccess } from './customerWorkspaces'
import { customerSessionToken, guardCustomerRequest } from './customerSignupHttp'
import { PageStudioTemplateListQuery } from '~~/shared/pageStudio/templateCatalogue'
import { listPermittedTemplates, type TemplateActor } from './templateCatalogue'

export function templateActorAuthorizer(event: H3Event, kind: TemplateActor['kind'], permission: 'PAGE_STUDIO_VIEW' | 'PAGE_STUDIO_EDIT' | 'PAGE_STUDIO_PUBLISH' = 'PAGE_STUDIO_VIEW') {
    // Each route names its authority family. Other applications may be signed
    // in in the same browser, but can never supply this route's principal.
    const portal = kind === 'portal' ? getCookie(event, 'client_session_token') : undefined
    const secureCustomer = kind === 'customer' ? getCookie(event, '__Host-studio_customer_session') : undefined
    const localCustomer = kind === 'customer' ? getCookie(event, 'studio_customer_session') : undefined
    const customer = secureCustomer || localCustomer
    const agencyCredentials: string[] = []
    if (kind === 'agency') {
      for (const name of ['auth_token', 'auth_token_client']) {
        const token = getCookie(event, name)
        if (token) agencyCredentials.push(token)
      }
      const authorization = getHeader(event, 'authorization')
      if (authorization) {
        if (!authorization.startsWith('Bearer ') || !authorization.slice(7)) throw createError({ statusCode: 403 })
        agencyCredentials.push(authorization.slice(7))
      }
      if (new Set(agencyCredentials).size !== 1) throw createError({ statusCode: 403 })
    }
    const agency = agencyCredentials[0]
    if ((secureCustomer && localCustomer)
      || !(kind === 'portal' ? portal : kind === 'customer' ? customer : agency)) throw createError({ statusCode: 403 })
    async function authorize(): Promise<TemplateActor> {
      // Existing authentication helpers cache per request; discard those cached
      // principals on refresh so a revoked login cannot survive this async read.
      delete event.context.user
      delete event.context.clientPortalUser
      if (kind === 'portal') {
        const user = await requireClientAuth(event)
        return { kind, userId: user.id, clientId: user.clientId, tenantId: await resolvePortalTemplateTenant(user.clientId), sessionIdentity: await digestPortalSessionToken(portal!) }
      }
      if (kind === 'customer') {
        guardCustomerRequest(event, event.method === 'GET' ? 'GET' : 'POST')
        const token = customerSessionToken(event)
        const user = await readCustomerSession(token)
        const setup = await readCustomerSetup(token)
        if (!setup.workspaceId) throw createError({ statusCode: 403 })
        await resolveCustomerWorkspaceAccess({ identityId: user.identityId, workspaceId: setup.workspaceId })
        return { kind, identityId: user.identityId, workspaceId: setup.workspaceId, sessionIdentity: await digestPortalSessionToken(token) }
      }
      const access = await requireAgencyPageStudioAccess(event, permission)
      const boundTenant = await resolveAgencyTemplateTenant(event.context.cloudflare?.env ?? {})
      if (access.tenantId !== boundTenant) throw createError({ statusCode: 403 })
      return { kind, userId: access.user.id, tenantId: access.tenantId, sessionIdentity: await digestPortalSessionToken(agency!) }
    }
    return authorize
}

export async function templateCatalogueHandler(event: H3Event, kind: TemplateActor['kind']) {
  setHeader(event, 'Cache-Control', 'private, no-store')
  try {
    const authorize = templateActorAuthorizer(event, kind)
    const parsed = PageStudioTemplateListQuery.safeParse(getQuery(event))
    if (!parsed.success || getHeader(event, 'transfer-encoding') || Number(getHeader(event, 'content-length') ?? 0) !== 0) throw createError({ statusCode: 400 })
    return await listPermittedTemplates(await authorize(), parsed.data, { query: queryTemplateCatalogue, reauthorize: authorize, copyEnabled: typeof (event.context.cloudflare?.env?.PAGE_STUDIO_TEMPLATE_SERVICE as { prepareTemplateCopy?: unknown } | undefined)?.prepareTemplateCopy === 'function' })
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode
    const statusCode = status && [400, 401, 403, 404, 409].includes(status) ? status : 503
    throw createError({ statusCode, statusMessage: statusCode === 503 ? 'Templates are unavailable. Try again later.' : 'Template access is unavailable.' })
  }
}
