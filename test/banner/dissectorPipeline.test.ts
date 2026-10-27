import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PNG } from 'pngjs'
import { createHash } from 'node:crypto'
import type { DissectionSourceIdentity } from '../../server/utils/banner/dissectionJobs'
import type { DissectorManifest, DissectorLayer } from '../../app/types/banner-studio'

const mocks = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn(), upload: vi.fn(), download: vi.fn(), analyze: vi.fn(), segment: vi.fn(), authorize: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ queryOneFresh: mocks.query, queryOne: mocks.query, execute: mocks.execute,
  transactionWithoutRetry: async callback => callback({ query: async (sql, args) => {
    const row = await mocks.query(sql, args)
    return { rows: row ? [row] : [] }
  } })
}))
vi.mock('~~/server/utils/banner/dissectionAccess', () => ({ assertDissectionAccess: mocks.authorize }))
vi.mock('~~/server/utils/storage', () => ({ uploadFile: mocks.upload, readStoredObject: mocks.download, deleteFile: vi.fn() }))
vi.mock('~~/server/utils/bannerDissector', async original => ({ ...await original<typeof import('../../server/utils/bannerDissector')>(), analyzeImage: mocks.analyze, segmentLayer: mocks.segment }))
const { runDissectionPipeline } = await import('../../server/utils/bannerDissectorPipeline')

