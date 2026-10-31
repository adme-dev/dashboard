import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type TestEvent = {
  query?: Record<string, string>
  params?: Record<string, string>
  headers?: Record<string, string>
  body?: ReadableStream | null
  json?: unknown
  context?: Record<string, unknown>
  status?: number
}
type TestHandler = (event: TestEvent) => unknown
type TestGlobals = typeof globalThis & {
  defineEventHandler: (handler: TestHandler) => TestHandler
  getQuery: (event: TestEvent) => Record<string, string>
  getRouterParam: (event: TestEvent, name: string) => string | undefined
  getHeader: (event: TestEvent, name: string) => string | undefined
  readBody: (event: TestEvent) => Promise<unknown>
  setResponseStatus: (event: TestEvent, status: number) => void
  createError: (input: { statusMessage: string, statusCode?: number }) => Error
  FixedLengthStream?: unknown
}

const g = globalThis as TestGlobals
g.defineEventHandler = handler => handler
g.getQuery = event => event.query ?? {}
g.getRouterParam = (event, name) => event.params?.[name]
g.getHeader = (event, name) => event.headers?.[name]
g.readBody = async event => event.json
g.setResponseStatus = (event, status) => {
  event.status = status
}
g.createError = input => Object.assign(new Error(input.statusMessage), input)

vi.mock('h3', async original => ({
  ...(await original<typeof import('h3')>()),
  getRequestWebStream: (event: TestEvent) => event.body
}))

const requireAuth = vi.fn()
const requireWriteAccess = vi.fn()
vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => requireAuth(...args),
  requireWriteAccess: (...args: unknown[]) => requireWriteAccess(...args)
}))

const queryOneFresh = vi.fn()
const queryFresh = vi.fn()
const execute = vi.fn()
vi.mock('~~/server/utils/db', () => ({
  queryOneFresh: (...args: unknown[]) => queryOneFresh(...args),
  queryFresh: (...args: unknown[]) => queryFresh(...args),
  execute: (...args: unknown[]) => execute(...args)
}))

const clientAccess = vi.fn()
const allClientAccess = vi.fn()
vi.mock('~~/server/utils/social/clientAccess', () => ({
  requireSocialClientAccess: (...args: unknown[]) => clientAccess(...args),
  hasAllSocialClientAccess: (...args: unknown[]) => allClientAccess(...args)
}))

const {
  SOURCE_ARCHIVE_MAX_BYTES,
  isSourceArchiveKey,
  parseSourceArchiveMetadata,
  sourceArchiveKey,
  storeSourceArchive
} = await import('~~/server/utils/banner/sourceArchives')
const { default: upload } = await import('~~/server/api/agency/banner-studio/source-archives/index.post')
const { default: list } = await import('~~/server/api/agency/banner-studio/source-archives/index.get')
const { default: patch } = await import('~~/server/api/agency/banner-studio/source-archives/[id].patch')
const { default: download } = await import('~~/server/api/agency/banner-studio/source-archives/[id]/download.get')

const CLIENT = '11111111-1111-4111-8111-111111111111'
const OTHER_CLIENT = '33333333-3333-4333-8333-333333333333'
const PROJECT = '22222222-2222-4222-8222-222222222222'
const ARCHIVE_ID = '44444444-4444-4444-8444-444444444444'
const ZIP = new Uint8Array([0x50, 0x4B, 0x03, 0x04, 1, 2, 3, 4, 5, 6])
const SHA = createHash('sha256').update(ZIP).digest('hex')

function stream(bytes: Uint8Array) {
  return new Response(bytes).body
}

