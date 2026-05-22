import { describe, it, expect, vi } from 'vitest'
import {
  createMeeting,
  mintParticipantToken,
  refreshParticipantToken,
} from '~~/server/utils/officeRealtime'

const baseAuth = { accountId: 'acc1', appId: 'app1', apiToken: 'tok1' }

describe('officeRealtime — RealtimeKit', () => {
  it('createMeeting POSTs to .../meetings and returns meetingId', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { id: 'meet-1', title: 'Zone' } })
    } as Response)
    const out = await createMeeting({ ...baseAuth, title: 'Zone', fetcher })
    expect(out).toEqual({ meetingId: 'meet-1' })
    const [url, init] = fetcher.mock.calls[0]!
    expect(url).toBe('https://api.cloudflare.com/client/v4/accounts/acc1/realtime/kit/app1/meetings')
    expect((init as RequestInit).method).toBe('POST')
    expect((init as RequestInit).headers).toMatchObject({
      'Authorization': 'Bearer tok1',
      'Content-Type': 'application/json',
    })
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({ title: 'Zone' })
  })

  it('mintParticipantToken POSTs participant body and returns authToken', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: { id: 'p-1', token: 'rtkt_xyz', custom_participant_id: 'user:u1', preset_name: 'staff_full' }
      })
    } as Response)
    const out = await mintParticipantToken({
      ...baseAuth,
      meetingId: 'meet-1',
      name: 'Paul',
      presetName: 'staff_full',
      customParticipantId: 'user:u1',
      fetcher,
    })
    expect(out).toEqual({ participantId: 'p-1', authToken: 'rtkt_xyz' })
    const [url, init] = fetcher.mock.calls[0]!
    expect(url).toBe('https://api.cloudflare.com/client/v4/accounts/acc1/realtime/kit/app1/meetings/meet-1/participants')
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({
      name: 'Paul',
      preset_name: 'staff_full',
      custom_participant_id: 'user:u1',
    })
  })

  it('refreshParticipantToken POSTs to the token sub-endpoint and echoes participantId', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { token: 'rtkt_refreshed' } })
    } as Response)
    const out = await refreshParticipantToken({
      ...baseAuth,
      meetingId: 'meet-1',
      participantId: 'p-1',
      fetcher,
    })
    expect(out).toEqual({ participantId: 'p-1', authToken: 'rtkt_refreshed' })
    const [url] = fetcher.mock.calls[0]!
    expect(url).toBe(
      'https://api.cloudflare.com/client/v4/accounts/acc1/realtime/kit/app1/meetings/meet-1/participants/p-1/token'
    )
  })

  it('mintParticipantToken throws on non-200 with status + body', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: false, status: 403, text: async () => 'forbidden'
    } as Response)
    await expect(
      mintParticipantToken({
        ...baseAuth, meetingId: 'm', name: 'n', presetName: 'p', customParticipantId: 'c', fetcher
      })
    ).rejects.toThrow(/403|forbidden/i)
  })

  it('throws when CF returns success:false (createMeeting)', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: false, errors: [{ message: 'bad preset' }] })
    } as Response)
    await expect(
      createMeeting({ ...baseAuth, fetcher })
    ).rejects.toThrow(/bad preset|success.*false/i)
  })
})
