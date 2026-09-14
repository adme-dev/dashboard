import { afterEach, describe, expect, it, vi } from 'vitest'
import { cloudflareDomainProvider, verifyDomainHostname } from '~~/server/utils/pageStudio/domainAttachmentProvider'

const config = { apiToken: 'synthetic-only', zoneId: 'a'.repeat(32), cnameTarget: 'sites.example.com' }
const host = 'client.example.com'
const owner = 'opaque-owner'
const item = { id: 'b'.repeat(32), hostname: host, custom_metadata: { page_studio_owner: owner } }
const list = (result: unknown[], info = { page: 1, total_pages: 1 }) => ({ success: true, result, result_info: { per_page: 5, count: result.length, ...info } })
describe('bounded custom hostname provider', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('retains the native global fetch receiver when using the default provider transport', async () => {
    vi.stubGlobal('fetch', function (this: unknown) {
      if (this !== globalThis) throw new Error('Illegal invocation')
      return Promise.resolve(Response.json(list([])))
    })
    await expect(cloudflareDomainProvider(config)!.find(host)).resolves.toBeNull()
  })
  it('uses the fixed zone and exact-hostname filter with bounded pagination', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(list([item])))
    expect(await cloudflareDomainProvider(config, fetcher)!.find(host)).toEqual(item)
    const [url, init] = fetcher.mock.calls[0]!
    expect(url).toBe(`https://api.cloudflare.com/client/v4/zones/${config.zoneId}/custom_hostnames?hostname.exact=${host}&page=1&per_page=5`)
    expect(init.redirect).toBe('manual')
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })
  it('returns absence only for an explicit successful complete empty list', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(list([], { page: 1, total_pages: 0 })))
    expect(await cloudflareDomainProvider(config, fetcher)!.find(host)).toBeNull()
  })
  it.each([list([item, item]), list([item], { page: 2, total_pages: 2 }), { success: true, result: [] }, { success: false, result: [] }, list([{ ...item, hostname: 'foreign.example.com' }])])('rejects ambiguous, incomplete or foreign lists', async (payload) => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(payload))
    await expect(cloudflareDomainProvider(config, fetcher)!.find(host)).rejects.toThrow()
  })
  it('accepts a complete exact result when totals describe many unfiltered zone pages', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(list([item], { page: 1, total_pages: 100 })))
    expect(await cloudflareDomainProvider(config, fetcher)!.find(host)).toEqual(item)
  })
  it('sends only the reviewed hostname/TLS policy and opaque owner metadata', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ success: true, result: item }))
    expect(await cloudflareDomainProvider(config, fetcher)!.create(host, owner)).toEqual(item)
    expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toEqual({ hostname: host, ssl: { method: 'txt', type: 'dv' }, custom_metadata: { page_studio_owner: owner } })
    expect(fetcher).toHaveBeenCalledOnce()
  })
  it.each([{ ...item, id: '../foreign' }, { ...item, custom_metadata: {} }, { ...item, hostname: 'other.example.com' }])('rejects substituted identity/metadata', (candidate) => {
    expect(() => verifyDomainHostname(candidate, host, owner, item.id)).toThrow()
  })
  it.each([403, 404, 429, 500, 302])('does not treat provider HTTP %s as absence or retry', async (status) => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ success: false, errors: [{ message: 'private-provider-token' }] }, { status }))
    const error = await cloudflareDomainProvider(config, fetcher)!.find(host).catch(error => error)
    expect(error.message).not.toContain('private-provider-token')
    expect(fetcher).toHaveBeenCalledOnce()
  })
  it.each(['', 'https://sites.example.com/path', '127.0.0.1', 'localhost'])('rejects invalid configured CNAME targets before provider effects: %s', async (cnameTarget) => {
    const fetcher = vi.fn()
    await expect(cloudflareDomainProvider({ ...config, cnameTarget }, fetcher)!.create(host, owner)).rejects.toMatchObject({ code: 'DOMAIN_PROVIDER_UNAVAILABLE' })
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('still reads a retained provider ID when the CNAME target is missing', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ success: true, result: item }))
    await expect(cloudflareDomainProvider({ ...config, cnameTarget: '' }, fetcher)!.get(item.id)).resolves.toEqual(item)
  })
  it('bounds response bytes and requires actual configured credentials', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('x'.repeat(65 * 1024)))
    await expect(cloudflareDomainProvider(config, fetcher)!.find(host)).rejects.toThrow()
    expect(cloudflareDomainProvider({ ...config, apiToken: '' }, fetcher)).toBeNull()
  })
})
