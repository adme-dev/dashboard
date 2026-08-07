import { describe, expect, it } from 'vitest'
import { normalizeGooglePmaxInventoryLaunchConfig } from '~~/server/utils/googlePmaxLaunchConfig'

const ids = {
  brief: '23799282-283b-4508-b065-3fd36e8c05fd',
  tenant: 'c41c58be-a3a8-4479-b5d1-9251bb80717d',
  client: '8d28740e-6239-4ab6-8d82-cd03aa10d5ea',
  connection: '4f1206a1-fec7-491f-beed-662d9e9fc904'
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    brief: {
      id: ids.brief,
      version: 1,
      tenantId: ids.tenant,
      clientId: ids.client,
      status: 'approved',
      templateSlug: 'google-pmax'
    },
    fieldValues: {
      pmax_type: 'inventory',
      campaign_name: 'CP Ford · New Vehicle PMax · July',
      budget_period: 'fixed_flight',
      allocated_total: 1000,
      budget_currency: 'AUD',
      start_date: '2026-07-17',
      end_date: '2026-07-31',
      google_connection_id: ids.connection,
      merchant_centre_id: '123456789',
      inventory_condition: 'new',
      bidding: 'max_conversions',
      asset_group_name: 'CP Ford new vehicles',
      final_url: 'https://www.cpford.com.au/new-vehicles/',
      business_name: 'CP Ford',
      headlines: 'Explore New Ford Vehicles\nBook a Test Drive\nFind Your Next Ford',
      long_headlines: 'Explore the latest new Ford vehicles available from CP Ford',
      descriptions: 'Browse new Ford vehicles and enquire today.\nBook a test drive with the CP Ford team.',
      locations: 'Melbourne VIC\nGeelong VIC',
      languages: ['en'],
      conversion_action_ids: ['111', '222'],
      acct_compliance_ack: true
    },
    provider: {
      selectedConnectionId: ids.connection,
      connectionId: ids.connection,
      selectedConversionActionIds: ['111', '222'],
      customerId: '123-456-7890',
      accountCurrency: 'AUD',
      accountTimezone: 'Australia/Melbourne',
      locations: [
        { criterionId: '1000567', displayName: 'Melbourne VIC', sourceText: 'Melbourne VIC' },
        { criterionId: '1015068', displayName: 'Geelong VIC', sourceText: 'Geelong VIC' }
      ],
      assetGroup: {
        imageAssetResourceNames: ['customers/1234567890/assets/20', 'customers/1234567890/assets/10'],
        logoAssetResourceNames: ['customers/1234567890/assets/30'],
        youtubeVideoAssetResourceNames: []
      },
      conversionGoals: [
        { conversionActionId: '222', resourceName: 'customers/1234567890/conversionActions/222', category: 'SUBMIT_LEAD_FORM', origin: 'WEBSITE' },
        { conversionActionId: '111', resourceName: 'customers/1234567890/conversionActions/111', category: 'PHONE_CALL_LEAD', origin: 'CALL_FROM_ADS' }
      ]
    },
    ...overrides
  }
}

