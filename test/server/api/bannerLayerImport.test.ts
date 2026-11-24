import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent { params?: Record<string, string>, body?: any, context?: any }
const g = globalThis as any
g.defineEventHandler = (fn: any) => fn
g.getRouterParam = (event: TestEvent, name: string) => event.params?.[name]
g.readBody = async (event: TestEvent) => event.body ?? {}
g.createError = (input: any) => Object.assign(new Error(input.statusMessage), input)
g.setResponseStatus = vi.fn()
g.setHeader = vi.fn()

const USER = '11111111-1111-4111-8111-111111111111'
const OTHER = '99999999-9999-4999-8999-999999999999'
const ASSET = '22222222-2222-4222-8222-222222222222'
const JOB = '33333333-3333-4333-8333-333333333333'
const PROJECT = '44444444-4444-4444-8444-444444444444'
const CLIENT = '55555555-5555-4555-8555-555555555555'
const SECRET = 'a-signing-secret-that-is-long-enough-123'

const mockRequireWriteAccess = vi.fn()
vi.mock('~~/server/utils/auth', () => ({ requireWriteAccess: (...args: unknown[]) => mockRequireWriteAccess(...args) }))

const mockQueryOne = vi.fn()
const mockDbQuery = vi.fn()
vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  transaction: async (callback: (db: { query: typeof mockDbQuery }) => unknown) => await callback({ query: mockDbQuery })
}))

const mockHasAllAccess = vi.fn()
const mockRequireClientAccess = vi.fn()
vi.mock('~~/server/utils/banner/clientAccess', () => ({
  hasAllBannerClientAccess: (...args: unknown[]) => mockHasAllAccess(...args),
  requireBannerClientAccess: (...args: unknown[]) => mockRequireClientAccess(...args)
}))

const mockDelivery = vi.fn()
vi.mock('~~/server/utils/banner/assetDelivery', () => ({ resolveBannerAssetDelivery: (...args: unknown[]) => mockDelivery(...args) }))
vi.mock('~~/server/utils/appUrl', () => ({ getAppUrl: () => 'https://app.example.test' }))
vi.mock('~~/server/utils/storage', () => ({ getPublicUrl: () => null }))

const mockRecordInvocation = vi.fn()
vi.mock('~~/server/utils/ai/invocationLedger', () => ({ recordAiInvocation: (...args: unknown[]) => mockRecordInvocation(...args) }))

const mockMarkFailed = vi.fn()
vi.mock('~~/server/utils/video-asset-intelligence/db', () => ({ markAssetIntelligenceJobFailed: (...args: unknown[]) => mockMarkFailed(...args) }))

const { default: startImport } = await import('../../../server/api/agency/banner-studio/layer-imports/index.post')
const { default: readImport } = await import('../../../server/api/agency/banner-studio/layer-imports/[jobId].get')

const spendConfirmed = { AI_GATEWAY_SPEND_LIMIT_CONFIRMED: 'true', AI_GATEWAY_GENERATION_MONTHLY_LIMIT_USD: '500' }
const picture = { id: ASSET, name: 'promo.jpg', mimeType: 'image/jpeg', uploadedBy: USER, clientId: null }

function startEvent(body: any, env: Record<string, unknown> = {}): TestEvent {
  return { body, context: { cloudflare: { env } } }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRequireWriteAccess.mockResolvedValue({ id: USER, role: 'manager' })
  mockHasAllAccess.mockResolvedValue(false)
  mockDelivery.mockReturnValue({ signingSecret: SECRET })
})

