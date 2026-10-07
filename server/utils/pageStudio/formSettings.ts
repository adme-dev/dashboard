import { portalFormContext } from './portalFormContext'
import { admitFormDocument, recheckFormAuthority, type TrustedFormContext } from './formAuthority'
import { PageStudioBusinessContentError } from './businessContent'
import type { authorizePageStudioBusinessContent, ContentAuthorityRequest } from './businessContent'
import type { getPageStudioDocument } from './documents'
import { samePageStudioContentScope } from '~~/shared/pageStudio/businessContent'
import { FormSettingsEditSchema, FormSettingsReadSchema, FormSettingsRecordSchema, sameFormSettingsIdentity, type FormSettingsState } from '~~/shared/pageStudio/formSettings'
import { formCatalogue } from '~~/shared/pageStudio/formCatalogue'
import { validateFormOutcomeFields } from '~~/shared/pageStudio/formOutcomes'

interface Dependencies {
  authorize?: typeof authorizePageStudioBusinessContent
  document?: typeof getPageStudioDocument
}
const invalid = (message: string) => new PageStudioBusinessContentError('FORM_SETTINGS_INVALID', 400, message)
const unavailable = () => new PageStudioBusinessContentError('FORM_SETTINGS_UNAVAILABLE', 503, 'Form settings storage is not connected. Your website has not changed.')
const conflict = () => new PageStudioBusinessContentError('FORM_SETTINGS_CONFLICT', 409, 'This form or its settings changed. Reload the saved version before saving again.')

export async function operateFormSettings(request: ContentAuthorityRequest, identity: { pageId: string, formId: string }, body?: unknown, deps: Dependencies = {}): Promise<FormSettingsState> {
  return operateTrustedFormSettings(portalFormContext(request, deps), identity, body)
}

export async function operateTrustedFormSettings(context: TrustedFormContext, identity: { pageId: string, formId: string }, body?: unknown): Promise<FormSettingsState> {
  const writing = body !== undefined
  // This is operational draft configuration, not a legacy CMS-content write.
  const before = await context.authorize(writing)
  const document = await context.readDocument(before.scope)
  await recheckFormAuthority(context, before, writing)
  admitFormDocument(document, before.scope)
  const entry = document.studio && formCatalogue(document.studio.pages, document.studio.formLibrary).find(item => item.placements.some(placement => placement.pageId === identity.pageId && placement.formId === identity.formId))
  const form = entry?.form
  if (!form || !document.studio || !form.fields) throw new PageStudioBusinessContentError('FORM_NOT_FOUND', 404, 'The saved form is not available')
  const key = FormSettingsReadSchema.safeParse({ scope: before.scope, ...(entry?.definitionId ? { definitionId: entry.definitionId } : identity) })
  if (!key.success) throw invalid('Invalid form selection')
  const service = context.service
  const edit = writing ? FormSettingsEditSchema.safeParse(body) : undefined
  if (edit && !edit.success) throw invalid('Check the outcome settings and try again')
  const proposed = edit?.success ? edit.data : undefined
  if (proposed) {
    if (proposed.checkpointId !== document.studio.checkpointId) throw conflict()
    const errors = validateFormOutcomeFields(proposed.settings, form.fields)
    if (errors.length) throw invalid(errors[0]!)
    // Limit redirects to a page in this saved site. Publication revalidates its
    // own page inventory before activating a draft in a future release.
    for (const outcome of [proposed.settings.fallback, ...proposed.settings.rules.map(rule => rule.outcome)]) {
      if (outcome.type === 'redirect' && !document.studio.pages.some(page => page.route === outcome.path && ['public', 'hidden'].includes(page.visibility))) throw invalid('Choose an available page on this website for the redirect')
    }
  }
  let value: unknown
  try {
    if (proposed) {
      if (!service?.writeFormSettingsDraft) throw unavailable()
      value = await service.writeFormSettingsDraft({ ...key.data, ...proposed, actorId: before.actorId })
    } else {
      if (!service?.readFormSettingsDraft) throw unavailable()
      value = await service.readFormSettingsDraft(key.data)
    }
  } catch (error) {
    if (error instanceof PageStudioBusinessContentError) throw error
    if (error instanceof Error && error.message === 'Form settings revision conflict') throw conflict()
    // A failed save may have committed. Never automatically replay writes.
    throw unavailable()
  }
  const after = await recheckFormAuthority(context, before, writing)
  if (value === null && !writing) return { record: null, canEdit: after.canEdit, activation: 'draft_only' }
  const record = FormSettingsRecordSchema.safeParse(value)
  if (!record.success || !samePageStudioContentScope(record.data.scope, before.scope) || !sameFormSettingsIdentity(record.data, key.data)
    || (proposed && (record.data.revision !== proposed.expectedRevision + 1 || record.data.actorId !== before.actorId || record.data.checkpointId !== proposed.checkpointId || JSON.stringify(record.data.settings) !== JSON.stringify(proposed.settings)))) throw unavailable()
  return { record: record.data, canEdit: after.canEdit, activation: 'draft_only' }
}
