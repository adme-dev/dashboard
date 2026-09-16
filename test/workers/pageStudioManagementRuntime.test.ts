import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { build } from 'esbuild'
import { mkdir, mkdtemp, rm, readFile } from 'node:fs/promises'
import path from 'node:path'
import { builtinModules } from 'node:module'
import { fileURLToPath } from 'node:url'
import { Miniflare, Response as LocalResponse } from 'miniflare'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const request = { operation: 'read', actor: { role: 'client', actorId: '10000000-0000-4000-8000-000000000002', clientId: '10000000-0000-4000-8000-000000000003' }, siteId: '10000000-0000-4000-8000-000000000001', expectedEnvironment: 'staging' }
describe('built private management Worker RPC boundary', () => {
  let directory: string | undefined
  let runtime: Miniflare | undefined
  let outboundRequests = 0
  beforeAll(async () => {
    await mkdir(path.join(root, '.nuxt'), { recursive: true })
    directory = await mkdtemp(path.join(root, '.nuxt', 'management-runtime-test-'))
    const outfile = path.join(directory, 'worker.mjs')
    const config = JSON.parse(await readFile(path.join(root, 'workers/page-studio-management/wrangler.staging.jsonc'), 'utf8'))
    await build({ entryPoints: [path.join(root, 'workers/page-studio-management/src/index.ts')], outfile, bundle: true, format: 'esm', platform: 'neutral', target: 'esnext', conditions: ['workerd', 'worker', 'browser'], mainFields: ['module', 'main'], external: ['node:*', 'cloudflare:*'], banner: { js: 'import { createRequire } from \'node:module\'; const require = createRequire(\'/worker.js\');' }, plugins: [{ name: 'node-compat-builtins', setup(plugin) {
      plugin.onResolve({ filter: /^[a-z][a-z_]*(?:\/[a-z_]+)?$/ }, args => builtinModules.includes(args.path) ? { path: `node:${args.path}`, external: true } : undefined)
    } }], logLevel: 'silent' })
    runtime = new Miniflare({
      workers: [
        { name: 'management', modules: true, scriptPath: outfile, compatibilityDate: config.compatibility_date, compatibilityFlags: config.compatibility_flags, bindings: { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'staging' }, outboundService: () => {
          outboundRequests++
          return new LocalResponse('Unexpected outbound request', { status: 500 })
        } },
        { name: 'caller', modules: true, script: `export default { async fetch(request, env) { return Response.json(await env.MANAGEMENT[new URL(request.url).pathname === '/inspect' ? 'inspectWebsite' : new URL(request.url).pathname === '/domains' ? 'domains' : 'emailSettings'](await request.json())) } }`, compatibilityDate: config.compatibility_date, serviceBindings: { MANAGEMENT: 'management' } }
      ]
    })
    await runtime.ready
  }, 60_000)
  afterAll(async () => {
    try {
      await runtime?.dispose()
    } finally {
      if (directory) await rm(directory, { recursive: true, force: true })
    }
  }, 30_000)
  async function rpc(input: unknown, pathname = 'rpc') {
    const caller = await runtime!.getWorker('caller')
    const response = await caller.fetch(`https://synthetic.invalid/${pathname}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) })
    expect(response.status).toBe(200)
    return response.json()
  }
  it('returns 404 over HTTP even for a valid management payload', async () => {
    const worker = await runtime!.getWorker('management')
    for (const method of ['GET', 'POST']) {
      const response = await worker.fetch('https://synthetic.invalid/emailSettings', { method, ...(method === 'POST' ? { body: JSON.stringify(request) } : {}) })
      expect(response.status).toBe(404)
      expect(await response.text()).toBe('Not found')
    }
    expect(outboundRequests).toBe(0)
  })
  it.each([null, { ...request, extra: true }, { ...request, actor: { ...request.actor, canEdit: true } }, { ...request, operation: 'write', body: {} }])('rejects invalid actual service-binding RPC before database access', async (input) => {
    expect(await rpc(input)).toEqual({ ok: false, error: { code: 'EMAIL_INVALID', statusCode: 400, message: 'Invalid website email settings request' } })
    expect(outboundRequests).toBe(0)
  })
  it.each(['staging', 'production'])('fails closed for %s scope without a fresh Hyperdrive binding', async (expectedEnvironment) => {
    expect(await rpc({ ...request, expectedEnvironment })).toEqual({ ok: false, error: { code: 'EMAIL_NOT_CONFIGURED', statusCode: 503, message: 'Website email settings environment is unavailable' } })
    expect(outboundRequests).toBe(0)
  })
  it('exposes domain RPC only through the private binding and denies malformed input', async () => {
    expect(await rpc({ ...request, extra: true }, 'domains')).toMatchObject({ ok: false, error: { code: 'DOMAIN_INVALID', statusCode: 400 } })
    expect(outboundRequests).toBe(0)
  })
  it('denies a valid domain operation without its fresh database binding', async () => {
    expect(await rpc({ operation: 'list', actor: { kind: 'portal', actorId: request.actor.actorId, clientId: request.actor.clientId }, siteId: request.siteId, expectedEnvironment: 'staging' }, 'domains')).toMatchObject({ ok: false, error: { code: 'DOMAIN_SERVICE_UNAVAILABLE', statusCode: 503 } })
    expect(outboundRequests).toBe(0)
  })
  it('denies inspection RPC without database and checkpoint bindings', async () => {
    expect(await rpc({ operation: 'launch', actorId: request.actor.actorId, tenantId: 'tenant', siteId: request.siteId, expectedEnvironment: 'staging' }, 'inspect')).toEqual({ ok: false, statusCode: 503 })
    expect(outboundRequests).toBe(0)
  })
})
