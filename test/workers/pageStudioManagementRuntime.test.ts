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
    const gatewayFile = path.join(directory, 'gateway.mjs')
    await build({ entryPoints: [path.join(root, 'workers/page-studio-control/src/index.ts')], outfile: gatewayFile, bundle: true, format: 'esm', platform: 'neutral', target: 'esnext', logLevel: 'silent' })
    runtime = new Miniflare({
      workers: [
        { name: 'receipt-fixture', modules: true, script: `import { WorkerEntrypoint } from 'cloudflare:workers'; export class ReceiptFixture extends WorkerEntrypoint { async readCompletion(input) { return { ok: true, value: input.completion } } }; export default { fetch() { return new Response('Not found', {status:404}) } }`, compatibilityDate: config.compatibility_date },
        { name: 'gateway', modules: true, scriptPath: gatewayFile, compatibilityDate: config.compatibility_date, bindings: { DASHBOARD_ORIGIN: 'https://preview.agency-dashboard-6cm.pages.dev', PAGE_STUDIO_CONTROL_SECRET: 's'.repeat(48), CONTENT_COMPLETION_TRANSPORT: 'management-rpc' }, serviceBindings: { PAGE_STUDIO_MANAGEMENT_COMPLETION: { name: 'receipt-fixture', entrypoint: 'ReceiptFixture' } }, outboundService: () => {
          outboundRequests++
          return new LocalResponse('Unexpected outbound request', { status: 500 })
        } },
        { name: 'management', modules: true, scriptPath: outfile, compatibilityDate: config.compatibility_date, compatibilityFlags: config.compatibility_flags, bindings: { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'staging' }, outboundService: () => {
          outboundRequests++
          return new LocalResponse('Unexpected outbound request', { status: 500 })
        } },
        { name: 'completion-caller', modules: true, script: `export default { async fetch(request, env) { const path = new URL(request.url).pathname; if(path === '/http') return env.COMPLETION.fetch(request); if(path === '/forbidden') { try { await env.COMPLETION.emailSettings(await request.json()); return Response.json({denied:false}) } catch { return Response.json({denied:true}) } } return Response.json(await env.COMPLETION.readCompletion(await request.json())) } }`, compatibilityDate: config.compatibility_date, serviceBindings: { COMPLETION: { name: 'management', entrypoint: 'ContentAttachmentAuthority' } } },
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
  it('round-trips a completion through the real gateway service-binding proxy', async () => {
    const gateway = await runtime!.getWorker('gateway')
    const receipt = { version: 1, activationId: '10000000-0000-4000-8000-000000000001', identity: `cms_attach_${'a'.repeat(64)}`, operationId: 'attach_one', proofDigest: 'b'.repeat(64), scope: { businessId: 'business_one', clientId: 'client_one', environment: 'staging', siteId: 'site_one', tenantId: 'tenant_one' } }
    const response = await gateway.fetch('https://synthetic.invalid/internal/page-studio/content-attachments/completion', { method: 'POST', body: JSON.stringify(receipt) })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(receipt)
    expect(outboundRequests).toBe(0)
  })
  it('uses the named read-only completion authority and fails closed before database access', async () => {
    const caller = await runtime!.getWorker('completion-caller')
    const response = await caller.fetch('https://synthetic.invalid/', { method: 'POST', body: JSON.stringify({ unexpected: true }) })
    expect(await response.json()).toMatchObject({ ok: false, error: { statusCode: 400 } })
    expect(outboundRequests).toBe(0)
  })
  it('denies valid completion without fresh Hyperdrive and exposes no management write methods', async () => {
    const caller = await runtime!.getWorker('completion-caller')
    const completion = { version: 1, activationId: '10000000-0000-4000-8000-000000000001', identity: `cms_attach_${'a'.repeat(64)}`, operationId: 'attach_one', proofDigest: 'b'.repeat(64), scope: { businessId: 'business_one', clientId: 'client_one', environment: 'staging', siteId: 'site_one', tenantId: 'tenant_one' } }
    const response = await caller.fetch('https://synthetic.invalid/', { method: 'POST', body: JSON.stringify({ expectedEnvironment: 'staging', completion }) })
    expect(await response.json()).toMatchObject({ ok: false, error: { statusCode: 503 } })
    const forbidden = await caller.fetch('https://synthetic.invalid/forbidden', { method: 'POST', body: JSON.stringify(request) })
    expect(await forbidden.json()).toEqual({ denied: true })
    expect((await caller.fetch('https://synthetic.invalid/http')).status).toBe(404)
    expect(outboundRequests).toBe(0)
  })
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
