import { beforeEach, describe, expect, it, vi } from 'vitest'

type TestEvent = {
  query?: Record<string, string>
  params?: Record<string, string>
  method?: 'GET' | 'HEAD'
  headers?: Headers
  context?: Record<string, unknown>
}
type TestHandler = (event: TestEvent) => unknown
type TestGlobals = typeof globalThis & {
  defineEventHandler: (handler: TestHandler) => TestHandler
  getQuery: (event: TestEvent) => Record<string, string>
  getRouterParam: (event: TestEvent, name: string) => string | undefined
  createError: (input: { statusMessage: string, statusCode?: number }) => Error
}

const g = globalThis as TestGlobals
g.defineEventHandler = handler => handler
g.getQuery = event => event.query ?? {}
g.getRouterParam = (event, name) => event.params?.[name]
g.createError = input => Object.assign(new Error(input.statusMessage), input)

const requireAuth = vi.fn()
const queryOne = vi.fn()
const queryRows = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => requireAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => queryOne(...args),
  queryRows: (...args: unknown[]) => queryRows(...args)
}))

const { default: jobsHandler } = await import('~~/server/api/agency/banner-studio/export-video/jobs.get')
const downloadModule = await import('~~/server/api/agency/banner-studio/export-video/jobs/[id]/download.get').catch(() => ({ default: undefined }))
const downloadHandler = downloadModule.default as undefined | ((event: TestEvent) => Promise<Response>)

const JOB_ID = '11111111-1111-4111-8111-111111111111'
const PROJECT_ID = '22222222-2222-4222-8222-222222222222'
const KEY = `banner-videos/${PROJECT_ID}/leaderboard_${JOB_ID}.mp4`

function objectBody(body = 'mp4-bytes') {
  return {
    size: 9,
    httpEtag: '"video-etag"',
    body: new Response(body).body
  }
}

function event(options: { method?: 'GET' | 'HEAD', headers?: Record<string, string>, bucket?: unknown } = {}) {
  return {
    method: options.method ?? 'GET',
    headers: new Headers(options.headers),
    params: { id: JOB_ID },
    context: {
      params: { id: JOB_ID },
      cloudflare: { env: { ...(options.bucket === undefined ? {} : { MEDIA_BUCKET: options.bucket }) } }
    }
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  requireAuth.mockResolvedValue({ id: 'user-1' })
  queryRows.mockResolvedValue([])
  queryOne.mockResolvedValue({ id: JOB_ID, project_id: PROJECT_ID, r2_key: KEY, status: 'done', format_key: 'leaderboard' })
})

describe('GET /agency/banner-studio/export-video/jobs', () => {
  it('replaces a stale public URL with the authenticated same-origin download route', async () => {
    queryRows.mockResolvedValueOnce([{
      id: JOB_ID, project_id: PROJECT_ID, format_key: 'leaderboard', width: 728, height: 90,
      fps: 30, crf: 23, quality: 1, source_r2_key: 'banner-render-jobs/source.html',
      status: 'done', url: 'https://pub-old-example.r2.dev/leaked.mp4', file_size: 71546, error: null
    }])

    await expect(jobsHandler({ query: { ids: JOB_ID } } as TestEvent)).resolves.toEqual({
      jobs: [{
        jobId: JOB_ID,
        formatKey: 'leaderboard',
        status: 'done',
        url: `/api/agency/banner-studio/export-video/jobs/${JOB_ID}/download`,
        fileSize: 71546,
        error: null
      }]
    })
  })
})

