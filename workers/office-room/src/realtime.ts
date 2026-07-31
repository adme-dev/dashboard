import type { ActorHandle, OfficeMediaSession } from '../../../app/types/office'
import { signOfficeMediaGrant } from './jwt'

const DEFAULT_REALTIME_BASE_URL = 'https://rtc.live.cloudflare.com/v1'

export type RealtimeSessionDescription = {
  sdp: string
  type: 'offer' | 'answer'
}

export type RealtimeTrack = {
  location: 'local' | 'remote'
  mid?: string
  sessionId?: string
  trackName?: string
  kind?: 'audio' | 'video'
  bidirectionalMediaStream?: boolean
  status?: 'active' | 'inactive' | 'waiting'
  errorCode?: string
  errorDescription?: string
}

export type RealtimeEnv = {
  REALTIME_APP_ID?: string
  REALTIME_APP_SECRET?: string
  OFFICE_SYNC_SECRET?: string
  OFFICE_GUEST_REALTIME_MEDIA_ENABLED?: string
  OFFICE_GUEST_REALTIME_PILOT_OFFICE_IDS?: string
}

export type WorkerRealtimeInput = {
  env: RealtimeEnv
  fetcher?: typeof fetch
  baseUrl?: string
}

export type CreateZoneSessionInput = WorkerRealtimeInput & {
  officeId: string
  zoneId: string
  handle: ActorHandle
}

export type CreateZoneSessionResult = {
  sessionId: string
  sessionDescription?: RealtimeSessionDescription
}

export type CreateZoneMediaSessionInput = CreateZoneSessionInput & {
  isGuest: boolean
  guestBadgeId: string | null
}

export type RefreshZoneMediaGrantInput = CreateZoneMediaSessionInput & {
  media: OfficeMediaSession
}

export type ZoneTracksInput = WorkerRealtimeInput & {
  sessionId: string
  sessionDescription?: RealtimeSessionDescription
  tracks: RealtimeTrack[]
  autoDiscover?: boolean
}

export type ZoneTracksResult = {
  requiresImmediateRenegotiation?: boolean
  sessionDescription?: RealtimeSessionDescription
  tracks?: RealtimeTrack[]
}

export type CloseZoneTracksInput = WorkerRealtimeInput & {
  sessionId: string
  tracks: Array<Pick<RealtimeTrack, 'mid'>>
  sessionDescription?: RealtimeSessionDescription
  force?: boolean
}

type RealtimeErrorResponse = {
  errorCode?: string
  errorDescription?: string
}

function requireRealtimeEnv(env: RealtimeEnv) {
  if (!env.REALTIME_APP_ID || !env.REALTIME_APP_SECRET) {
    throw new Error('REALTIME_APP_ID / REALTIME_APP_SECRET not bound on this worker')
  }
  return {
    appId: env.REALTIME_APP_ID,
    appSecret: env.REALTIME_APP_SECRET
  }
}

function zoneCorrelationId(input: Pick<CreateZoneSessionInput, 'officeId' | 'zoneId' | 'handle'>) {
  return `office:${input.officeId}:zone:${input.zoneId}:actor:${input.handle}`
}

function realtimeUrl(
  input: WorkerRealtimeInput,
  path: string,
  params?: Record<string, string | undefined>
) {
  const { appId } = requireRealtimeEnv(input.env)
  const baseUrl = (input.baseUrl ?? DEFAULT_REALTIME_BASE_URL).replace(/\/$/, '')
  const url = new URL(`${baseUrl}/apps/${encodeURIComponent(appId)}${path}`)
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value) url.searchParams.set(key, value)
  }
  return url.toString()
}

async function readRealtimeJson<T>(response: Response, method: string, url: string): Promise<T> {
  const text = await response.text()
  const body = text ? JSON.parse(text) as T & RealtimeErrorResponse : {} as T & RealtimeErrorResponse

  if (!response.ok || body.errorCode) {
    const message = body.errorDescription || body.errorCode || text || response.statusText
    throw new Error(`Cloudflare Realtime ${method} ${url} failed (${response.status}): ${message}`)
  }

  return body
}

async function realtimeFetch<T>(
  input: WorkerRealtimeInput,
  method: 'GET' | 'POST' | 'PUT',
  path: string,
  body?: unknown,
  params?: Record<string, string | undefined>
) {
  const { appSecret } = requireRealtimeEnv(input.env)
  const fetcher = input.fetcher ?? fetch
  const url = realtimeUrl(input, path, params)
  const serializedBody = body === undefined ? undefined : JSON.stringify(body)
  const response = await fetcher(url, {
    method,
    headers: {
      'Authorization': `Bearer ${appSecret}`,
      ...(serializedBody === undefined ? {} : { 'Content-Type': 'application/json' })
    },
    body: serializedBody
  })
  return readRealtimeJson<T>(response, method, url)
}

