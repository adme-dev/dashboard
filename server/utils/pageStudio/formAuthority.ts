import { PageStudioBusinessContentError, authorizePageStudioBusinessContent, type ContentAuthorityRequest } from './businessContent'
import { getPageStudioDocument } from './documents'
import { resolveEmailTemplateMedia } from './emailTemplateMedia'
import { samePageStudioContentScope, type PageStudioContentScope } from '~~/shared/pageStudio/businessContent'
import type { EmailTemplate } from '~~/shared/pageStudio/emailTemplates'

/** Constructed by server adapters only; never accepted from a browser body. */
export interface TrustedFormAuthority {
  scope: PageStudioContentScope
  actorId: string
  authorityKey: string
  canEdit: boolean
}
export interface FormDraftService {
  readFormSettingsDraft?: (input: unknown) => Promise<unknown>
  writeFormSettingsDraft?: (input: unknown) => Promise<unknown>
  readFormRecipientsDraft?: (input: unknown) => Promise<unknown>
  writeFormRecipientsDraft?: (input: unknown) => Promise<unknown>
  readEmailTemplateDraft?: (input: unknown) => Promise<unknown>
  writeEmailTemplateDraft?: (input: unknown) => Promise<unknown>
}
export interface TrustedFormContext {
  authorize: (writing: boolean) => Promise<TrustedFormAuthority>
  readDocument: (scope: PageStudioContentScope) => Promise<Awaited<ReturnType<typeof getPageStudioDocument>>>
  service: FormDraftService | undefined
  resolveMedia: (template: EmailTemplate) => Promise<{ images: Record<string, string>, warnings: string[] }>
}
export function sameTrustedFormAuthority(a: TrustedFormAuthority, b: TrustedFormAuthority) {
  return samePageStudioContentScope(a.scope, b.scope) && a.actorId === b.actorId && a.authorityKey === b.authorityKey
}
export async function recheckFormAuthority(context: Pick<TrustedFormContext, 'authorize'>, before: TrustedFormAuthority, writing: boolean) {
  const current = await context.authorize(writing)
  if (!sameTrustedFormAuthority(before, current) || (writing && !current.canEdit)) throw new PageStudioBusinessContentError('FORM_AUTHORITY_DENIED', 403, 'Form access denied')
  return current
}
export function admitFormDocument(document: Awaited<ReturnType<typeof getPageStudioDocument>>, scope: PageStudioContentScope) {
  if (document.id !== scope.siteId || document.site?.id !== scope.siteId || document.site.clientId !== scope.clientId) throw new PageStudioBusinessContentError('FORM_DOCUMENT_DENIED', 403, 'Website access denied')
}
export function portalFormContext(request: ContentAuthorityRequest, deps: { authorize?: typeof authorizePageStudioBusinessContent, document?: typeof getPageStudioDocument, media?: typeof resolveEmailTemplateMedia } = {}): TrustedFormContext {
  return {
    authorize: async (writing) => {
      const current = await (deps.authorize ?? authorizePageStudioBusinessContent)(request, writing, { policyOnly: true })
      return { ...current, actorId: request.actor.actorId, authorityKey: JSON.stringify([request.actor.role, request.actor.actorId, request.actor.clientId, current.scope.businessId, current.scope.clientId, current.scope.tenantId]) }
    },
    readDocument: scope => (deps.document ?? getPageStudioDocument)(scope.tenantId, scope.siteId, request.env.PAGE_STUDIO_CHECKPOINTS as Parameters<typeof getPageStudioDocument>[2]),
    service: request.env.PAGE_STUDIO_CONTENT_ROUTER as FormDraftService | undefined,
    resolveMedia: template => (deps.media ?? resolveEmailTemplateMedia)(request, template)
  }
}