function bucket() {
  const objects = new Map<string, Uint8Array>()
  return {
    objects,
    put: vi.fn(async (key: string, value: Uint8Array | ReadableStream, options?: { sha256?: string }) => {
      const bytes = value instanceof Uint8Array ? value : new Uint8Array(await new Response(value).arrayBuffer())
      if (options?.sha256 && createHash('sha256').update(bytes).digest('hex') !== options.sha256) {
        throw new Error('put: The SHA-256 checksum you specified did not match what we received.')
      }
      objects.set(key, bytes)
    }),
    head: vi.fn(async (key: string) => objects.has(key) ? { size: objects.get(key)!.byteLength } : null),
    get: vi.fn(async (key: string) => objects.has(key)
      ? { size: objects.get(key)!.byteLength, httpEtag: '"etag"', body: stream(objects.get(key)!) }
      : null)
  }
}

function query(overrides: Record<string, string> = {}) {
  return {
    sha256: SHA,
    bytes: String(ZIP.byteLength),
    clientId: CLIENT,
    designHash: 'q1gd37z',
    childHash: 'n17ylnq',
    filename: 'Design-1200x1200-px.zip',
    folderPath: 'KIA',
    sizeLabel: '1200x1200',
    status: 'held',
    holdReason: 'Unsupported layer type: video',
    ...overrides
  }
}

function uploadEvent(overrides: Record<string, string> = {}, bytes = ZIP, r2 = bucket()) {
  return {
    r2,
    event: {
      query: query(overrides),
      headers: {},
      body: stream(bytes),
      context: { cloudflare: { env: { MEDIA_BUCKET: r2 } } }
    } as TestEvent
  }
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: ARCHIVE_ID,
    clientId: CLIENT,
    designHash: 'q1gd37z',
    childHash: 'n17ylnq',
    sha256: SHA,
    bytes: ZIP.byteLength,
    filename: 'Design-1200x1200-px.zip',
    r2Key: `thebrief-sources/${CLIENT}/q1gd37z/${SHA}.zip`,
    projectId: null,
    status: 'held',
    holdReason: null,
    ...overrides
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  delete g.FixedLengthStream
  requireAuth.mockResolvedValue({ id: 'user-1' })
  requireWriteAccess.mockResolvedValue({ id: 'user-1' })
  clientAccess.mockReset().mockResolvedValue({ id: 'user-1' })
  allClientAccess.mockReset().mockReturnValue(false)
  queryOneFresh.mockReset()
  queryFresh.mockReset().mockResolvedValue([])
  execute.mockReset().mockResolvedValue(1)
})

describe('source archive key layout', () => {
  it('is content-addressed under a private client or unassigned prefix', () => {
    expect(sourceArchiveKey(CLIENT, 'q1gd37z', SHA)).toBe(`thebrief-sources/${CLIENT}/q1gd37z/${SHA}.zip`)
    expect(sourceArchiveKey(null, 'q1gd37z', SHA)).toBe(`thebrief-sources/unassigned/q1gd37z/${SHA}.zip`)
    expect(isSourceArchiveKey(sourceArchiveKey(null, 'q1gd37z', SHA))).toBe(true)
  })

  it('rejects traversal and malformed segments', () => {
    expect(() => sourceArchiveKey(CLIENT, '../x', SHA)).toThrow()
    expect(() => sourceArchiveKey('not-a-uuid', 'q1gd37z', SHA)).toThrow()
    expect(() => sourceArchiveKey(CLIENT, 'q1gd37z', 'ABC')).toThrow()
    expect(isSourceArchiveKey(`banner-assets/${CLIENT}/q1gd37z/${SHA}.zip`)).toBe(false)
    expect(isSourceArchiveKey(`thebrief-sources/${CLIENT}/q1gd37z/../${SHA}.zip`)).toBe(false)
  })
})

