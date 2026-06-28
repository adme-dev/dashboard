import { describe, it, expect, vi } from 'vitest'
import { buildServiceHeaders, createSocialDashboardClient } from '~~/server/utils/feeds/socialDashboardClient'

const ctx = { actingUserEmail: 'paul@adme.net.au', externalOrgId: 'org-123' }

describe('buildServiceHeaders', () => {
  it('sets the service secret + asserted identity headers', () => {
    expect(buildServiceHeaders(ctx, 'sekret')).toEqual({
      'content-type': 'application/json',
      'x-feed-service-secret': 'sekret',
      'x-feed-acting-user': 'paul@adme.net.au',
      'x-feed-org-id': 'org-123',
    })
  })
})

describe('createSocialDashboardClient.call', () => {
  it('strips a trailing slash, sends headers + JSON body, returns parsed json', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true, id: 'f1' }), { status: 200 }))
    const client = createSocialDashboardClient({ baseUrl: 'https://sd.example/', serviceSecret: 'sekret', fetchImpl: fetchImpl as any })
    const out = await client.call(ctx, 'POST', '/api/feeds', { name: 'X' })
    expect(out).toEqual({ ok: true, id: 'f1' })
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://sd.example/api/feeds')
    expect((init as any).method).toBe('POST')
    expect((init as any).headers['x-feed-service-secret']).toBe('sekret')
    expect((init as any).body).toBe(JSON.stringify({ name: 'X' }))
  })

  it('omits the body for GET and throws a descriptive error on non-2xx', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 403 }))
    const client = createSocialDashboardClient({ baseUrl: 'https://sd.example', serviceSecret: 's', fetchImpl: fetchImpl as any })
    await expect(client.call(ctx, 'GET', '/api/feeds')).rejects.toThrow(/GET \/api\/feeds → 403: nope/)
    expect((fetchImpl.mock.calls[0][1] as any).body).toBeUndefined()
  })
})
