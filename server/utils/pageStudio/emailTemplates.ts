import { portalFormContext } from './portalFormContext'
import { formCatalogue } from '~~/shared/pageStudio/formCatalogue'
import { admitFormDocument, recheckFormAuthority, type TrustedFormContext } from './formAuthority'
import { PageStudioBusinessContentError } from './businessContent'
import type { authorizePageStudioBusinessContent, ContentAuthorityRequest } from './businessContent'
import type { resolveEmailTemplateMedia } from './emailTemplateMedia'
import type { getPageStudioDocument } from './documents'
import { samePageStudioContentScope } from '~~/shared/pageStudio/businessContent'
import { EmailTemplatePreviewSchema, EmailTemplateWriteSchema, WebsiteEmailTemplateEditSchema, EmailTemplateOverrideEditSchema, defaultWebsiteEmailTemplate, EmailTemplateRecordSchema, EmailAudienceSchema, EmailTemplateHistoryCursorSchema, EmailTemplateHistorySchema, EmailTemplateRevisionSchema, type EmailTemplateHistoryPage, type EmailTemplateHistoricalVersion, type EmailTemplateState } from '~~/shared/pageStudio/emailTemplates'

interface Dependencies {
  authorize?: typeof authorizePageStudioBusinessContent
  document?: typeof getPageStudioDocument
  media?: typeof resolveEmailTemplateMedia
}
const invalid = (message: string) => new PageStudioBusinessContentError('EMAIL_TEMPLATE_INVALID', 400, message)
const unavailable = () => new PageStudioBusinessContentError('EMAIL_TEMPLATE_UNAVAILABLE', 503, 'Email template storage is not connected. Your website has not changed.')
const conflict = () => new PageStudioBusinessContentError('EMAIL_TEMPLATE_CONFLICT', 409, 'This form or its settings changed. Reload the saved version before saving again.')

export async function operateEmailTemplate(request: ContentAuthorityRequest, audience: string, body?: unknown, deps: Dependencies = {}, definitionId?: string): Promise<EmailTemplateState> {
  return operateTrustedEmailTemplate(portalFormContext(request, deps), audience, body, definitionId)
}

