import { describe, expect, it, vi } from 'vitest'

const ofetchMock = vi.fn()
vi.mock('ofetch', () => ({ ofetch: (...args: unknown[]) => ofetchMock(...args), $fetch: (...args: unknown[]) => ofetchMock(...args) }))

import { getCampaignAdAssets, GOOGLE_AD_ASSETS_CAP } from '~~/server/utils/googleAdsClient'

const adRow = (i: number) => ({ adGroupAd: { ad: { id: String(i), name: `Ad ${i}`, type: 'RESPONSIVE_SEARCH_AD', responsiveSearchAd: { headlines: [{ text: `H${i}` }], descriptions: [] } } } })

describe('getCampaignAdAssets — X-1a declared cap', () => {
  it('no longer silently returns 5 ads: returns every ad up to the cap and declares truncated=false', async () => {
    ofetchMock
      .mockResolvedValueOnce([{ results: Array.from({ length: 12 }, (_, i) => adRow(i)) }])
      .mockResolvedValueOnce([{ results: [] }])
    const assets = await getCampaignAdAssets('1234567890', 'tok', 'dev', '9999999999')
    expect(assets).toHaveLength(12)
    expect(assets.truncated).toBe(false)
    expect(assets.cap).toBe(GOOGLE_AD_ASSETS_CAP)
    expect(assets.total).toBe(12)
    expect(String(ofetchMock.mock.calls[0][1].body.query)).not.toContain('LIMIT 5')
  })

  it('declares truncation when the campaign has more ads than the cap', async () => {
    ofetchMock
      .mockResolvedValueOnce([{ results: Array.from({ length: GOOGLE_AD_ASSETS_CAP + 1 }, (_, i) => adRow(i)) }])
      .mockResolvedValueOnce([{ results: [] }])
    const assets = await getCampaignAdAssets('1234567890', 'tok', 'dev', '9999999999')
    expect(assets).toHaveLength(GOOGLE_AD_ASSETS_CAP)
    expect(assets.truncated).toBe(true)
    expect(assets.total).toBe(GOOGLE_AD_ASSETS_CAP + 1)
  })

  it('throws on an API failure instead of returning an empty list that looks like "no creatives"', async () => {
    ofetchMock.mockImplementationOnce(async () => {
      throw new Error('403 Forbidden')
    })
    let thrown: unknown = null
    try {
      await getCampaignAdAssets('1234567890', 'tok', 'dev', '9999999999')
    } catch (err) {
      thrown = err
    }
    expect(String(thrown)).toMatch(/403/)
  })
})