describe('source archive metadata', () => {
  it('bounds the declared size at 64 MB', () => {
    expect(() => parseSourceArchiveMetadata(query({ bytes: String(SOURCE_ARCHIVE_MAX_BYTES + 1) })))
      .toThrow(expect.objectContaining({ statusCode: 413 }))
    expect(parseSourceArchiveMetadata(query({ bytes: String(SOURCE_ARCHIVE_MAX_BYTES) })).bytes).toBe(SOURCE_ARCHIVE_MAX_BYTES)
  })

  it('rejects unsafe filenames and requires a project for imported archives', () => {
    expect(() => parseSourceArchiveMetadata(query({ filename: '../x.zip' }))).toThrow(expect.objectContaining({ statusCode: 400 }))
    expect(() => parseSourceArchiveMetadata(query({ filename: 'x.html' }))).toThrow(expect.objectContaining({ statusCode: 400 }))
    expect(() => parseSourceArchiveMetadata(query({ status: 'imported' }))).toThrow(expect.objectContaining({ statusCode: 400 }))
    expect(parseSourceArchiveMetadata(query({ status: 'imported', projectId: PROJECT })).projectId).toBe(PROJECT)
  })
})

describe('storeSourceArchive', () => {
  const metadata = { sha256: SHA, bytes: ZIP.byteLength, designHash: 'q1gd37z' }

  it('verifies the SHA-256 server-side before writing (buffered path)', async () => {
    const r2 = bucket()
    const wrong = new Uint8Array([...ZIP.slice(0, -1), 99])
    await expect(storeSourceArchive(r2, 'k', stream(wrong)!, metadata)).rejects.toMatchObject({ statusCode: 422 })
    expect(r2.put).not.toHaveBeenCalled()
  })

  it('rejects bodies larger or smaller than declared, and non-ZIP bodies', async () => {
    await expect(storeSourceArchive(bucket(), 'k', stream(new Uint8Array([...ZIP, 0]))!, metadata)).rejects.toMatchObject({ statusCode: 413 })
    await expect(storeSourceArchive(bucket(), 'k', stream(ZIP.slice(0, 6))!, metadata)).rejects.toMatchObject({ statusCode: 422 })
    const notZip = new Uint8Array([0x3C, 0x68, 0x74, 0x6D, 1, 2, 3, 4, 5, 6])
    await expect(storeSourceArchive(bucket(), 'k', stream(notZip)!, metadata)).rejects.toMatchObject({ statusCode: 400 })
  })

  it('streams through FixedLengthStream with the R2 sha256 check on Workers', async () => {
    g.FixedLengthStream = class {
      readable: ReadableStream
      writable: WritableStream
      constructor() {
        const pair = new TransformStream()
        this.readable = pair.readable
        this.writable = pair.writable
      }
    }
    const r2 = bucket()
    await storeSourceArchive(r2, 'k', stream(ZIP)!, metadata)
    expect(r2.put.mock.calls[0]?.[1]).toBeInstanceOf(ReadableStream)
    expect(r2.put.mock.calls[0]?.[2]).toMatchObject({ sha256: SHA })

    const wrong = new Uint8Array([...ZIP.slice(0, -1), 99])
    await expect(storeSourceArchive(bucket(), 'k2', stream(wrong)!, metadata)).rejects.toMatchObject({ statusCode: 422 })
  })
})

type Stored = Record<string, unknown> & { id: string, clientId: string | null, designHash: string, sha256: string, storedAt: string | null }

