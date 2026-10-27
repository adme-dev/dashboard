import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PNG } from 'pngjs'

const m = vi.hoisted(() => ({
  auth: vi.fn(),
  query: vi.fn(),
  execute: vi.fn(),
  access: vi.fn(),
  all: vi.fn(),
  limit: vi.fn(),
  assignment: vi.fn(),
  ledger: vi.fn(),
  client: vi.fn(),
  image: vi.fn(),
  native: vi.fn(),
  delivery: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  read: vi.fn()
}))
vi.mock('~~/server/utils/auth', () => ({ requireWriteAccess: m.auth }))
vi.mock('~~/server/utils/db', () => ({
  queryOneFresh: m.query,
  execute: m.execute
}))
vi.mock('~~/server/utils/social/clientAccess', () => ({
  requireSocialClientAccess: m.access,
  hasAllSocialClientAccess: m.all
}))
vi.mock('~~/server/utils/rateLimit', () => ({ enforceRateLimit: m.limit }))
vi.mock('~~/server/utils/ai/modelAssignments', () => ({
  resolveAiModelAssignment: m.assignment
}))
vi.mock('~~/server/utils/ai/invocationLedger', () => ({
  recordAiInvocation: m.ledger
}))
vi.mock('~~/server/utils/banner/artworkProvider', () => ({
  ARTWORK_IMAGE_MODELS: ['openai/gpt-image-1.5', 'openai/gpt-image-1', 'openai/gpt-image-1-mini'],
  artworkClient: m.client,
  generateArtworkImage: m.image,
  proposeNativeArtworkStyle: m.native
}))
vi.mock('~~/server/utils/banner/assetDelivery', () => ({
  resolveBannerAssetDelivery: m.delivery
}))
vi.mock('~~/server/utils/bannerStorage', () => ({
  bannerAssetDeliveryUrl: async () =>
    'https://app.test/api/public/banner-assets/signed',
  createBannerAssetStorageKey: () => 'owned/key',
  uploadBannerAsset: m.upload,
  deleteBannerFile: m.remove
}))
vi.mock('~~/server/utils/storage', () => ({ readStoredObject: m.read }))
vi.mock('~~/server/utils/appUrl', () => ({
  getAppUrl: () => 'https://app.test'
}))
const artwork = await import('../../../server/utils/banner/artwork')
const projectId = '00000000-0000-4000-8000-000000000001'
const assetId = '00000000-0000-4000-8000-000000000002'
const revision = '2026-10-26T00:00:00.000Z'
const event = { context: {} } as unknown as import('h3').H3Event
const request = () => ({ projectId, sourceRevision: revision, formatKey: 'mrec', layerId: 1, sourceWording: 'RELOCATION SALE', wording: 'GRAND OPENING', region: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 }, regionReviewed: true })
let project: { id: string, client_id: string | null, created_by: string, updated_at: string, canvas_data: { mrec: { layers: Array<Record<string, unknown>> } } }
let asset: { id: string, url: string, r2_key: string, client_id: string | null, uploaded_by: string, mime_type: string, file_size: number }
let source: Buffer
const run = (input: unknown = request()) => artwork.proposeLetteringRepair(event, input)
beforeEach(() => {
  vi.resetAllMocks()
  project = { id: projectId, client_id: null, created_by: 'user', updated_at: revision, canvas_data: { mrec: { layers: [{ id: 1, type: 'image', src: 'https://app.test/owned', x: 0, y: 0, w: 100, h: 100, opacity: 1, fit: 'fill', animIn: 'none', animOut: 'fadeOut', outDur: 0 }] } } }
  asset = { id: assetId, url: 'https://app.test/owned', r2_key: 'key', client_id: null, uploaded_by: 'user', mime_type: 'image/png', file_size: 100 }
  m.auth.mockResolvedValue({ id: 'user' })
  m.query.mockImplementation(async (sql: string) => sql.includes('FROM banner_projects') ? structuredClone(project) : structuredClone(asset))
  m.assignment.mockResolvedValue({ provider: 'openai', modelId: 'openai/gpt-image-1.5' })
  m.delivery.mockReturnValue({ signingSecret: 'x'.repeat(32) })
  m.remove.mockResolvedValue(undefined)
  m.execute.mockResolvedValue(1)
  const png = new PNG({ width: 8, height: 8 })
  for (let i = 0; i < png.data.length; i++) png.data[i] = (i * 13 + 7) % 256
  source = PNG.sync.write(png)
  m.read.mockImplementation(async () => ({ size: source.length, body: new Blob([source]).stream() }))
  const patch = new PNG({ width: 2, height: 2 })
  patch.data.fill(200)
  m.image.mockResolvedValue({ bytes: PNG.sync.write(patch), width: 2, height: 2, sha256: 'a'.repeat(64), requestId: 'req_repair' })
})
describe('flat lettering repair proposal boundary', () => {
  it('returns a full-size private background with one cropped provider call and no project mutation', async () => {
    const before = structuredClone(project)
    const proposal = await run()
    expect(proposal).toMatchObject({ projectId, sourceRevision: revision, layerId: 1, sourceAssetId: assetId, wording: 'GRAND OPENING', verification: 'review-required', backgroundAsset: { width: 8, height: 8 }, evidence: { provider: 'openai', requestId: 'req_repair', cost: null } })
    expect(proposal.sourceImageHash).toMatch(/^[a-f0-9]{64}$/)
    expect(m.image).toHaveBeenCalledTimes(1)
    const args = m.image.mock.calls[0]![1]
    expect(args.transparent).toBe(false)
    expect(args.references).toHaveLength(1)
    const crop = PNG.sync.read(args.references[0].bytes)
    expect([crop.width, crop.height]).toEqual([4, 4])
    const original = PNG.sync.read(source), output = PNG.sync.read(m.upload.mock.calls[0]![0])
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const i = (y * 8 + x) * 4
      expect([...output.data.subarray(i, i + 4)]).toEqual(x >= 2 && x < 6 && y >= 2 && y < 6 ? [200, 200, 200, 200] : [...original.data.subarray(i, i + 4)])
    }
    expect(project).toEqual(before)
    expect(m.execute.mock.calls.every(([sql]) => !sql.includes('banner_projects'))).toBe(true)
    expect(m.assignment).toHaveBeenCalledWith(expect.objectContaining({ featureKey: 'banner_lettering_raster' }))
    expect(m.ledger).toHaveBeenCalledWith(expect.objectContaining({ status: 'success', metadata: expect.objectContaining({ mode: 'lettering-repair' }) }))
  })
  it.each([
    { locked: true }, { copyLocked: true }, { platformQr: {} }, { isLogo: true }, { imageCrop: {} }, { isMask: true }, { rotation: 1 }, { opacity: 0.5 }, { fit: 'invalid' }, { visualFilter: 'blur(2px)' }, { mixBlendMode: 'multiply' }, { animIn: 'fadeIn' }, { animOut: 'fadeOut', outDur: 1 }, { keyframes: { x: [{ time: 1, value: 2 }] } }, { motionPath: [{ x: 1, y: 1 }] }, { feedBindings: [{ property: 'src' }] }, { clipToPresence: true }, { borderRadius: 10 }, { skewX: 2 }, { scaleX: 2 }, { flipX: true }
  ])('rejects unsafe source %j before budget or provider', async (patch) => {
    Object.assign(project.canvas_data.mrec.layers[0], patch)
    await expect(run()).rejects.toMatchObject({ statusCode: 400 })
    expect(m.limit).not.toHaveBeenCalled()
    expect(m.image).not.toHaveBeenCalled()
  })
  it('rejects another layer masking the source', async () => {
    project.canvas_data.mrec.layers.push({ id: 2, type: 'rect', isMask: true, maskTargetIds: [1] })
    await expect(run()).rejects.toMatchObject({ statusCode: 400 })
    expect(m.image).not.toHaveBeenCalled()
  })
  it.each([{ platformQr: {} }, { copyLocked: true }, { locked: true }, { isLogo: true }, { text: '$500 voucher' }, { letteringRecipe: { wording: '$500 voucher' } }])('rejects protected overlap %j', async (protectedData) => {
    project.canvas_data.mrec.layers.push({ id: 2, type: 'image', x: 30, y: 30, w: 10, h: 10, ...protectedData })
    await expect(run()).rejects.toMatchObject({ statusCode: 400 })
    expect(m.image).not.toHaveBeenCalled()
  })
  it('allows a separate non-overlapping protected layer', async () => {
    project.canvas_data.mrec.layers.push({ id: 2, type: 'image', x: 90, y: 90, w: 10, h: 10, platformQr: {} })
    await expect(run()).resolves.toHaveProperty('backgroundAsset')
  })
  it('rejects cover/contain source aspect mismatch', async () => {
    Object.assign(project.canvas_data.mrec.layers[0], { fit: 'contain', w: 200 })
    await expect(run()).rejects.toMatchObject({ statusCode: 400 })
    expect(m.image).not.toHaveBeenCalled()
  })
  it('rejects commercial rewrites and known saved wording mismatch', async () => {
    await expect(run({ ...request(), sourceWording: '$500', wording: '$600' })).rejects.toMatchObject({ statusCode: 400 })
    await expect(run({ ...request(), sourceWording: '$500', wording: '$500' })).rejects.toMatchObject({ statusCode: 400 })
    project.canvas_data.mrec.layers[0].letteringRecipe = { wording: 'APPROVED WORDS' }
    await expect(run()).rejects.toMatchObject({ statusCode: 409 })
    expect(m.image).not.toHaveBeenCalled()
  })
  it('requires write auth and client access', async () => {
    m.auth.mockRejectedValueOnce({ statusCode: 401 })
    await expect(run()).rejects.toMatchObject({ statusCode: 401 })
    project.client_id = 'client'
    m.access.mockRejectedValueOnce({ statusCode: 403 })
    await expect(run()).rejects.toMatchObject({ statusCode: 403 })
    expect(m.image).not.toHaveBeenCalled()
  })
  it('rejects non-owned project or reference and cross-client source', async () => {
    project.created_by = 'other'
    await expect(run()).rejects.toMatchObject({ statusCode: 403 })
    project.created_by = 'user'
    asset.uploaded_by = 'other'
    await expect(run()).rejects.toMatchObject({ statusCode: 403 })
    asset.uploaded_by = 'user'
    asset.client_id = 'other-client'
    await expect(run()).rejects.toMatchObject({ statusCode: 403 })
    expect(m.image).not.toHaveBeenCalled()
  })
  it('rejects saved source URL or expected hash mismatch', async () => {
    asset.url = 'https://app.test/other'
    await expect(run({ ...request(), referenceAssetId: assetId })).rejects.toMatchObject({ statusCode: 409 })
    asset.url = 'https://app.test/owned'
    await expect(run({ ...request(), sourceImageHash: '0'.repeat(64) })).rejects.toMatchObject({ statusCode: 409 })
    expect(m.image).not.toHaveBeenCalled()
  })
  it('rejects stale before generation and stale after generation without assets', async () => {
    project.updated_at = '2026-10-27T00:00:00.000Z'
    await expect(run()).rejects.toMatchObject({ statusCode: 409 })
    expect(m.image).not.toHaveBeenCalled()
    project.updated_at = revision
    m.image.mockImplementationOnce(async () => {
      project.updated_at = '2026-10-27T00:00:00.000Z'
      return { bytes: source, requestId: 'stale' }
    })
    await expect(run()).rejects.toMatchObject({ statusCode: 409 })
    expect(m.upload).not.toHaveBeenCalled()
    expect(m.execute).not.toHaveBeenCalled()
  })
  it('rejects changed source bytes after provider generation', async () => {
    m.image.mockImplementationOnce(async () => {
      const old = source
      const png = new PNG({ width: 8, height: 8 })
      png.data.fill(255)
      source = PNG.sync.write(png)
      return { bytes: old, requestId: 'changed' }
    })
    await expect(run()).rejects.toMatchObject({ statusCode: 409 })
    expect(m.upload).not.toHaveBeenCalled()
  })
  it('cleans uploaded output when a revision changes during upload', async () => {
    m.upload.mockImplementationOnce(async () => {
      project.updated_at = '2026-10-27T00:00:00.000Z'
    })
    await expect(run()).rejects.toMatchObject({ statusCode: 409 })
    expect(m.remove).toHaveBeenCalled()
    expect(m.execute).not.toHaveBeenCalled()
  })
  it('cleans persisted output when a revision changes during asset insertion', async () => {
    m.execute.mockImplementationOnce(async () => {
      project.updated_at = '2026-10-27T00:00:00.000Z'
    })
    await expect(run()).rejects.toMatchObject({ statusCode: 409 })
    expect(m.execute).toHaveBeenLastCalledWith('DELETE FROM banner_assets WHERE id=$1', [expect.any(String)])
    expect(m.remove).toHaveBeenCalled()
  })
  it('does not spend when the project changes during budget admission', async () => {
    m.limit.mockImplementationOnce(async () => {
      project.updated_at = '2026-10-27T00:00:00.000Z'
    })
    await expect(run()).rejects.toMatchObject({ statusCode: 409 })
    expect(m.image).not.toHaveBeenCalled()
  })
  it('fails closed for provider failure without persisting assets or retrying', async () => {
    m.image.mockRejectedValueOnce(new Error('provider failed'))
    await expect(run()).rejects.toThrow('provider failed')
    expect(m.image).toHaveBeenCalledTimes(1)
    expect(m.upload).not.toHaveBeenCalled()
    expect(m.execute).not.toHaveBeenCalled()
    expect(m.ledger).toHaveBeenCalledWith(expect.objectContaining({ status: 'error' }))
  })
  it('rejects malformed provider output without creating an asset', async () => {
    m.image.mockResolvedValueOnce({ bytes: Buffer.from('invalid'), requestId: 'bad_png' })
    await expect(run()).rejects.toMatchObject({ statusCode: 502 })
    expect(m.image).toHaveBeenCalledTimes(1)
    expect(m.upload).not.toHaveBeenCalled()
    expect(m.execute).not.toHaveBeenCalled()
  })
  it('rejects a saved source change even when its revision timestamp is unchanged', async () => {
    m.image.mockImplementationOnce(async () => {
      project.canvas_data.mrec.layers[0].src = 'https://app.test/changed'
      return { bytes: source, requestId: 'changed_source' }
    })
    await expect(run()).rejects.toMatchObject({ statusCode: 409 })
    expect(m.upload).not.toHaveBeenCalled()
  })
  it('rechecks tenant scope after provider completion', async () => {
    m.image.mockImplementationOnce(async () => {
      project.client_id = 'another-client'
      return { bytes: source, requestId: 'changed_tenant' }
    })
    await expect(run()).rejects.toMatchObject({ statusCode: 409 })
    expect(m.upload).not.toHaveBeenCalled()
  })
  it('rejects invalid region and absent saved selection before provider dispatch', async () => {
    await expect(run({ ...request(), region: { x: 0.8, y: 0, w: 0.5, h: 1 } })).rejects.toMatchObject({ statusCode: 400 })
    project.canvas_data.mrec.layers = []
    await expect(run()).rejects.toMatchObject({ statusCode: 409 })
    expect(m.image).not.toHaveBeenCalled()
  })
  it('keeps source dimensions and JPEG decoded pixels outside the repair', async () => {
    const { encode, decode } = await import('jpeg-js')
    source = Buffer.from(encode({ width: 8, height: 8, data: PNG.sync.read(source).data }, 80).data)
    asset.mime_type = 'image/jpeg'
    const original = decode(source, { useTArray: true, formatAsRGBA: true })
    const result = await run()
    const output = PNG.sync.read(m.upload.mock.calls[0]![0])
    expect(result.backgroundAsset).toMatchObject({ width: 8, height: 8 })
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      if (x >= 2 && x < 6 && y >= 2 && y < 6) continue
      const offset = (y * 8 + x) * 4
      expect([...output.data.subarray(offset, offset + 4)]).toEqual([...original.data.subarray(offset, offset + 4)])
    }
  })
  it('fails before spend without private delivery, credentials, model support or budget', async () => {
    m.delivery.mockReturnValueOnce({ signingSecret: null })
    await expect(run()).rejects.toMatchObject({ statusCode: 503 })
    m.client.mockImplementationOnce(() => {
      throw { statusCode: 503 }
    })
    await expect(run()).rejects.toMatchObject({ statusCode: 503 })
    m.assignment.mockResolvedValueOnce({ provider: 'openai', modelId: 'openai/gpt-4.1-mini' })
    await expect(run()).rejects.toMatchObject({ statusCode: 503 })
    m.limit.mockRejectedValueOnce({ statusCode: 429 })
    await expect(run()).rejects.toMatchObject({ statusCode: 429 })
    expect(m.image).not.toHaveBeenCalled()
  })
})
