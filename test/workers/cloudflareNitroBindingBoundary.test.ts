import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { build } from 'esbuild'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { unstable_dev, type UnstableDevWorker } from 'wrangler'

import { buildWorkerDispatcherModule } from '../../scripts/compact-worker-module.mjs'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

describe('compact dispatcher to Nitro Cloudflare binding boundary', () => {
  let directory: string
  let worker: UnstableDevWorker

  beforeAll(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'cloudflare-nitro-binding-'))
    const bridgePath = path.join(repositoryRoot, 'server/utils/cfBindings.ts')
    await writeFile(path.join(directory, 'index.js'), buildWorkerDispatcherModule(), 'utf8')
    await writeFile(path.join(directory, '_ws.js'), [
      'export const handleBoardConnect = () => new Response("unused")',
      'export const handleChatConnect = () => new Response("unused")',
      'export const handleBannerConnect = () => new Response("unused")'
    ].join('\n'), 'utf8')
    await writeFile(path.join(directory, '_nitro.js'), `
import * as bridge from ${JSON.stringify(bridgePath)}

export default {
  fetch(request, env, context) {
    const eventContext = {
      _platform: { cloudflare: { request, env, context } }
    }
    bridge.promoteCloudflarePlatformContext?.(eventContext)
    return Response.json({
      sameObject: eventContext.cloudflare?.env === env,
      sentinel: eventContext.cloudflare?.env?.SENTINEL ?? null
    })
  }
}
`, 'utf8')
    const bundlePath = path.join(directory, 'worker.mjs')
    await build({
      entryPoints: [path.join(directory, 'index.js')],
      outfile: bundlePath,
      bundle: true,
      format: 'esm',
      platform: 'neutral',
      target: 'esnext'
    })
    worker = await unstable_dev(bundlePath, {
      compatibilityDate: '2026-07-15',
      experimental: { disableExperimentalWarning: true },
      local: true,
      vars: { SENTINEL: 'worker-runtime-sentinel' }
    })
  }, 30_000)

  afterAll(async () => {
    await worker?.stop()
    if (directory) await rm(directory, { recursive: true, force: true })
  })

  it('preserves the exact Worker env object through the generated dispatcher and Nitro adapter context', async () => {
    const response = await worker.fetch('https://app.xeroflow.test/api/probe')

    await expect(response.json()).resolves.toEqual({
      sameObject: true,
      sentinel: 'worker-runtime-sentinel'
    })
  })
})
