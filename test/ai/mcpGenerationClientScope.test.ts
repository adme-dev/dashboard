import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildGenerationRunner } from '~~/server/utils/ai/mcp/generationRunner'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

const mocks = vi.hoisted(() => ({
  createMusicAsset: vi.fn(), getMusicAssetByIdempotencyKey: vi.fn(), requeueFailedMusicAsset: vi.fn(),
  queueSend: vi.fn(), generateVoiceover: vi.fn(), createVoiceAsset: vi.fn(), getAsset: vi.fn(),
  generateCreativeImage: vi.fn(), uploadBannerAsset: vi.fn(), queryOne: vi.fn(), queryRows: vi.fn(),
  runCreativeComplianceCheck: vi.fn(), loadSourceAssetsByIds: vi.fn(), presign: vi.fn(), metadata: vi.fn()
}))

vi.mock('~~/server/utils/audio/voiceGen', () => ({ generateVoiceover: mocks.generateVoiceover }))
vi.mock('~~/server/utils/audio/assets', () => ({
  createVoiceAsset: mocks.createVoiceAsset, createMusicAsset: mocks.createMusicAsset,
  getMusicAssetByIdempotencyKey: mocks.getMusicAssetByIdempotencyKey,
  requeueFailedMusicAsset: mocks.requeueFailedMusicAsset, getAsset: mocks.getAsset
}))
vi.mock('~~/server/utils/audio/musicGuard', () => ({
  loadBlocklist: vi.fn(async () => []), guardAudioPrompt: vi.fn(() => ({ safe: true, violations: [] }))
}))
vi.mock('~~/server/utils/creative-generation/aiGatewayProvider', async importOriginal => ({
  ...await importOriginal<typeof import('~~/server/utils/creative-generation/aiGatewayProvider')>(),
  generateCreativeImage: mocks.generateCreativeImage
}))
vi.mock('~~/server/utils/video-generation/sourceAssetStore', async importOriginal => ({
  ...await importOriginal<typeof import('~~/server/utils/video-generation/sourceAssetStore')>(),
  loadSourceAssetsByIds: mocks.loadSourceAssetsByIds
}))
vi.mock('~~/server/utils/bannerStorage', () => ({ uploadBannerAsset: mocks.uploadBannerAsset }))
vi.mock('~~/server/utils/storage', () => ({ getPresignedDownloadUrl: mocks.presign, getFileMetadata: mocks.metadata }))
vi.mock('~~/server/utils/db', () => ({ queryOne: mocks.queryOne, queryRows: mocks.queryRows }))
vi.mock('~~/server/utils/creativeCompliance', async importOriginal => ({
  ...await importOriginal<typeof import('~~/server/utils/creativeCompliance')>(),
  runCreativeComplianceCheck: mocks.runCreativeComplianceCheck
}))
vi.mock('~~/server/utils/ai/invocationLedger', () => ({ recordAiInvocation: vi.fn() }))

const CLIENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const SOURCE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const music = { prompt: 'Warm acoustic bed', isInstrumental: true, format: 'mp3', channels: [] }
const inputs = {
  generate_banner_image: { prompt: 'Abstract campaign background', aspectRatio: '1:1', modelId: 'aigateway/recraft-offer-card', subjectType: 'non_vehicle', referenceSourceAssetIds: [] },
  upscale_banner_image: { sourceAssetId: SOURCE, subjectType: 'non_vehicle', targetMegapixels: 4, outputFormat: 'webp', outputQuality: 90, enhanceDetails: false, enhanceRealism: false },
  verify_creative_compliance: { assetId: SOURCE, subjectType: 'non_vehicle', referenceSourceAssetIds: [] },
  generate_voiceover: { text: 'Hello', lang: 'en', channels: [] },
  start_music_generation: music
}
type WriteTool = keyof typeof inputs
function context(clientScope = CLIENT, userRole = 'owner'): ToolContext {
  return {
    userId: 'user-1',
    userRole,
    clientScope,
    event: { context: { cloudflare: { env: { AI: { run: vi.fn() }, MUSIC_QUEUE: { send: mocks.queueSend } } } } } as unknown as ToolContext['event']
  }
}
function execution() {
  return { markDispatched: vi.fn(), captureResult: vi.fn() }
}
function noSideEffects(services: ReturnType<typeof execution>) {
  expect(services.markDispatched).not.toHaveBeenCalled()
  expect(services.captureResult).not.toHaveBeenCalled()
  expect(mocks.generateCreativeImage).not.toHaveBeenCalled()
  expect(mocks.generateVoiceover).not.toHaveBeenCalled()
  expect(mocks.uploadBannerAsset).not.toHaveBeenCalled()
  expect(mocks.createVoiceAsset).not.toHaveBeenCalled()
  expect(mocks.createMusicAsset).not.toHaveBeenCalled()
  expect(mocks.queueSend).not.toHaveBeenCalled()
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('fetch', vi.fn(async () => {
    throw new Error('Unexpected network request in scope regression test')
  }))
  mocks.createMusicAsset.mockResolvedValue({ id: 'music-1', status: 'queued', clientId: CLIENT })
  mocks.getMusicAssetByIdempotencyKey.mockResolvedValue(null)
  mocks.requeueFailedMusicAsset.mockResolvedValue(true)
  mocks.generateVoiceover.mockResolvedValue({ sanitizedText: 'Hello', audioBuffer: new Uint8Array(), format: 'mp3', violations: [] })
  mocks.createVoiceAsset.mockResolvedValue({ id: 'voice-1', clientId: CLIENT, status: 'ready', streamUrl: null })
  mocks.generateCreativeImage.mockResolvedValue({ buffer: new Uint8Array(), contentType: 'image/webp', modelId: 'aigateway/recraft-offer-card', cfModel: 'recraft/recraftv4-1', safetyClass: 'non_vehicle_generative' })
  mocks.uploadBannerAsset.mockResolvedValue({ size: 100, key: 'asset.webp', url: 'https://assets.test/asset.webp' })
  mocks.queryOne.mockResolvedValue({ id: 'image-1' })
  mocks.runCreativeComplianceCheck.mockResolvedValue({ checkId: 'check-1', passed: true })
  mocks.loadSourceAssetsByIds.mockImplementation(async (ids: string[]) => ids.map(id => ({ id, client_id: CLIENT, r2_key: 'source.png', status: 'approved', content_type: 'image/png' })))
  mocks.presign.mockResolvedValue('https://assets.test/source.png')
  mocks.metadata.mockResolvedValue({ size: 100, contentType: 'image/png' })
  mocks.getAsset.mockResolvedValue(null)
})
afterEach(() => vi.unstubAllGlobals())

