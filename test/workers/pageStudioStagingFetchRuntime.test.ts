import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { build } from 'esbuild'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Miniflare, Response as LocalResponse } from 'miniflare'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const siteId = 'c34f6347-cc63-4ed7-9a5a-da165ebefed2'
const hostname = `preview-${siteId.replaceAll('-', '')}.xeroflow.io`
const config = { accountId: 'a'.repeat(32), zoneId: 'b'.repeat(32), apiToken: 'synthetic-local-token' }
const domain = { id: 'c'.repeat(32), cert_id: '11111111-1111-4111-8111-111111111111', hostname, service: 'xeroflow-page-studio-client-staging', zone_id: config.zoneId, zone_name: 'xeroflow.io' }

describe('client staging fetch in the actual Worker runtime', () => {
  let runtime: Miniflare
  let mode: 'success' | 'redirect' = 'success'
  let requests: { url: string, method: string }[] = []
  beforeAll(async () => {
    const bundle = await build({
      stdin: { resolveDir: root, contents: `
        import { cloudflareStagingProvider } from './workers/page-studio-management/src/stagingProvider'
        import { probeClientStagingHost } from './workers/page-studio-management/src/stagingManagement'
        export default { async fetch(request) {
          try {
            const value = new URL(request.url).pathname === '/probe'
              ? await probeClientStagingHost(${JSON.stringify(hostname)})
              : await cloudflareStagingProvider(${JSON.stringify(config)}).attach(${JSON.stringify(siteId)})
            return Response.json({ ok: true, value })
          } catch (error) { return Response.json({ ok: false, code: error.code ?? error.name }) }
        } }` },
      write: false, bundle: true, format: 'esm', platform: 'neutral', target: 'esnext',
      conditions: ['workerd', 'worker', 'browser'], mainFields: ['module', 'main'], logLevel: 'silent'
    })
    runtime = new Miniflare({
      modules: true, script: bundle.outputFiles[0]!.text,
      compatibilityDate: '2026-07-15', compatibilityFlags: ['nodejs_compat'],
      outboundService(request) {
        requests.push({ url: request.url, method: request.method })
        if (mode === 'redirect') return new LocalResponse(null, { status: 302, headers: { location: 'https://unexpected.invalid/credential-sink' } })
        const url = new URL(request.url)
        if (url.hostname === hostname && url.pathname === '/.well-known/xeroflow-staging') {
          return LocalResponse.json({ version: 1, service: domain.service, hostname })
        }
        const endpoint = `/client/v4/accounts/${config.accountId}/workers/domains`
        if (url.origin === 'https://api.cloudflare.com' && url.pathname === endpoint) {
          return LocalResponse.json({ success: true, result: [domain] })
        }
        if (url.origin === 'https://api.cloudflare.com' && url.pathname === `${endpoint}/${domain.id}`) {
          return LocalResponse.json({ success: true, result: domain })
        }
        return new LocalResponse('Unexpected request', { status: 500 })
      }
    })
    await runtime.ready
  }, 30_000)
  beforeEach(() => {
    mode = 'success'
    requests = []
  })
  afterAll(async () => {
    await runtime?.dispose()
  })
  async function call(pathname: string) {
    return (await runtime.dispatchFetch(`https://test.invalid/${pathname}`)).json()
  }
  it('verifies an existing hostname using real runtime fetch', async () => {
    expect(await call('provider')).toEqual({ ok: true, value: { domainId: domain.id, hostname, certificateId: domain.cert_id } })
    expect(requests).toHaveLength(2)
    expect(requests.every(request => request.method === 'GET')).toBe(true)
  })
  it('verifies the HTTPS delivery probe using real runtime fetch', async () => {
    expect(await call('probe')).toEqual({ ok: true, value: true })
    expect(requests).toHaveLength(1)
  })
  it('rejects a redirected provider response without forwarding credentials', async () => {
    mode = 'redirect'
    expect(await call('provider')).toEqual({ ok: false, code: 'STAGING_HOST_UNAVAILABLE' })
    expect(requests).toHaveLength(1)
    expect(new URL(requests[0]!.url).hostname).toBe('api.cloudflare.com')
  })
  it('rejects a redirected probe without following it', async () => {
    mode = 'redirect'
    expect(await call('probe')).toEqual({ ok: true, value: false })
    expect(requests).toHaveLength(1)
    expect(new URL(requests[0]!.url).hostname).toBe(hostname)
  })
})
