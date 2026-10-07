import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { build } from 'esbuild'
import { mkdir, mkdtemp, rm, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Miniflare, Response as LocalResponse } from 'miniflare'
import { customerFixture, documentFixtures } from '../fixtures/emailRendering'
import golden from '../fixtures/emailRenderingGolden.json'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
describe('actual Workerd private renderer RPC', () => {
  let directory: string | undefined
  let runtime: Miniflare | undefined
  let outboundRequests = 0
  beforeAll(async () => {
    await mkdir(path.join(root, '.nuxt'), { recursive: true })
    directory = await mkdtemp(path.join(root, '.nuxt', 'email-renderer-runtime-'))
    const config = JSON.parse(await readFile(path.join(root, 'workers/email-rendering/wrangler.staging.jsonc'), 'utf8'))
    const outfile = path.join(directory, 'worker.mjs')
    const artifact = process.env.EMAIL_RENDER_TEST_ARTIFACT
    if (!artifact) {
      const result = await build({ entryPoints: [path.join(root, 'workers/email-rendering/src/index.ts')], outfile, bundle: true, format: 'esm', platform: 'neutral', target: 'esnext', conditions: ['workerd', 'worker', 'browser'], mainFields: ['module', 'main'], external: ['cloudflare:*'], metafile: true, logLevel: 'silent' })
      expect(Object.keys(result.metafile!.inputs).some(name => /(?:^|\/)server\/|resend|postgres|node:/.test(name))).toBe(false)
    }
    const outboundService = () => {
      outboundRequests++
      return new LocalResponse('Unexpected outbound request', { status: 500 })
    }
    runtime = new Miniflare({ workers: [
      { name: 'renderer', modules: true, scriptPath: artifact || outfile, compatibilityDate: config.compatibility_date, bindings: config.vars, outboundService },
      { name: 'caller', modules: true, compatibilityDate: config.compatibility_date, script: `export default { async fetch(request, env) { if (new URL(request.url).pathname === '/http') return env.RENDERER.fetch(request); return Response.json(await env.RENDERER.render(await request.json())) } }`, serviceBindings: { RENDERER: { name: 'renderer', entrypoint: 'EmailRenderer' } }, outboundService }
    ] })
    await runtime.ready
  }, 60_000)
  afterAll(async () => {
    try {
      await runtime?.dispose()
    } finally {
      if (directory) await rm(directory, { recursive: true, force: true })
    }
  }, 30_000)
  async function rpc(input: unknown) {
    const caller = await runtime!.getWorker('caller')
    const response = await caller.fetch('https://synthetic.invalid/rpc', { method: 'POST', body: JSON.stringify(input) })
    expect(response.status).toBe(200)
    return response.json()
  }
  it.each(documentFixtures)('preserves $name bytes across real RPC', async (fixture) => {
    expect(await rpc({ version: 1, expectedEnvironment: 'staging', operation: 'document', document: fixture.document, options: fixture.options })).toMatchObject({ ok: true, value: { html: golden.documents[fixture.name as keyof typeof golden.documents] } })
    expect(outboundRequests).toBe(0)
  })
  it('preserves restricted customer output across real RPC', async () => {
    expect(await rpc({ version: 1, expectedEnvironment: 'staging', operation: 'customer-preview', ...customerFixture })).toMatchObject({ ok: true, value: golden.customer })
    expect(outboundRequests).toBe(0)
  })
  it('denies both default and named entrypoint HTTP access', async () => {
    for (const [worker, route] of [['renderer', '/'], ['caller', '/http']]) {
      const target = await runtime!.getWorker(worker!)
      expect((await target.fetch(`https://synthetic.invalid${route}`)).status).toBe(404)
    }
    expect(outboundRequests).toBe(0)
  })
  it('denies malformed and wrong-environment RPC without outbound requests', async () => {
    expect(await rpc({ private: 'secret' })).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
    expect(await rpc({ version: 1, expectedEnvironment: 'production', operation: 'document', document: documentFixtures[0]!.document, options: {} })).toMatchObject({ ok: false, error: { code: 'UNAVAILABLE' } })
    expect(outboundRequests).toBe(0)
  })
})
