import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { deflateSync } from 'node:zlib'
import { Miniflare } from 'miniflare'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { buildBundle } from '../../workers/banner-renderer/build.mjs'
import boundedInflateSync from '../../lib/pngjs-sync-inflate'

let directory: string
let runtime: Miniflare
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'banner-inflate-proof-'))
  const entry = join(directory, 'entry.ts')
  await writeFile(entry, `import inflate from ${JSON.stringify(resolve('lib/pngjs-sync-inflate.ts'))};
    export default { async fetch(request) {
      const limit = Number(new URL(request.url).searchParams.get('limit'));
      try {
        const bytes = inflate(new Uint8Array(await request.arrayBuffer()), { chunkSize: limit, maxLength: limit });
        return new Response(bytes);
      } catch (error) { return new Response(error.name, { status: 422 }); }
    } }`)
  const bundle = join(directory, 'worker.mjs')
  await buildBundle(entry, bundle)
  runtime = new Miniflare({ modules: true, modulesRoot: directory, scriptPath: bundle,
    compatibilityDate: '2026-07-15', compatibilityFlags: ['nodejs_compat'],
    outboundService: () => { throw new Error('Unexpected outbound request') } })
})
afterAll(async () => {
  await runtime?.dispose()
  if (directory) await rm(directory, { recursive: true, force: true })
})

it.each([16383, 16384, 16385, 65535, 65536, 65537, 691560, 921960])('inflates exactly %i bytes under workerd without accepting one extra byte', async (size) => {
  const expected = Buffer.alloc(size, 255)
  const response = await runtime.dispatchFetch(`https://local.invalid/?limit=${size}`, { method: 'POST', body: deflateSync(expected) })
  expect(response.status).toBe(200)
  expect(Buffer.from(await response.arrayBuffer())).toEqual(expected)
  const oversized = await runtime.dispatchFetch(`https://local.invalid/?limit=${size}`, { method: 'POST', body: deflateSync(Buffer.alloc(size + 1, 255)) })
  expect(oversized.status).toBe(422)
})

it('rejects highly compressed inflated bombs and corrupt compressed data under workerd', async () => {
  for (const body of [deflateSync(Buffer.alloc(8 * 1024 * 1024)), Buffer.from('invalid zlib')]) {
    const response = await runtime.dispatchFetch('https://local.invalid/?limit=65536', { method: 'POST', body })
    expect(response.status).toBe(422)
  }
})

it.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1])('rejects invalid or overflowing maxLength %s before allocating', (maxLength) => {
  expect(() => boundedInflateSync(deflateSync(Buffer.from('test')), { maxLength })).toThrow(RangeError)
})
