import { beforeEach, describe, expect, it, vi } from 'vitest'

const ofetchMock = vi.hoisted(() => vi.fn())
vi.mock('ofetch', () => ({ ofetch: (...args: unknown[]) => ofetchMock(...args) }))

import { getMetaCampaignAdPerformance } from '~~/server/utils/metaClient'

describe('getMetaCampaignAdPerformance', () => {
  beforeEach(() => {
    ofetchMock.mockReset()
    ofetchMock.mockImplementation(async (url: string, options: any) => {
      if (url.endsWith('/ads')) {
        return { data: [{ id: 'ad-1', creative: { id: 'creative-1' } }] }
      }
      if (options?.query?.time_increment === '1') {
        return { data: [{ ad_id: 'ad-1', spend: '10', date_start: '2026-08-04' }] }
      }
      return {
        data: [{
          ad_id: 'ad-1', ad_name: 'EOFY tile', spend: '121.59', impressions: '48210', clicks: '1430',
          reach: '13029', frequency: '3.7', actions: [{ action_type: 'lead', value: '9' }],
        }],
      }
    })
  })

  it('joins each Meta ad insight to its creative id and delivery window', async () => {
    const rows = await getMetaCampaignAdPerformance('campaign-1', 'secret-token', '2026-08-01', '2026-08-19')

    expect(rows).toEqual([expect.objectContaining({
      adId: 'ad-1',
      creativeId: 'creative-1',
      impressions: 48210,
      frequency: 3.7,
      firstServedDate: '2026-08-04',
      lastServedDate: '2026-08-04',
    })])
    expect(ofetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/campaign-1\/ads$/),
      expect.objectContaining({ query: expect.objectContaining({ fields: 'id,creative{id}' }) }),
    )
  })
})
