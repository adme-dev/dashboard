import { describe, expect, it } from 'vitest'
import {
  getSocialInboxAccountContextDisplay,
  getSocialInboxIdentityDisplay
} from '../../app/utils/socialInboxDisplay'

describe('getSocialInboxIdentityDisplay', () => {
  it('uses the provided participant name when Meta returns it', () => {
    expect(getSocialInboxIdentityDisplay({ platform: 'facebook', name: 'Jane Smith' })).toEqual({
      label: 'Jane Smith',
      unavailable: false,
      reason: null
    })
  })

  it('describes the interaction role when Facebook withholds a participant name', () => {
    expect(getSocialInboxIdentityDisplay({ platform: 'facebook', channelType: 'review', name: null })).toEqual({
      label: 'Name unavailable',
      unavailable: true,
      reason: 'Meta did not return this profile name. Some identities are withheld for privacy, and Page user-content access requires an approved permission.'
    })
  })

  it('falls back to a neutral label for non-Meta channels with no identity', () => {
    expect(getSocialInboxIdentityDisplay({ platform: 'youtube', name: '' })).toEqual({
      label: 'Unidentified user',
      unavailable: true,
      reason: 'The platform did not provide a display name for this interaction.'
    })
  })

  it('explains unavailable Google Business reviewer identities', () => {
    expect(getSocialInboxIdentityDisplay({ platform: 'google-business', name: null })).toEqual({
      label: 'Unidentified Google reviewer',
      unavailable: true,
      reason: 'Google Business Profile did not provide a reviewer display name for this review.'
    })
  })

  it('uses account name before platform account id for connected account context', () => {
    expect(getSocialInboxAccountContextDisplay({
      accountName: 'Northern Peugeot',
      platformAccountId: '12345'
    })).toBe('Northern Peugeot')

    expect(getSocialInboxAccountContextDisplay({
      accountName: ' ',
      platformAccountId: '12345'
    })).toBe('12345')
  })

  it('does not repeat the client when it is the connected account', () => {
    expect(getSocialInboxAccountContextDisplay({
      accountName: 'Mornington Nissan',
      clientName: 'Mornington Nissan'
    })).toBe('Mornington Nissan')
  })

  it('shows a distinct parent client after the connected account', () => {
    expect(getSocialInboxAccountContextDisplay({
      accountName: 'GWS Peninsula Honda',
      clientName: 'Garry and Warren Smith'
    })).toBe('GWS Peninsula Honda · Garry and Warren Smith')
  })
})
