import { describe, expect, it } from 'vitest'
import {
  filterSocialPublishingAccounts,
  socialPublishingAccountsForPlatform,
  stripSocialPublishingConnectQuery,
} from '../../app/utils/socialPublishingAccounts'
import type { SocialAccount } from '../../app/types'

function account(input: Partial<SocialAccount> & Pick<SocialAccount, 'id' | 'platform'>): SocialAccount {
  return {
    client_id: 'client-1',
    platform_account_id: input.id,
    account_name: null,
    is_active: true,
    last_error: null,
    token_expires_at: null,
    last_synced_at: null,
    created_at: '2026-06-29T00:00:00.000Z',
    ...input,
  }
}

describe('social publishing account helpers', () => {
  const accounts = [
    account({ id: 'fb-1', platform: 'facebook', account_name: 'ADME Facebook' }),
    account({ id: 'ig-1', platform: 'instagram', account_name: 'ADME Instagram' }),
    account({ id: 'gbp-1', platform: 'google-business', platform_account_id: 'locations/123' }),
    account({ id: 'fb-2', platform: 'facebook', account_name: 'Second Page', last_error: 'token expired', connection_health_label: 'Reconnect required' }),
  ]

  it('filters accounts by name, platform id, platform, and error without duplicating rows', () => {
    expect(filterSocialPublishingAccounts(accounts, 'adme').map(a => a.id)).toEqual(['fb-1', 'ig-1'])
    expect(filterSocialPublishingAccounts(accounts, 'locations/123').map(a => a.id)).toEqual(['gbp-1'])
    expect(filterSocialPublishingAccounts(accounts, 'token').map(a => a.id)).toEqual(['fb-2'])
    expect(filterSocialPublishingAccounts(accounts, 'reconnect').map(a => a.id)).toEqual(['fb-2'])
    expect(new Set(filterSocialPublishingAccounts(accounts, 'facebook').map(a => a.id)).size).toBe(2)
  })

  it('returns accounts for a single platform only', () => {
    expect(socialPublishingAccountsForPlatform(accounts, 'facebook').map(a => a.id)).toEqual(['fb-1', 'fb-2'])
    expect(socialPublishingAccountsForPlatform(accounts, 'instagram').map(a => a.id)).toEqual(['ig-1'])
  })

  it('strips only transient OAuth callback query params', () => {
    expect(stripSocialPublishingConnectQuery({
      client: 'client-1',
      social_connected: 'facebook',
      social_error: 'no_pages',
      social_select: 'pending-token',
      tab: 'accounts',
    })).toEqual({
      client: 'client-1',
      tab: 'accounts',
    })
  })
})