describe('Google PMax Inventory launch configuration normalization', () => {
  it('maps the CP Ford fixed flight into the canonical versioned config', () => {
    const result = normalizeGooglePmaxInventoryLaunchConfig(input())

    expect(result).toMatchObject({
      ok: true,
      value: {
        configHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        config: {
          schemaVersion: 1,
          briefId: ids.brief,
          briefVersion: 1,
          customerId: '1234567890',
          budget: {
            period: 'CUSTOM_PERIOD',
            allocatedTotal: 1000,
            dailyBudget: null,
            campaignDays: 15,
            provider: { totalAmountMicros: '1000000000', amountMicros: null }
          },
          inventoryFilter: { listingSource: 'SHOPPING', conditions: ['NEW'] },
          bidding: { strategy: 'MAXIMIZE_CONVERSIONS' },
          approval: { required: true, complianceAcknowledged: true }
        }
      }
    })
  })

  it('produces the same hash for semantically identical order and whitespace', () => {
    const first = normalizeGooglePmaxInventoryLaunchConfig(input())
    const reordered = input()
    reordered.fieldValues = {
      ...reordered.fieldValues,
      campaign_name: '  CP Ford · New Vehicle PMax · July  ',
      languages: ['en', 'en']
    }
    reordered.provider.locations.reverse()
    reordered.provider.assetGroup.imageAssetResourceNames.reverse()
    reordered.provider.conversionGoals.reverse()

    const second = normalizeGooglePmaxInventoryLaunchConfig(reordered)
    expect(first.ok && second.ok && first.value.configHash).toBe(second.ok && second.value.configHash)
  })

  it('changes version and hash for a material budget edit', () => {
    const first = normalizeGooglePmaxInventoryLaunchConfig(input())
    const changed = input({
      brief: { ...input().brief, version: 2 },
      fieldValues: { ...input().fieldValues, allocated_total: 1500 }
    })
    const second = normalizeGooglePmaxInventoryLaunchConfig(changed)

    expect(first.ok && second.ok && second.value.config.briefVersion).toBe(2)
    expect(first.ok && second.ok && first.value.configHash).not.toBe(second.ok && second.value.configHash)
  })

  it.each([
    ['PMAX_BRIEF_NOT_APPROVED', { brief: { ...input().brief, status: 'submitted' } }],
    ['PMAX_TYPE_INVALID', { fieldValues: { ...input().fieldValues, pmax_type: 'standard' } }],
    ['PMAX_MERCHANT_CENTER_MISSING', { fieldValues: { ...input().fieldValues, merchant_centre_id: '' } }],
    ['PMAX_CONNECTION_MISMATCH', { provider: { ...input().provider, selectedConnectionId: ids.brief } }],
    ['PMAX_CONVERSION_SELECTION_MISMATCH', { provider: { ...input().provider, selectedConversionActionIds: ['111'] } }],
    ['PMAX_COMPLIANCE_NOT_ACKNOWLEDGED', { fieldValues: { ...input().fieldValues, acct_compliance_ack: false } }]
  ])('rejects invalid or ambiguous input with stable code %s', (code, override) => {
    expect(normalizeGooglePmaxInventoryLaunchConfig(input(override))).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code })])
    })
  })

  it('rejects the legacy scalar target ROAS field because its unit is ambiguous', () => {
    expect(normalizeGooglePmaxInventoryLaunchConfig(input({
      fieldValues: { ...input().fieldValues, bidding: 'target_roas', target_cpa_roas: 400 }
    }))).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: 'PMAX_TARGET_ROAS_AMBIGUOUS' })])
    })
  })

  it('rejects duplicate field rows as ambiguous rather than using array order', () => {
    const base = input()
    expect(normalizeGooglePmaxInventoryLaunchConfig({
      ...base,
      fieldValues: [
        ...Object.entries(base.fieldValues).map(([fieldKey, value]) => ({ fieldKey, value })),
        { fieldKey: 'allocated_total', value: 50 }
      ]
    })).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: 'PMAX_FIELD_DUPLICATE', path: 'allocated_total' })])
    })
  })

  it('binds resolved locations to the approved location intent', () => {
    const base = input()
    base.provider.locations[0]!.sourceText = 'Sydney NSW'

    expect(normalizeGooglePmaxInventoryLaunchConfig(base)).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: 'PMAX_LOCATION_SELECTION_MISMATCH' })])
    })
  })

  it('rejects provider resource names that do not belong to the selected customer', () => {
    const base = input()
    base.provider.conversionGoals[0]!.resourceName = 'customers/9999999999/conversionActions/222'
    base.provider.assetGroup.imageAssetResourceNames[0] = 'customers/9999999999/assets/20'

    expect(normalizeGooglePmaxInventoryLaunchConfig(base)).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ code: 'PMAX_CONVERSION_RESOURCE_INVALID' }),
        expect.objectContaining({ code: 'PMAX_ASSET_RESOURCE_INVALID' })
      ])
    })
  })

  it('canonicalizes UUID casing before comparison and hashing', () => {
    const lower = normalizeGooglePmaxInventoryLaunchConfig(input())
    const upperInput = input()
    upperInput.brief.id = ids.brief.toUpperCase()
    upperInput.brief.tenantId = ids.tenant.toUpperCase()
    upperInput.brief.clientId = ids.client.toUpperCase()
    upperInput.fieldValues.google_connection_id = ids.connection.toUpperCase()
    upperInput.provider.selectedConnectionId = ids.connection.toUpperCase()
    upperInput.provider.connectionId = ids.connection.toUpperCase()
    const upper = normalizeGooglePmaxInventoryLaunchConfig(upperInput)

    expect(lower.ok && upper.ok && lower.value.configHash).toBe(upper.ok && upper.value.configHash)
  })

  it('rejects credentials embedded in the public final URL', () => {
    expect(normalizeGooglePmaxInventoryLaunchConfig(input({
      fieldValues: { ...input().fieldValues, final_url: 'https://user:password@www.cpford.com.au/new-vehicles/' }
    }))).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: 'PMAX_FINAL_URL_INVALID' })])
    })
  })

  it.each([
    'https://localhost/vehicles',
    'https://127.0.0.1/vehicles',
    'https://10.0.0.4/vehicles',
    'https://169.254.169.254/vehicles',
    'https://[::1]/vehicles',
    'https://[fd00::1]/vehicles'
  ])('rejects a non-public final URL host: %s', (finalUrl) => {
    expect(normalizeGooglePmaxInventoryLaunchConfig(input({
      fieldValues: { ...input().fieldValues, final_url: finalUrl }
    }))).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: 'PMAX_FINAL_URL_INVALID' })])
    })
  })

  it('deduplicates exact provider locations and rejects conflicting criterion evidence', () => {
    const exact = input()
    exact.provider.locations.push({ ...exact.provider.locations[0]! })
    const baseline = normalizeGooglePmaxInventoryLaunchConfig(input())
    const deduped = normalizeGooglePmaxInventoryLaunchConfig(exact)
    expect(baseline.ok && deduped.ok && baseline.value.configHash).toBe(deduped.ok && deduped.value.configHash)

    const conflict = input()
    conflict.provider.locations.push({ ...conflict.provider.locations[0]!, displayName: 'Different name' })
    expect(normalizeGooglePmaxInventoryLaunchConfig(conflict)).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: 'PMAX_LOCATION_EVIDENCE_CONFLICT' })])
    })
  })
})
