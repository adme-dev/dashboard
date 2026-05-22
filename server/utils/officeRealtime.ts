// =============================================================================
// Cloudflare Realtime API client — server-side
// =============================================================================
//
// Used by the OfficeRoom DO to mint per-participant tokens scoped to one zone.
// Endpoint paths are based on the spike findings (Task 0). Update if the CF
// API surface changes.
//
// NOTE: Endpoint paths (rtc.live.cloudflare.com/v1/apps/.../sessions/tokens,
// DELETE .../sessions/<key>) are ASSUMED based on plan documentation and are
// pending Task 0 spike confirmation. Tests use mocked fetch so they pass
// regardless of actual endpoint correctness.

export interface MintTokenInput {
  appId: string
  appSecret: string
  /** Stable key per zone, e.g. `office:o1:zone:z1` */
  sessionKey: string
  /** ActorHandle like `user:<uuid>` */
  participantId: string
  /** Inject `fetch` for testability */
  fetcher?: typeof fetch
}

export interface MintTokenResult {
  token: string
  sessionId: string
  /** ms epoch */
  expiresAt: number
}

const REALTIME_BASE = 'https://rtc.live.cloudflare.com/v1'

export async function mintParticipantToken(
  input: MintTokenInput,
): Promise<MintTokenResult> {
  const fetcher = input.fetcher ?? fetch
  const res = await fetcher(`${REALTIME_BASE}/apps/${input.appId}/sessions/tokens`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${input.appSecret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sessionKey: input.sessionKey,
      participantId: input.participantId,
    }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`mintParticipantToken ${res.status}: ${detail}`)
  }
  return (await res.json()) as MintTokenResult
}

export interface EndSessionInput {
  appId: string
  appSecret: string
  sessionKey: string
  fetcher?: typeof fetch
}

export async function endSession(input: EndSessionInput): Promise<void> {
  const fetcher = input.fetcher ?? fetch
  try {
    await fetcher(
      `${REALTIME_BASE}/apps/${input.appId}/sessions/${encodeURIComponent(input.sessionKey)}`,
      {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${input.appSecret}` },
      },
    )
  } catch {
    // best-effort; cleanup failures are non-fatal
  }
}
