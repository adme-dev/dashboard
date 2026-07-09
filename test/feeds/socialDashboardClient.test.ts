import { describe, it, expect, vi } from 'vitest'
import { buildServiceHeaders, buildSocialDashboardFeedServeUrl, createSocialDashboardClient } from '~~/server/utils/feeds/socialDashboardClient'

const ctx = { actingUserEmail: 'paul@adme.net.au', externalOrgId: 'org-123' }

describe('buildServiceHeaders', () => {
  it('builds stable live feed serve URLs', () => {
    expect(buildSocialDashboardFeedServeUrl('https://sd.example/', 'feed 1')).toBe('https://sd.example/api/feeds/feed%201/serve')
  })

  it('sets the service secret + asserted identity headers', () => {
    expect(buildServiceHeaders(ctx, 'sekret')).toEqual({
      'content-type': 'application/json',
      'x-feed-service-secret': 'sekret',
      'x-feed-acting-user': 'paul@adme.net.au',
      'x-feed-org-id': 'org-123'
    })
  })

  it('adds Authorization when a social-dashboard access token is configured', () => {
    expect(buildServiceHeaders(ctx, 'sekret', 'jwt')).toMatchObject({
      Authorization: 'Bearer jwt'
    })
  })
})

type FetchCallInit = RequestInit & { headers: Record<string, string> }

describe('createSocialDashboardClient.call', () => {
  it('strips a trailing slash, sends headers + JSON body, returns parsed json', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true, id: 'f1' }), { status: 200 }))
    const client = createSocialDashboardClient({ baseUrl: 'https://sd.example/', serviceSecret: 'sekret', accessToken: 'jwt', fetchImpl: fetchImpl as unknown as typeof fetch })
    const out = await client.call(ctx, 'POST', '/api/feeds', { name: 'X' })
    expect(out).toEqual({ ok: true, id: 'f1' })
    const [url, init] = fetchImpl.mock.calls[0]
    const requestInit = init as FetchCallInit
    expect(url).toBe('https://sd.example/api/feeds')
    expect(requestInit.method).toBe('POST')
    expect(requestInit.headers['x-feed-service-secret']).toBe('sekret')
    expect(requestInit.headers.Authorization).toBe('Bearer jwt')
    expect(requestInit.body).toBe(JSON.stringify({ name: 'X' }))
  })

  it('omits the body for GET and throws a descriptive error on non-2xx', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 403 }))
    const client = createSocialDashboardClient({ baseUrl: 'https://sd.example', serviceSecret: 's', fetchImpl: fetchImpl as unknown as typeof fetch })
    await expect(client.call(ctx, 'GET', '/api/feeds')).rejects.toThrow(/GET \/api\/feeds → 403: nope/)
    expect((fetchImpl.mock.calls[0][1] as RequestInit).body).toBeUndefined()
  })
})