const layer = (type: DissectorLayer['type'], id = type): DissectorLayer => ({ id, type, description: 'Fixture', z_index: 0, editable: type === 'live_text', export_as_png: type !== 'live_text', region: { x: 0, y: 0, width: 1, height: 1 }, mask: 'fixture-mask' })
const manifest = (layers: DissectorLayer[]): DissectorManifest => ({ jobId: 'analysis-job', version: '2.0', brand: 'Fixture', campaign_type: 'offer', banner_size: '', processed_at: '2026-10-26T00:00:00.000Z', status: 'segmenting', tokens: {}, layers })
const source = PNG.sync.write(new PNG({ width: 2, height: 2 }))
let writes: Array<{ sql: string, args: unknown[] }>
let record: { job_id: string, user_id: string, source_r2_key: string, status: string, error?: string | null, manifest: { execution: { attemptId: string, attempt: number, maxAttempts?: number, stage: string, startedAt?: unknown, updatedAt?: unknown }, source?: DissectionSourceIdentity | null, layers?: DissectorLayer[], importReceipt?: unknown } }
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('R2_ACCOUNT_ID', 'fixture-only')
  vi.stubEnv('R2_ACCESS_KEY_ID', 'fixture-only')
  vi.stubEnv('R2_SECRET_ACCESS_KEY', 'fixture-only')
  vi.stubGlobal('useRuntimeConfig', () => ({ renderLinkSecret: 's'.repeat(32) }))
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network forbidden in test')))
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  record = { job_id: 'job', user_id: '11111111-1111-4111-8111-111111111111', source_r2_key: 'banner-dissector/job/original.png', status: 'queued', manifest: { execution: { attemptId: 'initial', attempt: 1, maxAttempts: 3, stage: 'queued' } } }
  mocks.query.mockImplementation(async (sql: string, args: (string | number | boolean | null)[]) => {
    if (sql.includes('/* expire dissection */')) return null
    if (sql.startsWith('SELECT')) {
      if (sql.includes('manifest->\'execution\'->>\'attemptId\'')) return args[1] === record.manifest.execution.attemptId && ['analyzing', 'segmenting'].includes(record.status) ? { job_id: 'job' } : null
      return structuredClone(record)
    }
    writes.push({ sql, args })
    if (sql.includes('SET status = \'analyzing\'')) {
      if (record.status !== 'queued' || args[1] !== record.manifest.execution.attemptId) return null
      record.status = 'analyzing'
      record.manifest.execution = { ...record.manifest.execution, stage: 'analyzing', startedAt: args[2], updatedAt: args[2] }
    } else {
      if (!['analyzing', 'segmenting'].includes(record.status) || record.manifest.execution.attemptId !== args[4]) return null
      record.status = String(args[0])
      const immutable = Object.fromEntries(['source', 'ingestion', 'delivery'].filter(key => Object.prototype.hasOwnProperty.call(record.manifest, key)).map(key => [key, record.manifest[key]]))
      record.manifest = { ...JSON.parse(String(args[1])), ...immutable }
      record.error = args[2] as string | null
    }
    return structuredClone(record)
  })
  mocks.download.mockImplementation(async () => ({ size: source.length, body: new Blob([source]).stream() }))
  mocks.upload.mockImplementation(async (_bytes, key) => ({ url: `https://fixture.invalid/${key}` }))
  mocks.segment.mockResolvedValue(Buffer.from('cutout-fixture'))
  writes = []
  mocks.execute.mockImplementation(async (sql, args) => {
    writes.push({ sql, args })
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

function savedManifest(): DissectorManifest {
  const write = writes.findLast(w => w.sql.includes('manifest ='))!
  return JSON.parse(write.args.find(arg => typeof arg === 'string' && arg.startsWith('{')) as string)
}

describe('Dissector persists honest extraction states', () => {
  it.each(['hash', 'size', 'dimensions', 'mime', 'version', 'null'])('rejects a %s source identity mismatch before inference', async (mode) => {
    const identity = { version: 1, mimeType: 'image/png', width: 2, height: 2, byteLength: source.length, sha256: createHash('sha256').update(source).digest('hex') }
    if (mode === 'hash') identity.sha256 = 'a'.repeat(64)
    if (mode === 'size') identity.byteLength++
    if (mode === 'dimensions') identity.width++
    if (mode === 'mime') identity.mimeType = 'image/jpeg'
    if (mode === 'version') identity.version = 2
    record.manifest.source = (mode === 'null' ? null : identity) as DissectionSourceIdentity | null
    mocks.analyze.mockResolvedValue(manifest([layer('logo')]))
    await expect(runDissectionPipeline(null, 'job', { attemptId: 'initial' })).rejects.toThrow()
    expect(mocks.analyze).not.toHaveBeenCalled()
    expect(mocks.segment).not.toHaveBeenCalled()
    expect(mocks.upload).not.toHaveBeenCalled()
  })

  it('allows the exact verified source bytes to reach inference', async () => {
    record.manifest.source = { version: 1, mimeType: 'image/png', width: 2, height: 2, byteLength: source.length, sha256: createHash('sha256').update(source).digest('hex') }
    mocks.analyze.mockResolvedValue(manifest([layer('background')]))
    await runDissectionPipeline(null, 'job', { attemptId: 'initial' })
    expect(mocks.analyze).toHaveBeenCalledTimes(1)
    expect(mocks.analyze.mock.calls[0][1]).toBe(source.toString('base64'))
  })
  it('keeps the full source out of background layers and marks the result for review', async () => {
    mocks.analyze.mockResolvedValue(manifest([layer('background'), layer('logo')]))
    const result = await runDissectionPipeline(null, 'job', { attemptId: 'initial' })
    expect(result.status).toBe('review_ready')
    expect(result.layers[0]).toMatchObject({ extraction_status: 'unresolved' })
    expect(result.layers[0].r2_url).toBeUndefined()
    expect(result.layers[0].asset_path).toBeUndefined()
    expect(result.layers[1]).toMatchObject({ extraction_status: 'extracted', r2_url: expect.stringContaining('/api/public/banner-assets/v1.') })
    expect(result.warnings?.join(' ')).toMatch(/background/i)
    expect(savedManifest()).toMatchObject({ layers: result.layers, status: result.status })
    expect(mocks.upload.mock.calls.map(call => call[1])).not.toContain('banner-dissector/job/layers/source.png')
  })
  it.each(['null', 'throw'])('keeps failed extraction unresolved (%s), with no substitute source asset', async (mode) => {
    const stale = layer('logo')
    stale.r2_url = 'https://fixture.invalid/old-source.png'
    stale.asset_path = 'old-source.png'
    mocks.analyze.mockResolvedValue(manifest([stale]))
    if (mode === 'null') mocks.segment.mockResolvedValue(null)
    else mocks.segment.mockRejectedValue(new Error('private customer content must not be stored'))
    const result = await runDissectionPipeline(null, 'job', { attemptId: 'initial' })
    expect(result.status).toBe('review_ready')
    expect(result.layers[0]).toMatchObject({ extraction_status: 'unresolved' })
    expect(result.layers[0].r2_url).toBeUndefined()
    expect(result.layers[0].asset_path).toBeUndefined()
    expect(result.layers[0].mask).toBeUndefined()
    expect(JSON.stringify(result)).not.toContain('private customer')
    expect(savedManifest().status).toBe('review_ready')
    expect(JSON.stringify(writes)).not.toContain('old-source.png')
  })
  it.each(['missing', 'empty', 'ambiguous'])('does not call %s native copy complete', async (mode) => {
    const text = layer('live_text')
    text.token_bindings = ['token.price']
    const input = manifest([text])
    if (mode !== 'missing') input.tokens['token.price'] = { id: 'token.price', type: 'price', value: mode === 'empty' ? ' ' : '$100', label: 'Price', editable: true, required: true, affects_layers: [text.id] }
    if (mode === 'ambiguous') text.token_bindings.push('token.another')
    mocks.analyze.mockResolvedValue(input)
    const result = await runDissectionPipeline(null, 'job', { attemptId: 'initial' })
    expect(result.status).toBe('review_ready')
    expect(result.layers[0].extraction_status).toBe('unresolved')
  })
  it('keeps extracted assets and native copy for review when the model omits the background', async () => {
    const text = layer('live_text')
    text.token_bindings = ['token.brand']
    const input = manifest([text, layer('logo')])
    input.tokens['token.brand'] = { id: 'token.brand', type: 'brand', value: 'Approved fixture', label: 'Brand', editable: true, required: true, affects_layers: [text.id] }
    mocks.analyze.mockResolvedValue(input)
    const result = await runDissectionPipeline(null, 'job', { attemptId: 'initial' })
    expect(result.status).toBe('review_ready')
    expect(result.warnings?.join(' ')).toMatch(/background.*missing|no.*background/i)
    expect(result.layers).toHaveLength(2)
    expect(result.layers.some(l => l.type === 'background')).toBe(false)
    expect(result.layers.every(l => l.extraction_status === 'extracted')).toBe(true)
    expect(result.layers.every(l => l.mask === undefined)).toBe(true)
    expect(savedManifest()).toMatchObject({ layers: result.layers, status: result.status })
  })
  it('persists failure without provider/customer error text or a fabricated manifest', async () => {
    mocks.analyze.mockRejectedValue(new Error('private customer text'))
    await expect(runDissectionPipeline(null, 'job', { attemptId: 'initial' })).rejects.toThrow()
    expect(record.status).toBe('failed')
    expect(JSON.stringify(writes)).not.toContain('private customer text')
    expect(record.manifest.layers).toBeUndefined()
  })
  it('rejects unknown image dimensions instead of assuming a 300 by 250 canvas', async () => {
    mocks.download.mockResolvedValue({ size: 10, body: new Blob(['bad source']).stream() })
    mocks.analyze.mockResolvedValue(manifest([layer('logo')]))
    await expect(runDissectionPipeline(null, 'job', { attemptId: 'initial' })).rejects.toThrow(/image|dimensions/i)
    expect(record.status).toBe('failed')
  })

  it('duplicate delivery while analysis is in flight does not call a provider twice', async () => {
    let resolve!: (value: DissectorManifest) => void
    mocks.analyze.mockImplementation(() => new Promise((r) => {
      resolve = r
    }))
    const running = runDissectionPipeline(null, 'job', { attemptId: 'initial' })
    await vi.waitFor(() => expect(mocks.analyze).toHaveBeenCalledTimes(1))
    expect(await runDissectionPipeline(null, 'job', { attemptId: 'initial' })).toMatchObject({ status: 'analyzing' })
    expect(mocks.analyze).toHaveBeenCalledTimes(1)
    resolve(manifest([layer('logo')]))
    await running
    expect(record.status).toBe('review_ready')
  })

  it('cancelling an in-flight analysis discards its late result', async () => {
    let resolve!: (value: DissectorManifest) => void
    mocks.analyze.mockImplementation(() => new Promise((r) => {
      resolve = r
    }))
    const running = runDissectionPipeline(null, 'job', { attemptId: 'initial' })
    await vi.waitFor(() => expect(mocks.analyze).toHaveBeenCalled())
    record.status = 'cancelled'
    resolve(manifest([layer('logo')]))
    expect(await running).toMatchObject({ status: 'cancelled' })
    expect(mocks.segment).not.toHaveBeenCalled()
    expect(record.status).toBe('cancelled')
  })

  it('a replacement attempt cannot be overwritten by an old attempt or old queued generation', async () => {
    let resolve!: (value: DissectorManifest) => void
    mocks.analyze.mockImplementationOnce(() => new Promise((r) => {
      resolve = r
    })).mockResolvedValue(manifest([layer('logo')]))
    const stale = runDissectionPipeline(null, 'job', { attemptId: 'initial' })
    await vi.waitFor(() => expect(mocks.analyze).toHaveBeenCalledTimes(1))
    // A separate admission reserves the replacement; execution never creates it.
    record.status = 'queued'
    record.manifest = { execution: { attemptId: 'replacement', attempt: 2, maxAttempts: 3, stage: 'queued' } }
    await runDissectionPipeline(null, 'job', { attemptId: 'replacement' })
    const newest = structuredClone(record)
    resolve(manifest([layer('background')]))
    await stale
    await runDissectionPipeline(null, 'job', { attemptId: 'initial' })
    expect(record).toEqual(newest)
    expect(record.manifest.execution.attempt).toBe(2)
    expect(mocks.analyze).toHaveBeenCalledTimes(2)
  })

  it('strips model-controlled execution and import authority', async () => {
    mocks.analyze.mockResolvedValue({ ...manifest([layer('logo')]), execution: { attempt: 200, attemptId: 'spoof' }, importReceipt: { projectId: 'spoof' } })
    await runDissectionPipeline(null, 'job', { attemptId: 'initial' })
    expect(record.manifest.execution.attemptId).toBe('initial')
    expect(record.manifest.execution.attempt).toBe(1)
    expect(record.manifest.importReceipt).toBeUndefined()
  })
})

describe('Hosted Dissector binding bridge', () => {
  function hosted() {
    for (const key of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']) vi.stubEnv(key, '')
    const objects = new Map<string, Uint8Array>()
    const bucket = {
      get: vi.fn(async () => ({ size: source.length, body: new Blob([source]).stream() })),
      put: vi.fn(async (key: string, bytes: Uint8Array) => { objects.set(key, bytes) }),
      head: vi.fn(async (key: string) => ({ size: objects.get(key)?.byteLength })),
      delete: vi.fn(async (key: string) => { objects.delete(key) })
    }
    const event = { context: { cloudflare: { env: { MEDIA_BUCKET: bucket, RENDER_LINK_SECRET: 's'.repeat(32), APP_URL: 'https://app.xeroflow.io' } } } }
    mocks.analyze.mockResolvedValue(manifest([layer('logo')]))
    return { bucket, event, objects }
  }
  it('executes the actual queue branch using native storage without process credentials', async () => {
    const { event, bucket, objects } = hosted()
    const { processJob } = await import('../../server/utils/queueConsumer')
    await processJob({ type: 'dissect.analyze', payload: { jobId: 'job', attemptId: 'initial', _event: { spoof: true } }, enqueuedAt: new Date().toISOString() }, event as never)
    expect(record.status).toBe('review_ready')
    expect(bucket.get).toHaveBeenCalledWith('banner-dissector/job/original.png')
    expect(mocks.analyze).toHaveBeenCalledWith(event, source.toString('base64'), undefined)
    expect(mocks.segment.mock.calls[0][0]).toBe(event)
    expect(objects.size).toBe(1)
    expect(savedManifest().layers[0].asset_path).toMatch(/^banner-assets\/11111111-1111-4111-8111-111111111111\//)
    expect(savedManifest().layers[0].r2_url).toMatch(/^https:\/\/app.xeroflow.io\/api\/public\/banner-assets\/v1\./)
    expect(writes.some(w => w.sql.includes('INSERT INTO banner_assets') && w.args.includes(record.user_id))).toBe(true)
    expect(mocks.download).not.toHaveBeenCalled()
    expect(mocks.upload).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
    expect(process.env.R2_ACCESS_KEY_ID).toBe('')
  })
  it.each(['banner-dissector/other/original.png', 'https://127.0.0.1/source.png', 'banner-dissector/job/original.png/../../secret'])('rejects source outside the exact job source contract: %s', async (key) => {
    const { event, bucket } = hosted()
    record.source_r2_key = key
    await expect(runDissectionPipeline(event as never, 'job', { attemptId: 'initial' })).rejects.toThrow()
    expect(bucket.get).not.toHaveBeenCalled()
    expect(mocks.analyze).not.toHaveBeenCalled()
  })
  it.each(['missing', 'overstated', 'stream-overflow', 'truncated'])('rejects invalid native source bytes: %s', async (mode) => {
    const { event, bucket } = hosted()
    if (mode === 'missing') bucket.get.mockResolvedValue(null as never)
    else bucket.get.mockResolvedValue({ size: mode === 'overstated' ? 11 * 1024 * 1024 : source.length,
      body: new Blob([mode === 'stream-overflow' ? new Uint8Array(10 * 1024 * 1024 + 1) : mode === 'truncated' ? source.subarray(1) : source]).stream() })
    await expect(runDissectionPipeline(event as never, 'job', { attemptId: 'initial' })).rejects.toThrow()
    expect(mocks.analyze).not.toHaveBeenCalled()
  })
  it('never falls back to process storage when a hosted bucket is missing', async () => {
    const { event } = hosted()
    delete (event.context.cloudflare.env as Partial<typeof event.context.cloudflare.env>).MEDIA_BUCKET
    await expect(runDissectionPipeline(event as never, 'job', { attemptId: 'initial' })).rejects.toThrow()
    expect(mocks.download).not.toHaveBeenCalled()
  })
  it('discards and removes a cutout when cancellation arrives during native persistence', async () => {
    const { event, bucket, objects } = hosted()
    bucket.head.mockImplementation(async (key: string) => {
      record.status = 'cancelled'
      return { size: objects.get(key)?.byteLength }
    })
    expect(await runDissectionPipeline(event as never, 'job', { attemptId: 'initial' })).toMatchObject({ status: 'cancelled' })
    expect(objects.size).toBe(0)
    expect(writes.some(w => w.sql.includes('INSERT INTO banner_assets'))).toBe(false)
  })
  it('does not publish or retain a native cutout when catalogue persistence fails', async () => {
    const { event, objects } = hosted()
    mocks.execute.mockRejectedValue(new Error('private database error'))
    await runDissectionPipeline(event as never, 'job', { attemptId: 'initial' })
    expect(objects.size).toBe(0)
    expect(savedManifest().layers[0].extraction_status).toBe('unresolved')
    expect(savedManifest().layers[0].r2_url).toBeUndefined()
    expect(JSON.stringify(savedManifest())).not.toContain('private database')
  })
  it('rejects oversized extracted bytes before writing a native object', async () => {
    const { event, objects } = hosted()
    mocks.segment.mockResolvedValue(Buffer.alloc(10 * 1024 * 1024 + 1))
    await runDissectionPipeline(event as never, 'job', { attemptId: 'initial' })
    expect(objects.size).toBe(0)
    expect(savedManifest().layers[0].extraction_status).toBe('unresolved')
  })
  it('keeps an unpersisted native cutout unresolved and uncatalogued', async () => {
    const { event, bucket } = hosted()
    bucket.head.mockResolvedValue({ size: 0 })
    await runDissectionPipeline(event as never, 'job', { attemptId: 'initial' })
    expect(savedManifest().layers[0].extraction_status).toBe('unresolved')
    expect(writes.some(w => w.sql.includes('INSERT INTO banner_assets'))).toBe(false)
  })
})
