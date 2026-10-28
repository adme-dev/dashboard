// Dependency-free (zod only): imported by policy/projection without loading executable services.
import { z } from 'zod'

export const DEPARTMENT_EMAIL_READ_NAMES = [
  'marketing_list_email_campaigns', 'marketing_get_email_campaign', 'marketing_list_email_audiences', 'marketing_get_email_send_proposal'
] as const
export const DEPARTMENT_EMAIL_WRITE_NAMES = [
  'marketing_create_email_campaign_draft', 'marketing_update_email_campaign_draft', 'marketing_set_email_campaign_audience',
  'marketing_propose_email_campaign_send', 'marketing_review_email_campaign_send', 'marketing_execute_email_campaign_send',
  'marketing_send_email_campaign_test', 'marketing_pause_email_campaign_send', 'marketing_cancel_email_campaign'
] as const
/** Writes whose effect leaves the application (Resend); the rest are local transactions. */
export const DEPARTMENT_EMAIL_PROVIDER_NAMES = ['marketing_execute_email_campaign_send', 'marketing_send_email_campaign_test'] as const
export type DepartmentEmailToolName = typeof DEPARTMENT_EMAIL_READ_NAMES[number] | typeof DEPARTMENT_EMAIL_WRITE_NAMES[number]

/** Proposal kind stored in the existing ai_pending_actions store (source = 'mcp'). */
export const EMAIL_SEND_PROPOSAL_ACTION = 'department_email_campaign_send'

const uuid = z.string().uuid()
const revision = z.string().regex(/^[0-9a-f]{64}$/, 'Use the revision returned by the read')
const client = { clientId: uuid }
const optionalEmail = z.string().trim().email().max(300)
const MAX_BODY_SOURCE_BYTES = 256 * 1024
/** Flyhub email document as produced by the Email Studio editor; validated and rendered by the service. */
const bodySource = z.record(z.string(), z.unknown())
  .refine(value => new TextEncoder().encode(JSON.stringify(value)).length <= MAX_BODY_SOURCE_BYTES, 'Email body document is too large')
/** Segment (filter_rules); grammar validated by the service with the native segment validator. */
const segment = z.record(z.string(), z.unknown())

const draftFields = {
  name: z.string().trim().min(1).max(200),
  subject: z.string().trim().max(300).nullable(),
  fromName: z.string().trim().max(200).nullable(),
  fromEmail: optionalEmail.nullable(),
  replyTo: optionalEmail.nullable(),
  previewText: z.string().trim().max(300).nullable(),
  bodySource,
  segment: segment.nullable()
}

export const departmentEmailContracts = {
  marketing_list_email_campaigns: z.strictObject({
    ...client,
    status: z.enum(['draft', 'scheduled', 'sending', 'paused', 'sent', 'cancelled']).optional(),
    afterId: uuid.optional(),
    limit: z.number().int().min(1).max(50).default(25)
  }),
  marketing_get_email_campaign: z.strictObject({ ...client, campaignId: uuid }),
  marketing_list_email_audiences: z.strictObject({ ...client }),
  marketing_get_email_send_proposal: z.strictObject({ ...client, proposalId: uuid }),
  marketing_create_email_campaign_draft: z.strictObject({
    ...client,
    name: draftFields.name,
    subject: draftFields.subject.optional(),
    fromName: draftFields.fromName.optional(),
    fromEmail: draftFields.fromEmail.optional(),
    replyTo: draftFields.replyTo.optional(),
    previewText: draftFields.previewText.optional(),
    bodySource: bodySource.optional(),
    templateId: uuid.optional(),
    segment: segment.optional(),
    acknowledgement: z.literal('CREATE_CLIENT_EMAIL_DRAFT')
  }).refine(v => !(v.bodySource && v.templateId), 'Use either bodySource or templateId, not both'),
  marketing_update_email_campaign_draft: z.strictObject({
    ...client,
    campaignId: uuid,
    expectedRevision: revision,
    patch: z.strictObject({
      name: draftFields.name.optional(),
      subject: draftFields.subject.optional(),
      fromName: draftFields.fromName.optional(),
      fromEmail: draftFields.fromEmail.optional(),
      replyTo: draftFields.replyTo.optional(),
      previewText: draftFields.previewText.optional(),
      bodySource: bodySource.optional(),
      segment: draftFields.segment.optional()
    }).refine(p => Object.keys(p).length > 0, 'Patch must change at least one field'),
    acknowledgement: z.literal('UPDATE_CLIENT_EMAIL_DRAFT')
  }),
  marketing_set_email_campaign_audience: z.strictObject({
    ...client,
    campaignId: uuid,
    expectedRevision: revision,
    listIds: z.array(uuid).min(1).max(20).refine(ids => new Set(ids).size === ids.length, 'Duplicate list ids'),
    acknowledgement: z.literal('SET_CLIENT_EMAIL_AUDIENCE')
  }),
  marketing_propose_email_campaign_send: z.strictObject({
    ...client,
    campaignId: uuid,
    expectedRevision: revision,
    acknowledgement: z.literal('PROPOSE_CLIENT_EMAIL_SEND')
  }),
  marketing_review_email_campaign_send: z.strictObject({
    ...client,
    proposalId: uuid,
    expectedFreezeRevision: revision,
    decision: z.enum(['approve', 'reject']),
    reason: z.string().trim().min(1).max(1000),
    acknowledgement: z.literal('RECORD_INDEPENDENT_EMAIL_SEND_DECISION')
  }),
  marketing_execute_email_campaign_send: z.strictObject({
    ...client,
    proposalId: uuid,
    expectedFreezeRevision: revision,
    acknowledgement: z.literal('SEND_APPROVED_CLIENT_EMAIL')
  }),
  marketing_send_email_campaign_test: z.strictObject({
    ...client,
    campaignId: uuid,
    expectedRevision: revision,
    acknowledgement: z.literal('SEND_TEST_EMAIL_TO_MY_VERIFIED_ADDRESS')
  }),
  marketing_pause_email_campaign_send: z.strictObject({
    ...client,
    campaignId: uuid,
    acknowledgement: z.literal('PAUSE_CLIENT_EMAIL_SEND')
  }),
  marketing_cancel_email_campaign: z.strictObject({
    ...client,
    campaignId: uuid,
    expectedStatus: z.enum(['draft', 'scheduled', 'sending', 'paused']),
    acknowledgement: z.literal('CANCEL_CLIENT_EMAIL_CAMPAIGN')
  })
} satisfies Record<DepartmentEmailToolName, z.ZodTypeAny>