describe('GET /agency/banner-studio/export-video/jobs/:id/download', () => {
  it('streams an authenticated completed MP4 from the private R2 binding', async () => {
    const bucket = { head: vi.fn(async () => objectBody()), get: vi.fn(async () => objectBody()) }

    expect(downloadHandler).toBeTypeOf('function')
    if (!downloadHandler) return
    const response = await downloadHandler(event({ bucket }))

    expect(response.status).toBe(200)
    await expect(response.text()).resolves.toBe('mp4-bytes')
    expect(response.headers.get('content-type')).toBe('video/mp4')
    expect(response.headers.get('content-length')).toBe('9')
    expect(response.headers.get('etag')).toBe('"video-etag"')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('content-disposition')).toBe(`attachment; filename="leaderboard_${JOB_ID}.mp4"`)
    expect(queryOne).toHaveBeenCalledWith(expect.stringContaining('WHERE id = $1'), [JOB_ID])
    expect(bucket.get).toHaveBeenCalledWith(KEY, undefined)
  })

  it('serves a byte range for MP4 seeking without exposing another project key', async () => {
    const bucket = {
      head: vi.fn(async () => objectBody()),
      get: vi.fn(async () => ({ ...objectBody('4-by'), range: { offset: 2, length: 4 } }))
    }

    expect(downloadHandler).toBeTypeOf('function')
    if (!downloadHandler) return
    const response = await downloadHandler(event({ bucket, headers: { range: 'bytes=2-5' } }))

    expect(response.status).toBe(206)
    expect(response.headers.get('content-range')).toBe('bytes 2-5/9')
    expect(response.headers.get('content-length')).toBe('4')
    expect(bucket.get).toHaveBeenCalledWith(KEY, { range: { offset: 2, length: 4 } })
  })

  it('returns ranged HEAD metadata without reading the private object body', async () => {
    const bucket = { head: vi.fn(async () => objectBody()), get: vi.fn() }

    expect(downloadHandler).toBeTypeOf('function')
    if (!downloadHandler) return
    const response = await downloadHandler(event({ method: 'HEAD', bucket, headers: { range: 'bytes=2-5' } }))

    expect(response.status).toBe(206)
    expect(response.body).toBeNull()
    expect(response.headers.get('content-range')).toBe('bytes 2-5/9')
    expect(bucket.get).not.toHaveBeenCalled()
  })

  it('returns 404 without reading R2 for a job that has not completed', async () => {
    queryOne.mockResolvedValueOnce({ id: JOB_ID, project_id: PROJECT_ID, r2_key: KEY, status: 'rendering' })
    const bucket = { head: vi.fn(), get: vi.fn() }

    expect(downloadHandler).toBeTypeOf('function')
    if (!downloadHandler) return
    await expect(downloadHandler(event({ bucket }))).rejects.toMatchObject({ statusCode: 404 })
    expect(bucket.head).not.toHaveBeenCalled()
  })

  it('returns 404 without reading R2 when the completed job key does not belong to its project', async () => {
    queryOne.mockResolvedValueOnce({
      id: JOB_ID,
      project_id: PROJECT_ID,
      r2_key: 'banner-videos/33333333-3333-4333-8333-333333333333/other.mp4',
      status: 'done',
      format_key: 'leaderboard'
    })
    const bucket = { head: vi.fn(), get: vi.fn() }

    expect(downloadHandler).toBeTypeOf('function')
    if (!downloadHandler) return
    await expect(downloadHandler(event({ bucket }))).rejects.toMatchObject({ statusCode: 404 })
    expect(bucket.head).not.toHaveBeenCalled()
    expect(bucket.get).not.toHaveBeenCalled()
  })

  it('fails closed when the request-scoped private R2 binding is unavailable', async () => {
    expect(downloadHandler).toBeTypeOf('function')
    if (!downloadHandler) return
    await expect(downloadHandler(event())).rejects.toMatchObject({ statusCode: 503 })
  })

  it.each([undefined, ''])('fails closed when R2 metadata has an invalid ETag (%s)', async (httpEtag) => {
    const metadata = { ...objectBody(), httpEtag }
    const bucket = { head: vi.fn(async () => metadata), get: vi.fn() }

    expect(downloadHandler).toBeTypeOf('function')
    if (!downloadHandler) return
    await expect(downloadHandler(event({ bucket }))).rejects.toMatchObject({ statusCode: 503 })
    expect(bucket.get).not.toHaveBeenCalled()
  })
})