export function buildZoneCorrelationId(input: Pick<CreateZoneSessionInput, 'officeId' | 'zoneId' | 'handle'>) {
  return zoneCorrelationId(input)
}

export async function createZoneRealtimeSession(
  input: CreateZoneSessionInput
): Promise<CreateZoneSessionResult> {
  return await realtimeFetch<CreateZoneSessionResult>(
    input,
    'POST',
    '/sessions/new',
    undefined,
    { correlationId: zoneCorrelationId(input) }
  )
}

export async function createZoneRealtimeMediaSession(
  input: CreateZoneMediaSessionInput
): Promise<OfficeMediaSession> {
  if (!input.env.OFFICE_SYNC_SECRET) {
    throw new Error('OFFICE_SYNC_SECRET not bound on this worker')
  }
  requireGuestRealtimeRollout(input)
  const session = await createZoneRealtimeSession(input)
  return await issueZoneRealtimeMediaGrant(input, {
    provider: 'cloudflare-realtime',
    sessionId: session.sessionId,
    correlationId: buildZoneCorrelationId(input),
    grant: '',
    grantExpiresAt: 0,
    createdAt: Date.now()
  })
}

function requireGuestRealtimeRollout(input: Pick<CreateZoneMediaSessionInput, 'env' | 'isGuest' | 'officeId'>) {
  if (input.isGuest) {
    if (input.env.OFFICE_GUEST_REALTIME_MEDIA_ENABLED?.trim().toLowerCase() !== 'true') {
      throw new Error('Guest Realtime media is disabled')
    }
    const pilotOfficeIds = new Set(
      (input.env.OFFICE_GUEST_REALTIME_PILOT_OFFICE_IDS ?? '')
        .split(',')
        .map(officeId => officeId.trim())
        .filter(Boolean)
    )
    if (!pilotOfficeIds.has(input.officeId)) {
      throw new Error('Guest Realtime media is not enabled for this Office')
    }
  }
}

async function issueZoneRealtimeMediaGrant(
  input: Pick<CreateZoneMediaSessionInput, 'env' | 'officeId' | 'zoneId' | 'handle' | 'isGuest' | 'guestBadgeId'>,
  media: OfficeMediaSession
): Promise<OfficeMediaSession> {
  if (!input.env.OFFICE_SYNC_SECRET) {
    throw new Error('OFFICE_SYNC_SECRET not bound on this worker')
  }
  const grantExpiresAt = Date.now() + 5 * 60_000
  const grant = await signOfficeMediaGrant({
    purpose: 'office-media',
    officeId: input.officeId,
    zoneId: input.zoneId,
    handle: input.handle,
    sessionId: media.sessionId,
    isGuest: input.isGuest,
    guestBadgeId: input.guestBadgeId,
    scopes: ['state', 'publish', 'pull', 'renegotiate', 'close'],
    exp: Math.floor(grantExpiresAt / 1000)
  }, input.env.OFFICE_SYNC_SECRET)

  return {
    ...media,
    grant,
    grantExpiresAt
  }
}

export async function refreshZoneRealtimeMediaGrant(
  input: RefreshZoneMediaGrantInput
): Promise<OfficeMediaSession> {
  requireGuestRealtimeRollout(input)
  return await issueZoneRealtimeMediaGrant(input, input.media)
}

export async function addZoneRealtimeTracks(input: ZoneTracksInput): Promise<ZoneTracksResult> {
  return await realtimeFetch<ZoneTracksResult>(
    input,
    'POST',
    `/sessions/${encodeURIComponent(input.sessionId)}/tracks/new`,
    {
      tracks: input.tracks,
      ...(input.sessionDescription ? { sessionDescription: input.sessionDescription } : {}),
      ...(input.autoDiscover === undefined ? {} : { autoDiscover: input.autoDiscover })
    }
  )
}

export async function closeZoneRealtimeTracks(input: CloseZoneTracksInput): Promise<ZoneTracksResult> {
  return await realtimeFetch<ZoneTracksResult>(
    input,
    'PUT',
    `/sessions/${encodeURIComponent(input.sessionId)}/tracks/close`,
    {
      tracks: input.tracks,
      ...(input.sessionDescription ? { sessionDescription: input.sessionDescription } : {}),
      ...(input.force === undefined ? {} : { force: input.force })
    }
  )
}
