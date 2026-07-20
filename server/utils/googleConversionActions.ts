import { z } from 'zod'
import { gaqlQuery } from '~~/server/utils/googleAdsClient'

const GoogleAccountIdSchema = z.string().regex(/^\d{10}$/)

const GoogleConversionActionRowSchema = z.strictObject({
  conversionAction: z.strictObject({
    resourceName: z.string().regex(/^customers\/\d{10}\/conversionActions\/\d+$/),
    id: z.string().regex(/^\d+$/),
    name: z.string().trim().min(1).max(255),
    status: z.literal('ENABLED'),
    type: z.enum(['UPLOAD_CLICKS', 'WEBPAGE']),
    category: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
    origin: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
    primaryForGoal: z.boolean(),
    includeInConversionsMetric: z.boolean()
  })
})

const ListGoogleConversionActionsInputSchema = z.strictObject({
  accountId: GoogleAccountIdSchema,
  accessToken: z.string().min(1),
  developerToken: z.string().min(1),
  loginCustomerId: GoogleAccountIdSchema.nullable(),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(100)
})

export interface GoogleConversionActionItem {
  id: string
  resourceName: string
  name: string
  status: 'ENABLED'
  type: 'UPLOAD_CLICKS' | 'WEBPAGE'
  category: string
  origin: string
  isPrimary: boolean
  includesInConversions: boolean
  deliveryMode: 'offline_click' | 'additional_data_source'
}

export class GoogleConversionActionDiscoveryError extends Error {
  readonly code: 'GOOGLE_CONVERSION_ACTION_INPUT_INVALID' | 'GOOGLE_CONVERSION_ACTION_RESPONSE_INVALID'

  constructor(code: GoogleConversionActionDiscoveryError['code']) {
    super(code === 'GOOGLE_CONVERSION_ACTION_INPUT_INVALID'
      ? 'Invalid Google conversion-action discovery request'
      : 'Google returned an invalid conversion-action response')
    this.name = 'GoogleConversionActionDiscoveryError'
    this.code = code
  }
}

type QueryGoogleAds = typeof gaqlQuery

export function createGoogleConversionActionDiscovery(
  deps: { query: QueryGoogleAds } = { query: gaqlQuery }
) {
  return {
    async list(rawInput: z.input<typeof ListGoogleConversionActionsInputSchema>): Promise<{
      items: GoogleConversionActionItem[]
      pagination: { page: number, pageSize: number, hasNextPage: boolean }
    }> {
      const parsed = ListGoogleConversionActionsInputSchema.safeParse(rawInput)
      if (!parsed.success) {
        throw new GoogleConversionActionDiscoveryError('GOOGLE_CONVERSION_ACTION_INPUT_INVALID')
      }
      const input = parsed.data
      const offset = (input.page - 1) * input.pageSize
      const limit = input.pageSize + 1

      // Data Manager requires the numeric ID of an ENABLED Google Ads
      // conversion action. UPLOAD_CLICKS supports offline/enhanced leads;
      // WEBPAGE supports an additional source paired with a website tag.
      // Sources:
      // https://developers.google.com/data-manager/api/devguides/events/send-events
      // https://developers.google.com/google-ads/api/fields/v23/conversion_action
      const query = `
        SELECT
          conversion_action.resource_name,
          conversion_action.id,
          conversion_action.name,
          conversion_action.status,
          conversion_action.type,
          conversion_action.category,
          conversion_action.origin,
          conversion_action.primary_for_goal,
          conversion_action.include_in_conversions_metric
        FROM conversion_action
        WHERE conversion_action.status = 'ENABLED'
          AND conversion_action.type IN ('UPLOAD_CLICKS', 'WEBPAGE')
        ORDER BY conversion_action.name, conversion_action.id
        LIMIT ${limit} OFFSET ${offset}
      `.trim()

      const rows = await deps.query(
        input.accountId,
        input.accessToken,
        input.developerToken,
        query,
        input.loginCustomerId ?? undefined
      )
      const providerRows = z.array(GoogleConversionActionRowSchema).safeParse(rows)
      if (!providerRows.success) {
        throw new GoogleConversionActionDiscoveryError('GOOGLE_CONVERSION_ACTION_RESPONSE_INVALID')
      }

      const hasNextPage = providerRows.data.length > input.pageSize
      const items = providerRows.data.slice(0, input.pageSize).map(({ conversionAction }) => ({
        id: conversionAction.id,
        resourceName: conversionAction.resourceName,
        name: conversionAction.name,
        status: conversionAction.status,
        type: conversionAction.type,
        category: conversionAction.category,
        origin: conversionAction.origin,
        isPrimary: conversionAction.primaryForGoal,
        includesInConversions: conversionAction.includeInConversionsMetric,
        deliveryMode: conversionAction.type === 'UPLOAD_CLICKS'
          ? 'offline_click' as const
          : 'additional_data_source' as const
      }))

      return {
        items,
        pagination: { page: input.page, pageSize: input.pageSize, hasNextPage }
      }
    }
  }
}

export const googleConversionActionDiscovery = createGoogleConversionActionDiscovery()
