import { z } from 'zod'
import { admitFormDocument, recheckFormAuthority, type TrustedFormContext, type TrustedFormAuthority } from './formAuthority'
import { PageStudioBusinessContentError } from './businessContent'
import { PageStudioContentScopeSchema, samePageStudioContentScope } from '~~/shared/pageStudio/businessContent'
import { collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { formCatalogue } from '~~/shared/pageStudio/formCatalogue'
import { EmailTemplateRecordSchema, type EmailAudienceSchema, type EmailTemplate } from '~~/shared/pageStudio/emailTemplates'
import { EmailTemplateProposalDraftSchema, EmailTemplateProposalRequestSchema, EmailTemplateProposalSchema, applyEmailTemplateProposal, captureEmailTemplateDraft, decodeEmailTemplateProposalOutput } from '~~/shared/pageStudio/emailTemplateProposals'

const TargetSchema = EmailTemplateProposalDraftSchema.pick({ apiAudience: true, audience: true, definitionId: true }).strict()
const ReceiptSchema = z.object({
  scope: PageStudioContentScopeSchema, operationId: z.string(), fingerprint: z.string(),
  kind: z.literal('model'), charged: z.literal(true), admitted: z.boolean(),
  state: z.enum(['reserved', 'succeeded', 'failed'])
}).strict()
export interface EmailTemplateGenerationInput {
  prompt: string
  audience: z.infer<typeof EmailAudienceSchema>
  template: EmailTemplate
  siteName: string
  formName: string
  fields: { id: string, name: string, type: string }[]
}
interface UsageOperation {
  authority: TrustedFormAuthority
  operationId: string
  fingerprint: string
  kind: 'model'
}
/** Server-owned adapters must use the enabled catalogue, bounded Gateway calls
 * and atomic shared allowance accounting. No default adapter or public route is
 * supplied here; native preview's zero allowance must remain closed. */
export interface EmailTemplateGenerationExecution {
  resolveModel: (modelId: string) => Promise<{ id: string, invoke: (input: EmailTemplateGenerationInput) => Promise<string> } | null>
  reserve: (input: UsageOperation) => Promise<unknown>
  settle: (input: UsageOperation & { outcome: 'succeeded' | 'failed' }) => Promise<unknown>
}
const failure = (code: string, status: number, message: string) => new PageStudioBusinessContentError(code, status, message)
const unavailable = () => failure('EMAIL_AI_UNAVAILABLE', 503, 'Email design generation is unavailable. Your draft has not changed.')
const conflict = () => failure('EMAIL_AI_CONFLICT', 409, 'The form or its saved template changed. Reload before requesting another proposal.')
const uncertain = () => failure('EMAIL_AI_UNCERTAIN', 503, 'The generation outcome could not be confirmed. Your draft has not changed. Do not automatically retry this request.')

export async function generateEmailTemplateProposal(context: TrustedFormContext, target: unknown, body: unknown, execution: EmailTemplateGenerationExecution) {
  // Zod detaches nested input before any await; the caller cannot change the base
  // while current authority, model availability or accounting is being resolved.
  const request = EmailTemplateProposalRequestSchema.safeParse(body)
  const selection = TargetSchema.safeParse(target)
  if (!request.success || !selection.success) throw failure('EMAIL_AI_INVALID', 400, 'Check the email design request and try again.')
  const edit = request.data
  const selected = selection.data
  const before = structuredClone(await context.authorize(true))
  if (!before.canEdit) throw failure('FORM_AUTHORITY_DENIED', 403, 'Form access denied')

  const readBase = async () => {
    await recheckFormAuthority(context, before, true)
    const document = await context.readDocument(before.scope)
    await recheckFormAuthority(context, before, true)
    admitFormDocument(document, before.scope)
    if (!document.studio || !context.service?.readEmailTemplateDraft) throw unavailable()
    if (document.studio.checkpointId !== edit.checkpointId) throw conflict()
    const item = formCatalogue(document.studio.pages, document.studio.formLibrary).find(item => item.placements.some(placement => placement.pageId === edit.pageId && placement.formId === edit.formId))
    if (!item?.form.fields || (selected.definitionId !== undefined && item.definitionId !== selected.definitionId)) {
      throw failure('FORM_NOT_FOUND', 404, 'Choose a saved form for this template.')
    }
    // Copy only schema, never submitted answers or configured field defaults.
    const form = { siteName: document.site.name, formName: item.form.name || 'Website form', fields: item.form.fields.map(({ id, name, type }) => ({ id, name, type })) }
    let saved: unknown
    try {
      saved = await context.service.readEmailTemplateDraft({ scope: before.scope, audience: selected.audience })
    } catch { throw unavailable() }
    await recheckFormAuthority(context, before, true)
    const record = saved === null ? null : EmailTemplateRecordSchema.safeParse(saved)
    if (record && (!record.success || !samePageStudioContentScope(record.data.scope, before.scope) || record.data.audience !== selected.audience)) throw unavailable()
    if ((record?.success ? record.data.revision : 0) !== edit.expectedRevision) throw conflict()
    return form
  }
  const form = await readBase()
  const media = await context.resolveMedia(edit.template)
  await recheckFormAuthority(context, before, true)
  if (media.warnings.length) throw unavailable()
  const model = await execution.resolveModel(edit.modelId)
  await recheckFormAuthority(context, before, true)
  if (!model || model.id !== edit.modelId) throw unavailable()
  const { operationId, modelId, prompt, ...draftEdit } = edit
  const draft = { ...draftEdit, ...selected, siteId: before.scope.siteId }
  const snapshot = await captureEmailTemplateDraft(draft)
  const fingerprint = await collectionDigest({ purpose: 'email-template-proposal-v1', modelId, prompt, baseDigest: snapshot.digest, form })
  const operation: UsageOperation = { authority: before, operationId, fingerprint, kind: 'model' }
  const matchesReceipt = (value: unknown, state: 'reserved' | 'succeeded' | 'failed') => {
    const parsed = ReceiptSchema.safeParse(value)
    return parsed.success && samePageStudioContentScope(parsed.data.scope, before.scope)
      && parsed.data.operationId === operationId && parsed.data.fingerprint === fingerprint
      && parsed.data.state === state && parsed.data.admitted === (state === 'reserved')
  }
  // Hashing/model lookup may have yielded while another editor changed the base.
  const checkBase = async () => {
    if (JSON.stringify(await readBase()) !== JSON.stringify(form)) throw conflict()
  }
  await checkBase()
  let receipt: unknown
  try {
    receipt = await execution.reserve(operation)
  } catch (error) {
    // The adapter may have committed before losing its response. Only an explicit
    // allowance denial is a known rejection; never leak underlying error details.
    if (error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 429) {
      throw failure('EMAIL_AI_ALLOWANCE_EXHAUSTED', 429, 'The AI allowance has been reached. Your draft has not changed.')
    }
    throw uncertain()
  }
  if (!matchesReceipt(receipt, 'reserved')) throw uncertain()
  await checkBase()

  let raw: string
  try {
    raw = await model.invoke({ prompt, audience: selected.audience, template: edit.template, ...form })
  } catch {
    // Provider failure may mean a completed billable call. Retain the reservation;
    // neither a retry nor a refunded outcome can be inferred from transport errors.
    throw uncertain()
  }
  const settle = async (outcome: 'succeeded' | 'failed') => {
    let value: unknown
    try {
      value = await execution.settle({ ...operation, outcome })
    } catch { throw uncertain() }
    if (!matchesReceipt(value, outcome)) throw uncertain()
  }
  let proposal: z.infer<typeof EmailTemplateProposalSchema>
  try {
    proposal = EmailTemplateProposalSchema.parse({ ...decodeEmailTemplateProposalOutput(raw), schemaVersion: 1, id: crypto.randomUUID(), baseDigest: snapshot.digest, modelId, operationId })
    applyEmailTemplateProposal(proposal, snapshot, draft)
  } catch {
    await settle('failed')
    throw failure('EMAIL_AI_OUTPUT_INVALID', 502, 'The generated design could not be validated. Your draft has not changed.')
  }
  await checkBase()
  await settle('succeeded')
  await checkBase()
  // Generation never saves: Apply and the existing revision-checked Save remain
  // separate explicit editor actions, with a fresh local snapshot comparison.
  return proposal
}
