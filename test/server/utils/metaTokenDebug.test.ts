import { describe, expect, it, vi } from 'vitest'
import { debugMetaAccessToken, getMetaGranularTargetIds } from '~~/server/utils/metaTokenDebug'

describe('Meta token debugging', () => {
  it('uses app credentials server-side and returns only debug data', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      data: {
        is_valid: true,
        granular_scopes: [
          { scope: 'business_management', target_ids: ['910973038941836'] },
        ],
      },
    })

    const result = await debugMetaAccessToken('user-token', 'app-id', 'app-secret', fetchImpl)

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://graph.facebook.com/v25.0/debug_token',
      expect.objectContaining({
        method: 'GET',
        query: {
          input_token: 'user-token',
          access_token: 'app-id|app-secret',
        },
      }),
    )
    expect(result.is_valid).toBe(true)
  })

  it('deduplicates target IDs for the requested granular scope', () => {
    expect(getMetaGranularTargetIds({
      granular_scopes: [
        { scope: 'business_management', target_ids: ['business-1', 'business-1'] },
        { scope: 'catalog_management', target_ids: ['catalog-1'] },
        { scope: 'business_management', target_ids: ['business-2'] },
      ],
    }, 'business_management')).toEqual(['business-1', 'business-2'])
  })
})
