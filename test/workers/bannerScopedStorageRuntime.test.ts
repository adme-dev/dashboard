import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { build } from 'esbuild'
import { Miniflare, Response as LocalResponse } from 'miniflare'
import { PNG } from 'pngjs'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { scopedExportMetadata, parseScopedExportProvenance, type ScopedExportIdentity } from '../../server/utils/banner/scopedExport'

// The two production metadata functions run unchanged in Node. Their module also
// imports SQL/authority code: any accidental database use must fail, never connect.
vi.mock('~~/server/utils/db', () => {
  const deny = () => { throw new Error('Database outside native-R2 proof scope') }
  return { queryOneFresh: deny, queryRowsFresh: deny, queryOne: deny, queryRows: deny,
    execute: deny, transaction: deny, transactionWithoutRetry: deny }
})

const projectId = '11111111-1111-4111-8111-111111111111'
const exportId = '22222222-2222-4222-8222-222222222222'
const userId = '33333333-3333-4333-8333-333333333333'
const clientId = '44444444-4444-4444-8444-444444444444'
const key = `scoped-banner-exports/${projectId}/${exportId}.png`
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWP4z8DwHwAFAAH/e+m+7wAAAABJRU5ErkJggg==', 'base64')
const hash = (value: Uint8Array) => createHash('sha256').update(value).digest('hex')
const sha256 = hash(png)
const httpMetadata = { contentType: 'image/png', cacheControl: 'private, no-store' }
const identity: ScopedExportIdentity = {
  version: 1, projectId, sourceRevision: '2026-10-28T00:00:00.000Z',
  target: { owner: { kind: 'project', userId, projectId, projectOwnerId: userId, clientId },
    sessionsInvalidatedAt: '2026-10-27T00:00:00.000Z' },
  dependencies: Array.from({ length: 8 }, (_, index) => ({
    jobId: `55555555-5555-4555-8555-${String(index).padStart(12, '0')}`, sourceSha256: 'a'.repeat(64),
  })),
}
// Exercise the exact 1800-byte production ceiling, with eight distinct jobs.
// ISO fractional seconds are schema-valid padding; no unknown fields are added.
const baseMetadata = scopedExportMetadata(identity, exportId, sha256)
const maximumIdentity = { ...identity, sourceRevision: identity.sourceRevision.replace(/Z$/, `${'0'.repeat(1800 - Buffer.byteLength(baseMetadata.provenance!))}Z`) }
const maximumMetadata = scopedExportMetadata(maximumIdentity, exportId, sha256)

interface Observation {
  head: { size: number, etag: string, customMetadata: Record<string, string>, httpMetadata: typeof httpMetadata, checksum: string }
  get: Observation['head']
  byteLength: number
  sha256: string
}

