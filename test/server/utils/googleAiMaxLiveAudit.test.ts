import { describe, expect, it, vi } from 'vitest'

async function loadAuditModule() {
  return import('~~/server/utils/googleAiMaxLiveAudit').catch(() => null)
}

describe('Google AI Max live audit redaction boundary', () => {
  it('reports migration case coverage without retaining account or campaign identifiers', async () => {
    const audit = await loadAuditModule()
    expect(audit).not.toBeNull()
    if (!audit) return

    const summary = audit.summarizeGoogleAiMaxRows({
      campaignRows: [
        campaign('1001', 'Private ACA', 'UNSPECIFIED', false, 'OPTED_IN'),
        campaign('1002', 'Private Broad', 'BROAD', false, 'OPTED_OUT'),
        campaign('1003', 'Private Both', 'BROAD', false, 'OPTED_IN'),
        campaign('1004', 'Private Neither', 'UNSPECIFIED', false, 'OPTED_OUT'),
        campaign('1005', 'Private Enabled', 'UNSPECIFIED', true, 'OPTED_OUT'),
        { campaign: { id: '1006', name: 'Private Unknown', status: 'PAUSED' } }
      ],
      adGroupRows: [
        { adGroup: { id: '2001', campaign: 'customers/9999999999/campaigns/1005', status: 'ENABLED', aiMaxAdGroupSetting: { disableSearchTermMatching: false } } },
        { adGroup: { id: '2002', campaign: 'customers/9999999999/campaigns/1005', status: 'PAUSED', aiMaxAdGroupSetting: { disableSearchTermMatching: true } } },
        { adGroup: { id: '2003', campaign: 'customers/9999999999/campaigns/1006', status: 'ENABLED' } }
      ]
    })

    expect(summary).toEqual({
      campaignCount: 6,
      adGroupCount: 3,
      campaignStatuses: { ENABLED: 5, PAUSED: 1 },
      keywordMatchTypes: { BROAD: 2, UNSPECIFIED: 3, MISSING: 1 },
      aiMaxEnabled: { true: 1, false: 4, missing: 1 },
      textAssetAutomation: { OPTED_IN: 2, OPTED_OUT: 3, MISSING: 1 },
      finalUrlExpansion: { OPTED_OUT: 5, MISSING: 1 },
      bundlingRequired: { NOT_REQUIRED: 5, MISSING: 1 },
      adGroupMatchingDisabled: { true: 1, false: 1, missing: 1 },
      caseCoverage: {
        acaOnly: 1,
        broadOnly: 1,
        bothLegacySettings: 1,
        neitherLegacySetting: 1,
        aiMaxEnabled: 1,
        incompleteEvidence: 1
      }
    })
    expect(JSON.stringify(summary)).not.toMatch(/Private|9999999999|100[1-6]|200[1-3]/)
  })

  it('bounds account sampling and redacts provider identifiers from errors', async () => {
    const audit = await loadAuditModule()
    expect(audit).not.toBeNull()
    if (!audit) return

    expect(audit.parseGoogleAiMaxAuditLimit(undefined)).toBe(2)
    expect(audit.parseGoogleAiMaxAuditLimit('0')).toBe(1)
    expect(audit.parseGoogleAiMaxAuditLimit('99')).toBe(5)
    expect(audit.redactGoogleAiMaxAuditError(
      new Error('Bearer secret-token failed for customers/9999999999 and account 8888888888'),
      ['secret-token']
    )).toBe('Bearer [REDACTED] failed for customers/[REDACTED] and account [REDACTED]')
  })

  it('audits only the bounded sample and never emits connection or customer identifiers', async () => {
    const audit = await loadAuditModule()
    expect(audit?.runGoogleAiMaxLiveAudit).toBeTypeOf('function')
    if (!audit?.runGoogleAiMaxLiveAudit) return

    const result = await audit.runGoogleAiMaxLiveAudit({
      developerToken: 'developer-secret',
      limit: 2,
      accounts: [
        account('connection-private-1', '1111111111', undefined),
        account('connection-private-2', '2222222222', '3333333333'),
        account('connection-private-3', '4444444444', undefined)
      ]
    }, {
      fetchRows: async (customerId: string) => {
        if (customerId === '2222222222') {
          throw new Error('Bearer token-private failed for customers/2222222222')
        }
        return { campaignRows: [], adGroupRows: [] }
      }
    })

    expect(result).toEqual({
      status: 'partial',
      requestedAccountCount: 3,
      sampledAccountCount: 2,
      successfulAccounts: 1,
      failedAccounts: 1,
      authModes: { direct: 1, managerLinked: 1 },
      accounts: [
        { sample: 1, authMode: 'direct', summary: summarizeEmpty() },
        { sample: 2, authMode: 'manager_linked', error: 'Bearer [REDACTED] failed for customers/[REDACTED]' }
      ]
    })
    expect(JSON.stringify(result)).not.toMatch(
      /connection-private|1111111111|2222222222|3333333333|4444444444|developer-secret|token-private/
    )
  })

  it('retries a 403 without the manager header and reports the effective auth mode', async () => {
    const audit = await loadAuditModule()
    expect(audit?.runGoogleAiMaxLiveAudit).toBeTypeOf('function')
    if (!audit?.runGoogleAiMaxLiveAudit) return

    const fetchRows = vi.fn(async (
      _customerId: string,
      _accessToken: string,
      _developerToken: string,
      loginCustomerId?: string
    ) => {
      if (loginCustomerId) {
        throw Object.assign(new Error('manager permission denied'), { status: 403 })
      }
      return { campaignRows: [], adGroupRows: [] }
    })

    const result = await audit.runGoogleAiMaxLiveAudit({
      developerToken: 'developer-secret',
      limit: 1,
      accounts: [account('connection-private', '1111111111', '9999999999')]
    }, { fetchRows })

    expect(result.status).toBe('completed')
    expect(result.authModes).toEqual({ direct: 1, managerLinked: 0 })
    expect(result.accounts[0]).toMatchObject({ sample: 1, authMode: 'direct' })
    expect(fetchRows.mock.calls.map(call => call[3])).toEqual(['9999999999', undefined])
  })
})

function account(connectionId: string, customerId: string, loginCustomerId: string | undefined) {
  return {
    connectionId,
    customerId,
    resolveAuth: async () => ({ accessToken: 'token-private', loginCustomerId })
  }
}

function summarizeEmpty() {
  return {
    campaignCount: 0,
    adGroupCount: 0,
    campaignStatuses: {},
    keywordMatchTypes: {},
    aiMaxEnabled: {},
    textAssetAutomation: {},
    finalUrlExpansion: {},
    bundlingRequired: {},
    adGroupMatchingDisabled: {},
    caseCoverage: {
      acaOnly: 0,
      broadOnly: 0,
      bothLegacySettings: 0,
      neitherLegacySetting: 0,
      aiMaxEnabled: 0,
      incompleteEvidence: 0
    }
  }
}

function campaign(
  id: string,
  name: string,
  keywordMatchType: string,
  enableAiMax: boolean,
  textStatus: string
) {
  return {
    campaign: {
      id,
      name,
      status: 'ENABLED',
      keywordMatchType,
      aiMaxSetting: { enableAiMax, bundlingRequired: 'NOT_REQUIRED' },
      assetAutomationSettings: [
        { assetAutomationType: 'TEXT_ASSET_AUTOMATION', assetAutomationStatus: textStatus },
        { assetAutomationType: 'FINAL_URL_EXPANSION_TEXT_ASSET_AUTOMATION', assetAutomationStatus: 'OPTED_OUT' }
      ]
    }
  }
}
