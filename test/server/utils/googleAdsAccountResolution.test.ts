import { describe, expect, it } from 'vitest'
import {
  resolveGoogleAdsAccount,
  type GoogleAdsAccountResolutionCandidate,
  type GoogleAdsAccountResolutionDependencies
} from '~~/server/utils/googleAds/accountResolution'

const CLIENT_ID = 'efd1e1c6-f227-4b2f-b36d-19880bdba0e0'
const GAC_CONNECTION_ID = '717f209a-b2ea-4f2e-b489-2034a16ae9c1'
const GROUP_CONNECTION_ID = '9e32b563-a2c7-4e44-b703-1223260abd4b'

const candidates: GoogleAdsAccountResolutionCandidate[] = [
  {
    clientId: CLIENT_ID,
    canonicalName: 'Northern Motor Group',
    aliasId: '11111111-1111-4111-8111-111111111111',
    matchedName: 'Northern GAC',
    matchKind: 'alias'
  },
  {
    clientId: CLIENT_ID,
    canonicalName: 'Northern Motor Group',
    aliasId: null,
    matchedName: 'Northern Motor Group',
    matchKind: 'canonical'
  }
]

function dependencies(
  findCandidates: GoogleAdsAccountResolutionDependencies['findCandidates'] = async query => (
    candidates.filter(candidate => candidate.matchedName.toLowerCase().includes(query.toLowerCase()))
  )
): GoogleAdsAccountResolutionDependencies {
  return {
    findCandidates,
    listBindings: async clientId => [
      {
        id: '21111111-1111-4111-8111-111111111111',
        clientId,
        aliasId: '11111111-1111-4111-8111-111111111111',
        connectionId: GAC_CONNECTION_ID,
        operatingCustomerId: '7583977544',
        loginCustomerId: '1234567890',
        accountRole: 'dealer',
        connectionStatus: 'active',
        connectionAccountName: 'Northern GAC'
      },
      {
        id: '31111111-1111-4111-8111-111111111111',
        clientId,
        aliasId: null,
        connectionId: GROUP_CONNECTION_ID,
        operatingCustomerId: '6692975433',
        loginCustomerId: '1234567890',
        accountRole: 'group',
        connectionStatus: 'active',
        connectionAccountName: 'Northern Motor Group'
      }
    ]
  }
}

describe('Google Ads account resolution', () => {
  it('resolves the Northern GAC alias to its dealer account with complete evidence', async () => {
    const result = await resolveGoogleAdsAccount({ query: 'Northern GAC' }, dependencies())

    expect(result).toEqual({
      status: 'resolved',
      resolutionKind: 'direct',
      clientId: CLIENT_ID,
      canonicalName: 'Northern Motor Group',
      matchedName: 'Northern GAC',
      matchKind: 'alias',
      accounts: [{
        connectionId: GAC_CONNECTION_ID,
        operatingCustomerId: '7583977544',
        loginCustomerId: '1234567890',
        accountRole: 'dealer',
        connectionStatus: 'active',
        connectionAccountName: 'Northern GAC'
      }]
    })
  })

  it('resolves the canonical group name to the group account without implicit aggregation', async () => {
    const result = await resolveGoogleAdsAccount(
      { query: 'Northern Motor Group' },
      dependencies()
    )

    expect(result.status).toBe('resolved')
    if (result.status !== 'resolved') return
    expect(result.resolutionKind).toBe('direct')
    expect(result.accounts).toHaveLength(1)
    expect(result.accounts[0]).toMatchObject({
      connectionId: GROUP_CONNECTION_ID,
      operatingCustomerId: '6692975433',
      accountRole: 'group'
    })
  })

  it('includes every client-bound account only when aggregation is explicit', async () => {
    const result = await resolveGoogleAdsAccount(
      { query: 'Northern Motor Group', aggregate: true },
      dependencies()
    )

    expect(result.status).toBe('resolved')
    if (result.status !== 'resolved') return
    expect(result.resolutionKind).toBe('aggregated')
    expect(result.accounts.map(account => account.operatingCustomerId)).toEqual([
      '7583977544',
      '6692975433'
    ])
  })

  it('returns typed ambiguity instead of guessing from partial matches', async () => {
    const result = await resolveGoogleAdsAccount({ query: 'Northern' }, dependencies())

    expect(result).toEqual({
      status: 'ambiguous',
      query: 'Northern',
      candidates: [
        { clientId: CLIENT_ID, canonicalName: 'Northern Motor Group', matchedName: 'Northern GAC', matchKind: 'alias' },
        { clientId: CLIENT_ID, canonicalName: 'Northern Motor Group', matchedName: 'Northern Motor Group', matchKind: 'canonical' }
      ]
    })
  })

  it('fails closed when a repository returns a binding owned by another client', async () => {
    const deps = dependencies()
    deps.listBindings = async () => [{
      id: '41111111-1111-4111-8111-111111111111',
      clientId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      aliasId: '11111111-1111-4111-8111-111111111111',
      connectionId: GAC_CONNECTION_ID,
      operatingCustomerId: '7583977544',
      loginCustomerId: null,
      accountRole: 'dealer',
      connectionStatus: 'active',
      connectionAccountName: 'Northern GAC'
    }]

    const result = await resolveGoogleAdsAccount({ query: 'Northern GAC' }, deps)

    expect(result).toEqual({
      status: 'missing_mapping',
      clientId: CLIENT_ID,
      canonicalName: 'Northern Motor Group',
      matchedName: 'Northern GAC',
      matchKind: 'alias'
    })
  })
})
