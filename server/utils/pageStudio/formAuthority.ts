import { PageStudioBusinessContentError } from './businessContent'
import type { getPageStudioDocument } from './documents'
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
  listEmailTemplateDraftHistory?: (input: unknown) => Promise<unknown>
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
