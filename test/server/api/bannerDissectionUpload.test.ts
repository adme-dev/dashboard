import type { DissectionRecord } from '../../../server/utils/banner/dissectionJobs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PNG } from 'pngjs'
import { encode as encodeJpeg } from 'jpeg-js'
import { createHash } from 'node:crypto'

const sourcePng = new PNG({ width: 2, height: 2 })
sourcePng.data.fill(255)
const sourceImage = PNG.sync.write(sourcePng)

const capability = vi.hoisted(() => ({ enabled: true }))
vi.mock('../../../shared/bannerDissectionCapabilities', () => ({ get SCOPED_DISSECTION_ADMISSION_ENABLED() { return capability.enabled } }))
const m = vi.hoisted(() => ({ auth: vi.fn(), execute: vi.fn(), query: vi.fn(), upload: vi.fn(), pipeline: vi.fn(), multipart: vi.fn(), queued: vi.fn(), start: vi.fn(), finish: vi.fn(), resolveOwner: vi.fn(), authorize: vi.fn(), boundedBody: vi.fn(), transaction: vi.fn() }))
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('readMultipartFormData', m.multipart)
vi.mock('~~/server/utils/auth', () => ({ requireWriteAccess: m.auth }))
vi.mock('~~/server/utils/db', () => ({ execute: m.execute, queryOneFresh: m.query, transactionWithoutRetry: m.transaction }))
vi.mock('~~/server/utils/banner/dissectionAccess', () => ({ resolveDissectionOwner: m.resolveOwner, assertDissectionAccess: m.authorize }))
vi.mock('~~/server/runtime/banner-dissection-pages-guard', () => ({ ensureBoundedDissectionUploadBody: m.boundedBody }))
vi.mock('~~/server/utils/storage', () => ({ uploadFile: m.upload }))
vi.mock('~~/server/utils/jobExecutionLedger', () => ({ recordJobQueued: m.queued, markJobDispatchFailed: vi.fn(), startJobExecution: m.start, finishJobExecution: m.finish }))
vi.mock('~~/server/utils/bannerDissectorPipeline', () => ({ runDissectionPipeline: m.pipeline }))
const upload = (await import('../../../server/api/agency/banner-studio/dissect/upload.post')).default
let row: DissectionRecord
const nativeBucket = () => ({ put: vi.fn().mockResolvedValue({}), head: vi.fn().mockResolvedValue({ size: sourceImage.length }), delete: vi.fn() })
const hostedEnv = (extra = {}) => ({ MEDIA_BUCKET: nativeBucket(), RENDER_LINK_SECRET: 's'.repeat(32), ...extra })
const local = { path: '/', node: { req: { headers: { host: 'localhost' }, url: '/' } } }
beforeEach(() => {
  vi.resetAllMocks()
  capability.enabled = true
  m.auth.mockResolvedValue({ id: 'owner' })
  m.resolveOwner.mockResolvedValue({ owner: { kind: 'user', userId: 'owner' }, sessionsInvalidatedAt: null })
  m.authorize.mockResolvedValue(undefined)
  m.transaction.mockImplementation(async callback => callback({ query: async (sql: string, args: string[]) => {
    if (sql.includes('INSERT INTO banner_dissections')) { await m.execute(sql.trim(), args); return { rows: [] } }
    const result = await m.query(sql, args); return { rows: result ? [result] : [] }
  } }))
  m.multipart.mockResolvedValue([{ name: 'file', type: 'image/png', data: sourceImage }])
  m.upload.mockResolvedValue({ url: 'https://fixture.invalid/source.png' })
  m.execute.mockImplementation(async (_sql, args: string[]) => {
    if (_sql.startsWith('INSERT INTO banner_dissections')) row = { job_id: args[0], user_id: args[1], status: 'queued', manifest: JSON.parse(args[4]) }
  })
  // Only models the DB boundary needed for upload; actual CAS is proved in PostgreSQL.
  m.query.mockImplementation(async (sql, args) => {
    if (sql.startsWith('SELECT')) return row
    if (sql.includes('\'state\', \'leased\'')) {
      Object.assign(row.manifest!.execution!.dispatch!, { state: 'leased', leaseToken: 'transport', sendCount: 1, lastSentAt: new Date().toISOString() })
      return row
    }
    if (sql.includes('\'state\', $4::text')) {
      row.manifest!.execution!.dispatch!.state = args[3]
      return row
    }
    if (sql.includes('error = $3')) {
      row.status = 'failed'
      row.error = args[2]
      return row
    }
    return null
  })
  m.start.mockResolvedValue({ executionId: 'execution' })
})

