import { z } from 'zod'

const rawMimeKeyPattern
  = /^crm-email\/inbound\/\d{4}\/\d{2}\/\d{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/message\.eml$/i
const sha256Pattern = /^[a-f0-9]{64}$/
const contentTypePattern
  = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/
const emailAddressPattern = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/
const idempotencyKeyPattern = /^crm-inbound:[a-f0-9]{64}$/
const routeTokenPattern
  = /^v[1-9]\d{0,5}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{27}$/
const providerPattern = /^[a-z][a-z0-9_-]{1,63}$/
const MAX_RETENTION_MILLISECONDS = 30 * 24 * 60 * 60 * 1000

const noControlCharacters = (value: string) =>
  ![...value].some((character) => {
    const code = character.charCodeAt(0)
    return code < 32 || code === 127
  })

export const CrmEmailInboundQueueAttachmentSchema = z.object({
  r2ObjectKey: z.string().min(1).max(1024),
  filename: z.string().trim().min(1).max(500)
    .refine(value =>
      !value.includes('/')
      && !value.includes('\\')
      && noControlCharacters(value)
    ),
  contentType: z.string().max(255).regex(contentTypePattern),
  byteSize: z.number().int().min(0).max(5 * 1024 * 1024),
  sha256: z.string().regex(sha256Pattern),
  contentId: z.string().max(998).refine(noControlCharacters).nullable()
}).strict()

const retainedArtifactFields = {
  rawMimeR2Key: z.string().min(20).max(1024).regex(rawMimeKeyPattern),
  rawMimeSha256: z.string().regex(sha256Pattern),
  rawMimeExpiresAt: z.string().datetime({ offset: true }),
  attachments: z.array(CrmEmailInboundQueueAttachmentSchema).max(10),
  receivedAt: z.string().datetime({ offset: true })
}

function validateRetainedArtifacts(
  job: {
    rawMimeR2Key: string
    rawMimeExpiresAt: string
    receivedAt: string
    attachments: Array<{ r2ObjectKey: string, byteSize: number }>
  },
  context: z.RefinementCtx
): void {
  const prefix = job.rawMimeR2Key.slice(0, -'/message.eml'.length)
  const combinedBytes = job.attachments.reduce(
    (total, attachment, index) => {
      const expectedKey
        = `${prefix}/attachments/${String(index + 1).padStart(2, '0')}.bin`
      if (attachment.r2ObjectKey !== expectedKey) {
        context.addIssue({
          code: 'custom',
          path: ['attachments', index, 'r2ObjectKey'],
          message: 'Attachment R2 key does not match the raw MIME object'
        })
      }
      return total + attachment.byteSize
    },
    0
  )

  if (combinedBytes > 8 * 1024 * 1024) {
    context.addIssue({
      code: 'custom',
      path: ['attachments'],
      message: 'Combined attachment bytes exceed the inbound limit'
    })
  }

  const retention
    = Date.parse(job.rawMimeExpiresAt) - Date.parse(job.receivedAt)
  if (retention <= 0 || retention > MAX_RETENTION_MILLISECONDS) {
    context.addIssue({
      code: 'custom',
      path: ['rawMimeExpiresAt'],
      message: 'Raw MIME retention is outside the approved policy'
    })
  }
}

export const CrmEmailRetainedArtifactJobSchema = z.object({
  version: z.literal(1),
  type: z.literal('crm.email.retained'),
  routeKind: z.enum(['lead_inbox', 'conversation_reply']),
  routeToken: z.string().max(128).regex(routeTokenPattern),
  recipientDomain: z.string().trim().toLowerCase().min(3).max(253),
  provider: z.string().regex(providerPattern),
  providerMessageId: z.string().trim().min(1).max(500),
  ...retainedArtifactFields
}).strict().superRefine(validateRetainedArtifacts)

export const CrmEmailInboundQueueJobSchema = z.object({
  version: z.literal(1),
  type: z.literal('crm.email.inbound'),
  idempotencyKey: z.string().regex(idempotencyKeyPattern),
  routeId: z.string().uuid(),
  clientId: z.string().uuid(),
  conversationId: z.string().uuid().nullable(),
  routeKind: z.enum(['lead_inbox', 'conversation_reply']),
  provider: z.string().regex(providerPattern),
  providerMessageId: z.string().trim().min(1).max(500),
  ...retainedArtifactFields
}).strict().superRefine((job, context) => {
  if (
    (job.routeKind === 'lead_inbox' && job.conversationId !== null)
    || (job.routeKind === 'conversation_reply' && job.conversationId === null)
  ) {
    context.addIssue({
      code: 'custom',
      path: ['conversationId'],
      message: 'Conversation ownership does not match the route kind'
    })
  }
  validateRetainedArtifacts(job, context)
})

const messageHeaderSchema = z.string()
  .trim()
  .min(1)
  .max(998)
  .refine(noControlCharacters)

export const CrmEmailInboundAddressSchema = z.object({
  address: z.string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(320)
    .regex(emailAddressPattern),
  name: z.string()
    .trim()
    .min(1)
    .max(320)
    .refine(noControlCharacters)
    .nullable()
}).strict()

export const CrmEmailNormalizedInboundSchema = z.object({
  from: CrmEmailInboundAddressSchema,
  to: z.array(CrmEmailInboundAddressSchema).min(1).max(50),
  cc: z.array(CrmEmailInboundAddressSchema).max(50),
  replyTo: z.array(CrmEmailInboundAddressSchema).max(10),
  subject: z.string().trim().min(1).max(998).nullable(),
  text: z.string().max(512 * 1024).nullable(),
  internetMessageId: messageHeaderSchema.nullable(),
  inReplyTo: messageHeaderSchema.nullable(),
  references: z.array(messageHeaderSchema).max(100)
}).strict()

export const CrmEmailInboundProcessingRequestSchema = z.object({
  job: CrmEmailInboundQueueJobSchema,
  email: CrmEmailNormalizedInboundSchema
}).strict()

export type CrmEmailInboundQueueAttachment = z.infer<
  typeof CrmEmailInboundQueueAttachmentSchema
>
export type CrmEmailRetainedArtifactJob = z.infer<
  typeof CrmEmailRetainedArtifactJobSchema
>
export type CrmEmailInboundQueueJob = z.infer<
  typeof CrmEmailInboundQueueJobSchema
>
export type CrmEmailInboundProcessingRequest = z.infer<
  typeof CrmEmailInboundProcessingRequestSchema
>
