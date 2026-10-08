import { z } from 'zod'
import { collectionCanonical, collectionDigest } from './collectionApi'
import { EmailAudienceSchema, EmailTemplateEditSchema, ValidatedEmailTemplateSchema, emailTemplateImages, type EmailTemplate } from './emailTemplates'

const identity = z.string().min(1).max(128).regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/)
export const EMAIL_TEMPLATE_PROPOSAL_MAX_BYTES = 300_000

/** A draft snapshot is a concurrency boundary, never proof of authorization.
 * Server adapters must independently admit the site, form, model and allowance. */
export const EmailTemplateProposalDraftSchema = EmailTemplateEditSchema.extend({
  siteId: z.string().uuid(),
  apiAudience: z.enum(['portal', 'customer']),
  audience: EmailAudienceSchema,
  definitionId: identity.optional(),
  pageId: identity,
  formId: identity,
  customised: z.boolean()
}).strict()
export type EmailTemplateProposalDraft = z.infer<typeof EmailTemplateProposalDraftSchema>

/** The provider supplies design only. Scope, billing and proposal identity are
 * attached by the authenticated server after output validation. */
export const EmailTemplateProposalOutputSchema = z.object({
  summary: z.string().trim().min(1).max(2000),
  warnings: z.array(z.string().trim().min(1).max(500)).max(5),
  template: ValidatedEmailTemplateSchema
}).strict()
export const EmailTemplateProposalSchema = EmailTemplateProposalOutputSchema.extend({
  schemaVersion: z.literal(1),
  id: z.string().uuid(),
  baseDigest: z.string().regex(/^[a-f0-9]{64}$/),
  modelId: z.string().trim().min(1).max(200),
  operationId: z.string().min(1).max(512).regex(/^[A-Za-z0-9][A-Za-z0-9_:-]*$/)
}).strict()
export type EmailTemplateProposal = z.infer<typeof EmailTemplateProposalSchema>
export interface EmailTemplateDraftSnapshot { readonly canonical: string, readonly digest: string }

function parseDraft(input: unknown): EmailTemplateProposalDraft {
  // Optional undefined properties disappear on the wire. Hash the same document
  // in the browser and server, including nested optional logo/identity fields.
  return JSON.parse(JSON.stringify(EmailTemplateProposalDraftSchema.parse(input)))
}

export async function captureEmailTemplateDraft(input: unknown): Promise<EmailTemplateDraftSnapshot> {
  // Parse and serialize before the first await, so typing during digest creation
  // cannot replace the request's base. Strings also avoid retaining live Vue refs.
  const draft = parseDraft(input)
  const canonical = collectionCanonical(draft)
  return Object.freeze({ canonical, digest: await collectionDigest(draft) })
}

export function decodeEmailTemplateProposalOutput(raw: string) {
  if (typeof raw !== 'string' || new TextEncoder().encode(raw).byteLength > EMAIL_TEMPLATE_PROPOSAL_MAX_BYTES) {
    throw new Error('The AI template response is too large')
  }
  // No markdown stripping, truncation or automatic model retries. Uncertain or
  // invalid generation does not alter the draft or imply a refunded model call.
  return EmailTemplateProposalOutputSchema.parse(JSON.parse(raw))
}

/** Called only by the explicit Apply action. Returns an unsaved detached design;
 * persistence, inherited/custom selection and undo remain owned by the editor.
 * Synchronous validation avoids a second edit racing an awaited digest at Apply. */
export function applyEmailTemplateProposal(input: unknown, requested: EmailTemplateDraftSnapshot, current: unknown): EmailTemplate {
  const proposal = EmailTemplateProposalSchema.parse(input)
  const draft = parseDraft(current)
  if (proposal.baseDigest !== requested.digest || collectionCanonical(draft) !== requested.canonical) {
    throw new Error('The draft or website changed. Review a new proposal before applying it.')
  }
  // A text model may arrange selected media but cannot invent a storage identity.
  // The server must still verify current asset ownership/availability at generation
  // and save; this local check is not that authorization boundary.
  const selectedImages = new Set(emailTemplateImages(draft.template).map(image => image.assetId))
  if (emailTemplateImages(proposal.template).some(image => !selectedImages.has(image.assetId))) {
    throw new Error('The proposal uses an image that was not selected in this draft.')
  }
  return proposal.template
}
