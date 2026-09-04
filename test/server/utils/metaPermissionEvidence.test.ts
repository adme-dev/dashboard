import { describe, expect, it, vi } from 'vitest'
import { getEffectiveMetaPermissionEvidence } from '~~/server/utils/metaPermissionEvidence'

const adAccount = {
  account_id: '123',
  id: 'act_123',
  name: 'Review account',
  currency: 'AUD',
  account_status: 1,
}

describe('Meta permission capability evidence', () => {
  it('recovers effective business-login grants from protected API calls', async () => {
    const evidence = await getEffectiveMetaPermissionEvidence('token', 'catalog', {
      getReportedPermissions: vi.fn().mockResolvedValue([]),
      getAdAccounts: vi.fn().mockResolvedValue([adAccount]),
      listBusinesses: vi.fn().mockResolvedValue([{ id: 'business-1', name: 'ADME' }]),
      listCatalogs: vi.fn().mockResolvedValue([]),
    })

    expect(evidence.scopes).toEqual([
      'ads_management',
      'business_management',
      'catalog_management',
    ])
    expect(evidence.adAccounts).toEqual([adAccount])
    expect(evidence.evidence).toEqual({
      permissionsEndpoint: true,
      adsManagement: true,
      businessManagement: true,
      catalogManagement: true,
    })
  })

  it('does not infer permissions from the requested intent when probes fail', async () => {
    const evidence = await getEffectiveMetaPermissionEvidence('token', 'catalog', {
      getReportedPermissions: vi.fn().mockRejectedValue(new Error('unsupported')),
      getAdAccounts: vi.fn().mockRejectedValue(new Error('denied')),
      listBusinesses: vi.fn().mockRejectedValue(new Error('denied')),
      listCatalogs: vi.fn().mockResolvedValue([]),
    })

    expect(evidence.scopes).toEqual([])
    expect(evidence.evidence).toEqual({
      permissionsEndpoint: false,
      adsManagement: false,
      businessManagement: false,
      catalogManagement: false,
    })
  })

  it('tries each selected Business until catalog access is proven', async () => {
    const listCatalogs = vi.fn()
      .mockRejectedValueOnce(new Error('not selected'))
      .mockResolvedValueOnce([])

    const evidence = await getEffectiveMetaPermissionEvidence('token', 'catalog', {
      getReportedPermissions: vi.fn().mockResolvedValue(['pages_show_list']),
      getAdAccounts: vi.fn().mockResolvedValue([]),
      listBusinesses: vi.fn().mockResolvedValue([
        { id: 'business-1', name: 'One' },
        { id: 'business-2', name: 'Two' },
      ]),
      listCatalogs,
    })

    expect(listCatalogs).toHaveBeenCalledTimes(2)
    expect(evidence.scopes).toContain('catalog_management')
    expect(evidence.scopes).toContain('pages_show_list')
  })

  it('resolves Business Login granular-scope targets when /me/businesses is empty', async () => {
    const getBusiness = vi.fn()
      .mockResolvedValueOnce({ id: 'business-1', name: 'ADME Advertising' })
      .mockRejectedValueOnce(new Error('not accessible'))

    const evidence = await getEffectiveMetaPermissionEvidence('token', 'catalog', {
      getReportedPermissions: vi.fn().mockResolvedValue([]),
      getAdAccounts: vi.fn().mockResolvedValue([]),
      listBusinesses: vi.fn().mockResolvedValue([]),
      getBusiness,
      businessTargetIds: ['business-1', 'business-other'],
      listCatalogs: vi.fn().mockResolvedValue([]),
    })

    expect(getBusiness).toHaveBeenCalledWith('business-1', 'token')
    expect(getBusiness).toHaveBeenCalledWith('business-other', 'token')
    expect(evidence.businesses).toEqual([{ id: 'business-1', name: 'ADME Advertising' }])
    expect(evidence.scopes).toContain('business_management')
    expect(evidence.scopes).toContain('catalog_management')
  })
})
