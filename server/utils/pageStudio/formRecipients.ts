import { admitFormDocument, portalFormContext, recheckFormAuthority, type TrustedFormContext } from './formAuthority'
import { PageStudioBusinessContentError } from './businessContent'
import type { authorizePageStudioBusinessContent, ContentAuthorityRequest } from './businessContent'
import type { getPageStudioDocument } from './documents'
import { samePageStudioContentScope } from '~~/shared/pageStudio/businessContent'
import { FormRecipientsEditSchema, FormRecipientsRecordSchema, type FormRecipientsState } from '~~/shared/pageStudio/formRecipients'

interface Dependencies {
  authorize?: typeof authorizePageStudioBusinessContent
  document?: typeof getPageStudioDocument
}
const invalid = (message: string) => new PageStudioBusinessContentError('FORM_RECIPIENTS_INVALID', 400, message)
const unavailable = () => new PageStudioBusinessContentError('FORM_RECIPIENTS_UNAVAILABLE', 503, 'Form recipients storage is not connected. Your website has not changed.')
const conflict = () => new PageStudioBusinessContentError('FORM_RECIPIENTS_CONFLICT', 409, 'This form or its settings changed. Reload the saved version before saving again.')

export async function operateFormRecipients(request: ContentAuthorityRequest, body?: unknown, deps: Dependencies = {}): Promise<FormRecipientsState> {
  return operateTrustedFormRecipients(portalFormContext(request, deps), body)
}

export async function operateTrustedFormRecipients(context: TrustedFormContext, body?: unknown): Promise<FormRecipientsState> {
  const writing = body !== undefined
  // This is operational draft configuration, not a legacy CMS-content write.
  const before = await context.authorize(writing)
  const document = await context.readDocument(before.scope)
  await recheckFormAuthority(context, before, writing)
  admitFormDocument(document, before.scope)
  if (!document.studio) throw unavailable()
  const service = context.service
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
      value = await service.writeFormRecipientsDraft({ scope: before.scope, ...proposed, actorId: before.actorId })
    } else {
      if (!service?.readFormRecipientsDraft) throw unavailable()
      value = await service.readFormRecipientsDraft({ scope: before.scope })
    }
  } catch (error) {
    if (error instanceof PageStudioBusinessContentError) throw error
    if (error instanceof Error && error.message === 'Form recipients revision conflict') throw conflict()
    // A failed save may have committed. Never automatically replay writes.
    throw unavailable()
  }
  const after = await recheckFormAuthority(context, before, writing)
  if (value === null && !writing) return { record: null, canEdit: after.canEdit, activation: 'draft_only' }
  const record = FormRecipientsRecordSchema.safeParse(value)
  if (!record.success || !samePageStudioContentScope(record.data.scope, before.scope)
    || (proposed && (record.data.revision !== proposed.expectedRevision + 1 || record.data.actorId !== before.actorId || record.data.checkpointId !== proposed.checkpointId || JSON.stringify(record.data.settings) !== JSON.stringify(proposed.settings)))) throw unavailable()
  return { record: record.data, canEdit: after.canEdit, activation: 'draft_only' }
}
