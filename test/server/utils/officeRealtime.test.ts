import { describe, it, expect, vi } from 'vitest'
import { mintParticipantToken, endSession } from '~~/server/utils/officeRealtime'

// NOTE: The plan's original URL regex was `/realtime|calls/i`, but the
// implementation endpoint `https://rtc.live.cloudflare.com/...` does not
// contain "realtime" or "calls". Adjusted to `/rtc\.live\.cloudflare\.com/i`
// which specifically matches the CF Realtime host. The spirit ("URL should look
// like a Realtime/Calls endpoint") is preserved — `rtc` is Cloudflare's Realtime
// product domain. See implementer report for details.

describe('officeRealtime', () => {
  it('mintParticipantToken posts to the correct CF Realtime endpoint with auth', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'tok_abc', sessionId: 'sess_123', expiresAt: 1000 })
    } as Response)

    const res = await mintParticipantToken({
      appId: 'app-x',
      appSecret: 'sec-y',
      sessionKey: 'office:o1:zone:z1',
      participantId: 'user:u1',
      fetcher: fetchSpy
    })

    expect(res).toEqual({ token: 'tok_abc', sessionId: 'sess_123', expiresAt: 1000 })
    expect(fetchSpy).toHaveBeenCalledOnce()
    const [url, init] = fetchSpy.mock.calls[0]!
    expect(url).toMatch(/rtc\.live\.cloudflare\.com/i)
    expect((init as RequestInit).headers).toMatchObject({
      'Authorization': expect.stringContaining('sec-y')
    })
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body).toMatchObject({ sessionKey: 'office:o1:zone:z1', participantId: 'user:u1' })
  })

  it('mintParticipantToken throws on non-200 with a readable message', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'rate-limited'
    } as Response)

    await expect(
      mintParticipantToken({
        appId: 'a', appSecret: 's',
        sessionKey: 'k', participantId: 'p',
        fetcher: fetchSpy
      })
    ).rejects.toThrow(/429|rate-limited/i)
  })

  it('endSession swallows errors (best-effort cleanup)', async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new Error('network'))
    // Must not throw
    await expect(
      endSession({ appId: 'a', appSecret: 's', sessionKey: 'k', fetcher: fetchSpy })
    ).resolves.toBeUndefined()
  })
})
