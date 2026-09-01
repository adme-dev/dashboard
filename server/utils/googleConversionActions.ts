import { z } from 'zod'
import { ofetch } from 'ofetch'
import { gaqlQuery } from '~~/server/utils/googleAdsClient'

const GoogleAccountIdSchema = z.string().regex(/^\d{10}$/)

export const GoogleConversionActionNameSchema = z.enum([
  'Stock Enquiry',
  'Finance Enquiry',
  'Test Drive Enquiry',
  'Contact Us',
  'Model Variant Enquiry'
])

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

const ExactGoogleConversionActionRowSchema = z.strictObject({
  conversionAction: z.strictObject({
    resourceName: z.string().regex(/^customers\/\d{10}\/conversionActions\/\d+$/),
    id: z.string().regex(/^\d+$/),
    name: GoogleConversionActionNameSchema,
    status: z.enum(['ENABLED', 'HIDDEN', 'REMOVED']),
    type: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
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
  page: z.number().int().min(1).max(100),
  pageSize: z.number().int().min(1).max(100)
})

const ManageGoogleConversionActionInputSchema = z.strictObject({
  accountId: GoogleAccountIdSchema,
  accessToken: z.string().min(1),
  developerToken: z.string().min(1),
  loginCustomerId: GoogleAccountIdSchema.nullable(),
  name: GoogleConversionActionNameSchema
})

const GoogleConversionActionMutationResponseSchema = z.object({
  results: z.array(z.object({
    resourceName: z.string().regex(/^customers\/\d{10}\/conversionActions\/\d+$/)
  })).length(1)
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
  readonly code:
    | 'GOOGLE_CONVERSION_ACTION_INPUT_INVALID'
    | 'GOOGLE_CONVERSION_ACTION_RESPONSE_INVALID'
    | 'GOOGLE_CONVERSION_ACTION_CONFLICT'
    | 'GOOGLE_CONVERSION_ACTION_READBACK_FAILED'

  constructor(code: GoogleConversionActionDiscoveryError['code']) {
    super({
      GOOGLE_CONVERSION_ACTION_INPUT_INVALID: 'Invalid Google conversion-action request',
      GOOGLE_CONVERSION_ACTION_RESPONSE_INVALID: 'Google returned an invalid conversion-action response',
      GOOGLE_CONVERSION_ACTION_CONFLICT: 'An incompatible Google conversion action already uses this name',
      GOOGLE_CONVERSION_ACTION_READBACK_FAILED: 'Google conversion action could not be verified after creation'
    }[code])
    this.name = 'GoogleConversionActionDiscoveryError'
    this.code = code
  }
}

type QueryGoogleAds = typeof gaqlQuery

interface GoogleAdsMutationFetch {
  (url: string, options: {
    method: 'POST'
    headers: Record<string, string>
    body: unknown
  }): Promise<unknown>
}

export function createGoogleConversionActionMutation(
  deps: { fetch: GoogleAdsMutationFetch } = {
    fetch: (url, options) => ofetch(url, options)
  }
) {
  return {
    async create(rawInput: z.input<typeof ManageGoogleConversionActionInputSchema>): Promise<{
      resourceName: string
    }> {
      const parsed = ManageGoogleConversionActionInputSchema.safeParse(rawInput)
      if (!parsed.success) {
        throw new GoogleConversionActionDiscoveryError('GOOGLE_CONVERSION_ACTION_INPUT_INVALID')
      }
      const input = parsed.data
      const headers: Record<string, string> = {
        Authorization: `Bearer ${input.accessToken}`,
        'developer-token': input.developerToken,
        'Content-Type': 'application/json'
      }
      if (input.loginCustomerId) headers['login-customer-id'] = input.loginCustomerId

      // Google Ads API v23 ConversionAction create operation. Data Manager
      // enhanced conversions for leads require an UPLOAD_CLICKS action.
      // Sources:
      // https://developers.google.com/google-ads/api/reference/rpc/v23/ConversionActionOperation
      // https://developers.google.com/data-manager/api/devguides/events/send-events
      const response = await deps.fetch(
        `https://googleads.googleapis.com/v23/customers/${input.accountId}/conversionActions:mutate`,
        {
          method: 'POST',
          headers,
          body: {
            operations: [{
              create: {
                name: input.name,
                type: 'UPLOAD_CLICKS',
                category: 'SUBMIT_LEAD_FORM',
                status: 'ENABLED',
                countingType: 'ONE_PER_CLICK'
              }
            }]
          }
        }
      )
      const parsedResponse = GoogleConversionActionMutationResponseSchema.safeParse(response)
      if (!parsedResponse.success) {
        throw new GoogleConversionActionDiscoveryError('GOOGLE_CONVERSION_ACTION_RESPONSE_INVALID')
      }
      return { resourceName: parsedResponse.data.results[0]!.resourceName }
    }
  }
}

function exactActionQuery(name: z.infer<typeof GoogleConversionActionNameSchema>): string {
  return `
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
    WHERE conversion_action.name = '${name}'
    ORDER BY conversion_action.id
    LIMIT 2
  `.trim()
}

function exactActionItem(value: unknown): GoogleConversionActionItem | null {
  const parsed = ExactGoogleConversionActionRowSchema.safeParse(value)
  if (!parsed.success) return null
  const action = parsed.data.conversionAction
  if (action.status !== 'ENABLED' || action.type !== 'UPLOAD_CLICKS') return null
  return {
    id: action.id,
    resourceName: action.resourceName,
    name: action.name,
    status: action.status,
    type: action.type,
    category: action.category,
    origin: action.origin,
    isPrimary: action.primaryForGoal,
    includesInConversions: action.includeInConversionsMetric,
    deliveryMode: 'offline_click'
  }
}

export function createGoogleConversionActionProvisioner(deps: {
  query: QueryGoogleAds
  create: ReturnType<typeof createGoogleConversionActionMutation>['create']
} = {
  query: gaqlQuery,
  create: createGoogleConversionActionMutation().create
}) {
  return {
    async ensure(rawInput: z.input<typeof ManageGoogleConversionActionInputSchema>): Promise<{
      created: boolean
      item: GoogleConversionActionItem
    }> {
      const parsed = ManageGoogleConversionActionInputSchema.safeParse(rawInput)
      if (!parsed.success) {
        throw new GoogleConversionActionDiscoveryError('GOOGLE_CONVERSION_ACTION_INPUT_INVALID')
      }
      const input = parsed.data
      const queryExact = () => deps.query(
        input.accountId,
        input.accessToken,
        input.developerToken,
        exactActionQuery(input.name),
        input.loginCustomerId ?? undefined
      )
      const existing = await queryExact()
      if (existing.length > 1) {
        throw new GoogleConversionActionDiscoveryError('GOOGLE_CONVERSION_ACTION_CONFLICT')
      }
      if (existing.length === 1) {
        const item = exactActionItem(existing[0])
        if (!item) {
          throw new GoogleConversionActionDiscoveryError('GOOGLE_CONVERSION_ACTION_CONFLICT')
        }
        return { created: false, item }
      }

      let created: { resourceName: string }
      try {
        created = await deps.create(input)
      } catch (error) {
        // A retry or concurrent request can create the allowlisted action
        // after our initial read. Re-read before surfacing the provider error.
        const concurrent = await queryExact()
        if (concurrent.length === 1) {
          const item = exactActionItem(concurrent[0])
          if (item) return { created: false, item }
        }
        throw error
      }
      const readBack = await queryExact()
      if (readBack.length !== 1) {
        throw new GoogleConversionActionDiscoveryError('GOOGLE_CONVERSION_ACTION_READBACK_FAILED')
      }
      const item = exactActionItem(readBack[0])
      if (!item || item.resourceName !== created.resourceName) {
        throw new GoogleConversionActionDiscoveryError('GOOGLE_CONVERSION_ACTION_READBACK_FAILED')
      }
      return { created: true, item }
    }
  }
}

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
      // GAQL supports LIMIT but not SQL-style OFFSET. searchStream returns all
      // rows up to the limit, so request through the end of the desired page
      // plus one look-ahead row and page the bounded result locally.
      const limit = offset + input.pageSize + 1

      // Data Manager requires the numeric ID of an ENABLED Google Ads
      // conversion action. UPLOAD_CLICKS supports offline/enhanced leads;
      // WEBPAGE supports an additional source paired with a website tag.
      // Sources:
      // https://developers.google.com/data-manager/api/devguides/events/send-events
      // https://developers.google.com/google-ads/api/fields/v25/conversion_action
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
        LIMIT ${limit}
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

      const hasNextPage = providerRows.data.length > offset + input.pageSize
      const items = providerRows.data.slice(offset, offset + input.pageSize).map(({ conversionAction }) => ({
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
export const googleConversionActionProvisioner = createGoogleConversionActionProvisioner()