describe('local native R2 contract only (no authenticated route, real DB, hosted or service binding acceptance)', () => {
  let runtime: Miniflare | undefined
  let directory: string | undefined
  let bucket: Awaited<ReturnType<Miniflare['getR2Bucket']>>
  let outbound = 0

  beforeAll(async () => {
    expect(process.versions.node.split('.')[0], 'Run this native proof with Node 24').toBe('24')
    expect(PNG.sync.read(png)).toMatchObject({ width: 1, height: 1, data: Buffer.from([255, 0, 0, 255]) })
    directory = await mkdtemp(join(tmpdir(), 'banner-scoped-r2-'))
    const entry = join(directory, 'worker.mjs')
    await build({ bundle: true, format: 'esm', platform: 'neutral', target: 'esnext', outfile: entry,
      stdin: { resolveDir: process.cwd(), contents: `
        import { readBoundedBannerObjectBody } from ${JSON.stringify(resolve('server/utils/banner/boundedObjectBody.ts'))};
        const hex = value => Array.from(new Uint8Array(value), byte => byte.toString(16).padStart(2, '0')).join('');
        const summary = object => ({ size: object.size, etag: object.etag,
          customMetadata: object.customMetadata, httpMetadata: object.httpMetadata,
          checksum: hex(object.checksums.sha256) });
        export default { async fetch(request, env) {
          const url = new URL(request.url);
          // Local test observations only: never an HTTP route to encoded bytes.
          if (url.pathname !== '/__proof' || request.method !== 'POST') return new Response(null, { status: 404 });
          const key = url.searchParams.get('key');
          const head = await env.MEDIA_BUCKET.head(key);
          const object = await env.MEDIA_BUCKET.get(key);
          if (!head || !object) return new Response(null, { status: 404 });
          try {
            const data = await readBoundedBannerObjectBody(object.body,
              Number(url.searchParams.get('expected') ?? object.size),
              Number(url.searchParams.get('maximum') ?? 1024), 1000);
            return Response.json({ head: summary(head), get: summary(object),
              byteLength: data.byteLength, sha256: hex(await crypto.subtle.digest('SHA-256', data)) });
          } catch (error) { return Response.json({ error: error.message }, { status: 422 }); }
        } }`
      } })
    runtime = new Miniflare({ scriptPath: entry, modulesRoot: directory, modules: true, compatibilityDate: '2024-12-01',
      host: '127.0.0.1', r2Buckets: ['MEDIA_BUCKET'], r2Persist: join(directory, 'r2'),
      cf: false, outboundService: () => { outbound++; return new LocalResponse(null, { status: 503 }) } })
    await runtime.ready
    bucket = await runtime.getR2Bucket('MEDIA_BUCKET')
    console.info(`Scoped storage proof: ${process.version}; native workerd R2; PNG ${png.byteLength} bytes; SHA-256 ${sha256}; provenance ${Buffer.byteLength(maximumMetadata.provenance!)} bytes`)
  }, 30000)

  afterAll(async () => {
    // Await owned disposal; prove the instance is unusable before deleting its store.
    // If disposal fails, preserve the directory instead of hiding the failure.
    if (runtime) {
      await runtime.dispose()
      await expect(runtime.getR2Bucket('MEDIA_BUCKET')).rejects.toMatchObject({ code: 'ERR_DISPOSED' })
      console.info('Scoped storage proof: owned Miniflare disposed; subsequent binding access rejected with ERR_DISPOSED')
    }
    if (directory) await rm(directory, { recursive: true, force: true })
    expect(outbound).toBe(0)
  }, 15000)

  const observe = (objectKey = key, parameters: Record<string, string> = {}) => runtime!.dispatchFetch(
    `https://local.invalid/__proof?${new URLSearchParams({ key: objectKey, ...parameters })}`, { method: 'POST' })
  const put = (objectKey: string, customMetadata: Record<string, string>) => bucket.put(objectKey, png,
    { customMetadata, httpMetadata, sha256 })

  it('atomically roundtrips bytes with maximum provenance, exact size/hash and equal GET/HEAD metadata', async () => {
    expect(Buffer.byteLength(maximumMetadata.provenance!)).toBe(1800)
    const metadata = { ...maximumMetadata }
    // Explicit red-proof switch: changes fixture input only, never production code.
    if (process.env.BANNER_STORAGE_PROOF_INVALID_METADATA === '1') metadata.provenance = '{}'
    expect(await bucket.head(key)).toBeNull()
    const stored = await put(key, metadata)
    expect(stored).not.toBeNull()
    const response = await observe()
    expect(response.status).toBe(200)
    const actual = await response.json() as Observation
    expect(actual.get).toEqual(actual.head)
    expect(actual.get).toMatchObject({ size: png.byteLength, customMetadata: maximumMetadata, httpMetadata, checksum: sha256 })
    expect(actual.get.etag).toBe(stored!.etag)
    expect(actual.byteLength).toBe(png.byteLength)
    expect(actual.sha256).toBe(sha256)
    expect(parseScopedExportProvenance(actual.head.customMetadata, exportId, projectId)).toEqual({ ...maximumIdentity, exportId, outputSha256: actual.sha256 })
    expect(actual).not.toHaveProperty('body')
    expect(JSON.stringify(actual)).not.toContain(png.toString('base64'))
  })

  it('rejects 1801-byte provenance and a ninth dependency at the production boundary', () => {
    expect(() => scopedExportMetadata({ ...maximumIdentity, sourceRevision: maximumIdentity.sourceRevision.replace(/Z$/, '0Z') }, exportId, sha256)).toThrow('Too many protected source dependencies')
    expect(() => parseScopedExportProvenance({ provenance: maximumMetadata.provenance + ' ' }, exportId, projectId)).toThrow('Protected export provenance unavailable')
    expect(() => scopedExportMetadata({ ...identity, dependencies: [...identity.dependencies, identity.dependencies[0]!] }, exportId, sha256)).toThrow()
  })

  it.each([
    ['missing', {}],
    ['malformed', { provenance: '{' }],
    ['wrong-export', { provenance: JSON.stringify({ ...JSON.parse(baseMetadata.provenance!), exportId: userId }) }],
    ['wrong-project', { provenance: JSON.stringify({ ...JSON.parse(baseMetadata.provenance!), projectId: clientId }) }],
    ['wrong-owner', { provenance: JSON.stringify({ ...JSON.parse(baseMetadata.provenance!), target: { ...identity.target, owner: { ...identity.target.owner, projectId: clientId } } }) }],
    ['duplicate-job', { provenance: JSON.stringify({ ...JSON.parse(baseMetadata.provenance!), dependencies: [identity.dependencies[0], identity.dependencies[0]] }) }],
  ] as Array<[string, Record<string, string>]>)('rejects %s provenance after native R2 preserves it unchanged', async (label, metadata) => {
    const invalidKey = `${key}.${label}`
    await put(invalidKey, metadata)
    const response = await observe(invalidKey)
    expect(response.status).toBe(200)
    const actual = await response.json() as Observation
    expect(actual.head.customMetadata).toEqual(metadata)
    expect(actual.get).toEqual(actual.head)
    expect(() => parseScopedExportProvenance(actual.get.customMetadata, exportId, projectId)).toThrow('Protected export provenance unavailable')
  })

  it('detects a schema-valid but tampered output digest against actual native bytes', async () => {
    const tamperedKey = `${key}.digest`
    await put(tamperedKey, scopedExportMetadata(identity, exportId, '0'.repeat(64)))
    const actual = await (await observe(tamperedKey)).json() as Observation
    // Provenance is not signed: the parser validates shape/identity, and delivery
    // separately compares the digest. Do not claim the parser detects this alone.
    const parsed = parseScopedExportProvenance(actual.get.customMetadata, exportId, projectId)
    expect(actual.sha256).toBe(sha256)
    expect(parsed.outputSha256).not.toBe(actual.sha256)
  })

  it('rejects checksum-invalid native puts without publishing new bytes or replacement metadata', async () => {
    const atomicKey = `${key}.atomic`
    const options = { customMetadata: maximumMetadata, httpMetadata, sha256: '0'.repeat(64) }
    await expect(bucket.put(atomicKey, png, options)).rejects.toThrow()
    expect(await bucket.head(atomicKey)).toBeNull()
    await put(atomicKey, baseMetadata)
    const before = await (await observe(atomicKey)).json()
    await expect(bucket.put(atomicKey, new Uint8Array([0, 255, 1]), options)).rejects.toThrow()
    expect(await (await observe(atomicKey)).json()).toEqual(before)
  })

  it.each([
    [{ maximum: String(png.byteLength - 1) }, 'Object size exceeds its limit'],
    [{ expected: String(png.byteLength - 1) }, 'Object body exceeds its limit'],
    [{ expected: String(png.byteLength + 1) }, 'Object body is truncated'],
  ] as Array<[Record<string, string>, string]>)('production bounded reader rejects native body mismatch %j', async (parameters, message) => {
    const boundedKey = `${key}.bounded`
    await put(boundedKey, baseMetadata)
    const response = await observe(boundedKey, parameters)
    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({ error: message })
  })

  it('has no public HTTP asset route for GET, HEAD, encoded paths or Range requests', async () => {
    for (const path of [`/${key}`, `/${encodeURIComponent(key)}`, `/api/agency/banner-studio/exports/${exportId}/download`, '/__proof']) {
      for (const method of ['GET', 'HEAD']) {
        const response = await runtime!.dispatchFetch(`https://local.invalid${path}`, { method, headers: { range: 'bytes=0-15' } })
        expect(response.status).toBe(404)
        expect((await response.arrayBuffer()).byteLength).toBe(0)
      }
    }
    expect(outbound).toBe(0)
  })
})
