import { describe, expect, it } from 'vitest'
import { getSocialInboxIdentityDisplay } from '../../app/utils/socialInboxDisplay'

describe('getSocialInboxIdentityDisplay', () => {
  it('uses the provided participant name when Meta returns it', () => {
    expect(getSocialInboxIdentityDisplay({ platform: 'facebook', name: 'Jane Smith' })).toEqual({
      label: 'Jane Smith',
      unavailable: false,
      reason: null
    })
  })

  it('explains unavailable Facebook identities instead of showing a generic unknown user', () => {
    expect(getSocialInboxIdentityDisplay({ platform: 'facebook', name: null })).toEqual({
      label: 'Facebook user unavailable',
      unavailable: true,
      reason: 'Meta did not provide this user profile for the interaction.'
    })
  })

  it('falls back to a neutral label for non-Meta channels with no identity', () => {
    expect(getSocialInboxIdentityDisplay({ platform: 'youtube', name: '' })).toEqual({
      label: 'Unknown user',
      unavailable: true,
      reason: 'The platform did not provide a display name for this interaction.'
    })
  })
})
