import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { build } from 'esbuild'
import { builtinModules } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Miniflare, Response as LocalResponse } from 'miniflare'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const identity = { hostname: 'site.example.com', clientAddress: '203.0.113.4', identityDigest: 'a'.repeat(64) }
describe('public form challenge in the Worker runtime', () => {
  let runtime: Miniflare
  let redirectStatus: number | null = null
  let requests: { url: string, method: string, body: unknown }[] = []
  beforeAll(async () => {
    const bundle = await build({
      stdin: { resolveDir: root, contents: `
        import { verifyPublicFormChallenge, assertPublicFormChallenge } from './server/utils/pageStudio/publicFormChallenge'
        export default { async fetch() {
          try {
            const identity = ${JSON.stringify(identity)}
            const proof = await verifyPublicFormChallenge(identity, 'synthetic-challenge', { PAGE_STUDIO_PUBLIC_FORM_TURNSTILE_SECRET: 'synthetic-secret' })
            return Response.json({ ok: true, digest: assertPublicFormChallenge(proof, identity).challengeDigest })
          } catch (error) { return Response.json({ ok: false, code: error.code }) }
        } }` },
      write: false, bundle: true, format: 'esm', platform: 'neutral', target: 'esnext',
      alias: { '~~': root }, conditions: ['workerd', 'worker', 'browser'], mainFields: ['module', 'main'],
      external: ['node:*', 'cloudflare:*'], logLevel: 'silent',
      banner: { js: 'import { createRequire } from "node:module"; const require = createRequire("/worker.js");' },
      plugins: [{ name: 'node-compat-builtins', setup(plugin) {
        plugin.onResolve({ filter: /^[a-z][a-z_]*(?:\/[a-z_]+)?$/ }, args => builtinModules.includes(args.path) ? { path: `node:${args.path}`, external: true } : undefined)
      } }]
    })
    runtime = new Miniflare({
      modules: true, script: bundle.outputFiles[0]!.text,
      compatibilityDate: '2026-07-15', compatibilityFlags: ['nodejs_compat'],
      async outboundService(request) {
        // Record before parsing: a followed 302 changes POST to a bodyless GET.
        const captured = { url: request.url, method: request.method, body: null as unknown }
        requests.push(captured)
        if (request.url !== 'https://challenges.cloudflare.com/turnstile/v0/siteverify') return new LocalResponse(null, { status: 500 })
        if (request.method === 'POST') captured.body = await request.json()
        if (redirectStatus) return new LocalResponse(null, { status: redirectStatus, headers: { location: 'https://unexpected.invalid/secret-sink' } })
        return LocalResponse.json({ success: true, hostname: identity.hostname, action: 'page_studio_public_form' })
      }
    })
    await runtime.ready
  }, 30_000)
  beforeEach(() => {
    redirectStatus = null
    requests = []
  })
  afterAll(async () => {
    await runtime?.dispose()
  })
  it('mints an exact-intent proof after a real runtime POST to the fixed provider', async () => {
    const result = await (await runtime.dispatchFetch('https://test.invalid/challenge')).json()
    expect(result).toEqual({ ok: true, digest: expect.stringMatching(/^[a-f0-9]{64}$/) })
    expect(requests).toEqual([{ url: 'https://challenges.cloudflare.com/turnstile/v0/siteverify', method: 'POST', body: {
      secret: 'synthetic-secret', response: 'synthetic-challenge', remoteip: identity.clientAddress, idempotency_key: expect.any(String)
    } }])
  })
  it.each([301, 302, 303, 307, 308])('rejects provider redirect %i without forwarding the form token or secret', async (status) => {
    redirectStatus = status
    const result = await (await runtime.dispatchFetch('https://test.invalid/challenge')).json()
    expect(result).toEqual({ ok: false, code: 'PUBLIC_FORM_CHALLENGE_REQUIRED' })
    expect(requests).toHaveLength(1)
    expect(requests[0]!.url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify')
  })
})
