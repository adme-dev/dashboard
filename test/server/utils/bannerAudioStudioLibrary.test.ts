import { beforeEach, describe, expect, it, vi } from 'vitest'
import { audioStudioPreviewUrl, requireAudioLibraryProject, reuseAudioStudioTrack } from '~~/server/utils/banner/audioStudioLibrary'
import { listAssets } from '~~/server/utils/audio/assets'
import { buildBannerAudioManifest, readBannerAudioManifest } from '~~/shared/bannerAudioRender.mjs'

const mocks = vi.hoisted(() => ({
  requireWrite: vi.fn(), allClients: vi.fn(), requireClient: vi.fn(), queryFresh: vi.fn(),
  queryRows: vi.fn(), transaction: vi.fn(), query: vi.fn(), stage: vi.fn(),
  read: vi.fn(), upload: vi.fn(), remove: vi.fn(), presign: vi.fn()
}))

vi.mock('~~/server/utils/auth', () => ({ requireWriteAccess: mocks.requireWrite }))
vi.mock('~~/server/utils/banner/clientAccess', () => ({ hasAllBannerClientAccess: mocks.allClients, requireBannerClientAccess: mocks.requireClient }))
vi.mock('~~/server/utils/db', () => ({
  queryOneFresh: mocks.queryFresh, queryRows: mocks.queryRows,
  transactionWithoutRetry: mocks.transaction, getTransactionFailureStage: mocks.stage
}))
vi.mock('~~/server/utils/storage', () => ({ readStoredObject: mocks.read, getPresignedDownloadUrl: mocks.presign, isStorageConfigured: () => true }))
vi.mock('~~/server/utils/banner/assetDelivery', () => ({ resolveBannerAssetDelivery: () => ({ signingSecret: 'fixture-secret' }) }))
vi.mock('~~/server/utils/appUrl', () => ({ getAppUrl: () => 'https://app.xeroflow.io' }))
vi.mock('~~/server/utils/bannerStorage', () => ({
  createBannerAssetId: () => 'managed',
  createBannerAssetStorageKey: (filename: string) => `banner-assets/${filename}`,
  bannerAssetDeliveryUrl: () => 'https://app.xeroflow.io/api/public/banner-assets/v1.fixture.track',
  uploadBannerAsset: mocks.upload,
  deleteBannerFile: mocks.remove
}))

const event = {} as Parameters<typeof reuseAudioStudioTrack>[0]
const trackId = '11111111-1111-4111-8111-111111111111'
const clientId = '22222222-2222-4222-8222-222222222222'
const projectId = '33333333-3333-4333-8333-333333333333'
const userId = '44444444-4444-4444-8444-444444444444'
const source = { clientId, key: `audio/${clientId}/${trackId}/master.wav`, kind: 'music', title: 'Campaign bed' }
const managed = { id: 'managed', url: 'https://app.xeroflow.io/api/public/banner-assets/v1.fixture.track', name: source.title, mimeType: 'audio/wav' }
const waveHeader = Buffer.from('RIFF0000WAVE')

beforeEach(() => {
  vi.resetAllMocks()
  mocks.requireWrite.mockResolvedValue({ id: userId })
  mocks.transaction.mockImplementation(async work => await work({ query: mocks.query }))
  mocks.read.mockImplementation(async () => ({ size: waveHeader.length, body: new Blob([waveHeader]).stream() }))
  mocks.remove.mockResolvedValue(undefined)
  mocks.upload.mockImplementation(async (bytes, _name, _mime, _user, key, _binding, url) => ({ size: bytes.length, key, url }))
  mocks.query.mockImplementation(async sql => ({ rows: sql.includes('INSERT INTO banner_assets') ? [managed] : [] }))
})

