import { describe, expect, it, vi } from 'vitest'
import type {
  GooglePmaxLaunchPreparationError
} from '~~/server/utils/googlePmaxLaunchPreparation'
import {
  GooglePmaxLaunchPreparationError as PreparationError,
  createGooglePmaxLaunchPreparation
} from '~~/server/utils/googlePmaxLaunchPreparation'
import { normalizeGooglePmaxInventoryLaunchConfig } from '~~/server/utils/googlePmaxLaunchConfig'

const ids = {
  brief: '23799282-283b-4508-b065-3fd36e8c05fd',
  tenant: 'c41c58be-a3a8-4479-b5d1-9251bb80717d',
  client: '8d28740e-6239-4ab6-8d82-cd03aa10d5ea',
  connection: '4f1206a1-fec7-491f-beed-662d9e9fc904',
  feedLink: '7e8396fd-1515-4e5e-a364-3d7c3a3dc1ac',
  actor: '10ea5019-e05f-476f-971e-a73a3bc6930c'
}

const fields = {
  pmax_type: 'inventory',
  campaign_name: 'Northern GAC Vehicles',
  budget_period: 'fixed_flight',
  allocated_total: 700,
  budget_currency: 'AUD',
  start_date: '2026-08-08',
  end_date: '2026-09-06',
  google_connection_id: ids.connection,
  google_feed_id: 'google-vehicles-au',
  merchant_centre_id: '5831245452',
  inventory_condition: 'NEW',
  bidding: 'max_conversions',
  asset_mode: 'merchant_only',
  asset_group_name: 'Northern GAC vehicle inventory',
  final_url: 'https://www.northerngac.com.au/new-vehicles/',
  business_name: '',
  headlines: '',
  long_headlines: '',
  descriptions: '',
  locations: 'Bundoora VIC',
  languages: ['en'],
  conversion_action_ids: ['111'],
  acct_compliance_ack: true
}

function harness(overrides: { suggestions?: unknown } = {}) {
  let convertedProjectId: string | null = null
  const queryOne = vi.fn(async (sql: string) => {
    if (sql.includes('FROM briefs b')) return {
      id: ids.brief,
      client_id: ids.client,
      client_name: 'Northern GAC',
      title: 'Northern GAC Vehicles',
      status: 'approved',
      launch_config_version: 3,
      template_slug: 'google-pmax',
      converted_to_project_id: convertedProjectId,
      project_template_id: '862caf60-09aa-4488-98cb-0b145118a4a6'
    }
    if (sql.includes('FROM social_connections')) return {
      id: ids.connection,
      client_id: ids.client,
      account_id: '758-397-7544',
      account_name: 'Northern GAC',
      status: 'active'
    }
    if (sql.includes('FROM client_feed_links')) return {
      id: ids.feedLink,
      provider_id: 'social-dashboard',
      default_feed_ids: ['google-vehicles-au'],
      status: 'active'
    }
    return null
  })
  const queryRows = vi.fn(async (sql: string) => {
    if (sql.includes('FROM brief_field_values')) {
      return Object.entries(fields).map(([field_key, value]) => ({ field_key, value }))
    }
    return []
  })
  const readConnection = vi.fn(async () => ({
    id: ids.connection,
    clientId: ids.client,
    status: 'active' as const,
    customerId: '7583977544',
    accessToken: 'access-token',
    developerToken: 'developer-token'
  }))
  const suggestions = overrides.suggestions || ({
    geoTargetConstantSuggestions: [{
      geoTargetConstant: {
        resourceName: 'geoTargetConstants/1000567',
        name: 'Bundoora',
        canonicalName: 'Bundoora, Victoria, Australia',
        countryCode: 'AU',
        targetType: 'City',
        status: 'ENABLED'
      },
      searchTerm: 'Bundoora VIC',
      locale: 'en',
      reach: '10000'
    }]
  })
  const prepareProvider = vi.fn(async ({ connection, requestedLocations }) => {
    const payload = suggestions as { geoTargetConstantSuggestions?: Array<Record<string, unknown>> }
    const candidates = (payload.geoTargetConstantSuggestions || []).filter(item => item.searchTerm === requestedLocations[0])
    if (candidates.length !== 1) {
      throw new PreparationError('PMAX_PREPARATION_GEO_AMBIGUOUS', [{
        code: 'PMAX_LOCATION_RESOLUTION_AMBIGUOUS',
        path: 'locations',
        message: 'Approved location did not resolve uniquely.'
      }])
    }
    const geo = candidates[0]!.geoTargetConstant as Record<string, string>
    return {
      account: { id: connection.customerId, currencyCode: 'AUD', timeZone: 'Australia/Melbourne' },
      conversionGoals: [{
        conversionActionId: '111',
        resourceName: 'customers/7583977544/conversionActions/111',
        category: 'SUBMIT_LEAD_FORM',
        origin: 'WEBSITE'
      }],
      locations: [{
        criterionId: geo.resourceName!.replace('geoTargetConstants/', ''),
        displayName: geo.canonicalName!,
        sourceText: requestedLocations[0]!
      }]
    }
  })
  const createLaunch = vi.fn(async input => ({
    launch: { id: '780f8938-af67-4e61-96bb-65c3202f29a4', ...input },
    isReplay: false
  }))
  const ensureProject = vi.fn(async () => {
    convertedProjectId = '6f857dcc-8cf7-47b9-b787-fe05975053bb'
    return { project: { id: convertedProjectId } }
  })
  return {
    service: createGooglePmaxLaunchPreparation({
      queryOne: queryOne as never,
      queryRows: queryRows as never,
      readConnection,
      prepareProvider,
      createLaunch: createLaunch as never,
      ensureProject,
      normalize: async input => normalizeGooglePmaxInventoryLaunchConfig(input)
    }),
    queryOne,
    queryRows,
    readConnection,
    prepareProvider,
    createLaunch,
    ensureProject
  }
}

