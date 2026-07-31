// =============================================================================
// Cloudflare Realtime SFU API client
// =============================================================================
//
// Thin server-side wrapper around the HTTPS API documented at:
// https://developers.cloudflare.com/realtime/sfu/https-api/
//
// The SFU API is session/track based. The app secret must stay server-side.

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

export type RealtimeApiInput = {
  appId: string
  appSecret: string
  fetcher?: typeof fetch
  baseUrl?: string
}

export type CreateRealtimeSessionInput = RealtimeApiInput & {
  correlationId?: string
}

export type CreateRealtimeSessionResult = {
  sessionId: string
  sessionDescription?: RealtimeSessionDescription
}

export type RealtimeTracksInput = RealtimeApiInput & {
  sessionId: string
  sessionDescription?: RealtimeSessionDescription
  tracks: RealtimeTrack[]
  autoDiscover?: boolean
}

export type RealtimeTracksResult = {
  requiresImmediateRenegotiation?: boolean
  sessionDescription?: RealtimeSessionDescription
  tracks?: RealtimeTrack[]
}

export type RenegotiateRealtimeSessionInput = RealtimeApiInput & {
  sessionId: string
  sessionDescription: RealtimeSessionDescription
}

export type CloseRealtimeTracksInput = RealtimeApiInput & {
  sessionId: string
  tracks: Array<Pick<RealtimeTrack, 'mid'>>
  sessionDescription?: RealtimeSessionDescription
  force?: boolean
}

export type GetRealtimeSessionStateInput = RealtimeApiInput & {
  sessionId: string
}

export type GetRealtimeSessionStateResult = {
  tracks?: RealtimeTrack[]
}

type RealtimeErrorResponse = {
  errorCode?: string
  errorDescription?: string
}

function realtimeUrl(input: RealtimeApiInput, path: string, params?: Record<string, string | undefined>) {
  const baseUrl = (input.baseUrl ?? DEFAULT_REALTIME_BASE_URL).replace(/\/$/, '')
  const url = new URL(`${baseUrl}/apps/${encodeURIComponent(input.appId)}${path}`)
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
  input: RealtimeApiInput,
  method: 'GET' | 'POST' | 'PUT',
  path: string,
  body?: unknown,
  params?: Record<string, string | undefined>
) {
  const fetcher = input.fetcher ?? fetch
  const url = realtimeUrl(input, path, params)
  const serializedBody = body === undefined ? undefined : JSON.stringify(body)
  const response = await fetcher(url, {
    method,
    headers: {
      'Authorization': `Bearer ${input.appSecret}`,
      ...(serializedBody === undefined ? {} : { 'Content-Type': 'application/json' })
    },
    body: serializedBody
  })
  return readRealtimeJson<T>(response, method, url)
}

export async function createRealtimeSession(
  input: CreateRealtimeSessionInput
): Promise<CreateRealtimeSessionResult> {
  return await realtimeFetch<CreateRealtimeSessionResult>(
    input,
    'POST',
    '/sessions/new',
    undefined,
    { correlationId: input.correlationId }
  )
}

export async function addRealtimeTracks(input: RealtimeTracksInput): Promise<RealtimeTracksResult> {
  return await realtimeFetch<RealtimeTracksResult>(
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

export async function renegotiateRealtimeSession(
  input: RenegotiateRealtimeSessionInput
): Promise<RealtimeTracksResult> {
  return await realtimeFetch<RealtimeTracksResult>(
    input,
    'PUT',
    `/sessions/${encodeURIComponent(input.sessionId)}/renegotiate`,
    { sessionDescription: input.sessionDescription }
  )
}

export async function closeRealtimeTracks(input: CloseRealtimeTracksInput): Promise<RealtimeTracksResult> {
  return await realtimeFetch<RealtimeTracksResult>(
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

export async function getRealtimeSessionState(
  input: GetRealtimeSessionStateInput
): Promise<GetRealtimeSessionStateResult> {
  return await realtimeFetch<GetRealtimeSessionStateResult>(
    input,
    'GET',
    `/sessions/${encodeURIComponent(input.sessionId)}`
  )
}