describe('POST /api/agency/banner-studio/layer-imports', () => {
  it('queues the Separate layers job for the uploaded picture', async () => {
    const send = vi.fn()
    mockQueryOne.mockResolvedValueOnce(picture).mockResolvedValueOnce({ id: JOB, status: 'queued' })
    const response = await startImport(startEvent({ assetId: ASSET, projectId: PROJECT }, { ...spendConfirmed, ASSET_INTELLIGENCE_QUEUE: { send } }) as any)

    expect(response).toEqual({ jobId: JOB, status: 'queued', asset: { id: ASSET, name: 'promo.jpg' } })
    expect(g.setResponseStatus).toHaveBeenCalledWith(expect.anything(), 202)
    const [sql, params] = mockQueryOne.mock.calls[1]!
    expect(sql).toMatch(/INSERT INTO video_asset_intelligence_jobs/)
    expect(sql).toMatch(/'layer-decomposition'/)
    // No video asset: the banner upload is the source, and the model is the Worker's layer model.
    expect(params).toEqual([PROJECT, ASSET, 'aigateway/seedream-5.5', 'aigateway', USER])
    expect(send).toHaveBeenCalledWith({ jobId: JOB, projectId: PROJECT, sourceAssetId: ASSET })
    expect(mockRecordInvocation).toHaveBeenCalledWith(expect.objectContaining({ featureKey: 'banner_image_layer_decomposition', status: 'success', userId: USER }))
  })

  it('finds the library picture behind an image layer', async () => {
    const send = vi.fn()
    mockQueryOne.mockResolvedValueOnce(picture).mockResolvedValueOnce({ id: JOB, status: 'queued' })
    await startImport(startEvent({ src: 'https://app.example.test/api/public/banner-assets/v1.a.b' }, { ...spendConfirmed, ASSET_INTELLIGENCE_QUEUE: { send } }) as any)
    expect(mockQueryOne.mock.calls[0]![0]).toMatch(/WHERE url = \$1/)
    // With no project open, the picture stands in as the job's project reference.
    expect(mockQueryOne.mock.calls[1]![1][0]).toBe(ASSET)
  })

  it('says to upload a picture that is not in the library', async () => {
    mockQueryOne.mockResolvedValueOnce(null)
    await expect(startImport(startEvent({ src: 'https://elsewhere.example/car.jpg' }, spendConfirmed) as any))
      .rejects.toMatchObject({ statusCode: 404, statusMessage: 'Upload this picture to Media first, then import it as layers.' })
  })

  it('refuses a request with no picture', async () => {
    await expect(startImport(startEvent({ projectId: PROJECT }, spendConfirmed) as any)).rejects.toThrow()
    expect(mockQueryOne).not.toHaveBeenCalled()
  })

  it('refuses someone else\'s unassigned upload', async () => {
    mockQueryOne.mockResolvedValueOnce({ ...picture, uploadedBy: OTHER })
    await expect(startImport(startEvent({ assetId: ASSET }, spendConfirmed) as any)).rejects.toMatchObject({ statusCode: 403 })
    expect(mockQueryOne).toHaveBeenCalledTimes(1)
  })

  it('checks client access for a client\'s picture', async () => {
    mockQueryOne.mockResolvedValueOnce({ ...picture, uploadedBy: OTHER, clientId: CLIENT })
    mockRequireClientAccess.mockRejectedValue(Object.assign(new Error('No access'), { statusCode: 403 }))
    await expect(startImport(startEvent({ assetId: ASSET }, spendConfirmed) as any)).rejects.toMatchObject({ statusCode: 403 })
    expect(mockRequireClientAccess).toHaveBeenCalledWith(expect.anything(), CLIENT)
  })

  it('only takes JPEG and PNG pictures', async () => {
    mockQueryOne.mockResolvedValueOnce({ ...picture, mimeType: 'video/mp4' })
    await expect(startImport(startEvent({ assetId: ASSET }, spendConfirmed) as any))
      .rejects.toMatchObject({ statusCode: 400, statusMessage: 'Only JPEG and PNG pictures can be split into layers.' })
  })

  it('stays off until the AI Gateway spend limit is confirmed, before anything is created', async () => {
    mockQueryOne.mockResolvedValueOnce(picture)
    await expect(startImport(startEvent({ assetId: ASSET }, { ASSET_INTELLIGENCE_QUEUE: { send: vi.fn() } }) as any))
      .rejects.toMatchObject({ statusCode: 409, statusMessage: expect.stringMatching(/spend limit is confirmed/) })
    expect(mockQueryOne).toHaveBeenCalledTimes(1)
  })

  it('creates no job when the queue is not connected', async () => {
    mockQueryOne.mockResolvedValueOnce(picture)
    await expect(startImport(startEvent({ assetId: ASSET }, spendConfirmed) as any)).rejects.toMatchObject({ statusCode: 503 })
    expect(mockQueryOne).toHaveBeenCalledTimes(1)
  })

  it('marks the job failed when it cannot be queued, so it is never left waiting', async () => {
    const send = vi.fn().mockRejectedValue(new Error('queue full'))
    mockQueryOne.mockResolvedValueOnce(picture).mockResolvedValueOnce({ id: JOB, status: 'queued' })
    await expect(startImport(startEvent({ assetId: ASSET }, { ...spendConfirmed, ASSET_INTELLIGENCE_QUEUE: { send } }) as any))
      .rejects.toMatchObject({ statusCode: 503, statusMessage: 'The import could not be queued. Try again.' })
    expect(mockMarkFailed).toHaveBeenCalledWith(JOB, 'The import could not be queued. Try again.')
    expect(mockRecordInvocation).toHaveBeenCalledWith(expect.objectContaining({ status: 'error', errorCode: 'banner_layer_import_enqueue_failed' }))
  })
})

