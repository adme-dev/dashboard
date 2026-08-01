import { z } from 'zod'

const uuidSchema = z.string().uuid()
const boundedText = (min: number, max: number) => z.string().trim().min(min).max(max)
const crawlPurposeSchema = z.enum(['search', 'ai-input'])

export const siteIntelligenceDomainInputSchema = z.object({
  clientId: uuidSchema,
  lane: z.enum(['owned', 'competitor']),
  name: boundedText(1, 160),
  origin: boundedText(1, 2048),
  justification: boundedText(10, 1000),
  status: z.enum(['active', 'paused']).default('active'),
  discoveryMode: z.enum(['all', 'sitemaps', 'links']).optional(),
  includePatterns: z.array(boundedText(1, 500)).max(50).default([]),
  excludePatterns: z.array(boundedText(1, 500)).max(50).default([]),
  includeSubdomains: z.boolean().default(false),
  renderMode: z.enum(['auto', 'static', 'browser']).default('auto'),
  pageLimit: z.number().int().min(1).max(200).optional(),
  depth: z.number().int().min(0).max(5).optional(),
  frequency: z.enum(['daily', 'weekly', 'manual']).optional(),
  crawlPurposes: z.array(crawlPurposeSchema).min(1).max(2).optional(),
  aiInputAllowed: z.boolean().optional(),
  retentionDays: z.number().int().min(1).max(365).optional()
}).transform((input, context) => {
  const crawlPurposes = input.crawlPurposes ?? ['search']
  const aiInputAllowed = input.aiInputAllowed ?? false

  if (aiInputAllowed && !crawlPurposes.includes('ai-input')) {
    context.addIssue({
      code: 'custom',
      path: ['crawlPurposes'],
      message: 'ai-input purpose is required when AI input is allowed'
    })
    return z.NEVER
  }

  const competitor = input.lane === 'competitor'
  return {
    ...input,
    discoveryMode: input.discoveryMode ?? 'sitemaps',
    pageLimit: input.pageLimit ?? (competitor ? 100 : 200),
    depth: input.depth ?? (competitor ? 2 : 3),
    frequency: input.frequency ?? 'daily',
    crawlPurposes,
    aiInputAllowed,
    retentionDays: input.retentionDays ?? (competitor ? 30 : 90)
  }
})

export const siteIntelligenceRunTriggerSchema = z.enum(['manual', 'schedule', 'retry'])

export const siteIntelligenceWorkflowPayloadSchema = z.object({
  kind: z.literal('site.intelligence.crawl'),
  runId: uuidSchema,
  domainId: uuidSchema,
  clientId: uuidSchema,
  trigger: siteIntelligenceRunTriggerSchema,
  requestedBy: uuidSchema.optional()
})

export const siteIntelligenceCrawlRecordSchema = z.object({
  url: z.string().url().max(4096),
  status: z.enum(['completed', 'disallowed', 'skipped', 'errored', 'cancelled']),
  html: z.string().max(3_000_000).optional(),
  markdown: z.string().max(2_000_000).optional(),
  metadata: z.object({
    status: z.number().int().min(100).max(599).optional(),
    title: z.string().max(1000).optional(),
    url: z.string().url().max(4096)
  }).passthrough()
})

export const siteIntelligenceIngestBatchSchema = z.object({
  batchKey: boundedText(1, 300),
  records: z.array(siteIntelligenceCrawlRecordSchema).max(100)
})

export const siteIntelligenceEnrichmentSchema = z.object({
  pageType: z.enum([
    'homepage',
    'model',
    'inventory',
    'offer',
    'finance',
    'service',
    'location',
    'landing_page',
    'article',
    'other'
  ]),
  summary: boundedText(1, 1000),
  offerSummary: z.string().trim().max(1000).nullable(),
  themes: z.array(boundedText(1, 100)).max(12),
  confidence: z.number().min(0).max(1),
  evidenceFields: z.array(boundedText(1, 100)).max(20)
})

export type SiteIntelligenceDomainInput = z.output<typeof siteIntelligenceDomainInputSchema>
export type SiteIntelligenceWorkflowPayload = z.infer<typeof siteIntelligenceWorkflowPayloadSchema>
export type SiteIntelligenceCrawlRecord = z.infer<typeof siteIntelligenceCrawlRecordSchema>
export type SiteIntelligenceIngestBatch = z.infer<typeof siteIntelligenceIngestBatchSchema>
export type SiteIntelligenceEnrichment = z.infer<typeof siteIntelligenceEnrichmentSchema>
