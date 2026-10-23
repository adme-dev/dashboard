import { beforeEach, describe, expect, it, vi } from 'vitest'
import handler from '../../../server/api/agency/banner-studio/ai/generate-image.post'

const mocks = vi.hoisted(() => ({ write: vi.fn(), project: vi.fn(), scope: vi.fn(), references: vi.fn(), model: vi.fn(), query: vi.fn(), review: vi.fn(), record: vi.fn(), generate: vi.fn(), upload: vi.fn() }))
vi.mock('h3', async original => ({ ...await original<typeof import('h3')>(), readBody: async (event: { body: unknown }) => event.body }))
vi.mock('~~/server/utils/auth', () => ({ requireWriteAccess: mocks.write }))
vi.mock('~~/server/utils/banner/effectScope', () => ({ requireBannerEffectProject: mocks.project }))
vi.mock('~~/server/utils/social/clientAccess', () => ({ requireSocialClientScope: mocks.scope }))
vi.mock('~~/server/utils/banner/designReferences', () => ({ resolveDesignReferences: mocks.references }))
vi.mock('~~/server/utils/creative-generation/modelRegistry', () => ({ getCreativeGenerationModel: mocks.model }))
vi.mock('~~/server/utils/db', () => ({ queryOne: mocks.query }))
vi.mock('~~/server/utils/banner/brandKits', () => ({ getBrandKit: vi.fn(), getDefaultBrandKitForClient: vi.fn() }))
vi.mock('~~/server/utils/bannerStorage', () => ({ uploadBannerAsset: mocks.upload }))
vi.mock('~~/server/utils/creative-generation/aiGatewayProvider', () => ({ buildCreativeGenerationInputs: vi.fn(), generateCreativeImage: mocks.generate }))
vi.mock('~~/server/utils/video-generation/resolveSourceUrls', () => ({ resolveSourceAssetUrls: vi.fn() }))
vi.mock('~~/server/utils/ai/invocationLedger', () => ({ recordAiInvocation: mocks.record }))
vi.mock('~~/server/utils/creativeCompliance', () => ({ runCreativeComplianceCheck: mocks.review, CREATIVE_COMPLIANCE_MODEL: 'qwen/qwen3.8-27b' }))

