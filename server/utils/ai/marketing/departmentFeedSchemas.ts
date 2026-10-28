import { z } from 'zod'

export const departmentFeedClientSchema = z.strictObject({ clientId: z.string().uuid() })
const feedId = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/)
const words = z.array(z.string().trim().min(1).max(160)).max(100)
const range = z.strictObject({
  min: z.number().finite().nonnegative().optional(),
  max: z.number().finite().nonnegative().optional()
})
const filters = z.strictObject({
  makes: words.optional(),
  models: words.optional(),
  condition: words.optional(),
  bodyTypes: words.optional(),
  fuelTypes: words.optional(),
  transmission: words.optional(),
  colors: words.optional(),
  stockStatus: words.optional(),
  includeIds: words.optional(),
  excludeIds: words.optional(),
  search: z.string().trim().max(160).optional(),
  years: range.optional(),
  price: range.optional(),
  kms: range.optional()
})
export const departmentFeedSetupSchema = departmentFeedClientSchema.extend({
  name: z.string().trim().min(1).max(160),
  platform: z.enum(['google', 'facebook']),
  filters: filters.default({})
})
export const departmentFeedChangeSchema = departmentFeedClientSchema.extend({
  feedId,
  patch: z.strictObject({
    name: z.string().trim().min(1).max(160).optional(),
    filters: filters.optional(),
    isActive: z.boolean().optional()
  }).refine(patch => Object.keys(patch).length > 0)
})
export const departmentFeedRegenerationSchema = departmentFeedClientSchema.extend({
  feedId,
  format: z.enum(['xml', 'csv']).default('xml')
})
export const departmentFeedProposalSchema = departmentFeedClientSchema.extend({
  proposalId: z.string().uuid()
})
const revision = z.string().regex(/^[0-9a-f]{64}$/)
export const departmentFeedReviewSchema = departmentFeedProposalSchema.extend({
  expectedRevision: revision,
  decision: z.enum(['approved', 'rejected']),
  reason: z.string().trim().max(1000).optional()
})
export const departmentFeedExecuteSchema = departmentFeedProposalSchema.extend({
  expectedRevision: revision,
  ack: z.literal(true)
})
