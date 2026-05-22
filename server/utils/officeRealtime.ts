// =============================================================================
// Cloudflare RealtimeKit API client — server-side
// =============================================================================
//
// Used by the OfficeRoom DO to create meetings and mint/refresh per-participant
// tokens scoped to one zone.
//
// API base: https://api.cloudflare.com/client/v4/accounts/<accountId>/realtime/kit/<appId>
// Auth: Bearer <apiToken>
// Response envelope: { success: boolean, data?: T, errors?: { message: string }[] }

export interface CFAuth {
  accountId: string
  appId: string
  apiToken: string
  /** Inject `fetch` for testability */
  fetcher?: typeof fetch
}

export interface CreateMeetingInput extends CFAuth {
  title?: string
}
export interface CreateMeetingResult {
  meetingId: string
}

export interface MintTokenInput extends CFAuth {
  meetingId: string
  name: string
  presetName: string
  customParticipantId: string
}
export interface MintTokenResult {
  participantId: string
  authToken: string
}

export interface RefreshTokenInput extends CFAuth {
  meetingId: string
  participantId: string
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const cfBase = (a: CFAuth) =>
  `https://api.cloudflare.com/client/v4/accounts/${a.accountId}/realtime/kit/${a.appId}`

async function cfPost<T>(a: CFAuth, path: string, body: unknown): Promise<T> {
  const fetcher = a.fetcher ?? fetch
  const res = await fetcher(`${cfBase(a)}${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${a.apiToken}`,
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
    const msg = json.errors?.map(e => e.message).join('; ') ?? 'success:false'
    throw new Error(`CF RealtimeKit error: ${msg}`)
  }
  return json.data as T
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function createMeeting(
  input: CreateMeetingInput,
): Promise<CreateMeetingResult> {
  const body: Record<string, unknown> = {}
  if (input.title !== undefined) body.title = input.title
  const data = await cfPost<{ id: string }>(input, '/meetings', body)
  return { meetingId: data.id }
}

export async function mintParticipantToken(
  input: MintTokenInput,
): Promise<MintTokenResult> {
  const data = await cfPost<{ id: string; token: string }>(
    input,
    `/meetings/${input.meetingId}/participants`,
    {
      name: input.name,
      preset_name: input.presetName,
      custom_participant_id: input.customParticipantId,
    },
  )
  return { participantId: data.id, authToken: data.token }
}

export async function refreshParticipantToken(
  input: RefreshTokenInput,
): Promise<MintTokenResult> {
  const data = await cfPost<{ token: string }>(
    input,
    `/meetings/${input.meetingId}/participants/${input.participantId}/token`,
    {},
  )
  return { participantId: input.participantId, authToken: data.token }
}
