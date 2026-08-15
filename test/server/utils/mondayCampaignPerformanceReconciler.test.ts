import { describe, expect, it, vi } from 'vitest'
import {
  reconcileMondayCampaignPerformance,
  type CampaignPerformanceState
} from '~~/server/utils/mondayCampaignPerformanceReconciler'

const state: CampaignPerformanceState = {
  jobs: [
    {
      mondayItemId: 'job-1', taskId: 'task-1', clientId: 'client-1', clientName: 'Example Motors',
      title: 'Example Motors Google PMAX Inventory Lead Gen', platform: 'Google',
      campaignType: 'G_PMaxInventory', campaignId: null, budget: 900
    },
    {
      mondayItemId: 'job-2', taskId: 'task-2', clientId: 'client-2', clientName: 'Other Motors',
      title: 'Other Motors Used Cars AIA', platform: 'Meta',
      campaignType: 'M_AIA_Traffic', campaignId: 'meta-2', budget: 500
    }
  ],
  candidates: [
    {
      mediaSpendId: 'spend-1', clientId: 'client-1', platform: 'google_ads', campaignId: 'google-1',
      campaignName: 'Convert_Rolling_Google_PMaxInventory_Example_Motors_Lead_Gen'
    },
    {
      mediaSpendId: 'spend-2', clientId: 'client-2', platform: 'meta', campaignId: 'meta-2',
      campaignName: 'Capture_Rolling_Meta_AIA_Traffic_Other_Motors_Used_Cars'
    }
  ],
  unmappedMondayItemIds: []
}

describe('Monday campaign performance reconciliation', () => {
  it('is mutation-free in dry-run mode', async () => {
    const writeMondayCampaignId = vi.fn()
    const persistMatch = vi.fn()
    const result = await reconcileMondayCampaignPerformance({ apply: false }, {
      loadState: async () => state,
      writeMondayCampaignId,
      persistMatch
    })

    expect(result).toMatchObject({ total: 2, matched: 2, writtenBack: 0, persisted: 0 })
    expect(writeMondayCampaignId).not.toHaveBeenCalled()
    expect(persistMatch).not.toHaveBeenCalled()
  })

  it('writes only missing Monday IDs and persists every proven XeroFlow link', async () => {
    const writeMondayCampaignId = vi.fn()
    const persistMatch = vi.fn()
    const result = await reconcileMondayCampaignPerformance({ apply: true, writeBackMonday: true }, {
      loadState: async () => state,
      writeMondayCampaignId,
      persistMatch
    })

    expect(writeMondayCampaignId).toHaveBeenCalledTimes(1)
    expect(writeMondayCampaignId).toHaveBeenCalledWith(state.jobs[0], 'google-1')
    expect(persistMatch).toHaveBeenCalledTimes(2)
    expect(result).toMatchObject({ matched: 2, writtenBack: 1, persisted: 2, pending: 0, ambiguous: 0 })
    expect(persistMatch.mock.invocationCallOrder[0]).toBeLessThan(writeMondayCampaignId.mock.invocationCallOrder[0]!)
  })

  it('keeps Monday writeback optional during the XeroFlow cutover', async () => {
    const writeMondayCampaignId = vi.fn()
    const persistMatch = vi.fn()
    const result = await reconcileMondayCampaignPerformance({ apply: true }, {
      loadState: async () => state,
      writeMondayCampaignId,
      persistMatch
    })

    expect(persistMatch).toHaveBeenCalledTimes(2)
    expect(writeMondayCampaignId).not.toHaveBeenCalled()
    expect(result).toMatchObject({ persisted: 2, writtenBack: 0, writeBackSkipped: 1 })
  })

  it('does not lose a durable XeroFlow link when optional Monday writeback is unauthorized', async () => {
    const persistMatch = vi.fn()
    const result = await reconcileMondayCampaignPerformance({ apply: true, writeBackMonday: true }, {
      loadState: async () => state,
      writeMondayCampaignId: vi.fn().mockRejectedValue(new Error('missing required scopes')),
      persistMatch
    })

    expect(persistMatch).toHaveBeenCalledTimes(2)
    expect(result).toMatchObject({ persisted: 2, writtenBack: 0, writeBackFailed: 1 })
    expect(result.jobs[0]).toMatchObject({ status: 'matched', mondayWriteBack: 'failed' })
  })

  it('does not persist a platform campaign claimed by more than one job', async () => {
    const duplicateState: CampaignPerformanceState = {
      ...state,
      jobs: [state.jobs[0]!, { ...state.jobs[0]!, mondayItemId: 'job-duplicate', taskId: 'task-duplicate' }],
      candidates: [state.candidates[0]!]
    }
    const persistMatch = vi.fn()
    const result = await reconcileMondayCampaignPerformance({ apply: true }, {
      loadState: async () => duplicateState,
      writeMondayCampaignId: vi.fn(),
      persistMatch
    })

    expect(result).toMatchObject({ matched: 0, ambiguous: 2, persisted: 0 })
    expect(result.jobs.every(job => job.reason === 'candidate_claimed_by_multiple_jobs')).toBe(true)
    expect(persistMatch).not.toHaveBeenCalled()
  })

  it('reports imported jobs that do not yet have a XeroFlow task mapping', async () => {
    const result = await reconcileMondayCampaignPerformance({ apply: false }, {
      loadState: async () => ({ ...state, unmappedMondayItemIds: ['job-unmapped'] }),
      writeMondayCampaignId: vi.fn(),
      persistMatch: vi.fn()
    })

    expect(result.unmappedMondayItemIds).toEqual(['job-unmapped'])
  })
})