const id = '11111111-1111-4111-8111-111111111111'
const client = '22222222-2222-4222-8222-222222222222'
const project = { id, client_id: client, canvas_data: { square: { layers: [{ id: 1, type: 'text', text: 'DriveAgent', w: 750, h: 40 }] } } }
const request = (overrides = {}) => ({ context: {}, body: { projectId: id, clientId: id, prompt: 'Chrome lettering', effect: { layerId: 1, formatKey: 'square', text: 'DriveAgent', referenceIds: [], referenceProjectId: null }, ...overrides } })
beforeEach(() => {
  vi.resetAllMocks()
  mocks.write.mockResolvedValue({ id: 'author' })
  mocks.project.mockResolvedValue(project)
  // Stop before any billed provider call, after authority and brief validation.
  mocks.model.mockReturnValue(null)
})
describe('Text artwork authority and source fidelity', () => {
  it('persists a client-owned texture and reviews its imagery while native text stays deterministic', async () => {
    mocks.model.mockReturnValue({ id: 'aigateway/recraft-offer-card', cfModel: 'recraft/recraftv4-1', safetyClass: 'non_vehicle', defaultEnabled: true, mode: 'text-to-image', allowedSubjectTypes: ['non_vehicle'] })
    mocks.generate.mockResolvedValue({ buffer: Buffer.from('texture'), contentType: 'image/png' })
    mocks.upload.mockResolvedValue({ key: 'texture.png', url: 'https://assets.example.com/texture.png', size: 7 })
    mocks.query.mockResolvedValue({ id })
    mocks.review.mockResolvedValue({ passed: true, checkId: 'review-texture', verdict: {} })
    const event = request()
    Object.assign(event.body.effect, { mode: 'keep-font' })
    event.context = { cloudflare: { env: { AI: {} } } } as never
    await expect(handler(event as never)).resolves.toMatchObject({ assetId: id, status: 'ready', review: { status: 'passed' } })
    expect(mocks.query.mock.lastCall?.[1][5]).toContain('font-texture')
    expect(mocks.query.mock.lastCall?.[1][7]).toBe(client)
    expect(mocks.review).toHaveBeenCalledWith(expect.objectContaining({ assetId: id, clientId: client, expectedClaims: expect.objectContaining({ text: undefined }) }))
  })
  it('retries a correctly tagged texture review without generating or checking AI lettering', async () => {
    mocks.query.mockResolvedValue({ client_id: client, tags: ['ai-generated', 'font-texture'], mime_type: 'image/png' })
    mocks.review.mockResolvedValue({ passed: true, checkId: 'review-texture', verdict: {} })
    const event = request({ reviewAssetId: id })
    Object.assign(event.body.effect, { mode: 'keep-font' })
    await expect(handler(event as never)).resolves.toMatchObject({ status: 'ready' })
    expect(mocks.generate).not.toHaveBeenCalled()
    expect(mocks.review).toHaveBeenCalledWith(expect.objectContaining({ expectedClaims: { text: undefined } }))
  })
  it('generates material alone in keep-font mode, without redrawing the wording', async () => {
    const event = request()
    Object.assign(event.body.effect, { mode: 'keep-font' })
    await expect(handler(event as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(event.body.prompt).toContain('material texture')
    expect(event.body.prompt).toContain('No text')
    expect(event.body.prompt).not.toContain('Render exactly')
    expect(event.body.prompt).not.toContain('plain black background')
  })
  it('cannot skip wording review by relabelling existing artwork as a texture', async () => {
    mocks.query.mockResolvedValue({ client_id: client, tags: ['ai-generated'], mime_type: 'image/png' })
    const event = request({ reviewAssetId: id })
    Object.assign(event.body.effect, { mode: 'keep-font' })
    await expect(handler(event as never)).rejects.toMatchObject({ statusCode: 404 })
    expect(mocks.review).not.toHaveBeenCalled()
  })
  it('retries the same image review without invoking image generation', async () => {
    mocks.query.mockResolvedValue({ client_id: client, tags: ['ai-generated'], mime_type: 'image/png' })
    mocks.review.mockResolvedValue({ passed: true, checkId: 'review-1', verdict: { notes: 'Exact lettering verified.' } })
    await expect(handler(request({ reviewAssetId: id }) as never)).resolves.toMatchObject({ assetId: id, status: 'ready', review: { status: 'passed', checkId: 'review-1' } })
    expect(mocks.generate).not.toHaveBeenCalled()
    expect(mocks.review).toHaveBeenCalledWith(expect.objectContaining({ assetId: id, clientId: client, expectedClaims: { text: 'DriveAgent' } }))
  })
  it('distinguishes review service failure from a visual rejection and records it', async () => {
    mocks.query.mockResolvedValue({ client_id: client, tags: ['ai-generated'], mime_type: 'image/png' })
    mocks.review.mockRejectedValue(new Error('A private upstream error'))
    const failed = await handler(request({ reviewAssetId: id }) as never)
    expect(failed).toMatchObject({ status: 'review_blocked', review: { status: 'unavailable' } })
    expect(JSON.stringify(failed)).not.toContain('private upstream')
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({ status: 'error', metadata: { assetId: id } }))
    mocks.review.mockResolvedValue({ passed: false, checkId: 'review-2', verdict: { notes: 'Lettering is unreadable.' } })
    await expect(handler(request({ reviewAssetId: id }) as never)).resolves.toMatchObject({ status: 'review_blocked', review: { status: 'rejected', message: 'Lettering is unreadable.' } })
  })
  it('cannot retry another client or agency asset, or unsaved text', async () => {
    for (const owner of [id, null]) {
      mocks.query.mockResolvedValue({ client_id: owner, tags: ['ai-generated'], mime_type: 'image/png' })
      await expect(handler(request({ reviewAssetId: id }) as never)).rejects.toMatchObject({ statusCode: 404 })
    }
    const event = request({ reviewAssetId: id })
    event.body.effect.text = 'Different text'
    await expect(handler(event as never)).rejects.toMatchObject({ statusCode: 409 })
    expect(mocks.review).not.toHaveBeenCalled()
  })
  it('returns a safe provider failure and records the failed generation', async () => {
    mocks.model.mockReturnValue({ id: 'aigateway/recraft-offer-card', cfModel: 'recraft/recraftv4-1', defaultEnabled: true, mode: 'text-to-image', allowedSubjectTypes: ['non_vehicle'] })
    mocks.generate.mockRejectedValue(new Error('7003: private provider detail'))
    const event = request()
    event.context = { cloudflare: { env: { AI: {} } } } as never
    await expect(handler(event as never)).rejects.toMatchObject({ statusCode: 502, statusMessage: 'Image generation is unavailable. Try again; your banner is unchanged.' })
    expect(mocks.query).not.toHaveBeenCalled()
    expect(mocks.review).not.toHaveBeenCalled()
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({ status: 'error', errorCode: 'creative_generation_failed', modelId: 'recraft/recraftv4-1' }))
    expect(JSON.stringify(mocks.record.mock.calls)).not.toContain('private provider detail')
  })
  it('denies viewers before reading project content', async () => {
    mocks.write.mockRejectedValue({ statusCode: 403 })
    await expect(handler(request() as never)).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.project).not.toHaveBeenCalled()
  })
  it('requires selected text to match the saved source', async () => {
    const event = request()
    event.body.effect.text = 'Unsaved replacement'
    await expect(handler(event as never)).rejects.toMatchObject({ statusCode: 409 })
    expect(mocks.model).not.toHaveBeenCalled()
  })
  it('derives client ownership and specifies exact source text', async () => {
    const event = request()
    await expect(handler(event as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(event.body.clientId).toBe(client)
    expect(event.body.prompt).toContain('Render exactly this text: "DriveAgent"')
    expect(event.body.prompt).toContain('Chrome lettering')
    expect(event.body.prompt).toContain('one horizontal line')
    expect(event.body.aspectRatio).toBe('16:9')
  })
  it('rejects foreign references before loading private manifests', async () => {
    mocks.project.mockResolvedValueOnce(project).mockResolvedValueOnce(project).mockResolvedValueOnce({ ...project, client_id: id })
    const event = request()
    event.body.effect.referenceIds = [id]
    event.body.effect.referenceProjectId = id
    await expect(handler(event as never)).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.references).not.toHaveBeenCalled()
  })
  it('uses retained guide text and image analysis within the prompt budget', async () => {
    mocks.references.mockResolvedValue({ guideText: 'Use our navy brand colour.', references: [{ kind: 'image', description: 'Brushed metal texture. ' + 'x'.repeat(3000) }] })
    const event = request()
    event.body.effect.referenceIds = [id]
    event.body.effect.referenceProjectId = id
    await expect(handler(event as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(event.body.prompt).toContain('Use our navy brand colour.')
    expect(event.body.prompt).toContain('Brushed metal texture.')
    expect(event.body.prompt.length).toBeLessThanOrEqual(2000)
  })
  it('rejects unsupported artwork models and scopes generic requests', async () => {
    await expect(handler(request({ modelId: 'unconfigured-model' }) as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.model).not.toHaveBeenCalled()
    mocks.scope.mockRejectedValue({ statusCode: 403 })
    await expect(handler(request({ projectId: undefined, effect: undefined }) as never)).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.scope).toHaveBeenCalledWith(expect.anything(), id)
  })
})
