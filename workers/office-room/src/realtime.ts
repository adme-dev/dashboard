// =============================================================================
// Cloudflare RealtimeKit API client — worker-side
// =============================================================================
//
// Mirrors server/utils/officeRealtime.ts but lives in the worker bundle.
// Cannot import from server/utils/ across the runtime boundary, so the
// cfPost helper and endpoint logic are duplicated here intentionally.
//
// API base: https://api.cloudflare.com/client/v4/accounts/<accountId>/realtime/kit/<appId>
// Auth: Bearer <apiToken>
// Response envelope: { success: boolean, data?: T, errors?: { message: string }[] }

import type { ActorHandle } from '../../../app/types/office'

// ---------------------------------------------------------------------------
// Env shape (worker bindings)
// ---------------------------------------------------------------------------

interface Env {
  CF_ACCOUNT_ID?: string
  CF_REALTIMEKIT_APP_ID?: string
  CF_REALTIMEKIT_API_TOKEN?: string
}

// ---------------------------------------------------------------------------
// Public input / result types
// ---------------------------------------------------------------------------

export interface CreateZoneMeetingInput {
  env: Env
  title?: string
  fetcher?: typeof fetch
}
export interface CreateZoneMeetingResult {
  meetingId: string
}

export interface MintZoneTokenInput {
  env: Env
  meetingId: string
  /** 'user:<uuid>' — stored as custom_participant_id in CF */
  handle: ActorHandle
  name: string
  /** 'staff_full' | 'viewer_lurking' */
  presetName: string
  fetcher?: typeof fetch
}
export interface MintZoneTokenResult {
  /** CF-side participant id */
  participantId: string
  /** Token for RealtimeKitClient.init */
  authToken: string
}

export interface RefreshZoneTokenInput {
  env: Env
  meetingId: string
  /** CF-side participant id (NOT the handle) */
  participantId: string
  fetcher?: typeof fetch
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function resolveEnv(env: Env): { accountId: string; appId: string; apiToken: string } {
  const accountId = env.CF_ACCOUNT_ID
  const appId = env.CF_REALTIMEKIT_APP_ID
  const apiToken = env.CF_REALTIMEKIT_API_TOKEN
  if (!accountId || !appId || !apiToken) {
    throw new Error('CF_ACCOUNT_ID / CF_REALTIMEKIT_APP_ID / CF_REALTIMEKIT_API_TOKEN not bound')
  }
  return { accountId, appId, apiToken }
}

function cfBase(accountId: string, appId: string) {
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/realtime/kit/${appId}`
}

async function cfPost<T>(
  env: Env,
  path: string,
  body: unknown,
  fetcher?: typeof fetch,
): Promise<T> {
  const { accountId, appId, apiToken } = resolveEnv(env)
  const f = fetcher ?? fetch
  const res = await f(`${cfBase(accountId, appId)}${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body ?? {}),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`CF RealtimeKit ${res.status}: ${detail}`)
  }
  const json = await res.json() as { success: boolean; data?: T; errors?: { message: string }[] }
  if (!json.success) {
    const msg = json.errors?.map((e) => e.message).join('; ') ?? 'success:false'
    throw new Error(`CF RealtimeKit error: ${msg}`)
  }
  return json.data as T
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function createZoneMeeting(
  input: CreateZoneMeetingInput,
): Promise<CreateZoneMeetingResult> {
  const body: Record<string, unknown> = {}
  if (input.title !== undefined) body.title = input.title
  const data = await cfPost<{ id: string }>(input.env, '/meetings', body, input.fetcher)
  return { meetingId: data.id }
}

export async function mintZoneToken(
  input: MintZoneTokenInput,
): Promise<MintZoneTokenResult> {
  const data = await cfPost<{ id: string; token: string }>(
    input.env,
    `/meetings/${input.meetingId}/participants`,
    {
      name: input.name,
      preset_name: input.presetName,
      custom_participant_id: input.handle,
    },
    input.fetcher,
  )
  return { participantId: data.id, authToken: data.token }
}

export async function refreshZoneToken(
  input: RefreshZoneTokenInput,
): Promise<MintZoneTokenResult> {
  const data = await cfPost<{ token: string }>(
    input.env,
    `/meetings/${input.meetingId}/participants/${input.participantId}/token`,
    {},
    input.fetcher,
  )
  return { participantId: input.participantId, authToken: data.token }
}
