import { z } from 'zod'

const MAX_RAW_EMAIL_BYTES = 2 * 1024 * 1024
const MAX_ADF_ATTACHMENT_BYTES = 256 * 1024
const MAX_EXTRACTED_FIELDS = 100
const MAX_EXTRACTED_FIELD_VALUE_LENGTH = 4_000
const MAX_MESSAGE_LENGTH = 20_000

const SafeTextSchema = z.string()
  .max(MAX_EXTRACTED_FIELD_VALUE_LENGTH)
  .regex(/^[^\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]*$/, 'Contains unsafe control characters')

const SafeMessageSchema = z.string()
  .max(MAX_MESSAGE_LENGTH)
  .regex(/^[^\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]*$/, 'Contains unsafe control characters')

const HashSchema = z.string().regex(/^[a-f0-9]{64}$/, 'Expected a SHA-256 hash')
const UuidSchema = z.string().uuid()
const IsoTimestampSchema = z.string().datetime({ offset: true })
const ProviderAdapterIdSchema = z.string()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9_-]*$/, 'Expected a registered provider adapter identifier')
const MIN_PHONE_LIKE_DIGITS = 7
const PhoneLikeSequenceSchema = /\p{Nd}(?:[^\p{L}\p{N}]*\p{Nd})*/gu
const SafeSourceNameSchema = SafeTextSchema
  .trim()
  .min(1)
  .max(128)
  .regex(/^[\p{L}\p{N}][\p{L}\p{N} .&'’()/_-]*$/u, 'Expected a safe source display name')
  .refine((value) => {
    const candidates = value.match(PhoneLikeSequenceSchema) ?? []
    return candidates.every((candidate) => {
      const digitCount = candidate.match(/\p{Nd}/gu)?.length ?? 0
      return digitCount < MIN_PHONE_LIKE_DIGITS
    })
  }, 'Source display name resembles a phone identifier')
const SafeFieldKeySchema = z.string()
  .min(1)
  .max(255)
  .regex(/^[A-Za-z][A-Za-z0-9_.-]*$/, 'Expected a safe field identifier')
const RecipientTokenSchema = z.string()
  .regex(/^[0123456789abcdefghjkmnpqrstvwxyz]{10}$/, 'Expected a lowercase Crockford Base32 email endpoint token')
const EncryptedObjectKeySchema = z.string()
  .regex(/^email-ingestions\/[A-Za-z0-9_-]{16,200}$/, 'Expected an opaque email-ingestion object key')
const SafeDomainSchema = z.string()
  .trim()
  .min(1)
  .max(253)
  .regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/, 'Invalid domain')
const NormalizedSafeDomainSchema = SafeDomainSchema.transform(value => value.toLowerCase())

export const EmailParserKindSchema = z.enum(['adf', 'provider', 'generic', 'ai_fallback'])
export const EmailIngestionStatusSchema = z.enum(['received', 'accepted', 'duplicate', 'quarantined', 'failed'])
export const EmailIngressTransportSchema = z.literal('cloudflare_email_routing')

export const EmailSafeEvidenceSchema = z.object({
  hasText: z.boolean(),
  hasHtml: z.boolean(),
  hasAdf: z.boolean(),
  fieldKeys: z.array(SafeFieldKeySchema).max(MAX_EXTRACTED_FIELDS)
}).strict()

const EmailExtractedFieldSchema = z.object({
  value: SafeTextSchema,
  confidence: z.number().finite().min(0).max(1),
  provenance: z.enum(['subject', 'body', 'header', 'adf', 'attachment', 'ai'])
}).strict()

const EmailMessageFieldSchema = EmailExtractedFieldSchema.extend({
  value: SafeMessageSchema
}).strict()

export const EmailLeadExtractionSchema = z.object({
  provider: ProviderAdapterIdSchema,
  externalIdHash: HashSchema,
  sourceName: SafeSourceNameSchema,
  medium: z.enum(['classifieds', 'paid-social', 'cpc', 'lead_ingest']),
  parser: EmailParserKindSchema,
  fields: z.record(SafeFieldKeySchema, EmailExtractedFieldSchema).refine(
    fields => Object.keys(fields).length <= MAX_EXTRACTED_FIELDS,
    `At most ${MAX_EXTRACTED_FIELDS} extracted fields are allowed`
  ),
  vehicle: z.object({
    year: EmailExtractedFieldSchema.optional(),
    make: EmailExtractedFieldSchema.optional(),
    model: EmailExtractedFieldSchema.optional(),
    stock_number: EmailExtractedFieldSchema.optional()
  }).strict().optional(),
  message: EmailMessageFieldSchema.optional(),
  overallConfidence: z.number().finite().min(0).max(1),
  needsReview: z.boolean(),
  reviewReasons: z.array(SafeTextSchema.max(500)).max(20)
}).strict()

export const EmailEndpointPolicySchema = z.object({
  schemaVersion: z.literal(1),
  parserMode: z.enum(['auto', 'adf', 'generic']),
  aiExtractionMode: z.enum(['disabled', 'fallback']),
  expectedProvider: ProviderAdapterIdSchema.nullable(),
  allowedSenderDomains: z.array(SafeDomainSchema).max(100),
  maxRawBytes: z.number().int().positive().max(MAX_RAW_EMAIL_BYTES),
  maxAdfAttachmentBytes: z.number().int().positive().max(MAX_ADF_ATTACHMENT_BYTES)
}).strict()

export const EmailStageRequestSchema = z.object({
  schemaVersion: z.literal(1),
  correlationId: UuidSchema,
  transport: EmailIngressTransportSchema,
  recipientToken: RecipientTokenSchema,
  externalIdHash: HashSchema,
  messageIdHash: HashSchema.nullable(),
  provider: ProviderAdapterIdSchema,
  envelopeSenderDomain: NormalizedSafeDomainSchema.nullable(),
  headerFromDomain: NormalizedSafeDomainSchema.nullable(),
  receivedAt: IsoTimestampSchema,
  rawSize: z.number().int().nonnegative().max(MAX_RAW_EMAIL_BYTES),
  safeEvidence: EmailSafeEvidenceSchema,
  quarantineExpiresAt: IsoTimestampSchema
}).strict()

export const EmailStageResponseSchema = z.discriminatedUnion('outcome', [
  z.object({
    schemaVersion: z.literal(1),
    outcome: z.literal('reserved'),
    correlationId: UuidSchema,
    ingestionId: UuidSchema,
    encryptedObjectKey: EncryptedObjectKeySchema
  }).strict(),
  z.object({
    schemaVersion: z.literal(1),
    outcome: z.literal('duplicate'),
    ingestionId: UuidSchema,
    encryptedObjectKey: z.null()
  }).strict()
])

export const EmailIngestEnvelopeSchema = z.object({
  schemaVersion: z.literal(1),
  correlationId: UuidSchema,
  ingestionId: UuidSchema,
  transport: EmailIngressTransportSchema,
  recipientToken: RecipientTokenSchema,
  recipientAddressHash: HashSchema,
  envelopeSenderDomain: NormalizedSafeDomainSchema.nullable(),
  headerFromDomain: NormalizedSafeDomainSchema.nullable(),
  messageIdHash: HashSchema.nullable(),
  externalIdHash: HashSchema,
  receivedAt: IsoTimestampSchema,
  rawSize: z.number().int().nonnegative().max(MAX_RAW_EMAIL_BYTES),
  attachmentCount: z.number().int().nonnegative().max(100),
  extraction: EmailLeadExtractionSchema.nullable(),
  safeEvidence: EmailSafeEvidenceSchema,
  quarantine: z.object({
    reason: SafeTextSchema.max(500),
    encryptedObjectKey: EncryptedObjectKeySchema,
    expiresAt: IsoTimestampSchema
  }).strict().optional()
}).strict().superRefine((envelope, context) => {
  if (envelope.extraction && envelope.extraction.externalIdHash !== envelope.externalIdHash) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['extraction', 'externalIdHash'],
      message: 'Extraction external ID hash must match the envelope external ID hash'
    })
  }
})

export type EmailParserKind = z.infer<typeof EmailParserKindSchema>
export type EmailIngestionStatus = z.infer<typeof EmailIngestionStatusSchema>
export type EmailIngressTransport = z.infer<typeof EmailIngressTransportSchema>
export type EmailSafeEvidence = z.infer<typeof EmailSafeEvidenceSchema>
export type EmailEndpointPolicy = z.infer<typeof EmailEndpointPolicySchema>
export type ExtractedEmailField = z.infer<typeof EmailExtractedFieldSchema>
export type EmailLeadExtraction = z.infer<typeof EmailLeadExtractionSchema>
export type EmailIngestEnvelope = z.infer<typeof EmailIngestEnvelopeSchema>
export type EmailStageRequest = z.infer<typeof EmailStageRequestSchema>
export type EmailStageResponse = z.infer<typeof EmailStageResponseSchema>