describe('Dissection upload using the shared dispatcher (local mocked DB)', () => {
  it('persists queued state before delivery and binds the queue message to its generation', async () => {
    const send = vi.fn(async (job) => {
      expect(row.status).toBe('queued')
      expect(job.payload).toEqual({ jobId: row.job_id, attemptId: row.manifest!.execution!.attemptId })
    })
    expect(await upload({ ...local, context: { cloudflare: { env: hostedEnv({ JOBS_QUEUE: { send } }) } } } as never)).toMatchObject({ status: 'queued', execution: { attempt: 1, maxAttempts: 3, deadlineAt: expect.any(String) } })
    expect(send).toHaveBeenCalledTimes(1)
    const [sql, args] = m.execute.mock.calls[0]
    expect(sql).toContain('clock_timestamp()')
    expect(JSON.parse(args[4]).execution.dispatch).toMatchObject({ version: 1, state: 'pending', sendCount: 0 })
    expect(m.pipeline).not.toHaveBeenCalled()
  })
  it('returns before a registered pending analysis and retains its execution ledger', async () => {
    const tasks: Promise<unknown>[] = []
    let done!: (value: { status: string }) => void
    m.pipeline.mockImplementation(() => new Promise((resolve) => {
      done = resolve
    }))
    const response = await upload({ ...local, context: {}, waitUntil: (p: Promise<unknown>) => tasks.push(p) } as never)
    expect(response.status).toBe('queued')
    expect(tasks).toHaveLength(1)
    await vi.waitFor(() => expect(m.pipeline).toHaveBeenCalledTimes(1))
    done({ status: 'review_ready' })
    await Promise.all(tasks)
    expect(m.finish).toHaveBeenCalledWith(expect.anything(), 'succeeded', expect.any(Number))
  })
  it('persists an honest failed snapshot when no execution capability exists', async () => {
    const response = await upload({ ...local, context: {} } as never)
    expect(response.status).toBe('failed')
    expect(response.error).toMatch(/unavailable/i)
    expect(m.pipeline).not.toHaveBeenCalled()
  })
  it('never uses request fallback after queue acceptance becomes ambiguous', async () => {
    const waitUntil = vi.fn()
    const send = vi.fn().mockRejectedValue(new Error('private queue body'))
    const response = await upload({ ...local, context: { cloudflare: { env: hostedEnv({ JOBS_QUEUE: { send } }) } }, waitUntil } as never)
    expect(response.status).toBe('queued')
    expect(response.execution.dispatch).toMatchObject({ state: 'uncertain', sendCount: 1 })
    expect(JSON.stringify(response)).not.toContain('private queue body')
    expect(waitUntil).not.toHaveBeenCalled()
    expect(m.pipeline).not.toHaveBeenCalled()
  })
})