describe('Banner Studio Audio Studio library', () => {
  it('scopes playable search and paging to the job’s client and shared tracks', async () => {
    mocks.queryFresh.mockResolvedValueOnce({ clientId, createdBy: userId })
    const project = await requireAudioLibraryProject(event, projectId)
    expect(mocks.requireClient).toHaveBeenCalledWith(event, clientId)
    mocks.queryRows.mockResolvedValueOnce([{ id: trackId, client_id: clientId, title: 'Bed', kind: 'music', r2_key_master: source.key }])
    const [track] = await listAssets({ clientId: project.clientId, includeShared: true, playableOnly: true, includeVariants: false, search: 'bed', kind: 'music', limit: 13, offset: 12 })
    const [sql, params] = mocks.queryRows.mock.calls[0]!
    expect(params).toEqual(['music', clientId, 'bed', 13, 12])
    expect(sql).toContain('(client_id = $2 OR client_id IS NULL)')
    expect(sql).toMatch(/status IN \('ready', 'done'\)/)
    expect(sql).toContain('ORDER BY created_at DESC, id DESC LIMIT $4 OFFSET $5')
    expect(track?.streamUrl).toBe(`/api/agency/audio/assets/${trackId}/stream`)
    expect(mocks.presign).not.toHaveBeenCalled()
  })

  it('does not read a track outside the job’s client or the shared library', async () => {
    mocks.queryFresh.mockResolvedValueOnce(null)
    await expect(reuseAudioStudioTrack(event, trackId, { clientId, userId })).rejects.toMatchObject({ statusCode: 404 })
    expect(mocks.queryFresh).toHaveBeenCalledWith(expect.stringContaining('(client_id IS NULL OR client_id = $2)'), [trackId, clientId])
    expect(mocks.read).not.toHaveBeenCalled()
    expect(mocks.upload).not.toHaveBeenCalled()
  })

  it('signs previews only after checking the job’s client', async () => {
    mocks.queryFresh.mockResolvedValueOnce(null).mockResolvedValueOnce(source)
    mocks.presign.mockResolvedValue('https://assets.example.test/preview.wav')
    await expect(audioStudioPreviewUrl(trackId, null)).rejects.toMatchObject({ statusCode: 404 })
    expect(mocks.presign).not.toHaveBeenCalled()
    await expect(audioStudioPreviewUrl(trackId, clientId)).resolves.toBe('https://assets.example.test/preview.wav')
    expect(mocks.queryFresh).toHaveBeenLastCalledWith(expect.stringContaining('(client_id IS NULL OR client_id = $2)'), [trackId, clientId])
    expect(mocks.presign).toHaveBeenCalledExactlyOnceWith(source.key, 300)
  })

  it('stores one managed copy that can be reused by another job and exported', async () => {
    mocks.queryFresh.mockResolvedValue(source)
    const first = await reuseAudioStudioTrack(event, trackId, { clientId, userId })
    expect(mocks.upload).toHaveBeenCalledWith(waveHeader, `audio-studio-${trackId}.wav`, 'audio/wav', userId, expect.any(String), undefined, managed.url)
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO banner_assets'), expect.arrayContaining([clientId, ['audio-studio', `audio-studio:${trackId}`]]))
    mocks.query.mockImplementation(async sql => ({ rows: sql.includes('FROM banner_assets') ? [managed] : [] }))
    const second = await reuseAudioStudioTrack(event, trackId, { clientId, userId: 'another-editor' })
    expect(first).toEqual(second)
    expect(mocks.upload).toHaveBeenCalledOnce()
    const manifest = buildBannerAudioManifest([{ type: 'audio', src: managed.url, startTime: 0, endTime: 3 }])
    expect(readBannerAudioManifest(`<audio src="${managed.url}"></audio>${manifest}`)[0]?.src).toBe(managed.url)
  })

  it('cleans up only a copy that could not be committed', async () => {
    mocks.queryFresh.mockResolvedValue(source)
    mocks.query.mockImplementation(async (sql) => {
      if (sql.includes('INSERT INTO banner_assets')) throw new Error('insert failed')
      return { rows: [] }
    })
    await expect(reuseAudioStudioTrack(event, trackId, { clientId, userId })).rejects.toThrow('insert failed')
    expect(mocks.remove).toHaveBeenCalledWith(`banner-assets/audio-studio-${trackId}.wav`, undefined)
  })
})
