import { authorizePageStudioBusinessContent, PageStudioBusinessContentError as SettingsError, type ContentAuthorityRequest } from './businessContent'
import { getPageStudioDocument } from './documents'
import { samePageStudioContentScope } from '~~/shared/pageStudio/businessContent'
import { FormSettingsEditSchema, FormSettingsReadSchema, FormSettingsRecordSchema, type FormSettingsState } from '~~/shared/pageStudio/formSettings'
import { validateFormOutcomeFields } from '~~/shared/pageStudio/formOutcomes'

interface Dependencies {
  authorize?: typeof authorizePageStudioBusinessContent
  document?: typeof getPageStudioDocument
}
const invalid = (message: string) => new SettingsError('FORM_SETTINGS_INVALID', 400, message)
const unavailable = () => new SettingsError('FORM_SETTINGS_UNAVAILABLE', 503, 'Form settings storage is not connected. Your website has not changed.')
const conflict = () => new SettingsError('FORM_SETTINGS_CONFLICT', 409, 'This form or its settings changed. Reload the saved version before saving again.')

export async function operateFormSettings(request: ContentAuthorityRequest, identity: { pageId: string, formId: string }, body?: unknown, deps: Dependencies = {}): Promise<FormSettingsState> {
  const writing = body !== undefined
  const authorize = deps.authorize ?? authorizePageStudioBusinessContent
  // This is operational draft configuration, not a legacy CMS-content write.
  const before = await authorize(request, writing, { policyOnly: true })
  const key = FormSettingsReadSchema.safeParse({ scope: before.scope, ...identity })
  if (!key.success) throw invalid('Invalid form selection')
  const document = await (deps.document ?? getPageStudioDocument)(before.scope.tenantId, request.siteId, request.env.PAGE_STUDIO_CHECKPOINTS as Parameters<typeof getPageStudioDocument>[2])
  const form = document.studio?.pages.find(page => page.id === identity.pageId)?.forms.find(item => item.id === identity.formId)
  if (!form || !document.studio || !form.fields) throw new SettingsError('FORM_NOT_FOUND', 404, 'The saved form is not available')
  const current = await authorize(request, writing, { policyOnly: true })
  if (!samePageStudioContentScope(before.scope, current.scope)) throw new SettingsError('FORM_SETTINGS_DENIED', 403, 'Form settings access denied')
  const service = request.env.PAGE_STUDIO_CONTENT_ROUTER as { readFormSettingsDraft?: (input: unknown) => Promise<unknown>, writeFormSettingsDraft?: (input: unknown) => Promise<unknown> } | undefined
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
      value = await service.writeFormSettingsDraft({ ...key.data, ...proposed, actorId: request.actor.actorId })
    } else {
      if (!service?.readFormSettingsDraft) throw unavailable()
      value = await service.readFormSettingsDraft(key.data)
    }
  } catch (error) {
    if (error instanceof SettingsError) throw error
    if (error instanceof Error && error.message === 'Form settings revision conflict') throw conflict()
    // A failed save may have committed. Never automatically replay writes.
    throw unavailable()
  }
  const after = await authorize(request, writing, { policyOnly: true })
  if (!samePageStudioContentScope(before.scope, after.scope)) throw new SettingsError('FORM_SETTINGS_DENIED', 403, 'Form settings access denied')
  if (value === null && !writing) return { record: null, canEdit: after.canEdit, activation: 'draft_only' }
  const record = FormSettingsRecordSchema.safeParse(value)
  if (!record.success || !samePageStudioContentScope(record.data.scope, before.scope) || record.data.formId !== identity.formId || record.data.pageId !== identity.pageId
    || (proposed && (record.data.revision !== proposed.expectedRevision + 1 || record.data.actorId !== request.actor.actorId || record.data.checkpointId !== proposed.checkpointId || JSON.stringify(record.data.settings) !== JSON.stringify(proposed.settings)))) throw unavailable()
  return { record: record.data, canEdit: after.canEdit, activation: 'draft_only' }
}
