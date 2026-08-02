import { z } from 'zod'

const uuidSchema = z.string().uuid()
const boundedText = (min: number, max: number) => z.string().trim().min(min).max(max)

export const nearbyMarketRadiusSchema = z.union([z.literal(10), z.literal(25), z.literal(50)])

export const nearbySearchSchema = z.object({
  clientId: uuidSchema,
  radiusKm: nearbyMarketRadiusSchema,
  includeUsedIndependent: z.boolean().default(false),
  brand: boundedText(1, 100).optional(),
  monitoringStatus: z.enum(['saved', 'nominated', 'approved', 'dismissed']).optional()
}).strict()

export const marketLocationPreviewSchema = z.object({
  action: z.literal('preview'),
  addressText: boundedText(1, 500)
}).strict()

export const marketLocationConfirmationSchema = z.object({
  action: z.literal('confirm'),
  placeId: boundedText(1, 500),
  label: boundedText(1, 160),
  addressText: boundedText(1, 500)
}).strict()

export const marketLocationUpdateSchema = z.discriminatedUnion('action', [
  marketLocationPreviewSchema,
  marketLocationConfirmationSchema
])

const candidateDecisionBaseSchema = z.object({
  clientId: uuidSchema,
  marketLocationId: uuidSchema,
  radiusKm: nearbyMarketRadiusSchema
})

export const candidateDecisionSchema = z.discriminatedUnion('action', [
  candidateDecisionBaseSchema.extend({ action: z.literal('save') }).strict(),
  candidateDecisionBaseSchema.extend({
    action: z.literal('dismiss'),
    reviewerReason: boundedText(1, 1000)
  }).strict(),
  candidateDecisionBaseSchema.extend({
    action: z.literal('approve_and_index'),
    reviewerReason: boundedText(1, 1000),
    websiteUri: z.string().url().max(2048).optional()
  }).strict()
])

export const portalNominationSchema = z.object({
  marketLocationId: uuidSchema,
  radiusKm: nearbyMarketRadiusSchema,
  reason: boundedText(1, 1000)
}).strict()

export type NearbySearchInput = z.output<typeof nearbySearchSchema>
export type MarketLocationUpdateInput = z.output<typeof marketLocationUpdateSchema>
export type CandidateDecisionInput = z.output<typeof candidateDecisionSchema>
export type PortalNominationInput = z.output<typeof portalNominationSchema>
