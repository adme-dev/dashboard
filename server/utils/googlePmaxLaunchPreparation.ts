import { convertBriefToProject } from '~~/server/utils/briefConversion'
import { queryOne as dbQueryOne, queryRows as dbQueryRows } from '~~/server/utils/db'
import type {
  GooglePmaxInventoryLaunchConfig,
  GooglePmaxLaunchConfigIssue,
  GooglePmaxLaunchNormalizationInput,
  GooglePmaxLaunchNormalizationResult
} from '~~/server/utils/googlePmaxLaunchConfig'
import { hashCanonicalLaunchJson } from '~~/server/utils/googlePmaxLaunchHash'
import {
  createGooglePmaxLaunch,
  type GooglePmaxLaunch
} from '~~/server/utils/googlePmaxLaunchStore'
import { loadGooglePmaxProviderConnection } from '~~/server/utils/googlePmaxProviderConnection'
import type { GooglePmaxProviderConnection } from '~~/server/utils/googlePmaxProviderReadback'
import {
  createGooglePmaxRemoteDecisionEngine,
  GooglePmaxRemoteDecisionError
} from '~~/server/utils/googlePmaxRemoteDecisionEngine'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
interface BriefRow {
  id: string
  client_id: string
  client_name: string
  title: string
  status: string
  launch_config_version: number
  template_slug: string
  converted_to_project_id: string | null
  project_template_id: string | null
}

interface FieldRow {
  field_key: string
  value: unknown
}

interface ConnectionRow {
  id: string
  client_id: string
  account_id: string
  account_name: string
  status: string
}

interface FeedLinkRow {
  id: string
  provider_id: string
  default_feed_ids: unknown
  status: string
}

export interface GooglePmaxPreparableBrief {
  id: string
  clientId: string
  clientName: string
  title: string
  configVersion: number
}

export class GooglePmaxLaunchPreparationError extends Error {
  constructor(
    public readonly code:
      | 'PMAX_PREPARATION_BRIEF_NOT_FOUND'
      | 'PMAX_PREPARATION_BRIEF_NOT_APPROVED'
      | 'PMAX_PREPARATION_CONNECTION_NOT_FOUND'
      | 'PMAX_PREPARATION_PROVIDER_RESPONSE_INVALID'
      | 'PMAX_PREPARATION_GEO_AMBIGUOUS'
      | 'PMAX_PREPARATION_CONFIG_INVALID',
    public readonly issues: GooglePmaxLaunchConfigIssue[] = []
  ) {
    super(code)
    this.name = 'GooglePmaxLaunchPreparationError'
  }
}

type QueryOne = typeof dbQueryOne
type QueryRows = typeof dbQueryRows
type PreparedProvider = Awaited<ReturnType<ReturnType<typeof createGooglePmaxRemoteDecisionEngine>['prepareProvider']>>

interface PreparationDependencies {
  queryOne?: QueryOne
  queryRows?: QueryRows
  readConnection?: (config: Pick<GooglePmaxInventoryLaunchConfig,
    'tenantId' | 'clientId' | 'connectionId' | 'customerId'>) => Promise<GooglePmaxProviderConnection>
  prepareProvider?: (input: {
    connection: GooglePmaxProviderConnection
    selectedConversionActionIds: string[]
    requestedLocations: string[]
  }) => Promise<PreparedProvider>
  createLaunch?: typeof createGooglePmaxLaunch
  ensureProject?: (input: { briefId: string, userId: string }) => Promise<unknown>
  normalize?: (input: GooglePmaxLaunchNormalizationInput) => Promise<GooglePmaxLaunchNormalizationResult>
}

function fieldValue(value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value) && 'value' in value) {
    return (value as { value: unknown }).value
  }
  return value
}

function strings(value: unknown, splitPattern: RegExp = /[\r\n,]+/): string[] {
  const list = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(splitPattern)
      : []
  return [...new Set(list.map(item => String(item).trim()).filter(Boolean))].sort()
}

