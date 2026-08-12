import { z } from 'zod'
import type { GooglePmaxInventoryLaunchConfig } from '~~/server/utils/googlePmaxLaunchConfig'

const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const MicrosSchema = z.string().regex(/^[1-9]\d*$/)
const ResourceListSchema = z.array(z.string().min(1).max(200)).max(100)

const ConfigSchema = z.strictObject({
  schemaVersion: z.literal(2),
  briefId: z.string().uuid(),
  briefVersion: z.number().int().positive(),
  tenantId: z.string().uuid(),
  clientId: z.string().uuid(),
  connectionId: z.string().uuid(),
  customerId: z.string().regex(/^\d{10}$/),
  campaignName: z.string().trim().min(1).max(255),
  budget: z.strictObject({
    currency: z.string().regex(/^[A-Z]{3}$/),
    period: z.literal('CUSTOM_PERIOD'),
    startDate: DateSchema,
    endDate: DateSchema,
    campaignDays: z.number().int().positive().max(365),
    allocatedTotal: z.number().positive().finite(),
    dailyBudget: z.null(),
    calculatedDailyPace: z.number().positive().finite(),
    provider: z.strictObject({
      totalAmountMicros: MicrosSchema,
      amountMicros: z.null()
    })
  }),
  bidding: z.strictObject({
    strategy: z.enum(['MAXIMIZE_CONVERSIONS', 'MAXIMIZE_CONVERSION_VALUE']),
    targetCpaMicros: MicrosSchema.optional(),
    targetRoas: z.number().positive().finite().optional()
  }),
  schedule: z.strictObject({ startDate: DateSchema, endDate: DateSchema }),
  locations: z.array(z.strictObject({
    criterionId: z.string().regex(/^\d+$/),
    displayName: z.string().trim().min(1).max(255)
  })).min(1).max(100),
  languages: z.array(z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/)).min(1).max(20),
  finalUrls: z.array(z.string().url().max(2000)).min(1).max(20),
  merchantCenterId: z.string().regex(/^\d+$/),
  inventorySource: z.strictObject({
    providerId: z.literal('social-dashboard'),
    linkId: z.string().uuid(),
    feedId: z.string().trim().min(1).max(255),
    platform: z.literal('google')
  }),
  inventoryFilter: z.strictObject({
    listingSource: z.literal('SHOPPING'),
    conditions: z.array(z.enum(['NEW', 'USED'])).min(1).max(2)
  }),
  assetGroup: z.strictObject({
    mode: z.enum(['MERCHANT_ONLY', 'PROVIDED']),
    name: z.string().trim().min(1).max(255),
    businessName: z.string().max(255),
    headlines: z.array(z.string().trim().min(1).max(30)).max(15),
    longHeadlines: z.array(z.string().trim().min(1).max(90)).max(5),
    descriptions: z.array(z.string().trim().min(1).max(90)).max(5),
    imageAssetResourceNames: ResourceListSchema,
    logoAssetResourceNames: ResourceListSchema,
    youtubeVideoAssetResourceNames: ResourceListSchema
  }),
  conversionGoals: z.array(z.strictObject({
    conversionActionId: z.string().regex(/^\d+$/),
    resourceName: z.string().min(1).max(200),
    category: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
    origin: z.string().regex(/^[A-Z][A-Z0-9_]*$/)
  })).min(1).max(50),
  approval: z.strictObject({
    required: z.literal(true),
    complianceAcknowledged: z.boolean()
  })
}).superRefine((value, context) => {
  const start = new Date(`${value.budget.startDate}T00:00:00.000Z`).getTime()
  const end = new Date(`${value.budget.endDate}T00:00:00.000Z`).getTime()
  const days = Math.floor((end - start) / 86_400_000) + 1
  const expectedMicros = Math.round(value.budget.allocatedTotal * 1_000_000)
  if (
    !Number.isFinite(start)
    || !Number.isFinite(end)
    || days !== value.budget.campaignDays
    || days <= 0
    || value.schedule.startDate !== value.budget.startDate
    || value.schedule.endDate !== value.budget.endDate
  ) {
    context.addIssue({ code: 'custom', path: ['schedule'], message: 'Schedule does not match the fixed-flight budget.' })
  }
  if (
    !Number.isSafeInteger(expectedMicros)
    || String(expectedMicros) !== value.budget.provider.totalAmountMicros
    || Math.abs(value.budget.calculatedDailyPace - value.budget.allocatedTotal / value.budget.campaignDays) > 1e-9
  ) {
    context.addIssue({ code: 'custom', path: ['budget'], message: 'Budget amounts are not canonical.' })
  }

  for (const urlValue of value.finalUrls) {
    const url = new URL(urlValue)
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
    if (
      url.protocol !== 'https:'
      || url.username
      || url.password
      || hostname === 'localhost'
      || hostname.endsWith('.localhost')
      || hostname.endsWith('.local')
      || hostname.endsWith('.internal')
      || /^(?:10|127|0)\./.test(hostname)
      || /^192\.168\./.test(hostname)
      || /^172\.(?:1[6-9]|2\d|3[01])\./.test(hostname)
      || hostname === '::1'
    ) {
      context.addIssue({ code: 'custom', path: ['finalUrls'], message: 'Final URLs must be public HTTPS URLs.' })
    }
  }

  const assetResource = new RegExp(`^customers/${value.customerId}/assets/[1-9]\\d*$`)
  for (const resourceName of [
    ...value.assetGroup.imageAssetResourceNames,
    ...value.assetGroup.logoAssetResourceNames,
    ...value.assetGroup.youtubeVideoAssetResourceNames
  ]) {
    if (!assetResource.test(resourceName)) {
      context.addIssue({ code: 'custom', path: ['assetGroup'], message: 'Asset belongs to another customer.' })
    }
  }
  for (const goal of value.conversionGoals) {
    if (goal.resourceName !== `customers/${value.customerId}/conversionActions/${goal.conversionActionId}`) {
      context.addIssue({ code: 'custom', path: ['conversionGoals'], message: 'Conversion belongs to another customer.' })
    }
  }

  if (value.assetGroup.mode === 'MERCHANT_ONLY') {
    if (
      value.assetGroup.businessName
      || value.assetGroup.headlines.length
      || value.assetGroup.longHeadlines.length
      || value.assetGroup.descriptions.length
      || value.assetGroup.imageAssetResourceNames.length
      || value.assetGroup.logoAssetResourceNames.length
      || value.assetGroup.youtubeVideoAssetResourceNames.length
    ) {
      context.addIssue({ code: 'custom', path: ['assetGroup'], message: 'Merchant-only mode cannot contain manual assets.' })
    }
  } else if (
    !value.assetGroup.businessName
    || value.assetGroup.headlines.length < 3
    || value.assetGroup.longHeadlines.length < 1
    || value.assetGroup.descriptions.length < 2
    || value.assetGroup.imageAssetResourceNames.length < 1
    || value.assetGroup.logoAssetResourceNames.length < 1
  ) {
    context.addIssue({ code: 'custom', path: ['assetGroup'], message: 'Provided mode requires complete text and media coverage.' })
  }
})

export class GooglePmaxStoredConfigError extends Error {
  constructor() {
    super('Stored Google PMax launch configuration is invalid or non-canonical.')
    this.name = 'GooglePmaxStoredConfigError'
  }
}

export function parseGooglePmaxInventoryLaunchConfig(value: unknown): GooglePmaxInventoryLaunchConfig {
  const parsed = ConfigSchema.safeParse(value)
  if (!parsed.success) throw new GooglePmaxStoredConfigError()
  return parsed.data
}
