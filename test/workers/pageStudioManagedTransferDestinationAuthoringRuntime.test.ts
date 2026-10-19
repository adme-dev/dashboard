import { builtinModules } from 'node:module'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { build } from 'esbuild'
import { Miniflare, Response as LocalResponse } from 'miniflare'
import { afterAll, beforeAll, expect, it } from 'vitest'
import fixture from '../fixtures/pageStudioManagedTransferDestinationAuthoring.json'

let runtime: Miniflare, directory: string, outbound = 0
beforeAll(async () => {
  directory = await mkdtemp(path.resolve('.nuxt/authoring-runtime-'))
  const config = JSON.parse(await readFile('workers/page-studio-management/wrangler.production.jsonc', 'utf8'))
  const options = { bundle: true, format: 'esm' as const, platform: 'neutral' as const, target: 'esnext', conditions: ['workerd', 'worker', 'browser'], mainFields: ['module', 'main'], external: ['node:*', 'cloudflare:*'], banner: { js: 'import { createRequire } from \'node:module\';const require=createRequire(\'/worker.js\');' }, plugins: [{ name: 'builtins', setup(plugin: import('esbuild').PluginBuild) {
    plugin.onResolve({ filter: /^[a-z][a-z_]*(?:\/[a-z_]+)?$/ }, args => builtinModules.includes(args.path) ? { path: `node:${args.path}`, external: true } : undefined)
  } }], logLevel: 'silent' as const }
  const worker = path.join(directory, 'worker.mjs'), caller = path.join(directory, 'caller.mjs')
  await build({ ...options, tsconfig: 'workers/page-studio-management/tsconfig.json', outfile: worker, stdin: { contents: `import Base from '${path.resolve('workers/page-studio-management/src/index.ts')}';let calls=0;export default class extends Base{managedTransferDestinationAuthoring(input){calls++;return super.managedTransferDestinationAuthoring(input)}authoringCalls(){return calls}}`, resolveDir: process.cwd() } })
  await build({ ...options, alias: { '~~': process.cwd() }, outfile: caller, stdin: { contents: `import {authorizeManagedTransferDestinationAuthoring} from '${path.resolve('server/utils/pageStudio/managedTransferDestinationAuthoring.ts')}';export default{async fetch(request,env){if(new URL(request.url).pathname==='/count')return Response.json(await env.PAGE_STUDIO_MANAGEMENT.authoringCalls());try{return Response.json({ok:true,value:await authorizeManagedTransferDestinationAuthoring(await request.json(),{env})})}catch(error){return Response.json({ok:false,statusCode:error.statusCode})}}}`, resolveDir: process.cwd() } })
  const environment = { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production', PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'production', MANAGED_TRANSFER_DESTINATION_EXECUTION_POLICY: JSON.stringify({ ...fixture.request.destinationRequest.policy, formReceiptDigest: undefined, accountId: fixture.request.destinationRequest.successor.accountId, namespace: fixture.request.destinationRequest.successor.namespace }) }
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
it('uses actual captured service method and Worker-only strict proof validation with no database fallback or retry', async () => {
  const caller = await runtime.getWorker('caller')
  const invoke = async (value: unknown) => await (await caller.fetch('https://caller/authorize', { method: 'POST', body: JSON.stringify(value) })).json()
  expect(await invoke({ action: 'cancel', request: fixture.request })).toEqual({ ok: false, statusCode: 503 })
  expect(await (await caller.fetch('https://caller/count')).json()).toBe(1)
  expect(await invoke({ action: 'read', request: fixture.request })).toEqual({ ok: false, statusCode: 503 })
  expect(await (await caller.fetch('https://caller/count')).json()).toBe(2)
  expect(outbound).toBe(0)
  // Exercise HTTP ingress directly; getWorker().fetch() uses the service-binding proxy.
  const response = await runtime.dispatchFetch('https://management/authorize', { method: 'POST', body: JSON.stringify({ action: 'read', request: fixture.request }) })
  expect(response.status).toBe(404)
  expect(await response.text()).toBe('Not found')
  expect(await (await caller.fetch('https://caller/count')).json()).toBe(2)
  expect(outbound).toBe(0)
})
