import { describe, expect, it } from 'vitest'
import { getSocialInboxPollChannels } from '~~/server/utils/socialInbox/syncChannels'

describe('getSocialInboxPollChannels', () => {
  it('polls Facebook comments and reviews', () => {
    expect(getSocialInboxPollChannels('facebook')).toEqual(['comment', 'review'])
  })

  it('adds Messenger conversations when messaging access is enabled', () => {
    expect(getSocialInboxPollChannels('facebook', { messagingEnabled: true })).toEqual(['comment', 'dm', 'review'])
  })

  it('polls Google Business reviews only', () => {
    expect(getSocialInboxPollChannels('google-business')).toEqual(['review'])
  })

  it('returns an empty list for unsupported inbox providers', () => {
    expect(getSocialInboxPollChannels('snapchat')).toEqual([])
  })
})
