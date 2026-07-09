import { describe, expect, it, vi } from 'vitest'
import { createSocialDashboardClient } from '~~/server/utils/feeds/socialDashboardClient'

describe('createSocialDashboardClient.resolveOrganization', () => {
  it('upserts a social-dashboard organization through service auth without requiring an org id first', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      ok: true,
      organization_id: 'org-123',
      organization: { id: 'org-123', name: 'Blood Hyundai', slug: 'blood-hyundai' }
    }), { status: 200 }))
    const client = createSocialDashboardClient({
      baseUrl: 'https://sd.example/',
      serviceSecret: 'sekret',
      accessToken: 'jwt',
      fetchImpl: fetchImpl as unknown as typeof fetch
    })

    const out = await client.resolveOrganization({
      actingUserEmail: 'marketing@example.com',
      name: 'Blood Hyundai',
      externalClientId: 'client-1',
      sellerRefs: ['blood-hyundai'],
      platforms: ['google', 'meta']
    })

    expect(out).toEqual({
      ok: true,
      organization_id: 'org-123',
      organization: { id: 'org-123', name: 'Blood Hyundai', slug: 'blood-hyundai' }
    })
    const [url, init] = fetchImpl.mock.calls[0] as [RequestInfo | URL, RequestInit]
    const headers = init.headers as Record<string, string>
    expect(url).toBe('https://sd.example/api/organizations/upsert-external')
    expect(init.method).toBe('POST')
    expect(headers['x-feed-service-secret']).toBe('sekret')
    expect(headers['x-feed-acting-user']).toBe('marketing@example.com')
    expect(headers['x-feed-org-id']).toBeUndefined()
    expect(JSON.parse(String(init.body))).toMatchObject({
      name: 'Blood Hyundai',
      externalClientId: 'client-1',
      sellerRefs: ['blood-hyundai']
    })
  })
})
