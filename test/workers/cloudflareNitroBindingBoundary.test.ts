import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { build, type Plugin } from 'esbuild'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Miniflare } from 'miniflare'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const workerEntry = path.join(repositoryRoot, 'dist', '_worker.js', 'index.js')
const AUTH_TOKEN = 'production-boundary-auth-token'
const AUTH_CACHE_KEY = `auth-session:${AUTH_TOKEN.slice(0, 16)}`
const RENDER_LINK_SECRET = 'production-boundary-secret-with-at-least-thirty-two-bytes'
const STAGE_TIMEOUT_MS = 15_000
const describeBuiltWorker = existsSync(workerEntry) ? describe : describe.skip

async function stage<T>(label: string, promise: Promise<T>): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`Production Worker harness timed out during ${label}`)),
          STAGE_TIMEOUT_MS
        )
      })
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

const unavailableOptionalModules: Plugin = {
  name: 'unavailable-optional-worker-modules',
  setup(pluginBuild) {
    pluginBuild.onResolve(
      { filter: /^(?:@react-email\/render|@cloudflare\/puppeteer|puppeteer|gifenc|pngjs)$/ },
      args => ({ path: args.path, namespace: 'unavailable-optional' })
    )
    pluginBuild.onLoad({ filter: /.*/, namespace: 'unavailable-optional' }, (args) => {
      if (args.path === '@react-email/render') return { contents: 'export async function render(){ throw new Error("optional module unavailable") }' }
      if (args.path === 'gifenc') return { contents: 'export const GIFEncoder=undefined,quantize=undefined,applyPalette=undefined' }
      if (args.path === 'pngjs') return { contents: 'export const PNG=undefined' }
      return { contents: 'export default undefined' }
    })
  }
}

function jpegMultipartBody(): { body: Uint8Array, contentType: string } {
  const boundary = 'xeroflow-production-boundary'
  const encoder = new TextEncoder()
  const prefix = encoder.encode([
    `--${boundary}`,
    'Content-Disposition: form-data; name="file"; filename="production-probe.jpg"',
    'Content-Type: image/jpeg',
    '',
    ''
  ].join('\r\n'))
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
  const suffix = encoder.encode(`\r\n--${boundary}--\r\n`)
  const body = new Uint8Array(prefix.byteLength + jpeg.byteLength + suffix.byteLength)
  body.set(prefix)
  body.set(jpeg, prefix.byteLength)
  body.set(suffix, prefix.byteLength + jpeg.byteLength)
  return { body, contentType: `multipart/form-data; boundary=${boundary}` }
}

