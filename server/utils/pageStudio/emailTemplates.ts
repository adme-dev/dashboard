import { authorizePageStudioBusinessContent, PageStudioBusinessContentError as SettingsError, type ContentAuthorityRequest } from './businessContent'
import { getPageStudioDocument } from './documents'
import { samePageStudioContentScope } from '~~/shared/pageStudio/businessContent'
import { EmailTemplateEditSchema, EmailTemplateRecordSchema, EmailAudienceSchema, type EmailTemplateState } from '~~/shared/pageStudio/emailTemplates'

interface Dependencies {
  authorize?: typeof authorizePageStudioBusinessContent
  document?: typeof getPageStudioDocument
}
const invalid = (message: string) => new SettingsError('EMAIL_TEMPLATE_INVALID', 400, message)
const unavailable = () => new SettingsError('EMAIL_TEMPLATE_UNAVAILABLE', 503, 'Email template storage is not connected. Your website has not changed.')
const conflict = () => new SettingsError('EMAIL_TEMPLATE_CONFLICT', 409, 'This form or its settings changed. Reload the saved version before saving again.')

export async function operateEmailTemplate(request: ContentAuthorityRequest, audience: string, body?: unknown, deps: Dependencies = {}): Promise<EmailTemplateState> {
  const parsedAudience = EmailAudienceSchema.safeParse(audience)
  if (!parsedAudience.success) throw invalid('Unknown email audience')
  const writing = body !== undefined
  const authorize = deps.authorize ?? authorizePageStudioBusinessContent
  // This is operational draft configuration, not a legacy CMS-content write.
  const before = await authorize(request, writing, { policyOnly: true })
  const document = await (deps.document ?? getPageStudioDocument)(before.scope.tenantId, request.siteId, request.env.PAGE_STUDIO_CHECKPOINTS as Parameters<typeof getPageStudioDocument>[2])
  if (!document.studio) throw unavailable()
  const current = await authorize(request, writing, { policyOnly: true })
  if (!samePageStudioContentScope(before.scope, current.scope)) throw new SettingsError('EMAIL_TEMPLATE_DENIED', 403, 'Email template access denied')
  const service = request.env.PAGE_STUDIO_CONTENT_ROUTER as { readEmailTemplateDraft?: (input: unknown) => Promise<unknown>, writeEmailTemplateDraft?: (input: unknown) => Promise<unknown> } | undefined
  const edit = writing ? EmailTemplateEditSchema.safeParse(body) : undefined
  if (edit && !edit.success) throw invalid('Check the template fields and variables and try again')
  const proposed = edit?.success ? edit.data : undefined
  if (proposed) {
    if (proposed.checkpointId !== document.studio.checkpointId) throw conflict()
  }

  let value: unknown
  try {
    if (proposed) {
      if (!service?.writeEmailTemplateDraft) throw unavailable()
      value = await service.writeEmailTemplateDraft({ scope: before.scope, audience: parsedAudience.data, ...proposed, actorId: request.actor.actorId })
    } else {
      if (!service?.readEmailTemplateDraft) throw unavailable()
      value = await service.readEmailTemplateDraft({ scope: before.scope, audience: parsedAudience.data })
    }
  } catch (error) {
    if (error instanceof SettingsError) throw error
    if (error instanceof Error && error.message === 'Email template revision conflict') throw conflict()
    // A failed save may have committed. Never automatically replay writes.
    throw unavailable()
  }
  const after = await authorize(request, writing, { policyOnly: true })
  if (!samePageStudioContentScope(before.scope, after.scope)) throw new SettingsError('EMAIL_TEMPLATE_DENIED', 403, 'Email template access denied')
  if (value === null && !writing) return { record: null, canEdit: after.canEdit, activation: 'draft_only' }
  const record = EmailTemplateRecordSchema.safeParse(value)
  if (!record.success || !samePageStudioContentScope(record.data.scope, before.scope)
    || record.data.audience !== parsedAudience.data
    || (proposed && (record.data.revision !== proposed.expectedRevision + 1 || record.data.actorId !== request.actor.actorId || record.data.checkpointId !== proposed.checkpointId || JSON.stringify(record.data.template) !== JSON.stringify(proposed.template)))) throw unavailable()
  return { record: record.data, canEdit: after.canEdit, activation: 'draft_only' }
}