afterEach(() => vi.unstubAllEnvs())
describe('Dissection source upload native persistence', () => {
  it.each(['image/jpeg', 'image/webp'])('rejects PNG bytes labelled %s before storage or dispatch', async (mimeType) => {
    m.multipart.mockResolvedValue([{ name: 'file', type: mimeType, data: sourceImage }])
    const bucket = nativeBucket()
    const send = vi.fn()
    await expect(upload({ ...local, context: { cloudflare: { env: hostedEnv({ MEDIA_BUCKET: bucket, JOBS_QUEUE: { send } }) } } } as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(bucket.put).not.toHaveBeenCalled()
    expect(m.execute).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })
  it('validates PNG and stores the exact original with its content identity', async () => {
    const mimeType = 'image/png'
    const data = sourceImage
    m.multipart.mockResolvedValue([{ name: 'file', type: mimeType, data }])
    const bucket = nativeBucket()
    bucket.head.mockResolvedValue({ size: data.length })
    await upload({ ...local, context: { cloudflare: { env: hostedEnv({ MEDIA_BUCKET: bucket, JOBS_QUEUE: { send: vi.fn() } }) } } } as never)
    expect(Buffer.from(bucket.put.mock.calls[0][1])).toEqual(data)
    expect(JSON.parse(m.execute.mock.calls[0][1][4]).source).toEqual({
      version: 1, mimeType, byteLength: data.length, width: 2, height: 2,
      sha256: createHash('sha256').update(data).digest('hex')
    })
  })
  it.each([[2, 2], [2480, 3508]])('preserves legacy JPEG %i×%i original bytes without claiming verified source identity', async (width, height) => {
    const data = Buffer.from(encodeJpeg({ width, height, data: Buffer.alloc(width * height * 4, 255) }, 80).data)
    m.multipart.mockResolvedValue([{ name: 'file', type: 'image/jpeg', data }])
    const bucket = nativeBucket()
    bucket.head.mockResolvedValue({ size: data.length })
    await upload({ ...local, context: { cloudflare: { env: hostedEnv({ MEDIA_BUCKET: bucket, JOBS_QUEUE: { send: vi.fn() } }) } } } as never)
    expect(Buffer.from(bucket.put.mock.calls[0][1])).toEqual(data)
    expect(JSON.parse(m.execute.mock.calls[0][1][4])).not.toHaveProperty('source')
  })
  it.each([
    ['empty', Buffer.alloc(0)],
    ['declared PNG containing text', Buffer.from('not an image')],
    ['truncated PNG', sourceImage.subarray(0, 30)]
  ])('rejects %s before storage or dispatch', async (_name, data) => {
    m.multipart.mockResolvedValue([{ name: 'file', type: 'image/png', data }])
    const bucket = nativeBucket()
    bucket.head.mockResolvedValue({ size: data.length })
    const send = vi.fn()
    await expect(upload({ ...local, context: { cloudflare: { env: hostedEnv({ MEDIA_BUCKET: bucket, JOBS_QUEUE: { send } }) } } } as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(bucket.put).not.toHaveBeenCalled()
    expect(m.upload).not.toHaveBeenCalled()
    expect(m.execute).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })
  it('writes and verifies the native source before inserting or dispatching with no process credentials', async () => {
    vi.stubEnv('R2_ACCOUNT_ID', '')
    vi.stubEnv('R2_ACCESS_KEY_ID', '')
    vi.stubEnv('R2_SECRET_ACCESS_KEY', '')
    const bucket = nativeBucket()
    const send = vi.fn()
    const response = await upload({ ...local, context: { cloudflare: { env: hostedEnv({ MEDIA_BUCKET: bucket, JOBS_QUEUE: { send } }) } } } as never)
    expect(response.status).toBe('queued')
    const key = bucket.put.mock.calls[0][0]
    expect(key).toMatch(/^banner-dissector\/[a-f0-9-]+\/original.png$/)
    expect(bucket.put).toHaveBeenCalledWith(key, expect.any(Uint8Array), { httpMetadata: { contentType: 'image/png' } })
    expect(bucket.head).toHaveBeenCalledWith(key)
    expect(m.upload).not.toHaveBeenCalled()
    expect(m.execute.mock.invocationCallOrder[0]).toBeGreaterThan(bucket.head.mock.invocationCallOrder[0])
    expect(send.mock.invocationCallOrder[0]).toBeGreaterThan(m.execute.mock.invocationCallOrder[0])
  })
  it.each(['missing', 'unpersisted'])('fails before dispatch when native storage is %s', async (mode) => {
    const bucket = nativeBucket()
    bucket.head.mockResolvedValue({ size: 0 })
    const send = vi.fn()
    const env = hostedEnv({ MEDIA_BUCKET: mode === 'missing' ? undefined : bucket, JOBS_QUEUE: { send } })
    await expect(upload({ ...local, context: { cloudflare: { env } } } as never)).rejects.toThrow()
    expect(m.upload).not.toHaveBeenCalled()
    expect(m.execute).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })
})


describe('Dissection ownership admission boundary', () => {
  it('checks current ownership before source storage and again before insertion', async () => {
    const bucket = nativeBucket()
    await upload({ ...local, context: { cloudflare: { env: hostedEnv({ MEDIA_BUCKET: bucket, JOBS_QUEUE: { send: vi.fn() } }) } } } as never)
    expect(m.resolveOwner).toHaveBeenCalledTimes(2)
    expect(m.resolveOwner.mock.invocationCallOrder[0]).toBeLessThan(bucket.put.mock.invocationCallOrder[0])
    expect(m.resolveOwner.mock.invocationCallOrder[1]).toBeGreaterThan(bucket.head.mock.invocationCallOrder[0])
    expect(JSON.parse(m.execute.mock.calls[0][1][4]).ingestion).toMatchObject({ version: 1, owner: { kind: 'user', userId: 'owner' }, physical: null })
  })
  it('denies a revoked assignment before storage or sending a job', async () => {
    m.resolveOwner.mockRejectedValueOnce(Object.assign(new Error('Revoked'), { statusCode: 403 }))
    const bucket = nativeBucket(), send = vi.fn()
    await expect(upload({ ...local, context: { cloudflare: { env: hostedEnv({ MEDIA_BUCKET: bucket, JOBS_QUEUE: { send } }) } } } as never)).rejects.toMatchObject({ statusCode: 403 })
    expect(bucket.put).not.toHaveBeenCalled()
    expect(m.execute).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })
  it('rejects changed ownership between preflight and final admission', async () => {
    m.resolveOwner.mockResolvedValueOnce({ owner: { kind: 'user', userId: 'owner' }, sessionsInvalidatedAt: null })
      .mockResolvedValueOnce({ owner: { kind: 'user', userId: 'owner' }, sessionsInvalidatedAt: '2026-10-27T00:00:00.000Z' })
    const bucket = nativeBucket(), send = vi.fn()
    await expect(upload({ ...local, context: { cloudflare: { env: hostedEnv({ MEDIA_BUCKET: bucket, JOBS_QUEUE: { send } }) } } } as never)).rejects.toMatchObject({ statusCode: 409 })
    expect(bucket.put).toHaveBeenCalledOnce()
    expect(m.execute).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })
  it('rejects duplicated source parts instead of silently choosing the first', async () => {
    m.multipart.mockResolvedValue([{ name: 'file', type: 'image/png', data: sourceImage }, { name: 'file', type: 'image/png', data: sourceImage }])
    await expect(upload({ ...local, context: {} } as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(m.upload).not.toHaveBeenCalled()
    expect(m.execute).not.toHaveBeenCalled()
  })
})


describe('protected source storage admission', () => {
  it('does not fall back to a public local upload for scoped sources', async () => {
    m.resolveOwner.mockResolvedValue({ owner: { kind: 'client', userId: 'owner', clientId: 'client' }, sessionsInvalidatedAt: null })
    await expect(upload({ ...local, context: {} } as never)).rejects.toMatchObject({ statusCode: 503 })
    expect(m.upload).not.toHaveBeenCalled()
    expect(m.execute).not.toHaveBeenCalled()
  })
  it('denies assignment revocation after storage without persisting or dispatching a job', async () => {
    m.resolveOwner.mockResolvedValueOnce({ owner: { kind: 'client', userId: 'owner', clientId: 'client' }, sessionsInvalidatedAt: null })
      .mockRejectedValueOnce({ statusCode: 403 })
    const bucket = nativeBucket(), send = vi.fn()
    await expect(upload({ ...local, context: { cloudflare: { env: hostedEnv({ MEDIA_BUCKET: bucket, JOBS_QUEUE: { send } }) } } } as never)).rejects.toMatchObject({ statusCode: 403 })
    expect(bucket.put).toHaveBeenCalledOnce()
    expect(bucket.delete).not.toHaveBeenCalled()
    expect(m.execute).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })
})

it('keeps scoped admission off before ownership, storage or dispatch effects', async () => {
  capability.enabled = false
  m.multipart.mockResolvedValue([{ name: 'file', type: 'image/png', data: sourceImage }, { name: 'projectId', data: Buffer.from('11111111-1111-4111-8111-111111111111') }])
  const bucket = nativeBucket()
  await expect(upload({ ...local, context: { cloudflare: { env: hostedEnv({ MEDIA_BUCKET: bucket }) } } } as never)).rejects.toMatchObject({ statusCode: 409 })
  expect(m.resolveOwner).not.toHaveBeenCalled()
  expect(bucket.put).not.toHaveBeenCalled()
  expect(m.execute).not.toHaveBeenCalled()
})
