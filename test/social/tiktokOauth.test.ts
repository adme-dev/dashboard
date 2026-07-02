import { describe, expect, it, vi } from 'vitest'
import {
  TIKTOK_CONTENT_OAUTH_SCOPES,
  buildTikTokContentAuthUrl,
  discoverTikTokCreator,
  getTikTokContentDiscoveryErrorReason,
  mapTikTokCreatorToAccountRow,
  type TikTokCreatorSelection
} from '~~/server/utils/socialOAuth/tiktok'

const { ofetchSpy } = vi.hoisted(() => ({ ofetchSpy: vi.fn() }))
vi.mock('ofetch', () => ({ ofetch: ofetchSpy }))

describe('buildTikTokContentAuthUrl', () => {
  it('requests Login Kit authorization with Content Posting scopes and signed state', () => {
    const url = new URL(buildTikTokContentAuthUrl('client-key', 'https://app.xeroflow.io/tiktok', 'STATE'))
    expect(`${url.origin}${url.pathname}`).toBe('https://www.tiktok.com/v2/auth/authorize/')
    expect(url.searchParams.get('client_key')).toBe('client-key')
    expect(url.searchParams.get('redirect_uri')).toBe('https://app.xeroflow.io/tiktok')
    expect(url.searchParams.get('state')).toBe('STATE')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('scope')).toBe(TIKTOK_CONTENT_OAUTH_SCOPES.join(','))
  })
})

describe('discoverTikTokCreator', () => {
  it('loads the connected TikTok creator profile from user info', async () => {
    ofetchSpy.mockResolvedValueOnce({
      data: {
        user: {
          open_id: 'open-1',
          display_name: 'Acme Creator',
          username: 'acme',
          avatar_url: 'https://example.test/avatar.jpg',
          profile_deep_link: 'https://www.tiktok.com/@acme',
          is_verified: true
        }
      },
      error: { code: 'ok', message: '' }
    })

    const creator = await discoverTikTokCreator('AT')

    expect(ofetchSpy).toHaveBeenCalledWith(
      'https://open.tiktokapis.com/v2/user/info/?fields=open_id%2Cdisplay_name%2Cusername%2Cavatar_url%2Cprofile_deep_link%2Cis_verified',
      { headers: { Authorization: 'Bearer AT' } }
    )
    expect(creator).toEqual({
      openId: 'open-1',
      displayName: 'Acme Creator',
      username: 'acme',
      avatarUrl: 'https://example.test/avatar.jpg',
      profileDeepLink: 'https://www.tiktok.com/@acme',
      isVerified: true
    })
  })
})

describe('mapTikTokCreatorToAccountRow', () => {
  const creator: TikTokCreatorSelection = {
    openId: 'open-1',
    displayName: 'Acme Creator',
    username: 'acme',
    avatarUrl: 'https://example.test/avatar.jpg',
    profileDeepLink: 'https://www.tiktok.com/@acme',
    isVerified: true
  }

  it('maps the creator to a tiktok publishing account row', () => {
    const row = mapTikTokCreatorToAccountRow(creator, 'AT', 'RT', '2026-01-01T00:00:00.000Z')
    expect(row).toEqual({
      platform: 'tiktok',
      platform_account_id: 'open-1',
      account_name: 'Acme Creator',
      access_token: 'AT',
      refresh_token: 'RT',
      token_expires_at: '2026-01-01T00:00:00.000Z',
      metadata: {
        tiktokOpenId: 'open-1',
        tiktokUsername: 'acme',
        avatarUrl: 'https://example.test/avatar.jpg',
        profileDeepLink: 'https://www.tiktok.com/@acme',
        isVerified: true,
        publishingReadiness: 'oauth_connected_publish_not_enabled'
      }
    })
  })
})

describe('getTikTokContentDiscoveryErrorReason', () => {
  it('classifies scope errors', () => {
    expect(getTikTokContentDiscoveryErrorReason({
      data: { error: { code: 'scope_not_authorized', message: 'Scope not authorized' } }
    })).toBe('tiktok_invalid_scope')
  })

  it('keeps unknown discovery errors generic', () => {
    expect(getTikTokContentDiscoveryErrorReason(new Error('socket closed'))).toBe('tiktok_creator_info_failed')
  })
})
