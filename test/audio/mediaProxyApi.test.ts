import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent { query?: Record<string, any>; params?: Record<string, string>; headers?: Record<string, string>; context?: any }
const g = globalThis as any
const headersOut: Record<string, string> = {}
let statusOut = 200
g.defineEventHandler = (fn: any) => fn
g.getRouterParam = (e: TestEvent, n: string) => e.params?.[n]
g.getQuery = (e: TestEvent) => e.query ?? {}
g.getHeader = (e: TestEvent, n: string) => e.headers?.[n.toLowerCase()]
g.setHeader = (_e: TestEvent, n: string, v: string) => { headersOut[n] = v }
g.setResponseStatus = (_e: TestEvent, code: number) => { statusOut = code }
g.sendStream = (_e: TestEvent, body: unknown) => body
g.createError = (i: { statusCode: number; statusMessage: string }) => Object.assign(new Error(i.statusMessage), i)

const mockRequireAuth = vi.fn()
vi.mock('~~/server/utils/auth', () => ({ requireAuth: (...a: unknown[]) => mockRequireAuth(...a) }))
const mockGetProject = vi.fn()
vi.mock('~~/server/utils/audio/projects', () => ({ getProjectWithCurrentTimeline: (...a: unknown[]) => mockGetProject(...a) }))
const mockRead = vi.fn()
vi.mock('~~/server/utils/storage', () => ({ readStoredObject: (...a: unknown[]) => mockRead(...a) }))

const { TimelineStateSchema } = await import('~~/server/utils/audio/timelineSchema')
const { default: handler, parseByteRange } = await import('../../server/api/agency/audio/projects/[id]/media.get')

const state = TimelineStateSchema.parse({
  tracks: [{ id: 'vo', name: 'VO', kind: 'voiceover', clips: [{ id: 'a', r2_key: 'k/a', timeline_start_sec: 0, source_out_sec: 5 }] }]
})
const timeline = { id: 't1', projectId: 'p1', version: 1, label: null, state, schemaVersion: 1, createdBy: 'u1', createdAt: '2026-06-03T00:00:00Z' }

beforeEach(() => {
  vi.clearAllMocks()
  for (const k of Object.keys(headersOut)) delete headersOut[k]
  statusOut = 200
  mockRequireAuth.mockResolvedValue({ id: 'u1' })
  mockGetProject.mockResolvedValue({ project: { id: 'p1' }, timeline })
})

describe('parseByteRange', () => {
  it('parses open, closed and suffix ranges and rejects garbage', () => {
    expect(parseByteRange('bytes=0-')).toEqual({ start: 0, end: undefined })
    expect(parseByteRange('bytes=100-199')).toEqual({ start: 100, end: 199 })
    expect(parseByteRange('bytes=-500', 1000)).toEqual({ start: 500, end: 999 })
    expect(parseByteRange('bytes=-500')).toBeNull()
    expect(parseByteRange('bytes=200-100')).toBeNull()
    expect(parseByteRange('items=1-2')).toBeNull()
    expect(parseByteRange(undefined)).toBeNull()
  })
})

describe('GET /agency/audio/projects/:id/media', () => {
  it('refuses keys that are not in the project timeline (no arbitrary R2 reads)', async () => {
    await expect(handler({ params: { id: 'p1' }, query: { key: 'k/other' } } as any)).rejects.toMatchObject({ statusCode: 404 })
    expect(mockRead).not.toHaveBeenCalled()
  })

  it('streams a whole object with cache + range headers', async () => {
    const body = new Blob(['abc']).stream()
    mockRead.mockResolvedValue({ body, contentType: 'audio/mpeg', size: 3, range: null, etag: '"x"' })
    const res = await handler({ params: { id: 'p1' }, query: { key: 'k/a' }, headers: {} } as any)
    expect(res).toBe(body)
    expect(statusOut).toBe(200)
    expect(headersOut).toMatchObject({ 'Content-Type': 'audio/mpeg', 'Accept-Ranges': 'bytes', 'Content-Length': '3', ETag: '"x"' })
    expect(mockRead.mock.calls[0]![1]).toMatchObject({ range: undefined })
  })

  it('serves a 206 partial response for Range requests so <video> can seek', async () => {
    const body = new Blob(['bc']).stream()
    mockRead.mockResolvedValue({ body, contentType: 'video/mp4', size: 3, range: { start: 1, end: 2 }, etag: null })
    await handler({ params: { id: 'p1' }, query: { key: 'k/a' }, headers: { range: 'bytes=1-2' } } as any)
    expect(statusOut).toBe(206)
    expect(headersOut['Content-Range']).toBe('bytes 1-2/3')
    expect(headersOut['Content-Length']).toBe('2')
    expect(mockRead.mock.calls[0]![1]).toMatchObject({ range: { start: 1, end: 2 } })
  })

  it('404s when the object is gone', async () => {
    mockRead.mockResolvedValue(null)
    await expect(handler({ params: { id: 'p1' }, query: { key: 'k/a' }, headers: {} } as any)).rejects.toMatchObject({ statusCode: 404 })
  })
})
