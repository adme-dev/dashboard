import { beforeEach, describe, expect, it, vi } from 'vitest'

const ofetchMock = vi.hoisted(() => vi.fn())
vi.mock('ofetch', () => ({ ofetch: (...args: unknown[]) => ofetchMock(...args) }))

import { getMetaCampaignAdPerformance } from '~~/server/utils/metaClient'

describe('getMetaCampaignAdPerformance', () => {
  beforeEach(() => {
    ofetchMock.mockReset()
    ofetchMock.mockImplementation(async (url: string, options: any) => {
      if (url.endsWith('/ads')) {
        return { data: [{
          id: 'ad-1', name: 'EOFY tile', adset_id: 'set-1', effective_status: 'DISAPPROVED',
          issues_info: [{ error_code: 1487007, error_summary: 'Vehicle pricing claim', error_message: 'Price evidence required' }],
          creative: { id: 'creative-1' },
        }] }
      }
      if (url.endsWith('/adsets')) {
        return { data: [{ id: 'set-1', name: 'Retargeting', effective_status: 'ACTIVE', learning_stage_info: { status: 'LEARNING_LIMITED' } }] }
      }
      if (options?.query?.time_increment === '1') {
        return { data: [{ ad_id: 'ad-1', spend: '10', date_start: '2026-08-04' }] }
      }
      if (options?.query?.level === 'adset') {
        return { data: [{ adset_id: 'set-1', adset_name: 'Retargeting', spend: '121.59', impressions: '48210', frequency: '3.7', cpm: '2.52' }] }
      }
      return {
        data: [{
          ad_id: 'ad-1', ad_name: 'EOFY tile', adset_id: 'set-1', adset_name: 'Retargeting', spend: '121.59', impressions: '48210', clicks: '1430',
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
      adSetId: 'set-1',
      adSetName: 'Retargeting',
      impressions: 48210,
      frequency: 3.7,
      cpm: 2.52,
      approvalStatus: 'DISAPPROVED',
      providerApprovalStatus: 'DISAPPROVED',
      learningStage: 'LEARNING_LIMITED',
      providerLearningStage: 'LEARNING_LIMITED',
      policyIssues: [expect.objectContaining({ summary: 'Vehicle pricing claim' })],
      firstServedDate: '2026-08-04',
      lastServedDate: '2026-08-04',
    })])
    expect(ofetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/campaign-1\/ads$/),
      expect.objectContaining({ query: expect.objectContaining({ fields: expect.stringContaining('issues_info') }) }),
    )
  })

  it('keeps ad metrics when ad-set diagnostics fail and reports the family failure', async () => {
    ofetchMock.mockImplementation(async (url: string, options: any) => {
      if (url.endsWith('/adsets') || options?.query?.level === 'adset') throw new Error('Meta ad-set permission denied')
      if (url.endsWith('/ads')) return { data: [{ id: 'ad-1', adset_id: 'set-1', effective_status: 'ACTIVE' }] }
      if (options?.query?.time_increment === '1') return { data: [{ ad_id: 'ad-1', spend: '1', date_start: '2026-08-04' }] }
      return { data: [{ ad_id: 'ad-1', adset_id: 'set-1', spend: '10', impressions: '100', clicks: '5' }] }
    })
    const rows = await getMetaCampaignAdPerformance('campaign-1', 'token', '2026-08-01', '2026-08-19')
    expect(rows[0]).toMatchObject({
      spend: 10,
      approvalStatus: 'APPROVED',
      frequency: null,
      cpm: null,
      learningStage: null,
    })
    expect(rows[0]?.learningStageUnavailableReason).toMatch(/permission denied/i)
    expect(rows[0]?.adSetMetricsUnavailableReason).toMatch(/permission denied/i)
  })
})
