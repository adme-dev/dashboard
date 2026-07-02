import { describe, expect, it, vi } from 'vitest'
import {
  YOUTUBE_OAUTH_SCOPES,
  buildYouTubeAuthUrl,
  discoverYouTubeChannels,
  getYouTubeDiscoveryErrorReason,
  mapYouTubeChannelsToAccountRows,
  type YouTubeChannelSelection
} from '~~/server/utils/socialOAuth/youtube'

const { ofetchSpy } = vi.hoisted(() => ({ ofetchSpy: vi.fn() }))
vi.mock('ofetch', () => ({ ofetch: ofetchSpy }))

describe('buildYouTubeAuthUrl', () => {
  it('requests offline access and YouTube Data API scopes', () => {
    const url = new URL(buildYouTubeAuthUrl('cid.apps.googleusercontent.com', 'https://app.xeroflow.io/youtube', 'STATE'))
    expect(`${url.origin}${url.pathname}`).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(url.searchParams.get('client_id')).toBe('cid.apps.googleusercontent.com')
    expect(url.searchParams.get('redirect_uri')).toBe('https://app.xeroflow.io/youtube')
    expect(url.searchParams.get('state')).toBe('STATE')
    expect(url.searchParams.get('scope')).toBe(YOUTUBE_OAUTH_SCOPES.join(' '))
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('access_type')).toBe('offline')
    expect(url.searchParams.get('prompt')).toBe('consent')
    expect(url.searchParams.get('include_granted_scopes')).toBe('true')
  })
})

describe('discoverYouTubeChannels', () => {
  it('lists channels owned by the authenticated user', async () => {
    ofetchSpy.mockResolvedValueOnce({
      items: [{
        id: 'UC123',
        snippet: {
          title: 'Acme Channel',
          customUrl: '@acme',
          thumbnails: { default: { url: 'https://i.ytimg.com/acme.jpg' } }
        },
        statistics: {
          subscriberCount: '1200',
          videoCount: '42'
        }
      }]
    })

    const channels = await discoverYouTubeChannels('AT')

    expect(ofetchSpy).toHaveBeenCalledWith(
      'https://www.googleapis.com/youtube/v3/channels?part=id%2Csnippet%2Cstatistics&mine=true&maxResults=50',
      { headers: { Authorization: 'Bearer AT' } }
    )
    expect(channels).toEqual([{
      id: 'UC123',
      name: 'Acme Channel',
      handle: '@acme',
      thumbnailUrl: 'https://i.ytimg.com/acme.jpg',
      subscriberCount: 1200,
      videoCount: 42
    }])
  })
})

describe('mapYouTubeChannelsToAccountRows', () => {
  const channels: YouTubeChannelSelection[] = [{
    id: 'UC123',
    name: 'Acme Channel',
    handle: '@acme',
    thumbnailUrl: 'https://i.ytimg.com/acme.jpg',
    subscriberCount: 1200,
    videoCount: 42
  }]

  it('maps channels to youtube social account rows without marking publishing production-ready', () => {
    const rows = mapYouTubeChannelsToAccountRows(channels, 'AT', 'RT', '2026-01-01T00:00:00.000Z')
    expect(rows).toEqual([{
      platform: 'youtube',
      platform_account_id: 'UC123',
      account_name: 'Acme Channel',
      access_token: 'AT',
      refresh_token: 'RT',
      token_expires_at: '2026-01-01T00:00:00.000Z',
      metadata: {
        youtubeChannelId: 'UC123',
        youtubeHandle: '@acme',
        thumbnailUrl: 'https://i.ytimg.com/acme.jpg',
        subscriberCount: 1200,
        videoCount: 42,
        publishingReadiness: 'oauth_connected_upload_not_enabled'
      }
    }])
  })
})

describe('getYouTubeDiscoveryErrorReason', () => {
  it('classifies disabled API responses', () => {
    expect(getYouTubeDiscoveryErrorReason({
      statusCode: 403,
      data: { error: { status: 'PERMISSION_DENIED', message: 'YouTube Data API v3 has not been used in project before or it is disabled.' } }
    })).toBe('youtube_api_disabled')
  })

  it('keeps unknown discovery errors generic', () => {
    expect(getYouTubeDiscoveryErrorReason(new Error('socket closed'))).toBe('youtube_channel_list_failed')
  })
})