describe('generation runner server-owned client scope', () => {
  for (const tool of Object.keys(inputs) as WriteTool[]) {
    it.each([undefined, CLIENT.toUpperCase()])(`${tool} binds omitted or case-equivalent clientId to the server scope (%s)`, async (clientId) => {
      const args = clientId === undefined ? inputs[tool] : { ...inputs[tool], clientId }
      await buildGenerationRunner()[tool](args, context(CLIENT.toUpperCase()))
      if (tool === 'generate_voiceover') {
        expect(mocks.createVoiceAsset).toHaveBeenCalledWith(expect.objectContaining({ clientId: CLIENT }))
      } else if (tool === 'start_music_generation') {
        expect(mocks.createMusicAsset).toHaveBeenCalledWith(expect.objectContaining({ clientId: CLIENT }))
      } else {
        expect(mocks.runCreativeComplianceCheck).toHaveBeenCalledWith(expect.objectContaining({ clientId: CLIENT, clientScope: CLIENT }))
        if (tool !== 'verify_creative_compliance') {
          expect(mocks.generateCreativeImage).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ metadata: expect.objectContaining({ clientId: CLIENT }) }))
          expect(mocks.queryOne).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO banner_assets'), expect.arrayContaining([CLIENT]))
        }
      }
    })

    it.each(['owner', 'admin'])(`${tool} rejects foreign, null and malformed clientId even for %s`, async (role) => {
      for (const clientId of [OTHER, null, '', 'not-a-uuid']) {
        const services = execution()
        await expect(buildGenerationRunner(services)[tool]({ ...inputs[tool], clientId }, context(CLIENT, role))).rejects.toThrow()
        noSideEffects(services)
        expect(mocks.runCreativeComplianceCheck).not.toHaveBeenCalled()
      }
    })
  }

  it.each([...Object.keys(inputs), 'get_generation_status'])(`%s rejects malformed supplied server scopes before side effects`, async (tool) => {
    for (const scope of [null, '', 'not-a-uuid', 123]) {
      const services = execution()
      const runner = buildGenerationRunner(services)
      const args = tool === 'get_generation_status' ? { jobId: 'music-1' } : inputs[tool as WriteTool]
      const malformedContext = { ...context(), clientScope: scope } as unknown as ToolContext
      await expect(runner[tool](args, malformedContext)).rejects.toThrow()
      noSideEffects(services)
      expect(mocks.getAsset).not.toHaveBeenCalled()
      expect(mocks.runCreativeComplianceCheck).not.toHaveBeenCalled()
    }
  })

  it('passes scope to the audio helper before any playback URL can be issued', async () => {
    const issuedUrls: string[] = []
    mocks.getAsset.mockImplementation(async (jobId: string, scope?: string) => {
      const row = { id: jobId, clientId: OTHER, status: 'ready', kind: 'music', error: null }
      if (scope !== undefined && row.clientId !== scope) return null
      issuedUrls.push('https://private.test/foreign.mp3')
      return { ...row, streamUrl: issuedUrls[0] }
    })
    await expect(buildGenerationRunner().get_generation_status({ jobId: 'foreign-job' }, context(CLIENT.toUpperCase()))).resolves.toEqual({ status: 'not_found' })
    expect(mocks.getAsset).toHaveBeenCalledWith('foreign-job', CLIENT)
    expect(issuedUrls).toEqual([])
  })

  it('returns the ready asset and playback URL for the scoped client', async () => {
    mocks.getAsset.mockResolvedValue({ id: 'music-1', clientId: CLIENT, status: 'ready', kind: 'music', streamUrl: 'https://assets.test/music.mp3', error: null })
    await expect(buildGenerationRunner().get_generation_status({ jobId: 'music-1' }, context(CLIENT.toUpperCase()))).resolves.toEqual({
      jobId: 'music-1', status: 'ready', kind: 'music', assetUrl: 'https://assets.test/music.mp3', error: null
    })
    expect(mocks.getAsset).toHaveBeenCalledWith('music-1', CLIENT)
  })

  it('keeps unscoped agency status reads available', async () => {
    mocks.getAsset.mockResolvedValue({ id: 'music-1', clientId: null, status: 'ready', kind: 'music', streamUrl: 'https://assets.test/music.mp3' })
    const ctx = context()
    delete ctx.clientScope
    await expect(buildGenerationRunner().get_generation_status({ jobId: 'music-1' }, ctx)).resolves.toMatchObject({ jobId: 'music-1', assetUrl: 'https://assets.test/music.mp3' })
  })
})

describe('source ownership is checked before billed generation', () => {
  for (const tool of ['generate_banner_image', 'upscale_banner_image'] as const) {
    it.each([
      ['foreign', OTHER, 'approved'], ['agency shared', null, 'approved'], ['unapproved', CLIENT, 'pending']
    ])(`${tool} rejects %s sources before dispatch`, async (_label, owner, status) => {
      mocks.loadSourceAssetsByIds.mockResolvedValue([{ id: SOURCE, client_id: owner, status, r2_key: 'source.png' }])
      const services = execution()
      const args = tool === 'generate_banner_image' ? { ...inputs[tool], referenceSourceAssetIds: [SOURCE] } : inputs[tool]
      await expect(buildGenerationRunner(services)[tool]({ ...args, clientId: CLIENT }, context())).rejects.toThrow()
      noSideEffects(services)
      expect(mocks.presign).not.toHaveBeenCalled()
    })

    it(`${tool} retains approved agency source sharing for unscoped staff`, async () => {
      mocks.loadSourceAssetsByIds.mockResolvedValue([{ id: SOURCE, client_id: null, status: 'approved', r2_key: 'source.png' }])
      const args = tool === 'generate_banner_image' ? { ...inputs[tool], referenceSourceAssetIds: [SOURCE] } : inputs[tool]
      const ctx = context()
      delete ctx.clientScope
      await expect(buildGenerationRunner()[tool]({ ...args, clientId: CLIENT }, ctx)).resolves.toMatchObject({ assetId: 'image-1' })
      expect(mocks.generateCreativeImage).toHaveBeenCalledTimes(1)
    })
  }

  it.each([null, OTHER])('passes scoped compliance through the real boundary to reject target owner %s', async (owner) => {
    const real = await vi.importActual<typeof import('~~/server/utils/creativeCompliance')>('~~/server/utils/creativeCompliance')
    mocks.runCreativeComplianceCheck.mockImplementation(real.runCreativeComplianceCheck)
    mocks.queryOne.mockImplementation(async (sql: string) => sql.includes('FROM banner_assets') ? null : { id: SOURCE, client_id: owner, status: 'approved', r2_key: 'source.png', content_type: 'image/png' })
    const services = execution()
    await expect(buildGenerationRunner(services).verify_creative_compliance(inputs.verify_creative_compliance, context())).rejects.toThrow(/owned|scope|client/i)
    expect(mocks.runCreativeComplianceCheck).toHaveBeenCalledWith(expect.objectContaining({ clientId: CLIENT, clientScope: CLIENT }))
    expect(mocks.presign).not.toHaveBeenCalled()
    noSideEffects(services)
  })
})

