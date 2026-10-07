import { authorizePageStudioBusinessContent, type ContentAuthorityRequest } from './businessContent'
import { getPageStudioDocument } from './documents'
import { resolveEmailTemplateMedia } from './emailTemplateMedia'
import type { FormDraftService, TrustedFormContext } from './formAuthority'

export function portalFormContext(request: ContentAuthorityRequest, deps: { authorize?: typeof authorizePageStudioBusinessContent, document?: typeof getPageStudioDocument, media?: typeof resolveEmailTemplateMedia } = {}): TrustedFormContext {
  return {
    authorize: async (writing) => {
      const current = await (deps.authorize ?? authorizePageStudioBusinessContent)(request, writing, { policyOnly: true })
      return { ...current, actorId: request.actor.actorId, authorityKey: JSON.stringify([request.actor.role, request.actor.actorId, request.actor.role === 'client' ? request.actor.clientId : null, current.scope.businessId, current.scope.clientId, current.scope.tenantId]) }
    },
    readDocument: scope => (deps.document ?? getPageStudioDocument)(scope.tenantId, scope.siteId, request.env.PAGE_STUDIO_CHECKPOINTS as Parameters<typeof getPageStudioDocument>[2]),
    service: request.env.PAGE_STUDIO_CONTENT_ROUTER as FormDraftService | undefined,
    resolveMedia: template => (deps.media ?? resolveEmailTemplateMedia)(request, template)
  }
}
