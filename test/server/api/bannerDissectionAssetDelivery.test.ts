import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import type { H3Event } from 'h3'
import { resolveScopedDissectionAsset, deliverScopedDissectionAsset, uploadScopedDissectionAsset } from '~~/server/utils/banner/dissectionDelivery'
import { dissectionDeliverySchema, parseScopedDissectionAssetLocator, isScopedDissectionAssetReference, isProtectedDissectionStorageKey } from '#shared/bannerDissectionDelivery'

const state = vi.hoisted(() => ({ query: vi.fn(), auth: vi.fn(), inTransaction: false }))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: (...args: unknown[]) => state.auth(...args) }))
vi.mock('~~/server/utils/db', () => ({ queryOneFresh: vi.fn(), queryRowsFresh: vi.fn(), transactionWithoutRetry: async (action: any) => {
  state.inTransaction = true
  try { return await action({ query: state.query }) } finally { state.inTransaction = false }
} }))
const actor = '11111111-1111-4111-8111-111111111111'
const jobId = '22222222-2222-4222-8222-222222222222'
const assetId = '33333333-3333-4333-8333-333333333333'
const attemptId = '44444444-4444-4444-8444-444444444444'
const clientId = '55555555-5555-4555-8555-555555555555'
const locator = `/api/agency/banner-studio/dissect/${jobId}/assets/${assetId}`
const key = `scoped-dissection-assets/${jobId}/${attemptId}/${assetId}.png`
const bytes = new Uint8Array([137,80,78,71,13,10,26,10,1,2,3])
const hash = createHash('sha256').update(bytes).digest('hex')
let job: any, asset: any, active: boolean, assigned: boolean, grants: string[], session: string | null, project: any
let get: ReturnType<typeof vi.fn>, put: ReturnType<typeof vi.fn>
function event(): H3Event {
  const headers = new Map()
  return { context: { params: { jobId, assetId }, cloudflare: { env: { MEDIA_BUCKET: { get, put } } } },
    node: { req: { method: 'GET', headers: { range: 'bytes=0-1', 'if-none-match': '*' } }, res: { setHeader: (k: string,v: string) => headers.set(k,v), getHeader: (k: string) => headers.get(k) } } } as any
}
function object(content = bytes) { return { size: content.length, httpMetadata: { contentType: 'image/png' }, body: new Response(content).body } }
beforeEach(() => {
  vi.clearAllMocks(); active = true; assigned = true; grants = ['CREATIVE']; session = null; project = { id: clientId, created_by: actor, client_id: null }
  const entry = { assetId, attemptId, key, mimeType: 'image/png', byteLength: bytes.length, sha256: hash }
  job = { job_id: jobId, user_id: actor, status: 'complete', manifest: {
    source: { version: 1, mimeType: 'image/png', byteLength: bytes.length, sha256: hash, width: 1, height: 1 },
    ingestion: { version: 1, owner: { kind: 'client', userId: actor, clientId }, physical: null, ingestedAt: '2026-10-28T00:00:00.000Z', sessionsInvalidatedAt: null },
    delivery: { version: 1, assets: { [assetId]: entry } }, execution: { attemptId: clientId }
  } }
  asset = { id: assetId, r2_key: key, uploaded_by: actor, client_id: clientId, mime_type: 'image/png', file_size: bytes.length, url: locator }
  state.auth.mockResolvedValue({ id: actor })
  state.query.mockImplementation(async (sql: string, params: any[]) => {
    if (sql.includes('FROM banner_dissections')) return { rows: params[1] === actor ? [structuredClone(job)] : [] }
    if (sql.includes('FROM team_members')) return { rows: [{ id: actor, user_role: 'member', custom_role_id: null, is_active: active, sessions_invalidated_at: session }] }
    if (sql.includes('FROM custom_roles')) return { rows: [{ id: actor, is_read_only: false }] }
    if (sql.includes('FROM role_permission_groups')) return { rows: grants.map(permission_group => ({ permission_group })) }
    if (sql.includes('FROM client_team_assignments')) return { rows: assigned ? [{ id: actor }] : [] }
    if (sql.includes('FROM agency_clients')) return { rows: [{ id: clientId }] }
    if (sql.includes('FROM banner_projects')) return { rows: project ? [project] : [] }
    if (sql.includes('FROM banner_assets')) return { rows: asset ? [structuredClone(asset)] : [] }
    throw new Error(`Unexpected SQL ${sql}`)
  })
  get = vi.fn(async () => { expect(state.inTransaction).toBe(false); return object() })
  put = vi.fn(async () => ({ key, size: bytes.length }))
})