describe('music duplicate handling preserves client isolation', () => {
  it('uses different keys for the same brief in different client scopes and unscoped agency use', async () => {
    const runner = buildGenerationRunner()
    await runner.start_music_generation(music, context(CLIENT))
    await runner.start_music_generation(music, context(OTHER))
    const agency = context()
    delete agency.clientScope
    await runner.start_music_generation(music, agency)
    const keys = mocks.createMusicAsset.mock.calls.map(([input]) => input.idempotencyKey)
    expect(new Set(keys).size).toBe(3)
  })

  it.each([
    ['foreign ready', OTHER, 'ready'], ['foreign failed', OTHER, 'failed'],
    ['agency ready', null, 'ready'], ['agency failed', null, 'failed']
  ])('does not expose or retry a stale %s duplicate', async (_label, owner, status) => {
    const insertError = new Error('unique constraint collision')
    mocks.createMusicAsset.mockRejectedValue(insertError)
    mocks.getMusicAssetByIdempotencyKey.mockResolvedValue({ id: 'foreign-secret-job', clientId: owner, status, error: 'private failure' })
    const services = execution()
    await expect(buildGenerationRunner(services).start_music_generation(music, context())).rejects.toThrow()
    expect(mocks.requeueFailedMusicAsset).not.toHaveBeenCalled()
    expect(mocks.queueSend).not.toHaveBeenCalled()
    expect(services.markDispatched).not.toHaveBeenCalled()
    expect(services.captureResult).not.toHaveBeenCalled()
  })

  it.each([
    ['missing', null],
    ['foreign', { id: 'foreign-secret-job', clientId: OTHER, status: 'queued' }],
    ['agency-owned', { id: 'agency-secret-job', clientId: null, status: 'queued' }]
  ])('does not disclose a %s asset after losing a failed-job retry race', async (_label, reread) => {
    const insertError = new Error('unique constraint collision')
    mocks.createMusicAsset.mockRejectedValue(insertError)
    mocks.getMusicAssetByIdempotencyKey
      .mockResolvedValueOnce({ id: 'existing-job', clientId: CLIENT, status: 'failed' })
      .mockResolvedValueOnce(reread)
    mocks.requeueFailedMusicAsset.mockResolvedValueOnce(false)
    const services = execution()

    await expect(buildGenerationRunner(services).start_music_generation(music, context())).rejects.toBe(insertError)
    expect(mocks.requeueFailedMusicAsset).toHaveBeenCalledWith('existing-job', CLIENT)
    expect(mocks.getMusicAssetByIdempotencyKey).toHaveBeenCalledTimes(2)
    for (const [, scope] of mocks.getMusicAssetByIdempotencyKey.mock.calls) expect(scope).toBe(CLIENT)
    expect(mocks.queueSend).not.toHaveBeenCalled()
    expect(services.markDispatched).not.toHaveBeenCalled()
    expect(services.captureResult).not.toHaveBeenCalled()
  })

  it('rethrows the original insert failure when duplicate lookup finds no record', async () => {
    const insertError = new Error('database unavailable')
    mocks.createMusicAsset.mockRejectedValue(insertError)
    const services = execution()
    await expect(buildGenerationRunner(services).start_music_generation(music, context())).rejects.toBe(insertError)
    expect(mocks.queueSend).not.toHaveBeenCalled()
    expect(services.markDispatched).not.toHaveBeenCalled()
  })

  it.each(['ready', 'failed'])('retains same-client duplicate/retry handling for %s assets', async (status) => {
    mocks.createMusicAsset.mockRejectedValue(new Error('unique constraint collision'))
    mocks.getMusicAssetByIdempotencyKey.mockResolvedValue({ id: 'existing-job', clientId: CLIENT, status })
    const result = await buildGenerationRunner().start_music_generation(music, context())
    expect(result).toMatchObject({ jobId: 'existing-job', status: status === 'failed' ? 'queued' : 'duplicate' })
    expect(mocks.queueSend).toHaveBeenCalledTimes(status === 'failed' ? 1 : 0)
  })
})
