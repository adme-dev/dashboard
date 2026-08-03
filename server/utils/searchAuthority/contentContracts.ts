import { z } from 'zod'

const uuid = z.string().uuid()
const bounded = (min: number, max: number) => z.string().trim().min(min).max(max)

export const contentClaimInputSchema = z.object({
  claim: bounded(5, 2000),
  sourceType: z.enum(['sales_interview', 'manufacturer', 'provider_evidence']),
  sourceReference: bounded(5, 2000),
  expiresAt: z.string().datetime().nullable()
})

export const contentVersionInputSchema = z.object({
  bodyMarkdown: bounded(20, 100000),
  excerpt: bounded(10, 1000),
  disclaimer: bounded(5, 5000),
  schemaType: z.enum(['Article', 'FAQPage']),
  sourceInterviewIds: z.array(uuid).min(1).max(20),
  sourceVersionId: uuid.nullable().optional(),
  claims: z.array(contentClaimInputSchema).min(1).max(100),
  aiMetadata: z.object({
    provider: bounded(1, 100),
    model: bounded(1, 200),
    sourceIds: z.array(uuid).min(1).max(100)
  }).optional()
})

export const contentDecisionInputSchema = z.object({
  versionId: uuid,
  rationale: bounded(5, 2000)
})

export const contentAssetInputSchema = z.object({
  slug: bounded(1, 160).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: bounded(1, 300),
  topic: bounded(1, 500),
  opportunityId: uuid.nullable().optional(),
  taskId: uuid.nullable().optional(),
  interview: z.object({
    intervieweeName: bounded(1, 200),
    intervieweeRole: bounded(1, 200),
    occurredAt: z.string().datetime(),
    sourceSummary: bounded(10, 10000),
    consentConfirmed: z.literal(true)
  })
})

export type ContentClaimInput = z.infer<typeof contentClaimInputSchema>
export type ContentVersionInput = z.infer<typeof contentVersionInputSchema>
export type ContentAssetInput = z.infer<typeof contentAssetInputSchema>
