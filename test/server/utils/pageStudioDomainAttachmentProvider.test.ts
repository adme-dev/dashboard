import { afterEach, describe, expect, it, vi } from 'vitest'
import { cloudflareDomainProvider, verifyDomainHostname } from '../../../workers/page-studio-management/src/domainAttachmentProvider'

const config = { apiToken: 'synthetic-only', zoneId: 'a'.repeat(32), cnameTarget: 'sites.example.com' }
const standardConfig = { ...config, identityMode: 'standard' as const }
const providerUuid = '63821560-dcbb-41bd-b0ac-310145f95b15'
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
  it('creates a standard hostname without enterprise custom metadata using an HTTP 201 receipt', async () => {
    const created = { id: item.id, hostname: host }
    const fetcher = vi.fn().mockResolvedValue(Response.json({ success: true, result: created }, { status: 201 }))
    await expect(cloudflareDomainProvider(standardConfig, fetcher)!.create(host, owner, 'standard')).resolves.toEqual(created)
    expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toEqual({ hostname: host, ssl: { method: 'txt', type: 'dv' } })
    expect(fetcher).toHaveBeenCalledOnce()
  })
  it.each([200, 202])('refuses standard creation HTTP %s even with a matching hostname and owner marker', async (status) => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ success: true, result: item }, { status }))
    await expect(cloudflareDomainProvider(standardConfig, fetcher)!.create(host, owner, 'standard')).rejects.toMatchObject({ code: 'DOMAIN_PROVIDER_FAILED' })
    expect(fetcher).toHaveBeenCalledOnce()
  })
  it.each([{ id: '../foreign', hostname: host }, { id: item.id, hostname: 'foreign.example.com' }])('rejects a substituted standard creation receipt', async (created) => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ success: true, result: created }, { status: 201 }))
    await expect(cloudflareDomainProvider(standardConfig, fetcher)!.create(host, owner, 'standard')).rejects.toMatchObject({ code: 'DOMAIN_PROVIDER_MISMATCH' })
  })
  it('accepts provider UUIDs in standard creation, exact-ID GET and identity verification', async () => {
    const created = { id: providerUuid, hostname: host }
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ success: true, result: created }, { status: 201 }))
      .mockResolvedValueOnce(Response.json({ success: true, result: created }))
    const provider = cloudflareDomainProvider(standardConfig, fetcher)!
    await expect(provider.create(host, owner, 'standard')).resolves.toEqual(created)
    await expect(provider.get(providerUuid)).resolves.toEqual(created)
    expect(fetcher.mock.calls[1]![0]).toBe(`https://api.cloudflare.com/client/v4/zones/${config.zoneId}/custom_hostnames/${providerUuid}`)
    expect(verifyDomainHostname(created, host, undefined, providerUuid)).toEqual(created)
  })
  it.each(['../foreign', `${providerUuid}/other`, '63821560-dcbb-41bd-b0ac-not-an-id'])('rejects malformed retained provider IDs before GET: %s', async (id) => {
    const fetcher = vi.fn()
    await expect(cloudflareDomainProvider(config, fetcher)!.get(id)).rejects.toMatchObject({ code: 'DOMAIN_PROVIDER_MISMATCH' })
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('uses the pinned metadata creation mode after configuration switches to standard', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ success: true, result: item }))
    await expect(cloudflareDomainProvider(standardConfig, fetcher)!.create(host, owner, 'metadata')).resolves.toEqual(item)
    expect(JSON.parse(fetcher.mock.calls[0]![1].body).custom_metadata).toEqual({ page_studio_owner: owner })
  })
  it('uses the pinned standard creation mode after configuration switches to metadata', async () => {
    const created = { id: item.id, hostname: host }
    const fetcher = vi.fn().mockResolvedValue(Response.json({ success: true, result: created }, { status: 201 }))
    await expect(cloudflareDomainProvider(config, fetcher)!.create(host, owner, 'standard')).resolves.toEqual(created)
    expect(JSON.parse(fetcher.mock.calls[0]![1].body)).not.toHaveProperty('custom_metadata')
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