describeBuiltWorker('built Nitro Cloudflare binding boundary', () => {
  let directory: string
  let worker: Miniflare

  beforeAll(async () => {
    await mkdir(path.join(repositoryRoot, '.nuxt'), { recursive: true })
    directory = await mkdtemp(path.join(repositoryRoot, '.nuxt', 'production-worker-test-'))
    const bundlePath = path.join(directory, 'worker.mjs')
    await stage('esbuild production artifact bundle', build({
      entryPoints: [workerEntry],
      outfile: bundlePath,
      bundle: true,
      format: 'esm',
      platform: 'neutral',
      target: 'esnext',
      conditions: ['workerd', 'worker', 'browser'],
      mainFields: ['module', 'main'],
      external: ['node:*', 'cloudflare:*'],
      plugins: [unavailableOptionalModules],
      legalComments: 'none',
      logLevel: 'silent'
    }))
    worker = new Miniflare({
      modules: true,
      modulesRoot: repositoryRoot,
      scriptPath: bundlePath,
      compatibilityDate: '2024-12-01',
      compatibilityFlags: [
        'nodejs_compat',
        'no_handle_cross_request_promise_resolution',
        'no_nodejs_compat_v2'
      ],
      bindings: {
        APP_URL: 'https://app.xeroflow.test',
        RENDER_LINK_SECRET
      },
      kvNamespaces: ['CACHE'],
      r2Buckets: ['MEDIA_BUCKET']
    })
    await stage('Miniflare startup', worker.ready)
  }, 60_000)

  afterAll(async () => {
    if (worker) await stage('Miniflare disposal', worker.dispose())
    if (directory) await rm(directory, { recursive: true, force: true })
  }, 30_000)

  it('carries the real Worker env through the dispatcher, Nitro localFetch, H3 middleware, and route', async () => {
    const response = await stage('public capability request', worker.dispatchFetch(
      'https://app.xeroflow.test/api/public/banner-assets/v1.AAAA.AAAA'
    ))

    expect(response.status).toBe(403)
    await expect(response.text()).resolves.toContain('Invalid banner asset link')
  }, 30_000)

  it('uses the request-owned R2 binding and preserves uncertain uploads when persistence fails', async () => {
    const cache = await stage('CACHE binding lookup', worker.getKVNamespace('CACHE'))
    await stage('CACHE session seed', cache.put(AUTH_CACHE_KEY, JSON.stringify({
      id: '11111111-1111-4111-8111-111111111111',
      email: 'boundary-test@xeroflow.test',
      name: 'Boundary Test',
      role: 'admin',
      is_active: true
    })))

    const multipart = jpegMultipartBody()
    const response = await stage('multipart upload request', worker.dispatchFetch(
      'https://app.xeroflow.test/api/agency/banner-studio/assets/upload',
      {
        method: 'POST',
        headers: {
          'authorization': `Bearer ${AUTH_TOKEN}`,
          'content-type': multipart.contentType
        },
        body: multipart.body
      }
    ))

    const responseBody = await response.text()
    expect({ status: response.status, responseBody }).toMatchObject({
      status: 503,
      responseBody: expect.stringContaining('Banner upload recovery required')
    })

    const bucket = await stage('MEDIA_BUCKET lookup', worker.getR2Bucket('MEDIA_BUCKET'))
    const retained = await stage('post-recovery R2 list', bucket.list())
    expect(retained.objects).toHaveLength(1)
    expect(retained.objects[0]?.key).toMatch(
      /^banner-assets\/11111111-1111-4111-8111-111111111111\/[0-9a-f-]+\/production-probe\.jpg$/i
    )
  }, 30_000)

  it('probes the local R2 runtime contract for ranges and failed conditionals', async () => {
    const bucket = await stage('R2 probe bucket lookup', worker.getR2Bucket('MEDIA_BUCKET'))
    const key = 'production-boundary/r2-http-probe.txt'
    try {
      await stage('R2 probe put', bucket.put(key, 'hello world', {
        httpMetadata: { contentType: 'text/plain' }
      }))
      const metadata = await stage('R2 probe head', bucket.head(key))
      expect(metadata).toMatchObject({ key, size: 11 })

      const suffix = await stage('R2 suffix read', bucket.get(key, { range: { suffix: 3 } }))
      expect(suffix?.range).toEqual({ offset: 8, length: 3 })
      await expect(suffix?.text()).resolves.toBe('rld')

      const offset = await stage('R2 offset read', bucket.get(key, { range: { offset: 7, length: 4 } }))
      expect(offset?.range).toEqual({ offset: 7, length: 4 })
      await expect(offset?.text()).resolves.toBe('orld')

      await expect(stage('R2 unsatisfiable read', bucket.get(key, { range: { offset: 99, length: 3 } })))
        .rejects.toThrow(/range/i)

      const unchanged = await stage('R2 if-none-match probe', bucket.get(key, {
        onlyIf: { etagDoesNotMatch: metadata!.etag }
      }))
      expect(unchanged).toBeTruthy()
      expect(unchanged && 'body' in unchanged).toBe(false)

      const failedMatch = await stage('R2 if-match probe', bucket.get(key, {
        onlyIf: { etagMatches: 'different-etag' }
      }))
      expect(failedMatch).toBeTruthy()
      expect(failedMatch && 'body' in failedMatch).toBe(false)
    } finally {
      await stage('R2 probe cleanup', bucket.delete(key))
    }
  }, 30_000)
})