export async function operateTrustedEmailTemplate(context: TrustedFormContext, audience: string, body?: unknown, definitionId?: string): Promise<EmailTemplateState> {
  const parsedAudience = EmailAudienceSchema.safeParse(audience)
  if (!parsedAudience.success) throw invalid('Unknown email audience')
  const writing = body !== undefined
  // This is operational draft configuration, not a legacy CMS-content write.
  const before = await context.authorize(writing)
  const document = await context.readDocument(before.scope)
  await recheckFormAuthority(context, before, writing)
  admitFormDocument(document, before.scope)
  if (!document.studio) throw unavailable()
  const service = context.service
  if (definitionId !== undefined && !document.studio.formLibrary?.definitions.some(item => item.id === definitionId)) throw new PageStudioBusinessContentError('FORM_NOT_FOUND', 404, 'Choose a saved shared form')
  const websiteEdit = writing && definitionId === undefined ? WebsiteEmailTemplateEditSchema.safeParse(body) : undefined
  const edit = writing && definitionId !== undefined ? EmailTemplateOverrideEditSchema.safeParse(body) : websiteEdit
  if (edit && !edit.success) throw invalid('Check the template fields and variables and try again')
  const proposed = edit?.success ? edit.data : undefined
  if (proposed && proposed.checkpointId !== document.studio.checkpointId) throw conflict()

  await recheckFormAuthority(context, before, writing)

  let value: unknown
  let outgoing: { template: ReturnType<typeof defaultWebsiteEmailTemplate>, overrides: NonNullable<NonNullable<EmailTemplateState['record']>['overrides']> } | undefined
  const decode = (value: unknown) => {
    const parsed = EmailTemplateRecordSchema.safeParse(value)
    if (!parsed.success || !samePageStudioContentScope(parsed.data.scope, before.scope) || parsed.data.audience !== parsedAudience.data) throw unavailable()
    return parsed.data
  }
  const removals = websiteEdit?.success ? websiteEdit.data.removeOverrideDefinitionIds ?? [] : []
  let head: ReturnType<typeof decode> | null = null
  if (proposed) {
    if (!service?.writeEmailTemplateDraft || !service.readEmailTemplateDraft) throw unavailable()
    let saved: unknown
    try {
      saved = await service.readEmailTemplateDraft({ scope: before.scope, audience: parsedAudience.data })
    } catch {
      throw unavailable()
    }
    await recheckFormAuthority(context, before, writing)
    head = saved === null ? null : decode(saved)
    if ((head?.revision ?? 0) !== proposed.expectedRevision) throw conflict()
    if (removals.some(id => !head?.overrides?.some(item => item.definitionId === id) || document.studio!.formLibrary?.definitions.some(item => item.id === id))) {
      throw invalid('Only templates for removed forms can be cleared. Reload the saved website and review your selection.')
    }
    // Removing unrelated overrides must still work if an unchanged default image
    // became unavailable. Any actual template edit retains normal media checks.
    const cleanupOnly = removals.length > 0 && JSON.stringify(proposed.template) === JSON.stringify(head?.template)
    if (proposed.template && !cleanupOnly) {
      const media = await context.resolveMedia(proposed.template)
      await recheckFormAuthority(context, before, writing)
      if (media.warnings.length) throw invalid(media.warnings[0]!)
    }
  }
  try {
    if (proposed) {
      if (!service?.writeEmailTemplateDraft) throw unavailable()
      const overrides = head?.overrides ?? []
      outgoing = definitionId !== undefined
        ? { template: head?.template ?? defaultWebsiteEmailTemplate(parsedAudience.data), overrides: [...overrides.filter(item => item.definitionId !== definitionId), ...(proposed.template ? [{ definitionId, template: proposed.template }] : [])] }
        : { template: proposed.template!, overrides: overrides.filter(item => !removals.includes(item.definitionId)) }
      const write = EmailTemplateWriteSchema.safeParse({ scope: before.scope, audience: parsedAudience.data, checkpointId: proposed.checkpointId, expectedRevision: proposed.expectedRevision, ...outgoing, actorId: before.actorId })
      if (!write.success) throw invalid(write.error.issues[0]?.message ?? 'Check your template settings')
      outgoing = { template: write.data.template, overrides: write.data.overrides ?? [] }
      value = await service.writeEmailTemplateDraft(write.data)
    } else {
      if (!service?.readEmailTemplateDraft) throw unavailable()
      value = await service.readEmailTemplateDraft({ scope: before.scope, audience: parsedAudience.data })
    }
  } catch (error) {
    if (error instanceof PageStudioBusinessContentError) throw error
    if (error instanceof Error && error.message === 'Email template revision conflict') throw conflict()
    // A failed save may have committed. Never automatically replay writes.
    throw unavailable()
  }
  const after = await recheckFormAuthority(context, before, writing)
  if (value === null && !writing) return { record: null, canEdit: after.canEdit, activation: 'draft_only' }
  const record = EmailTemplateRecordSchema.safeParse(value)
  if (!record.success || !samePageStudioContentScope(record.data.scope, before.scope)
    || record.data.audience !== parsedAudience.data
    || (proposed && (record.data.revision !== proposed.expectedRevision + 1 || record.data.actorId !== before.actorId || record.data.checkpointId !== proposed.checkpointId || JSON.stringify(record.data.template) !== JSON.stringify(outgoing?.template) || JSON.stringify(record.data.overrides ?? []) !== JSON.stringify(outgoing?.overrides)))) throw unavailable()
  const removedDefinitionIds = (record.data.overrides ?? []).filter(item => !document.studio!.formLibrary?.definitions.some(form => form.id === item.definitionId)).map(item => item.definitionId)
  return { record: record.data, canEdit: after.canEdit, activation: 'draft_only', removedDefinitionIds }
}

export async function previewTrustedEmailTemplate(context: TrustedFormContext, audience: string, body: unknown) {
  const parsed = EmailTemplatePreviewSchema.safeParse(body)
  if (!parsed.success || !EmailAudienceSchema.safeParse(audience).success) throw new PageStudioBusinessContentError('EMAIL_TEMPLATE_INVALID', 400, 'Check the template fields and preview form')
  const before = await context.authorize(false)
  const document = await context.readDocument(before.scope)
  await recheckFormAuthority(context, before, false)
  admitFormDocument(document, before.scope)
  const form = document.studio && formCatalogue(document.studio.pages, document.studio.formLibrary).find(item => item.placements.some(placement => placement.pageId === parsed.data.pageId && placement.formId === parsed.data.formId))?.form
  if (!form?.fields) throw new PageStudioBusinessContentError('FORM_NOT_FOUND', 404, 'Choose a saved form for the preview')
  const media = await context.resolveMedia(parsed.data.template)
  await recheckFormAuthority(context, before, false)
  const preview = await context.renderEmailPreview(parsed.data.template, { siteName: document.site.name, formName: form.name || 'Website form', fields: form.fields.map(({ id, name, type }) => ({ id, name, type })), images: media.images })
  await recheckFormAuthority(context, before, false)
  return { ...preview, warnings: media.warnings }
}

