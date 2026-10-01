import { authorizePageStudioBusinessContent, PageStudioBusinessContentError as SettingsError, type ContentAuthorityRequest } from './businessContent'
import { resolveEmailTemplateMedia } from './emailTemplateMedia'
import { getPageStudioDocument } from './documents'
import { samePageStudioContentScope } from '~~/shared/pageStudio/businessContent'
import { EmailTemplateWriteSchema, EmailTemplateEditSchema, EmailTemplateOverrideEditSchema, defaultWebsiteEmailTemplate, EmailTemplateRecordSchema, EmailAudienceSchema, type EmailTemplateState } from '~~/shared/pageStudio/emailTemplates'

interface Dependencies {
  authorize?: typeof authorizePageStudioBusinessContent
  document?: typeof getPageStudioDocument
  media?: typeof resolveEmailTemplateMedia
}
const invalid = (message: string) => new SettingsError('EMAIL_TEMPLATE_INVALID', 400, message)
const unavailable = () => new SettingsError('EMAIL_TEMPLATE_UNAVAILABLE', 503, 'Email template storage is not connected. Your website has not changed.')
const conflict = () => new SettingsError('EMAIL_TEMPLATE_CONFLICT', 409, 'This form or its settings changed. Reload the saved version before saving again.')

export async function operateEmailTemplate(request: ContentAuthorityRequest, audience: string, body?: unknown, deps: Dependencies = {}, definitionId?: string): Promise<EmailTemplateState> {
  const parsedAudience = EmailAudienceSchema.safeParse(audience)
  if (!parsedAudience.success) throw invalid('Unknown email audience')
  const writing = body !== undefined
  const authorize = deps.authorize ?? authorizePageStudioBusinessContent
  // This is operational draft configuration, not a legacy CMS-content write.
  const before = await authorize(request, writing, { policyOnly: true })
  const document = await (deps.document ?? getPageStudioDocument)(before.scope.tenantId, request.siteId, request.env.PAGE_STUDIO_CHECKPOINTS as Parameters<typeof getPageStudioDocument>[2])
  if (!document.studio) throw unavailable()
  const service = request.env.PAGE_STUDIO_CONTENT_ROUTER as { readEmailTemplateDraft?: (input: unknown) => Promise<unknown>, writeEmailTemplateDraft?: (input: unknown) => Promise<unknown> } | undefined
  if (definitionId !== undefined && !document.studio.formLibrary?.definitions.some(item => item.id === definitionId)) throw new SettingsError('FORM_NOT_FOUND', 404, 'Choose a saved shared form')
  const edit = writing ? (definitionId !== undefined ? EmailTemplateOverrideEditSchema : EmailTemplateEditSchema).safeParse(body) : undefined
  if (edit && !edit.success) throw invalid('Check the template fields and variables and try again')
  const proposed = edit?.success ? edit.data : undefined
  if (proposed) {
    if (proposed.checkpointId !== document.studio.checkpointId) throw conflict()
    if (proposed.template) {
      const media = await (deps.media ?? resolveEmailTemplateMedia)(request, proposed.template)
      if (media.warnings.length) throw invalid(media.warnings[0]!)
    }
  }

  const current = await authorize(request, writing, { policyOnly: true })
  if (!samePageStudioContentScope(before.scope, current.scope)) throw new SettingsError('EMAIL_TEMPLATE_DENIED', 403, 'Email template access denied')

  let value: unknown
  let outgoing: { template: ReturnType<typeof defaultWebsiteEmailTemplate>, overrides: NonNullable<NonNullable<EmailTemplateState['record']>['overrides']> } | undefined
  const decode = (value: unknown) => {
    const parsed = EmailTemplateRecordSchema.safeParse(value)
    if (!parsed.success || !samePageStudioContentScope(parsed.data.scope, before.scope) || parsed.data.audience !== parsedAudience.data) throw unavailable()
    return parsed.data
  }
  try {
    if (proposed) {
      if (!service?.writeEmailTemplateDraft) throw unavailable()
      if (!service.readEmailTemplateDraft) throw unavailable()
      const saved = await service.readEmailTemplateDraft({ scope: before.scope, audience: parsedAudience.data })
      const head = saved === null ? null : decode(saved)
      if ((head?.revision ?? 0) !== proposed.expectedRevision) throw conflict()
      const overrides = head?.overrides ?? []
      outgoing = definitionId !== undefined
        ? { template: head?.template ?? defaultWebsiteEmailTemplate(parsedAudience.data), overrides: [...overrides.filter(item => item.definitionId !== definitionId), ...(proposed.template ? [{ definitionId, template: proposed.template }] : [])] }
        : { template: proposed.template!, overrides }
      const write = EmailTemplateWriteSchema.safeParse({ scope: before.scope, audience: parsedAudience.data, ...proposed, ...outgoing, actorId: request.actor.actorId })
      if (!write.success) throw invalid(write.error.issues[0]?.message ?? 'Check your template settings')
      outgoing = { template: write.data.template, overrides: write.data.overrides ?? [] }
      value = await service.writeEmailTemplateDraft(write.data)
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
    || (proposed && (record.data.revision !== proposed.expectedRevision + 1 || record.data.actorId !== request.actor.actorId || record.data.checkpointId !== proposed.checkpointId || JSON.stringify(record.data.template) !== JSON.stringify(outgoing?.template) || JSON.stringify(record.data.overrides ?? []) !== JSON.stringify(outgoing?.overrides)))) throw unavailable()
  return { record: record.data, canEdit: after.canEdit, activation: 'draft_only' }
}
