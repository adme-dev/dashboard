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
const { proposeArtwork } = await import('../../../server/utils/banner/artwork')
const projectId = '00000000-0000-4000-8000-000000000001',
  assetId = '00000000-0000-4000-8000-000000000002',
  revision = '2026-10-26T00:00:00.000Z'
interface TestLayer {
  id: number
  type: string
  text?: string
  src?: string
  platformQr?: unknown
  copyLocked?: boolean
  locked?: boolean
  imageCrop?: unknown
  mixBlendMode?: string
  maskTargetIds?: number[]
}
let project: {
  id: string
  client_id: string | null
  created_by: string
  updated_at: string
  canvas_data: { custom_794x1123: { layers: TestLayer[] } }
}
const event = { context: {} } as unknown as import('h3').H3Event
const generation = () => ({
  projectId,
  sourceRevision: revision,
  formatKey: 'custom_794x1123',
  prompt: 'leafy street, no beach',
  approvedCopy: ['GRAND OPENING'],
  referenceAssetIds: [assetId]
})
const lettering = () => ({
  projectId,
  sourceRevision: revision,
  formatKey: 'custom_794x1123',
  layerId: 1,
  mode: 'native',
  wording: 'GRAND OPENING',
  instruction: 'Keep bold'
})
beforeEach(() => {
  vi.resetAllMocks()
  project = {
    id: projectId,
    client_id: null,
    created_by: 'user',
    updated_at: revision,
    canvas_data: {
      custom_794x1123: {
        layers: [{ id: 1, type: 'text', text: 'RELOCATION SALE' }]
      }
    }
  }
  m.remove.mockResolvedValue(undefined)
  m.auth.mockResolvedValue({ id: 'user' })
  m.query.mockImplementation(async (sql: string) =>
    sql.includes('FROM banner_projects')
      ? project
      : {
          id: assetId,
          url: 'https://app.test/owned',
          r2_key: 'key',
          client_id: null,
          uploaded_by: 'user',
          mime_type: 'image/png',
          file_size: 80
        }
  )
  m.assignment.mockResolvedValue({
    provider: 'openai',
    modelId: 'openai/gpt-image-1.5'
  })
  m.delivery.mockReturnValue({ signingSecret: 'x'.repeat(32) })
  const png = new PNG({ width: 2, height: 2 })
  png.data.fill(255)
  const referenceBytes = PNG.sync.write(png)
  m.read.mockImplementation(async () => ({
    size: referenceBytes.length,
    body: new Blob([referenceBytes]).stream()
  }))
  m.image.mockResolvedValue({
    bytes: PNG.sync.write(png),
    width: 2,
    height: 2,
    sha256: 'a'.repeat(64),
    requestId: 'req_1'
  })
  m.native.mockResolvedValue({
    nativeStyle: { fontFamily: 'Impact', fontSize: 80 },
    warnings: ['Approximation'],
    requestId: 'req_native'
  })
})
describe('scoped generation and lettering proposals', () => {
  it.each([{}, { env: {} }, { env: { MEDIA_BUCKET: {} } }, { env: { MEDIA_BUCKET: { get: true } } }])('rejects unavailable hosted reference storage before reading ambient bytes: %j', async (cloudflare) => {
    const hostedEvent = { context: { cloudflare } } as unknown as import('h3').H3Event
    await expect(proposeArtwork(hostedEvent, generation(), 'generation')).rejects.toMatchObject({ statusCode: 503 })
    await expect(proposeArtwork(hostedEvent, { ...lettering(), referenceAssetId: assetId }, 'lettering')).rejects.toMatchObject({ statusCode: 503 })
    expect(m.read).not.toHaveBeenCalled()
    expect(m.image).not.toHaveBeenCalled()
    expect(m.native).not.toHaveBeenCalled()
    expect(m.limit).not.toHaveBeenCalled()
  })
  it('reads hosted references only through the request bucket', async () => {
    const bytes = PNG.sync.write(new PNG({ width: 2, height: 2 }))
    const get = vi.fn(async () => ({ size: bytes.length, body: new Blob([bytes]).stream() }))
    const hostedEvent = { context: { cloudflare: { env: { MEDIA_BUCKET: { get } } } } } as unknown as import('h3').H3Event
    await expect(proposeArtwork(hostedEvent, { ...lettering(), referenceAssetId: assetId }, 'lettering')).resolves.toMatchObject({ mode: 'native' })
    expect(get).toHaveBeenCalledWith('key')
    expect(m.read).not.toHaveBeenCalled()
    expect(m.native.mock.calls[0][1].reference).toEqual(bytes)
  })
  it('refuses managed QR lettering edits before provider dispatch', async () => {
    project.canvas_data.custom_794x1123.layers[0] = { id: 1, type: 'image', src: 'https://app.test/owned', platformQr: { qrCodeId: assetId } }
    await expect(proposeArtwork(event, lettering(), 'lettering')).rejects.toMatchObject({ statusCode: 409 })
    expect(m.image).not.toHaveBeenCalled()
    expect(m.native).not.toHaveBeenCalled()
    expect(m.limit).not.toHaveBeenCalled()
  })
  it('creates signed owned image assets, retains copy in provider brief and never updates document', async () => {
    const result = await proposeArtwork(event, generation(), 'generation')
    expect(result).toMatchObject({
      mode: 'generation',
      verification: 'review-required',
      evidence: { cost: null, requestId: 'req_1' },
      asset: { width: 2 }
    })
    expect(m.image.mock.calls[0][1].prompt).toContain('GRAND OPENING')
    expect(m.image.mock.calls[0][1].prompt).toContain('Never draw or copy QR codes')
    expect(m.limit).toHaveBeenCalledWith(
      event,
      expect.objectContaining({ failureMode: 'closed', limit: 12 })
    )
    expect(m.execute.mock.calls[0][0]).toContain('INSERT INTO banner_assets')
    expect(
      m.execute.mock.calls.some(([sql]) =>
        sql.includes('UPDATE banner_projects')
      )
    ).toBe(false)
  })
  it('checks auth, owner and stale revision before provider or cost', async () => {
    m.auth.mockRejectedValueOnce({ statusCode: 401 })
    await expect(
      proposeArtwork(event, generation(), 'generation')
    ).rejects.toMatchObject({ statusCode: 401 })
    project.created_by = 'other'
    await expect(
      proposeArtwork(event, generation(), 'generation')
    ).rejects.toMatchObject({ statusCode: 403 })
    project.created_by = 'user'
    project.updated_at = '2026-10-25T00:00:00Z'
    await expect(
      proposeArtwork(event, generation(), 'generation')
    ).rejects.toMatchObject({ statusCode: 409 })
    expect(m.image).not.toHaveBeenCalled()
    expect(m.limit).not.toHaveBeenCalled()
  })
  it('rejects unsupported assignment and unavailable private storage before paid image invocation', async () => {
    m.assignment.mockResolvedValueOnce({
      provider: 'groq',
      ignoredReason: 'unsupported'
    })
    await expect(
      proposeArtwork(event, generation(), 'generation')
    ).rejects.toMatchObject({ statusCode: 503 })
    m.delivery.mockReturnValue({ signingSecret: null })
    await expect(
      proposeArtwork(event, generation(), 'generation')
    ).rejects.toMatchObject({ statusCode: 503 })
    expect(m.image).not.toHaveBeenCalled()
  })
  it('rejects cross-client assets without fetching a URL or invoking provider', async () => {
    m.query.mockImplementation(async (sql: string) =>
      sql.includes('FROM banner_projects')
        ? project
        : { id: assetId, client_id: 'other', uploaded_by: 'user' }
    )
    await expect(
      proposeArtwork(
        event,
        { ...generation(), referenceAssetIds: [assetId] },
        'generation'
      )
    ).rejects.toMatchObject({ statusCode: 403 })
    expect(m.read).not.toHaveBeenCalled()
    expect(m.image).not.toHaveBeenCalled()
  })
  it('does not return stale outputs or invent fallback output', async () => {
    m.image.mockImplementationOnce(async () => {
      project.updated_at = '2026-10-27T00:00:00Z'
      return { bytes: Buffer.from('png'), requestId: 'x' }
    })
    await expect(
      proposeArtwork(event, generation(), 'generation')
    ).rejects.toMatchObject({ statusCode: 409 })
    expect(m.upload).not.toHaveBeenCalled()
    project.updated_at = revision
    m.image.mockRejectedValueOnce({ statusCode: 502 })
    await expect(
      proposeArtwork(event, generation(), 'generation')
    ).rejects.toMatchObject({ statusCode: 502 })
    expect(m.native).not.toHaveBeenCalled()
  })
  it('validates selected wording, protected copy and replacement boundaries', async () => {
    project.canvas_data.custom_794x1123.layers[0].copyLocked = true
    await expect(
      proposeArtwork(event, lettering(), 'lettering')
    ).rejects.toMatchObject({ statusCode: 400 })
    project.canvas_data.custom_794x1123.layers[0] = {
      id: 1,
      type: 'image',
      src: 'https://untrusted'
    }
    await expect(
      proposeArtwork(event, lettering(), 'lettering')
    ).rejects.toMatchObject({ statusCode: 400 })
    expect(m.native).not.toHaveBeenCalled()
  })
  it('returns native proposal without saving or altering unselected layers', async () => {
    const before = JSON.stringify(project)
    const result = await proposeArtwork(event, lettering(), 'lettering')
    expect(result).toMatchObject({
      mode: 'native',
      wording: 'GRAND OPENING',
      nativeStyle: { fontFamily: 'Impact' }
    })
    expect(JSON.stringify(project)).toBe(before)
    expect(m.execute).not.toHaveBeenCalled()
    expect(m.image).not.toHaveBeenCalled()
  })
  it('compensates this requests generated object on asset DB failure', async () => {
    m.execute.mockRejectedValueOnce(new Error('DB unavailable'))
    await expect(
      proposeArtwork(event, generation(), 'generation')
    ).rejects.toThrow('DB unavailable')
    expect(m.remove).toHaveBeenCalledWith('owned/key', undefined)
  })
})

