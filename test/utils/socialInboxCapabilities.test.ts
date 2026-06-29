import { describe, expect, it } from 'vitest'
import { getSocialInboxCapabilities } from '../../app/utils/socialInboxCapabilities'

describe('getSocialInboxCapabilities', () => {
  it('enables public comment replies for supported platforms', () => {
    expect(getSocialInboxCapabilities({ platform: 'instagram', channel_type: 'comment' }).reply).toMatchObject({
      enabled: true,
      label: 'Public comment reply'
    })
  })

  it('shows review responses for Google Business reviews', () => {
    expect(getSocialInboxCapabilities({ platform: 'google-business', channel_type: 'review' }).reply).toMatchObject({
      enabled: true,
      label: 'Review response'
    })
  })

  it('marks TikTok inbox items as read-only', () => {
    expect(getSocialInboxCapabilities({ platform: 'tiktok', channel_type: 'comment' }).reply).toMatchObject({
      enabled: false,
      reason: 'TikTok replies require additional API access.'
    })
  })

  it('marks unknown providers as read-only', () => {
    expect(getSocialInboxCapabilities({ platform: 'threads', channel_type: 'comment' }).reply).toMatchObject({
      enabled: false,
      reason: 'Replies are not wired for this platform yet.'
    })
  })
})