/** In-memory banner_source_archives honouring the (client, design, SHA-256) identity index. */
function fakeDb(options: { projectClient?: string | null, failComplete?: number } = {}) {
  const rows: Stored[] = []
  let failComplete = options.failComplete ?? 0
  const identityOf = (params: unknown[]) => rows.find(item =>
    item.clientId === (params[0] ?? null) && item.designHash === params[1] && item.sha256 === params[2])
  queryOneFresh.mockImplementation(async (sql: string, params: unknown[]) => {
    if (sql.includes('FROM banner_projects')) return options.projectClient === undefined ? null : { clientId: options.projectClient }
    if (sql.includes('INSERT INTO banner_source_archives')) {
      if (identityOf(params)) return null
      const created: Stored = {
        id: `archive-${rows.length + 1}`, clientId: (params[0] as string | null) ?? null, designHash: params[1] as string,
        sha256: params[2] as string, r2Key: params[3] as string, storedAt: null
      }
      rows.push(created)
      return { ...created }
    }
    if (sql.includes('UPDATE banner_source_archives')) {
      if (failComplete > 0) {
        failComplete -= 1
        throw new Error('connection terminated')
      }
      const found = rows.find(item => item.id === params[0])
      if (!found) return null
      found.storedAt ??= '2026-10-31T00:00:00Z'
      return { ...found }
    }
    if (sql.includes('source_design_hash = $2 AND sha256 = $3')) {
      const found = identityOf(params)
      return found ? { ...found } : null
    }
    throw new Error(`unexpected SQL: ${sql}`)
  })
  execute.mockImplementation(async (sql: string, params: unknown[]) => {
    if (!sql.startsWith('DELETE')) throw new Error(`unexpected SQL: ${sql}`)
    const at = rows.findIndex(item => item.id === params[0] && item.storedAt === null)
    if (at >= 0) rows.splice(at, 1)
    return at >= 0 ? 1 : 0
  })
  return rows
}