describe('first-use separated lettering', () => {
  it('resolves selected owned PNG and rejects protected changes even on first use', async () => {
    const png = new PNG({ width: 3, height: 3 })
    png.data.fill(0)
    png.data[19] = 255
    const bytes = PNG.sync.write(png)
    project.canvas_data.custom_794x1123.layers[0] = {
      id: 1,
      type: 'image',
      src: 'https://app.test/owned'
    }
    m.query.mockImplementation(async (sql: string) =>
      sql.includes('FROM banner_projects')
        ? project
        : {
            id: assetId,
            url: 'https://app.test/owned',
            r2_key: 'key',
            client_id: null,
            uploaded_by: 'user',
            mime_type: 'image/png',
            file_size: bytes.length
          }
    )
    m.read.mockImplementation(async () => ({
      size: bytes.length,
      body: new Blob([bytes]).stream()
    }))
    const input = {
      ...lettering(),
      sourceWording: 'SALE',
      isolationConfirmed: true
    }
    await expect(
      proposeArtwork(event, input, 'lettering')
    ).resolves.toMatchObject({ referenceAssetIds: [assetId], mode: 'native' })
    expect(m.native.mock.calls[0][1].reference).toEqual(bytes)
    await expect(
      proposeArtwork(
        event,
        { ...input, sourceWording: '$399 per month' },
        'lettering'
      )
    ).rejects.toMatchObject({ statusCode: 400 })
  })
  it('rejects crop, lock and mask scope before provider calls', async () => {
    for (const extra of [
      { locked: true },
      { imageCrop: {} },
      { maskTargetIds: [2] },
      { mixBlendMode: 'multiply' }
    ]) {
      project.canvas_data.custom_794x1123.layers[0] = {
        id: 1,
        type: 'text',
        text: 'SALE',
        ...extra
      }
      await expect(
        proposeArtwork(event, lettering(), 'lettering')
      ).rejects.toMatchObject({ statusCode: 400 })
    }
    expect(m.native).not.toHaveBeenCalled()
  })
})

describe('generation contract requirements', () => {
  it('rejects absent references and blank copy before credentials or inference', async () => {
    for (const extra of [
      { referenceAssetIds: [] },
      { approvedCopy: [] },
      { approvedCopy: ['  '] }
    ])
      await expect(
        proposeArtwork(event, { ...generation(), ...extra }, 'generation')
      ).rejects.toMatchObject({ statusCode: 400 })
    expect(m.client).not.toHaveBeenCalled()
    expect(m.image).not.toHaveBeenCalled()
  })
})
