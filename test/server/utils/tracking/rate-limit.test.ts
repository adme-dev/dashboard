import { describe, it, expect, vi } from 'vitest'
import { rateCheck } from '../../../../server/utils/tracking/rate-limit'

function fakeLimiter(verdict: any) {
  const calls: any = { idFromName: vi.fn((n: string) => ({ name: n })), body: null as any }
  const ns = {
    idFromName: calls.idFromName,
    get: () => ({
      fetch: async (_url: any, init: any) => {
        calls.body = JSON.parse(init.body)
        return Response.json(verdict)
      },
    }),
  }
  return { ns, calls }
}

describe('rateCheck', () => {
  it('routes by write key and forwards limits', async () => {
    const { ns, calls } = fakeLimiter({ allowed: true })
    const v = await rateCheck(ns as any, { writeKey: 'wk_abc', ipHash: 'h1', keyLimit: 600, ipLimit: 60, windowMs: 10_000 })
    expect(v.allowed).toBe(true)
    expect(calls.idFromName).toHaveBeenCalledWith('wk_abc')
    expect(calls.body).toEqual({ ipHash: 'h1', keyLimit: 600, ipLimit: 60, windowMs: 10_000 })
  })

  it('parses a deny verdict', async () => {
    const { ns } = fakeLimiter({ allowed: false, layer: 'ip', retryAfterSec: 7 })
    const v = await rateCheck(ns as any, { writeKey: 'wk', ipHash: null, keyLimit: 1, ipLimit: 1, windowMs: 10_000 })
    expect(v).toEqual({ allowed: false, layer: 'ip', retryAfterSec: 7 })
  })
})
