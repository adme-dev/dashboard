import { describe, expect, it, vi } from 'vitest'
import {
  getGrantedMetaPermissions,
  getMetaOAuthScopes,
  normalizeGrantedMetaPermissions,
} from '~~/server/utils/metaPermissions'

describe('Meta permission truth', () => {
  it('keeps rejected review permissions out of baseline consent', () => {
    expect(getMetaOAuthScopes('baseline')).not.toContain('ads_read')
    expect(getMetaOAuthScopes('baseline')).not.toContain('catalog_management')
    expect(getMetaOAuthScopes('catalog')).toContain('catalog_management')
    expect(getMetaOAuthScopes('catalog')).not.toContain('ads_read')
  })

  it('persists only permissions Meta reports as granted', () => {
    expect(normalizeGrantedMetaPermissions([
      { permission: 'ads_management', status: 'granted' },
      { permission: 'ads_read', status: 'declined' },
      { permission: 'catalog_management', status: 'expired' },
    ])).toEqual(['ads_management'])
  })

  it('uses a bearer header and follows permission pagination without leaking the token', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({
        data: [{ permission: 'business_management', status: 'granted' }],
        paging: { next: 'https://graph.facebook.com/v25.0/page-2?after=cursor&access_token=provider-token' },
      })
      .mockResolvedValueOnce({
        data: [{ permission: 'catalog_management', status: 'granted' }],
      })

    const scopes = await getGrantedMetaPermissions('secret-token', fetchImpl)

    expect(scopes).toEqual(['business_management', 'catalog_management'])
    expect(fetchImpl).toHaveBeenNthCalledWith(1, expect.stringContaining('/me/permissions'), {
      headers: { Authorization: 'Bearer secret-token' },
      query: { limit: 100 },
    })
    expect(fetchImpl).toHaveBeenNthCalledWith(2, 'https://graph.facebook.com/v25.0/page-2?after=cursor', {
      headers: { Authorization: 'Bearer secret-token' },
    })
    expect(JSON.stringify(scopes)).not.toContain('secret-token')
  })

  it('rejects a provider pagination URL outside Meta Graph', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce({
      data: [],
      paging: { next: 'https://attacker.example/collect' },
    })

    await expect(getGrantedMetaPermissions('secret-token', fetchImpl))
      .rejects.toThrow('invalid pagination URL')
    expect(fetchImpl).toHaveBeenCalledOnce()
  })
})
