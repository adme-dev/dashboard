import { describe, expect, it } from 'vitest'
import {
  formatSocialInboxSyncChannelResult,
  formatSocialInboxSyncSummary,
  getSocialInboxSyncChannelsForAccount,
  getSocialInboxSyncIssueCount,
  getSocialInboxSyncStatusDisplay
} from '../../app/utils/socialInboxSync'

describe('social inbox sync presentation', () => {
  it('summarises checked channels and failed channels', () => {
    expect(formatSocialInboxSyncSummary({
      synced: 3,
      channels: [
        { accountId: 'a1', platform: 'facebook', channelType: 'comment', status: 'success', synced: 3 },
        { accountId: 'a1', platform: 'facebook', channelType: 'review', status: 'error', synced: 0, error: 'Missing permission' }
      ]
    })).toBe('3 new items · 2 channels checked · 1 channel failed')
  })

  it('counts failed and skipped channels as issues', () => {
    expect(getSocialInboxSyncIssueCount({
      synced: 0,
      channels: [
        { accountId: 'a1', platform: 'facebook', channelType: 'comment', status: 'skipped', synced: 0 },
        { accountId: 'a2', platform: 'instagram', channelType: 'comment', status: 'error', synced: 0 }
      ]
    })).toBe(2)
  })

  it('filters sync channel results by account', () => {
    const result = {
      synced: 1,
      channels: [
        { accountId: 'a1', platform: 'facebook', channelType: 'comment', status: 'success' as const, synced: 1 },
        { accountId: 'a2', platform: 'google-business', channelType: 'review', status: 'error' as const, synced: 0 }
      ]
    }

    expect(getSocialInboxSyncChannelsForAccount(result, 'a1')).toEqual([result.channels[0]])
  })

  it('formats per-channel results for the health drawer', () => {
    expect(formatSocialInboxSyncChannelResult({
      accountId: 'a1',
      platform: 'facebook',
      channelType: 'comment',
      status: 'error',
      synced: 0,
      error: 'Missing permission'
    })).toBe('Missing permission')
    expect(getSocialInboxSyncStatusDisplay('skipped')).toMatchObject({ label: 'Skipped', color: 'warning' })
  })
})