describe('scoped byte delivery', () => {
  it('reads historical registered generation with two fresh checks outside remote I/O', async () => {
    const result = await resolveScopedDissectionAsset(event(), actor, locator)
    expect(result).toEqual({ bytes, mimeType: 'image/png', jobId, sourceSha256: hash })
    expect(get).toHaveBeenCalledWith(key)
    expect(state.query.mock.calls.filter(([sql]) => sql.includes('FROM banner_dissections'))).toHaveLength(2)
  })
  it.each(['inactive','assignment','permission','session','source','registry','owner','row','client','mime','size','url','key','entry','generation'])('denies %s before storage', async kind => {
    if (kind === 'inactive') active = false
    if (kind === 'assignment') assigned = false
    if (kind === 'permission') grants = []
    if (kind === 'session') session = '2026-10-28T01:00:00.000Z'
    if (kind === 'source') delete job.manifest.source
    if (kind === 'registry') delete job.manifest.delivery
    if (kind === 'owner') job.manifest.ingestion.owner.userId = clientId
    if (kind === 'row') asset = null
    if (kind === 'client') asset.client_id = null
    if (kind === 'mime') asset.mime_type = 'image/jpeg'
    if (kind === 'size') asset.file_size++
    if (kind === 'url') asset.url = 'https://example.test/image.png'
    if (kind === 'key') asset.r2_key = 'banner-assets/public.png'
    if (kind === 'entry') job.manifest.delivery.assets[assetId].assetId = actor
    if (kind === 'generation') job.manifest.delivery.assets[assetId].attemptId = actor
    await expect(resolveScopedDissectionAsset(event(), actor, locator)).rejects.toMatchObject({ statusCode: expect.any(Number) })
    expect(get).not.toHaveBeenCalled()
  })
  it('denies another session actor before storage', async () => {
    await expect(resolveScopedDissectionAsset(event(), clientId, locator)).rejects.toMatchObject({ statusCode: 404 })
    expect(get).not.toHaveBeenCalled()
  })
  it.each(['revoke','inactive','permission','session','row','registry','source','ingestion','generation'])('rechecks %s after bytes', async kind => {
    get.mockImplementation(async () => {
      if (kind === 'revoke') assigned = false
      if (kind === 'inactive') active = false
      if (kind === 'permission') grants = []
      if (kind === 'session') session = '2026-10-28T01:00:00.000Z'
      if (kind === 'ingestion') job.manifest.ingestion.ingestedAt = '2026-10-27T00:00:00.000Z'
      if (kind === 'row') asset = null
      if (kind === 'registry') delete job.manifest.delivery.assets[assetId]
      if (kind === 'source') job.manifest.source.sha256 = 'a'.repeat(64)
      if (kind === 'generation') job.manifest.delivery.assets[assetId].sha256 = 'a'.repeat(64)
      return object()
    })
    await expect(resolveScopedDissectionAsset(event(), actor, locator)).rejects.toMatchObject({ statusCode: expect.any(Number) })
  })
  it.each(['user','null','unknown'])('denies invalid/unprotected ingestion %s before R2', async kind => {
    if (kind === 'user') job.manifest.ingestion.owner = { kind: 'user', userId: actor }
    if (kind === 'null') job.manifest.ingestion = null
    if (kind === 'unknown') job.manifest.ingestion.version = 2
    await expect(resolveScopedDissectionAsset(event(), actor, locator)).rejects.toMatchObject({ statusCode: expect.any(Number) })
    expect(get).not.toHaveBeenCalled()
  })
  it('sanitizes database failures and never reads storage', async () => {
    state.query.mockRejectedValueOnce(new Error('secret SQL details'))
    await expect(resolveScopedDissectionAsset(event(), actor, locator)).rejects.toMatchObject({ statusCode: 503, statusMessage: 'Dissection asset delivery unavailable' })
    expect(get).not.toHaveBeenCalled()
  })
  it('denies a deleted source project before R2', async () => {
    job.manifest.ingestion.owner = { kind: 'project', userId: actor, projectId: clientId, projectOwnerId: actor, clientId: null }; asset.client_id = null; project = null
    await expect(resolveScopedDissectionAsset(event(), actor, locator)).rejects.toMatchObject({ statusCode: 403 })
    expect(get).not.toHaveBeenCalled()
  })
  it('protects personal projects and rejects source project reassignment', async () => {
    job.manifest.ingestion.owner = { kind: 'project', userId: actor, projectId: clientId, projectOwnerId: actor, clientId: null }; asset.client_id = null
    await expect(resolveScopedDissectionAsset(event(), actor, locator)).resolves.toMatchObject({ jobId })
    get.mockClear(); project.created_by = clientId
    await expect(resolveScopedDissectionAsset(event(), actor, locator)).rejects.toMatchObject({ statusCode: 403 }); expect(get).not.toHaveBeenCalled()
  })
  it.each(['hash','length','mime','overflow'])('rejects stored %s mismatch', async kind => {
    const bad = object()
    if (kind === 'hash') bad.body = new Response(new Uint8Array(bytes.length)).body
    if (kind === 'length') bad.body = new Response(bytes.slice(0, -1)).body
    if (kind === 'mime') bad.httpMetadata.contentType = 'image/jpeg'
    if (kind === 'overflow') bad.body = new Response(new Uint8Array(bytes.length + 1)).body
    get.mockResolvedValue(bad)
    await expect(resolveScopedDissectionAsset(event(), actor, locator)).rejects.toMatchObject({ statusCode: 503 })
  })
  it('rejects invalid metadata without waiting for storage cancellation', async () => {
    const cancel = vi.fn(() => new Promise<void>(() => {}))
    get.mockResolvedValue({ size: bytes.length + 1, httpMetadata: { contentType: 'image/png' }, body: new ReadableStream({ cancel }) })
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const result = await Promise.race([
        resolveScopedDissectionAsset(event(), actor, locator).catch(error => error),
        new Promise(resolve => { timer = setTimeout(() => resolve('blocked on cancel'), 100) })
      ])
      expect(result).toMatchObject({ statusCode: 503 })
      expect(cancel).toHaveBeenCalledOnce()
    } finally { clearTimeout(timer) }
  })
  it('fails closed for absent native binding', async () => {
    const e = event(); delete e.context.cloudflare.env.MEDIA_BUCKET
    await expect(resolveScopedDissectionAsset(e, actor, locator)).rejects.toMatchObject({ statusCode: 503 })
  })
  it.each([false, true])('GET/HEAD ignores cache and range shortcuts: head=%s', async head => {
    const response = await deliverScopedDissectionAsset(event(), head)
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('etag')).toBeNull(); expect(response.headers.get('content-range')).toBeNull()
    expect((await response.arrayBuffer()).byteLength).toBe(head ? 0 : bytes.length)
    expect(get).toHaveBeenCalledOnce()
  })
  it('sets no-store even for an unauthenticated request', async () => {
    const e = event(); state.auth.mockRejectedValue({ statusCode: 401 })
    await expect(deliverScopedDissectionAsset(e)).rejects.toMatchObject({ statusCode: 401 })
    expect(e.node.res.getHeader('Cache-Control')).toBe('private, no-store'); expect(get).not.toHaveBeenCalled()
  })
  it('writes a bounded private object without public signer then verifies stored bytes', async () => {
    await expect(uploadScopedDissectionAsset(event(), { jobId, attemptId, assetId, bytes })).resolves.toEqual({ key, url: locator, size: bytes.length, assetId, mimeType: 'image/png', sha256: hash })
    expect(put).toHaveBeenCalledWith(key, bytes, { httpMetadata: { contentType: 'image/png', cacheControl: 'private, no-store' } })
  })
})

