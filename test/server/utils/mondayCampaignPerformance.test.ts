import { describe, expect, it } from 'vitest'
import {
  matchMondayCampaignToSpend,
  type CampaignLinkJob,
  type CampaignSpendCandidate
} from '~~/server/utils/mondayCampaignPerformance'

const jobs: CampaignLinkJob[] = [
  {
    mondayItemId: '12366146161',
    taskId: 'task-astoria',
    clientId: 'client-astoria',
    clientName: 'Astoria GWM',
    title: 'Astoria GWM YouTube 6 & 15 Sec Pre-Roll & Bumper Ads - Ora 5',
    platform: 'Google',
    campaignType: 'G_YouTube',
    campaignId: null,
    budget: 1000
  },
  {
    mondayItemId: '7594498282',
    taskId: 'task-frankston',
    clientId: 'client-frankston',
    clientName: 'Frankston Mitsubishi',
    title: 'Frankston Mitsubishi Google PMAX Inventory Demo + Demo Clearance Ad Set',
    platform: 'Google',
    campaignType: 'G_PMaxInventory',
    campaignId: null,
    budget: 500
  },
  {
    mondayItemId: '11204153481',
    taskId: 'task-geelong',
    clientId: 'client-geelong',
    clientName: 'Geelong GWM Haval',
    title: 'Geelong GWM Google Performance Max Inventory Lead Gen - New/Demo/Used',
    platform: 'Google',
    campaignType: 'G_PMaxInventory',
    campaignId: null,
    budget: 1000
  },
  {
    mondayItemId: '18081155750',
    taskId: 'task-northern',
    clientId: 'client-northern',
    clientName: 'Northern Motor Group',
    title: 'Northern Motor Group Used Cars AIA',
    platform: 'Meta',
    campaignType: 'M_AIA_Traffic',
    campaignId: null,
    budget: 510
  }
]

const candidates: CampaignSpendCandidate[] = [
  {
    mediaSpendId: 'spend-astoria-youtube', clientId: 'client-astoria', platform: 'google_ads',
    campaignId: '24029061026', campaignName: 'Astoria_GWM_YouTube_6_&_15_Sec_Pre-Roll_&_Bumper_Ads_Ora_5'
  },
  {
    mediaSpendId: 'spend-frankston-pmax', clientId: 'client-frankston', platform: 'google_ads',
    campaignId: '21844047755', campaignName: 'Convert_Rolling_Google_PMaxInventory_Frankston_Mitsubishi_Demo_Cars'
  },
  {
    mediaSpendId: 'spend-geelong-pmax', clientId: 'client-geelong', platform: 'google_ads',
    campaignId: '23659262393', campaignName: 'Convert_Fixed_Google_PMaxInventory_Geelong_GWM_Haval_Lead_Gen'
  },
  {
    mediaSpendId: 'spend-northern-used', clientId: 'client-northern', platform: 'meta',
    campaignId: '120233939519630320', campaignName: 'Capture_Rolling_Meta_AIA_Traffic_Northern_Motor_Group_Used_Cars'
  }
]

describe('Monday campaign performance matching', () => {
  it('links the four uniquely provable current campaign jobs', () => {
    expect(jobs.map(job => matchMondayCampaignToSpend(job, candidates))).toEqual([
      expect.objectContaining({ status: 'matched', campaignId: '24029061026' }),
      expect.objectContaining({ status: 'matched', campaignId: '21844047755' }),
      expect.objectContaining({ status: 'matched', campaignId: '23659262393' }),
      expect.objectContaining({ status: 'matched', campaignId: '120233939519630320' })
    ])
  })

  it('keeps a generic boosted-post job pending rather than guessing an LMCT campaign', () => {
    const job: CampaignLinkJob = {
      mondayItemId: '12657246645', taskId: 'task-boosted', clientId: 'client-northern',
      clientName: 'Northern Motor Group', title: 'Northern Motor Group Meta Boosted Post',
      platform: 'Meta', campaignType: 'M_Boosted', campaignId: null, budget: 500
    }
    const result = matchMondayCampaignToSpend(job, [{
      mediaSpendId: 'spend-lmct', clientId: 'client-northern', platform: 'meta',
      campaignId: '120248432435790320',
      campaignName: 'Capture_Fixed_Meta_Boosted_Post_Northern_Motor_Group_LMCT_Membership'
    }])

    expect(result).toMatchObject({ status: 'pending', reason: 'no_distinctive_name_overlap' })
  })

  it('rejects wrong-client, wrong-platform and incompatible campaign-type candidates', () => {
    const job = jobs[0]!
    const result = matchMondayCampaignToSpend(job, [
      { ...candidates[0]!, clientId: 'another-client' },
      { ...candidates[0]!, platform: 'meta' },
      { ...candidates[0]!, campaignName: 'Astoria GWM Google Display Ora 5' }
    ])

    expect(result).toMatchObject({ status: 'pending', reason: 'no_compatible_candidate' })
  })

  it('requires a unique best inferred candidate', () => {
    const job = jobs[0]!
    const result = matchMondayCampaignToSpend(job, [
      candidates[0]!,
      { ...candidates[0]!, mediaSpendId: 'spend-duplicate', campaignId: 'other-id' }
    ])

    expect(result).toMatchObject({ status: 'ambiguous', reason: 'tied_best_match' })
  })

  it('honours an explicit ID only when it belongs to the same client and platform', () => {
    const explicit = { ...jobs[0]!, campaignId: '24029061026' }
    expect(matchMondayCampaignToSpend(explicit, candidates)).toMatchObject({
      status: 'matched', campaignId: '24029061026', evidence: 'explicit_campaign_id'
    })

    expect(matchMondayCampaignToSpend({ ...explicit, campaignId: 'wrong-id' }, candidates)).toMatchObject({
      status: 'pending', reason: 'explicit_campaign_id_not_synced'
    })
  })
})
