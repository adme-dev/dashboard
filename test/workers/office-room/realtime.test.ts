import { describe, it, expect, vi } from 'vitest'
import { createZoneMeeting, mintZoneToken, refreshZoneToken } from '../../../workers/office-room/src/realtime'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const validEnv = {
  CF_ACCOUNT_ID: 'acc1',
  CF_REALTIMEKIT_APP_ID: 'app1',
  CF_REALTIMEKIT_API_TOKEN: 'tok1',
}

function mockFetch(data: unknown, ok = true, success = true) {
  const json = { success, data, errors: success ? undefined : [{ message: 'api error' }] }
  return vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 400,
    text: vi.fn().mockResolvedValue(JSON.stringify(json)),
    json: vi.fn().mockResolvedValue(json),
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('mintZoneToken', () => {
  it('builds correct URL and body, returns participantId + authToken', async () => {
    const fetcher = mockFetch({ id: 'p-1', token: 'rtkt_xyz' })
    const result = await mintZoneToken({
      env: validEnv,
      meetingId: 'meet-1',
      handle: 'user:u1',
      name: 'Paul',
      presetName: 'staff_full',
      fetcher: fetcher as unknown as typeof fetch,
    })

    expect(fetcher).toHaveBeenCalledTimes(1)
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(
      'https://api.cloudflare.com/client/v4/accounts/acc1/realtime/kit/app1/meetings/meet-1/participants',
    )
    expect(JSON.parse(init.body as string)).toEqual({
      name: 'Paul',
      preset_name: 'staff_full',
      custom_participant_id: 'user:u1',
    })
    expect(result).toEqual({ participantId: 'p-1', authToken: 'rtkt_xyz' })
  })

  it('throws if any CF_* env var is missing or empty', async () => {
    await expect(
      mintZoneToken({
        env: { CF_ACCOUNT_ID: 'acc1', CF_REALTIMEKIT_APP_ID: 'app1', CF_REALTIMEKIT_API_TOKEN: '' },
        meetingId: 'meet-1',
        handle: 'user:u1',
        name: 'Paul',
        presetName: 'staff_full',
      }),
    ).rejects.toThrow(/CF_|not bound/i)
  })
})

describe('createZoneMeeting', () => {
  it('POSTs to /meetings and returns meetingId', async () => {
    const fetcher = mockFetch({ id: 'meet-42' })
    const result = await createZoneMeeting({
      env: validEnv,
      title: 'Lounge',
      fetcher: fetcher as unknown as typeof fetch,
    })

    expect(fetcher).toHaveBeenCalledTimes(1)
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(
      'https://api.cloudflare.com/client/v4/accounts/acc1/realtime/kit/app1/meetings',
    )
    expect(JSON.parse(init.body as string)).toEqual({ title: 'Lounge' })
    expect(result).toEqual({ meetingId: 'meet-42' })
  })
})

describe('refreshZoneToken', () => {
  it('POSTs to .../participants/<id>/token and echoes participantId', async () => {
    const fetcher = mockFetch({ token: 'rtkt_refreshed' })
    const result = await refreshZoneToken({
      env: validEnv,
      meetingId: 'meet-1',
      participantId: 'p-1',
      fetcher: fetcher as unknown as typeof fetch,
    })

    expect(fetcher).toHaveBeenCalledTimes(1)
    const [url] = fetcher.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(
      'https://api.cloudflare.com/client/v4/accounts/acc1/realtime/kit/app1/meetings/meet-1/participants/p-1/token',
    )
    expect(result).toEqual({ participantId: 'p-1', authToken: 'rtkt_refreshed' })
  })
})

describe('error handling', () => {
  it('throws when CF returns success:false', async () => {
    const fetcher = mockFetch(null, true, false)
    await expect(
      createZoneMeeting({
        env: validEnv,
        fetcher: fetcher as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/CF RealtimeKit error/)
  })
})
