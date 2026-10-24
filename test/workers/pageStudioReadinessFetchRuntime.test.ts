import { mkdtemp, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { build } from 'esbuild'
import { Miniflare, Response as LocalResponse } from 'miniflare'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { collectionDigest } from '../../shared/pageStudio/collectionApi'
import { sourceFreezeTransportFixture } from './pageStudioTransferRecoverySourceFreezeSupport'
import { sourceEffectTransportFixture } from './pageStudioTransferRecoverySourceEffectSupport'

let runtime: Miniflare, directory: string, outbound = 0
beforeAll(async () => {
  directory = await mkdtemp(path.resolve('.nuxt/source-ready-fetch-'))
  const config = JSON.parse(await readFile('workers/page-studio-management/wrangler.production.jsonc', 'utf8'))
  const control = path.join(directory, 'control.mjs')
  const authority = path.join(directory, 'authority.mjs')
  const options = { bundle: true, format: 'esm' as const, platform: 'neutral' as const, target: 'esnext', logLevel: 'silent' as const }
  await build({ ...options, entryPoints: ['workers/page-studio-control/src/index.ts'], outfile: control })
  // Deliberately synthetic authority: this test proves native fetch transport,
  // not PostgreSQL permission checks (covered by the real database suite).
  await build({ ...options, outfile: authority, stdin: {
    resolveDir: process.cwd(), contents: `
      import { collectionDigest } from '${path.resolve('shared/pageStudio/collectionApi.ts')}';
      export default { async fetch(request) {
        if (!['https://page-studio-management.internal/transfer-recovery-source-ready', 'https://page-studio-management.internal/transfer-recovery-source-freeze'].includes(request.url) || request.method !== 'POST')
          return new Response(null, { status: 404 });
        const input = await request.json();
        const digest = await collectionDigest(input);
        return Response.json({ purpose: input.purpose, envelopeDigest: digest }, { headers: { 'x-request-digest': digest } });
      } }`
  } })
  const denyOutbound = () => {
    outbound++
    return new LocalResponse('Unexpected outbound', { status: 500 })
  }
  runtime = new Miniflare({ workers: [
    { name: 'control', modules: true, scriptPath: control, compatibilityDate: config.compatibility_date,
      bindings: { DASHBOARD_ORIGIN: 'https://app.xeroflow.io', PAGE_STUDIO_CONTROL_SECRET: 's'.repeat(48), NATIVE_SCHEMA_TRANSPORT: 'placed-fetch' },
      serviceBindings: { PAGE_STUDIO_NATIVE_SCHEMA_AUTHORITY: 'authority' }, outboundService: denyOutbound },
    { name: 'authority', modules: true, scriptPath: authority, compatibilityDate: config.compatibility_date, outboundService: denyOutbound }
  ] })
  await runtime.ready
}, 60000)
afterAll(async () => {
  await runtime?.dispose()
  if (directory) await rm(directory, { recursive: true, force: true })
})
it('uses the real service-binding fetch callable for the source-ready callback', async () => {
  const { command: _command, ...source } = await sourceEffectTransportFixture()
  const input = { ...source, purpose: 'recovery-source-freeze-ready', freezeDescriptor: {
    formatVersion: 1, kind: 'managed-transfer-recovery-source-freeze-v1', layoutDigest: 'f'.repeat(64)
  } }
  const control = await runtime.getWorker('control')
  const response = await control.fetch('https://control.internal/internal/page-studio/managed-transfers/recovery/source-ready', {
    method: 'POST', body: JSON.stringify(input)
  })
  expect(response.status).toBe(200)
  const digest = await collectionDigest(input)
  expect(response.headers.get('x-request-digest')).toBe(digest)
  expect(await response.json()).toEqual({ purpose: input.purpose, envelopeDigest: digest })
  expect(outbound).toBe(0)
})

it.each(['claim', 'dispatch', 'inspect', 'settle'] as const)('uses the real private binding for exact freeze %s authority', async (verb) => {
  const input = await sourceFreezeTransportFixture(verb)
  const control = await runtime.getWorker('control')
  const response = await control.fetch('https://control.internal/internal/page-studio/managed-transfers/recovery/source-freeze', {
    method: 'POST', body: JSON.stringify(input)
  })
  expect(response.status).toBe(200)
  const digest = await collectionDigest(input)
  expect(response.headers.get('x-request-digest')).toBe(digest)
  expect(await response.json()).toEqual({ purpose: input.purpose, envelopeDigest: digest })
  expect(outbound).toBe(0)
})
