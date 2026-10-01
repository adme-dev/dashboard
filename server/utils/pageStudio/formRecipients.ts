import { authorizePageStudioBusinessContent, PageStudioBusinessContentError as SettingsError, type ContentAuthorityRequest } from './businessContent'
import { getPageStudioDocument } from './documents'
import { samePageStudioContentScope } from '~~/shared/pageStudio/businessContent'
import { FormRecipientsEditSchema, FormRecipientsRecordSchema, type FormRecipientsState } from '~~/shared/pageStudio/formRecipients'

interface Dependencies {
  authorize?: typeof authorizePageStudioBusinessContent
  document?: typeof getPageStudioDocument
}
const invalid = (message: string) => new SettingsError('FORM_RECIPIENTS_INVALID', 400, message)
const unavailable = () => new SettingsError('FORM_RECIPIENTS_UNAVAILABLE', 503, 'Form recipients storage is not connected. Your website has not changed.')
const conflict = () => new SettingsError('FORM_RECIPIENTS_CONFLICT', 409, 'This form or its settings changed. Reload the saved version before saving again.')

export async function operateFormRecipients(request: ContentAuthorityRequest, body?: unknown, deps: Dependencies = {}): Promise<FormRecipientsState> {
  const writing = body !== undefined
  const authorize = deps.authorize ?? authorizePageStudioBusinessContent
  // This is operational draft configuration, not a legacy CMS-content write.
  const before = await authorize(request, writing, { policyOnly: true })
  const document = await (deps.document ?? getPageStudioDocument)(before.scope.tenantId, request.siteId, request.env.PAGE_STUDIO_CHECKPOINTS as Parameters<typeof getPageStudioDocument>[2])
  if (!document.studio) throw unavailable()
  const current = await authorize(request, writing, { policyOnly: true })
  if (!samePageStudioContentScope(before.scope, current.scope)) throw new SettingsError('FORM_RECIPIENTS_DENIED', 403, 'Form recipients access denied')
  const service = request.env.PAGE_STUDIO_CONTENT_ROUTER as { readFormRecipientsDraft?: (input: unknown) => Promise<unknown>, writeFormRecipientsDraft?: (input: unknown) => Promise<unknown> } | undefined
  const edit = writing ? FormRecipientsEditSchema.safeParse(body) : undefined
  if (edit && !edit.success) throw invalid('Check the recipient addresses and try again')
  const proposed = edit?.success ? edit.data : undefined
  if (proposed) {
    if (proposed.checkpointId !== document.studio.checkpointId) throw conflict()
    const definitions = new Set(document.studio.formLibrary?.definitions.map(item => item.id) ?? [])
    if (proposed.settings.overrides.some(item => !definitions.has(item.definitionId))) throw invalid('A form override no longer matches this website. Reload the saved website and review the override.')
  }

  let value: unknown
  try {
    if (proposed) {
      if (!service?.writeFormRecipientsDraft) throw unavailable()
      value = await service.writeFormRecipientsDraft({ scope: before.scope, ...proposed, actorId: request.actor.actorId })
    } else {
      if (!service?.readFormRecipientsDraft) throw unavailable()
      value = await service.readFormRecipientsDraft({ scope: before.scope })
    }
  } catch (error) {
    if (error instanceof SettingsError) throw error
    if (error instanceof Error && error.message === 'Form recipients revision conflict') throw conflict()
    // A failed save may have committed. Never automatically replay writes.
    throw unavailable()
  }
  const after = await authorize(request, writing, { policyOnly: true })
  if (!samePageStudioContentScope(before.scope, after.scope)) throw new SettingsError('FORM_RECIPIENTS_DENIED', 403, 'Form recipients access denied')
  if (value === null && !writing) return { record: null, canEdit: after.canEdit, activation: 'draft_only' }
  const record = FormRecipientsRecordSchema.safeParse(value)
  if (!record.success || !samePageStudioContentScope(record.data.scope, before.scope)
    || (proposed && (record.data.revision !== proposed.expectedRevision + 1 || record.data.actorId !== request.actor.actorId || record.data.checkpointId !== proposed.checkpointId || JSON.stringify(record.data.settings) !== JSON.stringify(proposed.settings)))) throw unavailable()
  return { record: record.data, canEdit: after.canEdit, activation: 'draft_only' }
}
