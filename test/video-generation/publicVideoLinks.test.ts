import { afterEach, describe, expect, it, vi } from 'vitest'
import { setCachedCfBindings } from '../../server/utils/cfBindings'
import { signVideoAssetToken, verifyVideoAssetToken } from '../../server/utils/video/assetLinks'
import { signRenderToken, verifyRenderToken } from '../../server/utils/audio/renderLinks'

vi.mock('~~/server/utils/cfBindings', async () => await import('../../server/utils/cfBindings'))
vi.mock('~~/server/utils/db', () => ({ queryOne: vi.fn(), queryRows: vi.fn() }))
vi.mock('~~/server/utils/storage', () => ({ getPresignedDownloadUrl: vi.fn(), getPublicUrl: vi.fn(), isStorageConfigured: vi.fn() }))
vi.mock('~~/server/utils/video/assets', () => ({ mapVideoAssetRow: vi.fn() }))

afterEach(() => {
  setCachedCfBindings({})
  vi.unstubAllEnvs()
})

describe('production public video links on Cloudflare Pages', () => {
  it('signs and verifies both asset and render links with the Pages secret', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('RENDER_LINK_SECRET', '')
    setCachedCfBindings({ RENDER_LINK_SECRET: 'pages-signing-secret-for-video-links' })
    const asset = { assetId: 'asset-1' }
    const render = { jobId: 'job-1', format: 'youtube_16x9' }
    expect(await verifyVideoAssetToken(await signVideoAssetToken(asset))).toEqual(asset)
    expect(await verifyRenderToken(await signRenderToken(render))).toEqual(render)
  })
  it('fails closed when the production signing secret is unavailable', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('RENDER_LINK_SECRET', '')
    setCachedCfBindings({})
    await expect(signVideoAssetToken({ assetId: 'asset-1' })).rejects.toThrow('RENDER_LINK_SECRET')
    await expect(signRenderToken({ jobId: 'job-1', format: '16:9' })).rejects.toThrow('RENDER_LINK_SECRET')
  })
  it('rejects a forged asset capability and a modified asset payload', async () => {
    setCachedCfBindings({ RENDER_LINK_SECRET: 'test-video-link-secret' })
    const signed = await signVideoAssetToken({ assetId: 'asset-1' })
    const [body, signature] = signed.split('.')
    expect(await verifyVideoAssetToken(`${body}.forged`)).toBeNull()
    const other = await signVideoAssetToken({ assetId: 'asset-2' })
    expect(await verifyVideoAssetToken(`${other.split('.')[0]}.${signature}`)).toBeNull()
  })
})
