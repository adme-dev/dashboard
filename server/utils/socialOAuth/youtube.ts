import { ofetch } from 'ofetch'
import type { AccountRow } from './store'

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const YOUTUBE_DATA_BASE = 'https://www.googleapis.com/youtube/v3'

export const YOUTUBE_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/youtube.upload'
]

export interface YouTubeTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
  scope?: string
}

interface YouTubeChannel {
  id?: string
  snippet?: {
    title?: string
    customUrl?: string
    thumbnails?: Record<string, { url?: string }>
  }
  statistics?: {
    subscriberCount?: string | number
    videoCount?: string | number
  }
}

export interface YouTubeChannelSelection {
  id: string
  name: string
  handle: string | null
  thumbnailUrl: string | null
  subscriberCount: number | null
  videoCount: number | null
}

export function buildYouTubeAuthUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    scope: YOUTUBE_OAUTH_SCOPES.join(' '),
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true'
  })
  return `${GOOGLE_AUTH_URL}?${params.toString()}`
}

export async function exchangeYouTubeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<YouTubeTokenResponse> {
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code'
  })
  return ofetch<YouTubeTokenResponse>(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  })
}

export async function refreshYouTubeToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<YouTubeTokenResponse> {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token'
  })
  return ofetch<YouTubeTokenResponse>(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  })
}

export async function discoverYouTubeChannels(accessToken: string): Promise<YouTubeChannelSelection[]> {
  const url = new URL(`${YOUTUBE_DATA_BASE}/channels`)
  url.searchParams.set('part', 'id,snippet,statistics')
  url.searchParams.set('mine', 'true')
  url.searchParams.set('maxResults', '50')
  const data = await youtubeFetch<{ items?: YouTubeChannel[] }>(url.toString(), accessToken)
  return (data.items ?? []).map(toSelection).filter((channel): channel is YouTubeChannelSelection => Boolean(channel))
}

export function getYouTubeDiscoveryErrorReason(error: unknown): string {
  const raw = error as {
    status?: number
    statusCode?: number
    data?: {
      error?: {
        code?: number
        message?: string
        status?: string
      }
    }
    message?: string
  }
  const statusCode = raw.statusCode || raw.status || raw.data?.error?.code || null
  const googleStatus = raw.data?.error?.status || ''
  const message = raw.data?.error?.message || raw.message || ''
  const haystack = `${googleStatus} ${message}`.toLowerCase()

  if (statusCode === 403 && (haystack.includes('disabled') || haystack.includes('has not been used'))) return 'youtube_api_disabled'
  if (statusCode === 403) return 'youtube_permission_denied'
  return 'youtube_channel_list_failed'
}

export function mapYouTubeChannelsToAccountRows(
  channels: YouTubeChannelSelection[],
  accessToken: string,
  refreshToken: string | null,
  expiresAt: string | null
): AccountRow[] {
  return channels.map(channel => ({
    platform: 'youtube',
    platform_account_id: channel.id,
    account_name: channel.name,
    access_token: accessToken,
    refresh_token: refreshToken,
    token_expires_at: expiresAt,
    metadata: {
      youtubeChannelId: channel.id,
      youtubeHandle: channel.handle,
      thumbnailUrl: channel.thumbnailUrl,
      subscriberCount: channel.subscriberCount,
      videoCount: channel.videoCount,
      publishingReadiness: 'oauth_connected_upload_not_enabled'
    }
  }))
}

async function youtubeFetch<T>(url: string, accessToken: string): Promise<T> {
  try {
    return await ofetch<T>(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    })
  } catch (error) {
    console.warn('[YouTubeOAuth] API request failed', getYouTubeApiErrorLog(url, error))
    throw error
  }
}

function getYouTubeApiErrorLog(url: string, error: unknown): Record<string, unknown> {
  const raw = error as {
    status?: number
    statusCode?: number
    data?: {
      error?: {
        code?: number
        message?: string
        status?: string
      }
    }
    message?: string
  }
  const parsedUrl = new URL(url)
  return {
    endpoint: `${parsedUrl.hostname}${parsedUrl.pathname}`,
    statusCode: raw.statusCode || raw.status || raw.data?.error?.code || null,
    googleStatus: raw.data?.error?.status || null,
    message: raw.data?.error?.message || raw.message || 'YouTube API request failed'
  }
}

function toSelection(channel: YouTubeChannel): YouTubeChannelSelection | null {
  if (!channel.id) return null
  return {
    id: channel.id,
    name: channel.snippet?.title || `YouTube channel ${channel.id}`,
    handle: normalizeHandle(channel.snippet?.customUrl),
    thumbnailUrl: channel.snippet?.thumbnails?.default?.url
      || channel.snippet?.thumbnails?.medium?.url
      || channel.snippet?.thumbnails?.high?.url
      || null,
    subscriberCount: toNumber(channel.statistics?.subscriberCount),
    videoCount: toNumber(channel.statistics?.videoCount)
  }
}

function normalizeHandle(value: string | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  return trimmed.startsWith('@') ? trimmed : `@${trimmed}`
}

function toNumber(value: string | number | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string' || !value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