const historyUnavailable = () => new PageStudioBusinessContentError('EMAIL_TEMPLATE_HISTORY_UNAVAILABLE', 503, 'Email template history is unavailable on this website runtime. Your draft has not changed.')
const historyNotFound = () => new PageStudioBusinessContentError('EMAIL_TEMPLATE_REVISION_NOT_FOUND', 404, 'The saved template version is not available.')
async function authorizeTemplateHistory(context: TrustedFormContext, definitionId?: string) {
  const before = await context.authorize(false)
  const document = await context.readDocument(before.scope)
  await recheckFormAuthority(context, before, false)
  admitFormDocument(document, before.scope)
  if (!document.studio) throw historyUnavailable()
  if (definitionId !== undefined && !document.studio.formLibrary?.definitions.some(item => item.id === definitionId)) throw new PageStudioBusinessContentError('FORM_NOT_FOUND', 404, 'Choose a saved shared form')
  return before
}
/** The audience document log includes saves to its other shared-form templates. */
export async function listTrustedEmailTemplateHistory(context: TrustedFormContext, audience: string, cursor: unknown = {}, definitionId?: string): Promise<EmailTemplateHistoryPage> {
  const parsedAudience = EmailAudienceSchema.safeParse(audience)
  const parsedCursor = EmailTemplateHistoryCursorSchema.safeParse(cursor)
  if (!parsedAudience.success || !parsedCursor.success) throw invalid('Choose an email audience and a valid history cursor')
  const before = await authorizeTemplateHistory(context, definitionId)
  if (!context.service?.listEmailTemplateDraftHistory) throw historyUnavailable()
  let value: unknown
  try {
    value = await context.service.listEmailTemplateDraftHistory({ scope: before.scope, audience: parsedAudience.data, ...parsedCursor.data })
  } catch { throw historyUnavailable() }
  const current = await recheckFormAuthority(context, before, false)
  const page = EmailTemplateHistorySchema.safeParse(value)
  if (!page.success || !samePageStudioContentScope(page.data.scope, before.scope) || page.data.audience !== parsedAudience.data || page.data.revisions.some(item => parsedCursor.data.beforeRevision !== undefined && item.revision >= parsedCursor.data.beforeRevision)) throw historyUnavailable()
  return { audience: page.data.audience, canEdit: current.canEdit, revisions: page.data.revisions, nextBeforeRevision: page.data.nextBeforeRevision }
}
export async function readTrustedEmailTemplateRevision(context: TrustedFormContext, audience: string, revision: unknown, definitionId?: string): Promise<EmailTemplateHistoricalVersion> {
  const parsedAudience = EmailAudienceSchema.safeParse(audience)
  const parsedRevision = EmailTemplateRevisionSchema.safeParse(revision)
  if (!parsedAudience.success || !parsedRevision.success) throw invalid('Choose an email audience and a valid saved revision')
  const before = await authorizeTemplateHistory(context, definitionId)
  if (!context.service?.readEmailTemplateDraft) throw historyUnavailable()
  let value: unknown
  try {
    value = await context.service.readEmailTemplateDraft({ scope: before.scope, audience: parsedAudience.data, revision: parsedRevision.data })
  } catch { throw historyUnavailable() }
  await recheckFormAuthority(context, before, false)
  if (value === null) throw historyNotFound()
  const record = EmailTemplateRecordSchema.safeParse(value)
  if (!record.success || !samePageStudioContentScope(record.data.scope, before.scope) || record.data.audience !== parsedAudience.data || record.data.revision !== parsedRevision.data) throw historyUnavailable()
  return { revision: record.data.revision, updatedAt: record.data.updatedAt, template: definitionId === undefined ? record.data.template : record.data.overrides?.find(item => item.definitionId === definitionId)?.template ?? null }
}
