import { describe, expect, it } from 'vitest'
import {
  buildCampaignPerformanceState,
  shouldInitializeCampaignBudget
} from '~~/server/utils/mondayCampaignPerformanceStore'
import type { MondayCampaignSnapshot } from '~~/server/utils/mondayCampaignJobs'

describe('XeroFlow campaign performance state', () => {
  it('makes XeroFlow task/client ownership authoritative and reports unmapped Monday jobs', () => {
    const snapshots = [
      {
        mondayItemId: 'job-1', name: 'Example Motors Google PMAX Inventory Lead Gen',
        platform: 'Google', campaignType: 'G_PMaxInventory', campaignId: null, budget: 900
      },
      {
        mondayItemId: 'job-unmapped', name: 'Unknown Motors Meta Traffic',
        platform: 'Meta', campaignType: 'M_Traffic', campaignId: null, budget: 100
      }
    ] as MondayCampaignSnapshot[]

    const result = buildCampaignPerformanceState(snapshots, [{
      mondayItemId: 'job-1', taskId: 'task-1', clientId: 'client-1', clientName: 'Example Motors',
      campaignId: 'google-1'
    }], [{
      mediaSpendId: 'spend-1', clientId: 'client-1', platform: 'google_ads',
      campaignId: 'google-1', campaignName: 'Convert_Google_PMaxInventory_Example_Motors_Lead_Gen'
    }])

    expect(result.jobs).toEqual([expect.objectContaining({
      mondayItemId: 'job-1', taskId: 'task-1', clientId: 'client-1', clientName: 'Example Motors'
    })])
    expect(result.jobs[0]?.campaignId).toBe('google-1')
    expect(result.jobs[0]?.linkedInXeroFlow).toBe(true)
    expect(shouldInitializeCampaignBudget(result.jobs[0]!)).toBe(false)
    expect(shouldInitializeCampaignBudget({
      ...result.jobs[0]!, linkedInXeroFlow: false, budget: 900
    })).toBe(true)
    expect(result.unmappedMondayItemIds).toEqual(['job-unmapped'])
  })
})
