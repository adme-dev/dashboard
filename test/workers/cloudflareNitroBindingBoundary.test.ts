import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { build, type Plugin } from 'esbuild'
import { hash } from 'bcryptjs'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Miniflare, Response as LocalResponse } from 'miniflare'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const workerEntry = path.join(repositoryRoot, 'dist', '_worker.js', 'index.js')
const USER_ID = '11111111-1111-4111-8111-111111111111'
const USER_EMAIL = 'boundary-test@xeroflow.test'
const PASSWORD = 'synthetic-local-boundary-password'
const DATABASE_URL = 'postgresql://synthetic:local-only@ep-boundary.neon.test/boundary'
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
  let authToken: string
  let freshIdentityReads = 0
  let assetInsertAttempts = 0
  const unexpectedQueries: string[] = []

  beforeAll(async () => {
    await mkdir(path.join(repositoryRoot, '.nuxt'), { recursive: true })
    directory = await mkdtemp(path.join(repositoryRoot, '.nuxt', 'production-worker-test-'))
    const bundlePath = path.join(directory, 'worker.mjs')
    const passwordHash = await hash(PASSWORD, 10)
    const identity = { id: USER_ID, email: USER_EMAIL, name: 'Boundary Test', role: 'admin', is_active: true, custom_role_id: null }
    const result = (row?: Record<string, unknown>) => LocalResponse.json({
      fields: Object.entries(row ?? {}).map(([name, value]) => ({ name, dataTypeID: typeof value === 'boolean' ? 16 : 25 })),
      rows: row ? [Object.values(row).map(value => typeof value === 'boolean' ? (value ? 't' : 'f') : value)] : [],
      rowCount: row ? 1 : 0,
      command: 'SELECT'
    })
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
        DATABASE_URL,
        RENDER_LINK_SECRET
      },
      // The actual login/session SQL goes through the built application's Neon
      // HTTP driver. All outbound requests terminate in this local fixture;
      // no provider credentials, production database or identity cache is used.
      outboundService: async (request) => {
        if (request.url !== 'https://api.neon.test/sql' || request.method !== 'POST'
          || request.headers.get('neon-connection-string') !== DATABASE_URL) {
          unexpectedQueries.push('unexpected outbound target')
          return LocalResponse.json({ message: 'Local fixture target denied' }, { status: 400 })
        }
        const { query, params } = await request.json() as { query: string, params: unknown[] }
        if (query.includes('FROM team_members') && query.includes('sessions_invalidated_at')
          && query.includes('WHERE id = $1 AND is_active = true') && params[0] === USER_ID) {
          freshIdentityReads++
          return result({ ...identity, sessions_invalidated_at: null })
        }
        if (query.includes('FROM team_members') && query.includes('WHERE email = $1') && params[0] === USER_EMAIL) return result(identity)
        if (query === 'SELECT password_hash FROM team_members WHERE id = $1' && params[0] === USER_ID) return result({ password_hash: passwordHash })
        if (query.includes('FROM custom_roles cr') && params[0] === 'admin') return result()
        if (query.startsWith('INSERT INTO banner_assets ')) {
          assetInsertAttempts++
          return LocalResponse.json({ message: 'Synthetic asset persistence failure' }, { status: 400 })
        }
        if (query.includes('FROM banner_assets') && query.trimStart().startsWith('SELECT ')) {
          return LocalResponse.json({ message: 'Synthetic asset readback failure' }, { status: 400 })
        }
        unexpectedQueries.push('unexpected SQL operation')
        return LocalResponse.json({ message: 'Local fixture query denied' }, { status: 400 })
      },
      kvNamespaces: ['CACHE'],
      r2Buckets: ['MEDIA_BUCKET']
    })
    await stage('Miniflare startup', worker.ready)
    // Mint the session through the real Worker login handler, password check
    // and JWT signer; this remains valid if the application's signing changes.
    const login = await stage('synthetic login', worker.dispatchFetch('https://app.xeroflow.test/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: USER_EMAIL, password: PASSWORD })
    }))
    expect(login.status).toBe(200)
    const cookie = login.headers.get('set-cookie')?.match(/(?:^|,\s*)auth_token=([^;]+)/)?.[1]
    expect(cookie).toBeTruthy()
    authToken = decodeURIComponent(cookie!)
    await login.text()
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
    const multipart = jpegMultipartBody()
    const response = await stage('multipart upload request', worker.dispatchFetch(
      'https://app.xeroflow.test/api/agency/banner-studio/assets/upload',
      {
        method: 'POST',
        headers: {
          'authorization': `Bearer ${authToken}`,
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
    expect(freshIdentityReads).toBeGreaterThan(0)
    expect(assetInsertAttempts).toBe(1)
    expect(unexpectedQueries).toEqual([])

    const bucket = await stage('MEDIA_BUCKET lookup', worker.getR2Bucket('MEDIA_BUCKET'))
    const retained = await stage('post-recovery R2 list', bucket.list())
    expect(retained.objects).toHaveLength(1)
    expect(retained.objects[0]?.key).toMatch(
      /^banner-assets\/11111111-1111-4111-8111-111111111111\/[0-9a-f-]+\/production-probe\.jpg$/i
    )
  }, 30_000)

  it('rejects a forged signature before fresh identity reads or R2 writes', async () => {
    const readsBefore = freshIdentityReads
    const bucket = await stage('forged-session R2 lookup', worker.getR2Bucket('MEDIA_BUCKET'))
    const before = await stage('forged-session initial R2 list', bucket.list())
    const multipart = jpegMultipartBody()
    const response = await stage('forged-session request', worker.dispatchFetch(
      'https://app.xeroflow.test/api/agency/banner-studio/assets/upload', {
        method: 'POST',
        headers: { 'authorization': `Bearer ${authToken.split('.')[0]}.invalidSignature`, 'content-type': multipart.contentType },
        body: multipart.body
      }
    ))
    expect(response.status).toBe(401)
    await response.text()
    expect(freshIdentityReads).toBe(readsBefore)
    const after = await stage('forged-session final R2 list', bucket.list())
    expect(after.objects.map(object => object.key)).toEqual(before.objects.map(object => object.key))
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