describe('GET /api/agency/banner-studio/layer-imports/:jobId', () => {
  const jobRow = (over: Record<string, unknown> = {}) => ({
    id: JOB, status: 'running', error_message: null, created_by: USER, created_at: new Date('2026-11-24T06:00:00Z'),
    started_at: new Date('2026-11-24T06:00:02Z'), source_banner_asset_id: ASSET, output_derivative_ids: [], client_id: CLIENT, ...over
  })
  const key = (folder: string, file: string) => `banner-assets/${USER}/${folder}/${file}`
  const derivativeIds = ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4']
  const headlineText = { text: 'SUMMER SALE', lines: 1, fontGuess: null, fontCategory: 'sans', fontWeight: 800, italic: false, uppercase: true, align: 'left', color: '#ffcc00', letterSpacing: 'normal' }
  const derivatives = () => [
    { id: derivativeIds[0], kind: 'foreground-png', r2_key: key('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'layer-02-headline.png'), width: 512, height: 144, metadata: { layerName: 'headline', layerKind: 'text', z: 2, bbox: { x: 64, y: 72, width: 512, height: 144 }, size: 2048, text: headlineText } },
    { id: derivativeIds[1], kind: 'foreground-png', r2_key: key('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'layer-01-red-car.png'), width: 512, height: 360, metadata: { layerName: 'red car', layerKind: 'product', z: 1, bbox: { x: 384, y: 288, width: 512, height: 360 }, size: 4096 } },
    { id: derivativeIds[2], kind: 'background-png', r2_key: key('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3', 'base.png'), width: 1280, height: 720, metadata: { z: 0, size: 9000 } },
    { id: derivativeIds[3], kind: 'layer-package', r2_key: 'video-asset-derivatives/c/p/j/layers.json', width: 1280, height: 720, metadata: { partial: true, skipped: [{ name: 'price badge', step: 'extract', reason: 'The model returned nothing.' }], costUsd: 0.0889, latencyMs: 51000 } }
  ]

  function database(job: unknown, rows: unknown[] = []) {
    mockDbQuery.mockImplementation(async (sql: string) => {
      if (/FROM video_asset_intelligence_jobs/.test(sql)) return { rows: job ? [job] : [] }
      if (/FROM video_asset_derivatives/.test(sql)) return { rows }
      return { rows: [] }
    })
  }
  const inserts = () => mockDbQuery.mock.calls.filter(([sql]) => /INSERT INTO banner_assets/.test(sql))

  it('reports a job that is still running without touching the library', async () => {
    database(jobRow())
    const status = await readImport({ params: { jobId: JOB } } as any)
    expect(status).toEqual({ jobId: JOB, status: 'running', error: null, createdAt: '2026-11-24T06:00:00.000Z', startedAt: '2026-11-24T06:00:02.000Z', result: null })
    expect(inserts()).toHaveLength(0)
  })

  it('gives the reason a job failed', async () => {
    database(jobRow({ status: 'failed', error_message: 'No separate elements were found in this picture.' }))
    await expect(readImport({ params: { jobId: JOB } } as any)).resolves.toMatchObject({ status: 'failed', error: 'No separate elements were found in this picture.', result: null })
  })

  it('reports a blocked job as failed, because it never ran', async () => {
    database(jobRow({ status: 'blocked', error_message: null }))
    await expect(readImport({ params: { jobId: JOB } } as any)).resolves.toMatchObject({ status: 'failed', error: 'The import failed.' })
  })

  it('returns the layers back to front, saved to the media library with what was skipped and what it cost', async () => {
    database(jobRow({ status: 'succeeded', output_derivative_ids: derivativeIds }), derivatives())
    const status = await readImport({ params: { jobId: JOB } } as any)

    expect(status.status).toBe('succeeded')
    expect(status.result).toMatchObject({
      width: 1280, height: 720, costUsd: 0.0889, latencyMs: 51000,
      skipped: [{ name: 'price badge', step: 'extract', reason: 'The model returned nothing.' }]
    })
    expect(status.result!.layers.map(layer => [layer.name, layer.kind, layer.z])).toEqual([['red car', 'product', 1], ['headline', 'text', 2]])
    expect(status.result!.layers[1]).toMatchObject({ bbox: { x: 64, y: 72, width: 512, height: 144 }, width: 512, height: 144, text: headlineText })
    expect(status.result!.layers[0]!.text).toBeNull()
    expect(status.result!.base).toMatchObject({ width: 1280, height: 720 })
    for (const item of [...status.result!.layers, status.result!.base!]) {
      expect(item.url).toMatch(/^https:\/\/app\.example\.test\/api\/public\/banner-assets\/v1\./)
    }

    // One library picture each for the two layers and the background, owned by the person who ran it, in the client's library.
    expect(inserts()).toHaveLength(3)
    const [, params] = inserts()[0]!
    expect(params[1]).toBe('headline.png')
    expect(params[3]).toBe(derivatives()[0]!.r2_key)
    expect(params.slice(5)).toEqual([['layer-import'], USER, CLIENT])
    expect(mockDbQuery.mock.calls[0]![0]).toMatch(/FOR UPDATE OF j/)
  })

  it('reuses the saved pictures when the status is read again', async () => {
    const saved = derivatives().map((row, index) => row.kind === 'layer-package'
      ? row
      : { ...row, metadata: { ...row.metadata, bannerAssetId: `cccccccc-cccc-4ccc-8ccc-ccccccccccc${index}`, bannerAssetUrl: `https://app.example.test/api/public/banner-assets/v1.saved${index}.sig` } })
    database(jobRow({ status: 'succeeded', output_derivative_ids: derivativeIds }), saved)
    const status = await readImport({ params: { jobId: JOB } } as any)
    expect(inserts()).toHaveLength(0)
    expect(status.result!.layers[1]).toMatchObject({ assetId: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc0', url: 'https://app.example.test/api/public/banner-assets/v1.saved0.sig' })
  })

  it('leaves out a picture stored outside the owner\'s own library space', async () => {
    const rows = derivatives()
    rows[1]!.r2_key = 'video-asset-derivatives/c/p/j/layer-01-red-car.png'
    database(jobRow({ status: 'succeeded', output_derivative_ids: derivativeIds }), rows)
    const status = await readImport({ params: { jobId: JOB } } as any)
    expect(status.result!.layers.map(layer => layer.name)).toEqual(['headline'])
    expect(inserts()).toHaveLength(2)
  })

  it('leaves out a layer with no usable position', async () => {
    const rows = derivatives()
    rows[0]!.metadata.bbox = { x: 0, y: 0, width: 0, height: 10 } as any
    database(jobRow({ status: 'succeeded', output_derivative_ids: derivativeIds }), rows)
    const status = await readImport({ params: { jobId: JOB } } as any)
    expect(status.result!.layers.map(layer => layer.name)).toEqual(['red car'])
  })

  it('does not show one person\'s import to another, whatever their role', async () => {
    mockRequireWriteAccess.mockResolvedValue({ id: USER, role: 'owner' })
    database(jobRow({ created_by: OTHER }))
    await expect(readImport({ params: { jobId: JOB } } as any)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('answers 404 for a job that is not a banner import', async () => {
    database(null)
    await expect(readImport({ params: { jobId: JOB } } as any)).rejects.toMatchObject({ statusCode: 404 })
    expect(mockDbQuery.mock.calls[0]![0]).toMatch(/source_banner_asset_id IS NOT NULL/)
  })

  it('rejects an id that is not a job id', async () => {
    await expect(readImport({ params: { jobId: 'latest' } } as any)).rejects.toMatchObject({ statusCode: 400 })
    expect(mockDbQuery).not.toHaveBeenCalled()
  })
})
