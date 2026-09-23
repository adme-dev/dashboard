import { afterEach, describe, expect, it, vi } from 'vitest'
import { cloudflareStagingProvider, CLIENT_STAGING_SERVICE } from '../../../workers/page-studio-management/src/stagingProvider'
import { pageStudioStagingAddress } from '~~/shared/pageStudio/staging'

const siteId = 'c34f6347-cc63-4ed7-9a5a-da165ebefed2'
const config = { accountId: 'a'.repeat(32), zoneId: 'b'.repeat(32), apiToken: 'private-test-token' }
const domain = { id: 'c'.repeat(32), cert_id: '11111111-1111-4111-8111-111111111111', environment: 'production', hostname: pageStudioStagingAddress(siteId).hostname, service: 'xeroflow-page-studio-client-staging', zone_id: config.zoneId, zone_name: 'xeroflow.io' }
const response = (result: unknown) => new Response(JSON.stringify({ success: true, result }))
describe('platform-owned client staging hostname provider', () => {
  afterEach(() => vi.restoreAllMocks())
  it('records only the failed provider operation and status without credentials or response contents', async () => {
    const log = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fetcher = vi.fn().mockResolvedValueOnce(response([])).mockResolvedValueOnce(new Response('private provider diagnostics', { status: 403 }))
    await expect(cloudflareStagingProvider(config, fetcher).attach(siteId)).rejects.toMatchObject({ code: 'STAGING_HOST_UNAVAILABLE' })
    expect(log).toHaveBeenCalledExactlyOnceWith(JSON.stringify({ event: 'page_studio_staging_provider_failure', operation: 'attach', reason: 'http', status: 403 }))
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/private|token|xeroflow\.io/)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
  it('classifies a lost provider response without logging the thrown message', async () => {
    const log = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fetcher = vi.fn().mockRejectedValue(new Error('secret token and private address'))
    await expect(cloudflareStagingProvider(config, fetcher).attach(siteId)).rejects.toMatchObject({ code: 'STAGING_HOST_UNAVAILABLE' })
    expect(log).toHaveBeenCalledExactlyOnceWith(JSON.stringify({ event: 'page_studio_staging_provider_failure', operation: 'list', reason: 'network', status: null }))
  })
  it('creates only the immutable client address and verifies its exact read-back', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response([])).mockResolvedValueOnce(response(domain)).mockResolvedValueOnce(response(domain))
    const provider = cloudflareStagingProvider(config, fetcher)
    expect(await provider.attach(siteId)).toEqual({ domainId: domain.id, hostname: domain.hostname, certificateId: domain.cert_id })
    expect(fetcher).toHaveBeenCalledTimes(3)
    const [url, options] = fetcher.mock.calls[1]
    expect(url).toBe(`https://api.cloudflare.com/client/v4/accounts/${config.accountId}/workers/domains`)
    expect(options).toMatchObject({ method: 'PUT', redirect: 'error' })
    expect(JSON.parse(options.body)).toEqual({ hostname: domain.hostname, service: CLIENT_STAGING_SERVICE, zone_id: config.zoneId })
    expect(fetcher.mock.calls[2][0]).toBe(`${url}/${domain.id}`)
  })
  it('accepts the longer hostname identifier returned by the live Cloudflare API', async () => {
    const liveDomain = { ...domain, id: '34d9b1c173151b06f79935e65e911ecb52e8e3ec' }
    const fetcher = vi.fn().mockResolvedValueOnce(response([liveDomain])).mockResolvedValueOnce(response(liveDomain))
    await expect(cloudflareStagingProvider(config, fetcher).attach(siteId)).resolves.toMatchObject({ domainId: liveDomain.id })
    expect(fetcher.mock.calls[1][0]).toBe(`https://api.cloudflare.com/client/v4/accounts/${config.accountId}/workers/domains/${liveDomain.id}`)
  })
  it.each(['', '../other', 'a'.repeat(65), 'a'.repeat(31), 'id?other=1'])('rejects an unsafe or unbounded hostname identifier %s', async (id) => {
    const fetcher = vi.fn().mockResolvedValueOnce(response([{ ...domain, id }]))
    await expect(cloudflareStagingProvider(config, fetcher).attach(siteId)).rejects.toMatchObject({ code: 'STAGING_HOST_CONFLICT' })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('recovers a previously attached hostname without another provider mutation', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response([domain])).mockResolvedValueOnce(response(domain))
    const result = await cloudflareStagingProvider(config, fetcher).attach(siteId)
    expect(result.domainId).toBe(domain.id)
    expect(fetcher.mock.calls.every(([, options]) => options.method === 'GET')).toBe(true)
  })
  it('does not overwrite an existing hostname attached to another Worker', async () => {
    const fetcher = vi.fn().mockResolvedValue(response([{ ...domain, service: 'unrelated-worker' }]))
    await expect(cloudflareStagingProvider(config, fetcher).attach(siteId)).rejects.toMatchObject({ code: 'STAGING_HOST_CONFLICT' })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it.each([{ hostname: 'app.xeroflow.io' }, { zone_id: 'd'.repeat(32) }, { zone_name: 'different.example' }, { service: 'unrelated-worker' }, { cert_id: '' }])('rejects provider mismatches without returning a ready receipt', async (change) => {
    const fetcher = vi.fn().mockResolvedValueOnce(response([])).mockResolvedValueOnce(response({ ...domain, ...change }))
    await expect(cloudflareStagingProvider(config, fetcher).attach(siteId)).rejects.toMatchObject({ code: 'STAGING_HOST_CONFLICT' })
  })
  it('does not retry a mutation after losing its response', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response([])).mockRejectedValueOnce(new Error('private upstream message'))
    await expect(cloudflareStagingProvider(config, fetcher).attach(siteId)).rejects.toMatchObject({ code: 'STAGING_HOST_UNAVAILABLE', message: 'Staging hostname could not be verified. Retry to check its saved state.' })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
  it('requires the same provider identity after creation', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response([])).mockResolvedValueOnce(response(domain)).mockResolvedValueOnce(response({ ...domain, id: 'e'.repeat(32) }))
    await expect(cloudflareStagingProvider(config, fetcher).attach(siteId)).rejects.toMatchObject({ code: 'STAGING_HOST_CONFLICT' })
  })
  it.each([302, 403, 429, 500])('fails closed on provider HTTP %i', async (status) => {
    const fetcher = vi.fn().mockResolvedValue(new Response('private diagnostics', { status }))
    await expect(cloudflareStagingProvider(config, fetcher).attach(siteId)).rejects.toMatchObject({ code: 'STAGING_HOST_UNAVAILABLE' })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('rejects duplicate matches and oversized response bodies', async () => {
    for (const result of [[domain, domain], { private: 'x'.repeat(70000) }]) {
      const fetcher = vi.fn().mockResolvedValue(response(result))
      await expect(cloudflareStagingProvider(config, fetcher).attach(siteId)).rejects.toThrow()
      expect(fetcher).toHaveBeenCalledTimes(1)
    }
  })
  it('refuses invalid configuration or arbitrary hostnames before network access', async () => {
    const fetcher = vi.fn()
    expect(() => cloudflareStagingProvider({ ...config, accountId: '../other' }, fetcher)).toThrow()
    await expect(cloudflareStagingProvider(config, fetcher).attach('app.xeroflow.io')).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })
})