describe('Google PMax launch preparation', () => {
  it('builds the immutable launch only from server-read brief and provider evidence', async () => {
    const test = harness()

    const result = await test.service.prepare({
      tenantId: ids.tenant,
      briefId: ids.brief,
      expectedClientId: ids.client,
      actorId: ids.actor
    })

    expect(test.readConnection).toHaveBeenCalledWith({
      tenantId: ids.tenant,
      clientId: ids.client,
      connectionId: ids.connection,
      customerId: '7583977544'
    })
    expect(test.prepareProvider).toHaveBeenCalledWith({
      connection: expect.objectContaining({ customerId: '7583977544' }),
      selectedConversionActionIds: ['111'],
      requestedLocations: ['Bundoora VIC']
    })
    expect(test.createLaunch).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: ids.tenant,
      briefId: ids.brief,
      clientId: ids.client,
      connectionId: ids.connection,
      configVersion: 3,
      configHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      idempotencyKey: expect.stringMatching(/^[a-f0-9]{64}$/),
      actorId: ids.actor,
      normalizedConfig: expect.objectContaining({
        customerId: '7583977544',
        merchantCenterId: '5831245452',
        locations: [{ criterionId: '1000567', displayName: 'Bundoora, Victoria, Australia' }],
        conversionGoals: [{
          conversionActionId: '111',
          resourceName: 'customers/7583977544/conversionActions/111',
          category: 'SUBMIT_LEAD_FORM',
          origin: 'WEBSITE'
        }]
      })
    }))
    expect(test.ensureProject).toHaveBeenCalledWith({ briefId: ids.brief, userId: ids.actor })
    expect(result.isReplay).toBe(false)
  })

  it('fails closed when an approved location is ambiguous', async () => {
    const candidate = {
      resourceName: 'geoTargetConstants/1000567',
      name: 'Bundoora',
      canonicalName: 'Bundoora, Victoria, Australia',
      countryCode: 'AU',
      targetType: 'City',
      status: 'ENABLED'
    }
    const test = harness({
      suggestions: {
        geoTargetConstantSuggestions: [
          { geoTargetConstant: candidate, searchTerm: 'Bundoora VIC' },
          { geoTargetConstant: { ...candidate, resourceName: 'geoTargetConstants/2000567' }, searchTerm: 'Bundoora VIC' }
        ]
      }
    })

    await expect(test.service.prepare({
      tenantId: ids.tenant,
      briefId: ids.brief,
      expectedClientId: ids.client,
      actorId: ids.actor
    })).rejects.toMatchObject<Partial<GooglePmaxLaunchPreparationError>>({
      code: 'PMAX_PREPARATION_GEO_AMBIGUOUS',
      issues: [expect.objectContaining({ code: 'PMAX_LOCATION_RESOLUTION_AMBIGUOUS' })]
    })
    expect(test.createLaunch).not.toHaveBeenCalled()
  })

  it('lists only approved brief versions that do not already have a launch', async () => {
    const test = harness()
    test.queryRows.mockResolvedValueOnce([{
      id: ids.brief,
      client_id: ids.client,
      client_name: 'Northern GAC',
      title: 'Northern GAC Vehicles',
      status: 'approved',
      launch_config_version: 3,
      template_slug: 'google-pmax',
      converted_to_project_id: null,
      project_template_id: '862caf60-09aa-4488-98cb-0b145118a4a6'
    }])

    await expect(test.service.list({
      tenantId: ids.tenant,
      clientId: ids.client,
      limit: 20
    })).resolves.toEqual([{
      id: ids.brief,
      clientId: ids.client,
      clientName: 'Northern GAC',
      title: 'Northern GAC Vehicles',
      configVersion: 3
    }])
    expect(test.queryRows).toHaveBeenCalledWith(
      expect.stringContaining('NOT EXISTS'),
      [ids.tenant, 20, ids.client]
    )
  })
})