describe('pure registry and locator boundaries', () => {
  it('requires strict entries and bounds the registry', () => {
    expect(dissectionDeliverySchema.safeParse(job.manifest.delivery).success).toBe(true)
    job.manifest.delivery.assets[assetId].evil = true
    expect(dissectionDeliverySchema.safeParse(job.manifest.delivery).success).toBe(false)
    expect(dissectionDeliverySchema.safeParse({ version: 1, assets: Object.fromEntries(Array.from({length:301},(_,i)=>[String(i),{}])) }).success).toBe(false)
  })
  it('rejects newline aliases in registered SHA-256', () => {
    job.manifest.delivery.assets[assetId].sha256 += '\n'
    expect(dissectionDeliverySchema.safeParse(job.manifest.delivery).success).toBe(false)
  })
  it.each(['bad-key', `${key}\n`, key.replace(attemptId, actor)])('malformed registry keys fail validation without throwing: %s', forged => {
    job.manifest.delivery.assets[assetId].key = forged
    expect(dissectionDeliverySchema.safeParse(job.manifest.delivery).success).toBe(false)
  })
  it.each([`${locator}\n`, `${locator}?x=1`, `${locator}/`, `https://host${locator}`, locator.replace('/assets/', '/%61ssets/'), locator.toUpperCase()])('rejects noncanonical locator %s', value => {
    expect(parseScopedDissectionAssetLocator(value)).toBeNull(); expect(isScopedDissectionAssetReference(value)).toBe(true)
  })
  it.each(['scoped-dissection-assets/a', '/scoped-banner-exports/a', 'foo/../scoped-dissection-assets/a', '%2573coped-dissection-assets/a', 'https://host/scoped-banner-exports/a'])('recognizes protected namespace alias %s', value => {
    expect(isProtectedDissectionStorageKey(value)).toBe(true)
  })
})