describe('POST /source-archives', () => {
  it('reserves the row before writing R2, then completes it', async () => {
    const rows = fakeDb()
    const { event, r2 } = uploadEvent()
    r2.put.mockImplementation(async (key: string, value: Uint8Array) => {
      expect(rows).toHaveLength(1)
      expect(rows[0]!.storedAt).toBeNull()
      r2.objects.set(key, value)
    })
    const result = await upload(event) as { alreadyPresent: boolean }
    expect(result.alreadyPresent).toBe(false)
    expect(event.status).toBe(201)
    expect([...r2.objects.keys()]).toEqual([`thebrief-sources/${CLIENT}/q1gd37z/${SHA}.zip`])
    expect(rows[0]!.storedAt).not.toBeNull()
    expect(clientAccess).toHaveBeenCalledWith(event, CLIENT)
  })

  it('is idempotent by client, design and SHA-256 and never stores the body again', async () => {
    fakeDb()
    await upload(uploadEvent().event)
    const { event, r2 } = uploadEvent()
    await expect(upload(event)).resolves.toMatchObject({ alreadyPresent: true })
    expect(r2.put).not.toHaveBeenCalled()
  })

  it('keeps identical bytes for different clients or designs as separate archives', async () => {
    const rows = fakeDb()
    const first = uploadEvent()
    const otherClient = uploadEvent({ clientId: OTHER_CLIENT })
    const otherDesign = uploadEvent({ designHash: 'z2ke50n' })
    for (const { event } of [first, otherClient, otherDesign]) {
      await expect(upload(event)).resolves.toMatchObject({ alreadyPresent: false })
    }
    expect(rows.map(item => `${item.clientId}/${item.designHash}`)).toEqual([
      `${CLIENT}/q1gd37z`, `${OTHER_CLIENT}/q1gd37z`, `${CLIENT}/z2ke50n`
    ])
    expect(new Set(rows.map(item => item.r2Key)).size).toBe(3)
    expect([...otherClient.r2.objects.keys()]).toEqual([`thebrief-sources/${OTHER_CLIENT}/q1gd37z/${SHA}.zip`])
    expect([...otherDesign.r2.objects.keys()]).toEqual([`thebrief-sources/${CLIENT}/z2ke50n/${SHA}.zip`])
  })

  it('never leaves an R2 object without a row when recording fails, and a retry completes it', async () => {
    const rows = fakeDb({ failComplete: 1 })
    const r2 = bucket()
    const failed = uploadEvent({}, ZIP, r2)
    await expect(upload(failed.event)).rejects.toThrow('connection terminated')
    expect(r2.objects.size).toBe(1)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ r2Key: [...r2.objects.keys()][0], storedAt: null })

    const retry = uploadEvent({}, ZIP, r2)
    await expect(upload(retry.event)).resolves.toMatchObject({ alreadyPresent: false, archive: { id: rows[0]!.id } })
    expect(rows).toHaveLength(1)
    expect(rows[0]!.storedAt).not.toBeNull()
  })

  it('never writes R2 when the reservation insert fails', async () => {
    fakeDb()
    const insertFailure = queryOneFresh.getMockImplementation()!
    queryOneFresh.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes('INSERT INTO banner_source_archives')) throw new Error('database unavailable')
      return insertFailure(sql, params)
    })
    const { event, r2 } = uploadEvent()
    await expect(upload(event)).rejects.toThrow('database unavailable')
    expect(r2.put).not.toHaveBeenCalled()
  })

  it('releases its own reservation when R2 rejects the bytes', async () => {
    const rows = fakeDb()
    const { event, r2 } = uploadEvent({}, new Uint8Array([...ZIP.slice(0, -1), 99]))
    await expect(upload(event)).rejects.toMatchObject({ statusCode: 422 })
    expect(r2.objects.size).toBe(0)
    expect(rows).toHaveLength(0)
  })

  it('keeps the reservation when the R2 outcome is unknown', async () => {
    const rows = fakeDb()
    const { event, r2 } = uploadEvent()
    r2.put.mockRejectedValue(new Error('network reset'))
    await expect(upload(event)).rejects.toThrow('network reset')
    expect(rows).toHaveLength(1)
    expect(execute).not.toHaveBeenCalled()
  })

  it('completes a reservation another upload left behind', async () => {
    const rows = fakeDb()
    rows.push({ id: 'archive-old', clientId: CLIENT, designHash: 'q1gd37z', sha256: SHA, r2Key: `thebrief-sources/${CLIENT}/q1gd37z/${SHA}.zip`, storedAt: null })
    const { event, r2 } = uploadEvent()
    await expect(upload(event)).resolves.toMatchObject({ alreadyPresent: false, archive: { id: 'archive-old' } })
    expect(r2.objects.size).toBe(1)
  })

  it('requires client access before touching the database or R2', async () => {
    clientAccess.mockRejectedValue(Object.assign(new Error('No access'), { statusCode: 403 }))
    const { event, r2 } = uploadEvent()
    await expect(upload(event)).rejects.toMatchObject({ statusCode: 403 })
    expect(queryOneFresh).not.toHaveBeenCalled()
    expect(r2.put).not.toHaveBeenCalled()
  })

  it('requires all-client access for unassigned archives', async () => {
    const { event } = uploadEvent({ clientId: '' })
    await expect(upload(event)).rejects.toMatchObject({ statusCode: 403 })
    allClientAccess.mockReturnValue(true)
    fakeDb()
    const second = uploadEvent({ clientId: '' })
    await upload(second.event)
    expect([...second.r2.objects.keys()]).toEqual([`thebrief-sources/unassigned/q1gd37z/${SHA}.zip`])
  })

  it('rejects read-only users', async () => {
    requireWriteAccess.mockRejectedValue(Object.assign(new Error('Read-only'), { statusCode: 403 }))
    await expect(upload(uploadEvent().event)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('rejects oversized declarations and mismatched Content-Length before reading the body', async () => {
    const big = uploadEvent({ bytes: String(SOURCE_ARCHIVE_MAX_BYTES + 1) })
    await expect(upload(big.event)).rejects.toMatchObject({ statusCode: 413 })
    const lying = uploadEvent()
    lying.event.headers = { 'content-length': '999' }
    await expect(upload(lying.event)).rejects.toMatchObject({ statusCode: 400 })
    expect(queryOneFresh).not.toHaveBeenCalled()
    expect(big.r2.put).not.toHaveBeenCalled()
    expect(lying.r2.put).not.toHaveBeenCalled()
  })

  it('rejects a project that belongs to another client before reserving', async () => {
    const rows = fakeDb({ projectClient: OTHER_CLIENT })
    const { event, r2 } = uploadEvent({ projectId: PROJECT, status: 'imported' })
    await expect(upload(event)).rejects.toMatchObject({ statusCode: 400 })
    expect(rows).toHaveLength(0)
    expect(r2.put).not.toHaveBeenCalled()
  })
})

describe('GET /source-archives', () => {
  it('scopes a client listing to client access', async () => {
    const event = { query: { clientId: CLIENT, designHash: 'q1gd37z' } }
    await list(event)
    expect(clientAccess).toHaveBeenCalledWith(event, CLIENT)
    expect(queryFresh.mock.calls[0]?.[1]).toEqual([CLIENT, 'q1gd37z', 200])
    expect(queryFresh.mock.calls[0]?.[0]).toContain('stored_at IS NOT NULL')
  })

  it('lists unconfirmed reservations only on request', async () => {
    await list({ query: { clientId: CLIENT, reserved: 'true' } })
    expect(queryFresh.mock.calls[0]?.[0]).toContain('stored_at IS NULL')
    expect(queryFresh.mock.calls[0]?.[0]).not.toContain('stored_at IS NOT NULL')
  })

  it('requires all-client access to list across clients or unassigned', async () => {
    await expect(list({ query: {} })).rejects.toMatchObject({ statusCode: 403 })
    await expect(list({ query: { clientId: 'unassigned' } })).rejects.toMatchObject({ statusCode: 403 })
    allClientAccess.mockReturnValue(true)
    await list({ query: { sha256: SHA } })
    expect(queryFresh.mock.calls[0]?.[1]).toEqual([SHA, 200])
  })
})

describe('PATCH /source-archives/:id', () => {
  it('links a project of the same client and marks it imported', async () => {
    queryOneFresh
      .mockResolvedValueOnce(row())
      .mockResolvedValueOnce({ clientId: CLIENT })
      .mockResolvedValueOnce(row({ projectId: PROJECT, status: 'imported' }))
    await expect(patch({ params: { id: ARCHIVE_ID }, json: { projectId: PROJECT, status: 'imported' } }))
      .resolves.toMatchObject({ archive: { projectId: PROJECT } })
    expect(queryOneFresh.mock.calls[2]?.[1]).toEqual([ARCHIVE_ID, CLIENT, PROJECT, 'imported', null, CLIENT])
  })

  it('rejects linking a project owned by another client', async () => {
    queryOneFresh.mockResolvedValueOnce(row()).mockResolvedValueOnce({ clientId: OTHER_CLIENT })
    await expect(patch({ params: { id: ARCHIVE_ID }, json: { projectId: PROJECT } })).rejects.toMatchObject({ statusCode: 400 })
  })

  it('does not reassign an archive that already has a client', async () => {
    queryOneFresh.mockResolvedValueOnce(row())
    await expect(patch({ params: { id: ARCHIVE_ID }, json: { clientId: OTHER_CLIENT } })).rejects.toMatchObject({ statusCode: 409 })
  })
})

describe('GET /source-archives/:id/download', () => {
  it('streams privately to authorised staff only', async () => {
    const r2 = bucket()
    r2.objects.set(row().r2Key, ZIP)
    const context = { cloudflare: { env: { MEDIA_BUCKET: r2 } } }
    queryOneFresh.mockResolvedValueOnce(row())
    const response = await download({ params: { id: ARCHIVE_ID }, context }) as Response
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('content-disposition')).toContain('attachment;')
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(ZIP)

    queryOneFresh.mockResolvedValueOnce(row())
    clientAccess.mockRejectedValue(Object.assign(new Error('No access'), { statusCode: 403 }))
    await expect(download({ params: { id: ARCHIVE_ID }, context })).rejects.toMatchObject({ statusCode: 403 })
  })

  it('refuses rows whose key is outside the private prefix', async () => {
    queryOneFresh.mockResolvedValueOnce(row({ r2Key: 'banner-assets/x/y.zip' }))
    await expect(download({ params: { id: ARCHIVE_ID }, context: {} })).rejects.toMatchObject({ statusCode: 404 })
  })
})