function activeFeedIds(value: unknown): string[] {
  if (Array.isArray(value)) return strings(value)
  if (typeof value !== 'string') return []
  try {
    return strings(JSON.parse(value))
  } catch {
    return []
  }
}

async function readBrief(
  queryOne: QueryOne,
  tenantId: string,
  briefId: string
): Promise<BriefRow | null> {
  return queryOne<BriefRow>(
    `SELECT b.id, b.client_id, c.name AS client_name, b.title, b.status,
            b.launch_config_version, b.converted_to_project_id,
            bt.slug AS template_slug, bt.project_template_id
       FROM briefs b
       JOIN brief_templates bt ON bt.id = b.template_id
       JOIN agency_clients c ON c.id = b.client_id
      WHERE b.id = $1::uuid
        AND $2::text = (
          SELECT tenant_id
            FROM xero_org_connection
           WHERE tenant_id <> '__default__'
           ORDER BY updated_at DESC
           LIMIT 1
        )
      LIMIT 1`,
    [briefId, tenantId]
  )
}

export function createGooglePmaxLaunchPreparation(dependencies: PreparationDependencies = {}) {
  const queryOne = dependencies.queryOne || dbQueryOne
  const queryRows = dependencies.queryRows || dbQueryRows
  const readConnection = dependencies.readConnection || loadGooglePmaxProviderConnection
  const prepareProvider = dependencies.prepareProvider || (input => createGooglePmaxRemoteDecisionEngine(useEvent()).prepareProvider(input))
  const createLaunch = dependencies.createLaunch || createGooglePmaxLaunch
  const ensureProject = dependencies.ensureProject || (input => convertBriefToProject(input))
  const normalize = dependencies.normalize || (input => createGooglePmaxRemoteDecisionEngine(useEvent()).normalize(input))

  return {
    async list(input: { tenantId: string, clientId?: string, limit?: number }): Promise<GooglePmaxPreparableBrief[]> {
      const params: unknown[] = [input.tenantId, Math.min(Math.max(input.limit || 50, 1), 100)]
      const clientClause = input.clientId ? `AND b.client_id = $${params.push(input.clientId)}::uuid` : ''
      const rows = await queryRows<BriefRow>(
        `SELECT b.id, b.client_id, c.name AS client_name, b.title, b.status,
                b.launch_config_version, b.converted_to_project_id,
                bt.slug AS template_slug, bt.project_template_id
           FROM briefs b
           JOIN brief_templates bt ON bt.id = b.template_id
           JOIN agency_clients c ON c.id = b.client_id
          WHERE bt.slug = 'google-pmax'
            AND b.status = 'approved'
            AND $1::text = (
              SELECT tenant_id
                FROM xero_org_connection
               WHERE tenant_id <> '__default__'
               ORDER BY updated_at DESC
               LIMIT 1
            )
            ${clientClause}
            AND NOT EXISTS (
              SELECT 1
                FROM campaign_launches launch
               WHERE launch.brief_id = b.id
                 AND launch.config_version = b.launch_config_version
            )
          ORDER BY b.reviewed_at DESC NULLS LAST, b.updated_at DESC
          LIMIT $2`,
        params
      )
      return rows.map(row => ({
        id: row.id,
        clientId: row.client_id,
        clientName: row.client_name,
        title: row.title,
        configVersion: row.launch_config_version
      }))
    },

    async identify(input: { tenantId: string, briefId: string }): Promise<{ clientId: string }> {
      if (!UUID_PATTERN.test(input.briefId)) {
        throw new GooglePmaxLaunchPreparationError('PMAX_PREPARATION_BRIEF_NOT_FOUND')
      }
      const brief = await readBrief(queryOne, input.tenantId, input.briefId)
      if (!brief) throw new GooglePmaxLaunchPreparationError('PMAX_PREPARATION_BRIEF_NOT_FOUND')
      return { clientId: brief.client_id }
    },

    async prepare(input: {
      tenantId: string
      briefId: string
      expectedClientId: string
      actorId: string
    }): Promise<{ launch: GooglePmaxLaunch, isReplay: boolean }> {
      const brief = await readBrief(queryOne, input.tenantId, input.briefId)
      if (!brief) throw new GooglePmaxLaunchPreparationError('PMAX_PREPARATION_BRIEF_NOT_FOUND')
      if (brief.client_id.toLowerCase() !== input.expectedClientId.toLowerCase()) {
        throw new GooglePmaxLaunchPreparationError('PMAX_PREPARATION_BRIEF_NOT_FOUND')
      }
      if (brief.status !== 'approved' || brief.template_slug !== 'google-pmax') {
        throw new GooglePmaxLaunchPreparationError('PMAX_PREPARATION_BRIEF_NOT_APPROVED')
      }

      const fieldRows = await queryRows<FieldRow>(
        `SELECT field.field_key, value.value
           FROM brief_field_values value
           JOIN brief_template_fields field ON field.id = value.field_id
          WHERE value.brief_id = $1::uuid
          ORDER BY field.field_key, value.id`,
        [brief.id]
      )
      const fields: Record<string, unknown> = {}
      for (const row of fieldRows) {
        if (row.field_key in fields) {
          throw new GooglePmaxLaunchPreparationError('PMAX_PREPARATION_CONFIG_INVALID', [{
            code: 'PMAX_FIELD_DUPLICATE',
            path: row.field_key,
            message: `Approved field ${row.field_key} has duplicate values.`
          }])
        }
        fields[row.field_key] = fieldValue(row.value)
      }

      const selectedConnectionId = typeof fields.google_connection_id === 'string'
        ? fields.google_connection_id.trim().toLowerCase()
        : ''
      const selectedFeedId = typeof fields.google_feed_id === 'string'
        ? fields.google_feed_id.trim()
        : ''
      const selectedConversionActionIds = strings(fields.conversion_action_ids)
      const requestedLocations = strings(fields.locations, /\r?\n/)
      if (!UUID_PATTERN.test(selectedConnectionId)) {
        throw new GooglePmaxLaunchPreparationError('PMAX_PREPARATION_CONNECTION_NOT_FOUND')
      }
      if (selectedConversionActionIds.some(id => !/^\d+$/.test(id))) {
        throw new GooglePmaxLaunchPreparationError('PMAX_PREPARATION_CONFIG_INVALID', [{
          code: 'PMAX_CONVERSION_SELECTION_INVALID',
          path: 'conversion_action_ids',
          message: 'Approved conversion action selections must contain numeric Google Ads IDs only.'
        }])
      }

      const connectionRow = await queryOne<ConnectionRow>(
        `SELECT id, client_id, account_id, account_name, status
           FROM social_connections
          WHERE id = $1::uuid
            AND client_id = $2::uuid
            AND platform = 'google'
            AND status = 'active'
          LIMIT 1`,
        [selectedConnectionId, brief.client_id]
      )
      if (!connectionRow) {
        throw new GooglePmaxLaunchPreparationError('PMAX_PREPARATION_CONNECTION_NOT_FOUND')
      }
      const customerId = connectionRow.account_id.replace(/[\s-]/g, '')
      if (!/^\d{10}$/.test(customerId)) {
        throw new GooglePmaxLaunchPreparationError('PMAX_PREPARATION_CONNECTION_NOT_FOUND')
      }
      const connection = await readConnection({
        tenantId: input.tenantId,
        clientId: brief.client_id,
        connectionId: connectionRow.id,
        customerId
      })

      const providerPromise = prepareProvider({ connection, selectedConversionActionIds, requestedLocations }).catch((error) => {
        if (error instanceof GooglePmaxLaunchPreparationError) throw error
        if (error instanceof GooglePmaxRemoteDecisionError && error.code === 'PMAX_PREPARATION_GEO_AMBIGUOUS') {
          throw new GooglePmaxLaunchPreparationError('PMAX_PREPARATION_GEO_AMBIGUOUS', [{
            code: 'PMAX_LOCATION_RESOLUTION_AMBIGUOUS',
            path: 'locations',
            message: 'An approved location did not resolve to exactly one enabled Australian Google geo target.'
          }])
        }
        throw new GooglePmaxLaunchPreparationError('PMAX_PREPARATION_PROVIDER_RESPONSE_INVALID')
      })
      const [provider, feedLink] = await Promise.all([
        providerPromise,
        queryOne<FeedLinkRow>(
          `SELECT id, provider_id, default_feed_ids, status
             FROM client_feed_links
            WHERE client_id = $1::uuid
              AND provider_id = 'social-dashboard'
              AND status = 'active'
            LIMIT 1`,
          [brief.client_id]
        )
      ])

      const account = provider.account
      if (account.id !== customerId || connection.customerId !== customerId) {
        throw new GooglePmaxLaunchPreparationError('PMAX_PREPARATION_PROVIDER_RESPONSE_INVALID')
      }
      const feedIds = feedLink ? activeFeedIds(feedLink.default_feed_ids) : []
      const feedActive = Boolean(feedLink && selectedFeedId && feedIds.includes(selectedFeedId))

      const normalized = await normalize({
        brief: {
          id: brief.id,
          version: brief.launch_config_version,
          tenantId: input.tenantId,
          clientId: brief.client_id,
          status: brief.status,
          templateSlug: brief.template_slug
        },
        fieldValues: fields,
        provider: {
          selectedConnectionId,
          connectionId: connection.id,
          selectedConversionActionIds,
          customerId: account.id,
          accountCurrency: account.currencyCode,
          accountTimezone: account.timeZone,
          inventorySource: {
            linkId: feedLink?.id || '',
            providerId: feedLink?.provider_id || '',
            selectedFeedId,
            feedId: feedActive ? selectedFeedId : '',
            platform: 'google',
            active: feedActive
          },
          locations: provider.locations,
          assetGroup: {
            requiredAssetCoverageComplete: false,
            imageAssetResourceNames: [],
            logoAssetResourceNames: [],
            youtubeVideoAssetResourceNames: []
          },
          conversionGoals: provider.conversionGoals
        }
      })
      if (normalized.ok === false) {
        throw new GooglePmaxLaunchPreparationError('PMAX_PREPARATION_CONFIG_INVALID', normalized.issues)
      }
      if (!brief.converted_to_project_id) {
        if (!brief.project_template_id) {
          throw new GooglePmaxLaunchPreparationError('PMAX_PREPARATION_CONFIG_INVALID', [{
            code: 'PMAX_ROLLOUT_TEMPLATE_MISSING',
            path: 'brief.projectTemplateId',
            message: 'The approved brief is not linked to the Google PMax rollout project template.'
          }])
        }
        try {
          await ensureProject({ briefId: brief.id, userId: input.actorId })
        } catch (error: unknown) {
          if ((error as { statusCode?: number })?.statusCode !== 409) throw error
        }
      }

      const configHash = normalized.value.configHash
      const idempotencyKey = hashCanonicalLaunchJson({
        tenantId: input.tenantId,
        briefId: brief.id,
        configVersion: brief.launch_config_version,
        configHash
      })
      const currentBrief = await readBrief(queryOne, input.tenantId, input.briefId)
      if (
        !currentBrief
        || currentBrief.client_id !== brief.client_id
        || currentBrief.status !== 'approved'
        || currentBrief.template_slug !== 'google-pmax'
        || currentBrief.launch_config_version !== brief.launch_config_version
        || !currentBrief.converted_to_project_id
      ) {
        throw new GooglePmaxLaunchPreparationError('PMAX_PREPARATION_BRIEF_NOT_APPROVED')
      }
      return createLaunch({
        tenantId: input.tenantId,
        briefId: brief.id,
        clientId: brief.client_id,
        connectionId: connection.id,
        configVersion: brief.launch_config_version,
        configHash,
        idempotencyKey,
        normalizedConfig: normalized.value.config as unknown as Record<string, unknown>,
        actorId: input.actorId
      })
    }
  }
}

export const googlePmaxLaunchPreparation = createGooglePmaxLaunchPreparation()
