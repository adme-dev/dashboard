import { builtinModules } from 'node:module'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { build } from 'esbuild'
import { Miniflare, Response as LocalResponse } from 'miniflare'
import { afterAll, beforeAll, expect, it } from 'vitest'

const siteId = '00000000-0000-4000-8000-000000000001'

let runtime: Miniflare, directory: string, outbound = 0
beforeAll(async () => {
  directory = await mkdtemp(path.resolve('.nuxt/transfer-controls-runtime-'))
  const config = JSON.parse(await readFile('workers/page-studio-management/wrangler.production.jsonc', 'utf8'))
  const options = { bundle: true, format: 'esm' as const, platform: 'neutral' as const, target: 'esnext', conditions: ['workerd', 'worker', 'browser'], mainFields: ['module', 'main'], external: ['node:*', 'cloudflare:*'], banner: { js: 'import { createRequire } from \'node:module\';const require=createRequire(\'/worker.js\');' }, plugins: [{ name: 'builtins', setup(plugin: import('esbuild').PluginBuild) {
    plugin.onResolve({ filter: /^[a-z][a-z_]*(?:\/[a-z_]+)?$/ }, args => builtinModules.includes(args.path) ? { path: `node:${args.path}`, external: true } : undefined)
  } }], logLevel: 'silent' as const }
  const worker = path.join(directory, 'worker.mjs'), caller = path.join(directory, 'caller.mjs')
  await build({ ...options, tsconfig: 'workers/page-studio-management/tsconfig.json', outfile: worker, entryPoints: ['workers/page-studio-management/src/index.ts'] })
  await build({ ...options, alias: { '~~': process.cwd() }, outfile: caller, stdin: { contents: `import {callTransferControls,callTransferWorkflow} from '${path.resolve('server/utils/pageStudio/transferControls.ts')}';export default{async fetch(request,env){const workflow=new URL(request.url).pathname==='/workflow';try{return Response.json({ok:true,value:await (workflow?callTransferWorkflow:callTransferControls)(await request.json(),env)})}catch(error){return Response.json({ok:false,statusCode:error.statusCode})}}}`, resolveDir: process.cwd() } })
  const environment = { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production', PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'production' }

  runtime = new Miniflare({ workers: [{ name: 'management', modules: true, scriptPath: worker, compatibilityDate: config.compatibility_date, compatibilityFlags: config.compatibility_flags, bindings: environment, outboundService: () => {
    outbound++
    return new LocalResponse('Unexpected outbound', { status: 500 })
  } }, { name: 'caller', modules: true, scriptPath: caller, compatibilityDate: config.compatibility_date, compatibilityFlags: config.compatibility_flags, bindings: environment, serviceBindings: { PAGE_STUDIO_MANAGEMENT: 'management' } }] })
  await runtime.ready
}, 60000)
afterAll(async () => {
  await runtime?.dispose()
  if (directory)
    await rm(directory, { recursive: true, force: true })
})
it('uses actual fixed RPC methods, fails closed without native SQL, and rejects HTTP', async () => {
  const caller = await runtime.getWorker('caller')
  const identity = { siteId, requestId: siteId, operator: { actorId: siteId, loginSessionHash: 'a'.repeat(64) } }
  const invoke = async (path: string, input: unknown) => (await caller.fetch(`https://caller/${path}`, { method: 'POST', body: JSON.stringify(input) })).json()
  expect(await invoke('controls', { ...identity, action: 'operator-status' })).toEqual({ ok: false, statusCode: 503 })
  expect(await invoke('workflow', { ...identity, action: 'status', expectedRevision: 5 })).toEqual({ ok: false, statusCode: 503 })
  const management = await runtime.getWorker('management')
  for (const method of ['GET', 'POST']) {
    expect((await management.fetch('https://management/transferControls', { method })).status).toBe(404)
    expect((await management.fetch('https://management/transferWorkflow', { method })).status).toBe(404)
  }
  expect(outbound).toBe(0)
})
it('exposes only the fixed placed paths with strict rejection before SQL', async () => {
  const management = await runtime.getWorker('management')
  for (const path of ['transfer-workflow', 'managed-transfer-resource-authority']) {
    const url = `https://page-studio-management.internal/${path}`
    expect((await management.fetch(url, { method: 'GET' })).status).toBe(404)
    const rejected = await management.fetch(url, { method: 'POST', body: '{}' })
    expect(rejected.status).toBe(400)
    expect(rejected.headers.get('x-request-digest')).toMatch(/^[a-f0-9]{64}$/)
  }
  expect(outbound).toBe(0)
})
