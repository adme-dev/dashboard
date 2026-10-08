import type { TrustedFormContext, TrustedFormAuthority } from './formAuthority'
import { admitFormDocument, snapshotTrustedFormAuthority, recheckFormAuthority } from './formAuthority'
import { PageStudioBusinessContentError } from './businessContent'
import { samePageStudioContentScope } from '~~/shared/pageStudio/businessContent'
import { EmailAudienceSchema, starterEmailTemplate } from '~~/shared/pageStudio/emailTemplates'
import { EmailTemplateContractSupportSchema, EmailFieldOptionsRequestSchema, EmailFieldOptionsSchema } from '~~/shared/pageStudio/emailTemplateCapabilities'
import { formCatalogue } from '~~/shared/pageStudio/formCatalogue'

const notFound = () => new PageStudioBusinessContentError('FORM_NOT_FOUND', 404, 'Choose a saved form')
const unavailable = () => new PageStudioBusinessContentError('EMAIL_FIELD_UNAVAILABLE', 503, 'Field text is not ready for this website. Your draft is unchanged.')

/** Both services must acknowledge V2. Read-only, no template save or model call. */
export async function supportsEmailFieldReferences(context: TrustedFormContext, before: TrustedFormAuthority, audience: 'team' | 'customer', writing: boolean): Promise<boolean> {
  let raw: unknown
  try {
    raw = await context.service?.readEmailTemplateDraft?.({ scope: before.scope, audience, contractVersion: 2 })
  } catch {
    await recheckFormAuthority(context, before, writing)
    return false
  }
  await recheckFormAuthority(context, before, writing)
  const result = EmailTemplateContractSupportSchema.safeParse(raw)
  if (!result.success || !samePageStudioContentScope(result.data.scope, before.scope)) return false
  const template = { ...starterEmailTemplate('customer'), schemaVersion: 2 as const, fieldBindings: [], subject: 'Field support check' }
  let preview: Awaited<ReturnType<TrustedFormContext['renderEmailPreview']>>
  try {
    preview = await context.renderEmailPreview(template, { siteName: 'Field support check', formName: 'Field support check', formKey: 'contract_probe', fields: [] })
  } catch {
    await recheckFormAuthority(context, before, writing)
    return false
  }
  await recheckFormAuthority(context, before, writing)
  return preview.sample === true && preview.subject === 'Field support check'
}
export async function requireEmailFieldReferences(context: TrustedFormContext, before: TrustedFormAuthority, audience: 'team' | 'customer', writing: boolean) {
  if (!await supportsEmailFieldReferences(context, before, audience, writing)) throw unavailable()
}
export async function readEmailTemplateFieldOptions(context: TrustedFormContext, audience: string, input: unknown, definitionId?: string, apiAudience: 'portal' | 'customer' = 'portal') {
  const parsed = EmailFieldOptionsRequestSchema.safeParse(input)
  const selectedAudience = EmailAudienceSchema.safeParse(audience)
  if (!parsed.success || !selectedAudience.success) throw new PageStudioBusinessContentError('EMAIL_FIELD_INVALID', 400, 'Choose a saved preview form')
  const before = snapshotTrustedFormAuthority(await context.authorize(false))
  const locate = async () => {
    const document = await context.readDocument(before.scope)
    await recheckFormAuthority(context, before, false)
    admitFormDocument(document, before.scope)
    const item = document.studio && formCatalogue(document.studio.pages, document.studio.formLibrary).find(candidate => candidate.placements.some(placement => placement.pageId === parsed.data.pageId && placement.formId === parsed.data.formId))
    if (!item?.form.fields || (definitionId && item.definitionId !== definitionId)) throw notFound()
    return { document, item }
  }
  await locate()
  if (!await supportsEmailFieldReferences(context, before, selectedAudience.data, false)) return { available: false as const, reason: 'Field text is not ready for this website yet.' }
  const { document, item } = await locate()
  const fields = item.form.fields!.filter(field => field.type !== 'hidden').map(field => ({ fieldId: field.id, label: field.name.trim() || 'Unnamed field', type: field.type }))
  return EmailFieldOptionsSchema.parse({ available: true, siteId: before.scope.siteId, apiAudience, checkpointId: document.studio!.checkpointId, formKey: item.key, fields })
}
