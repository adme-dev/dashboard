import { describe, expect, it, vi } from 'vitest'
import { resolveSourceAssetUrls } from '~~/server/utils/video-generation/resolveSourceUrls'

describe('resolveSourceAssetUrls', () => {
  it('loads, validates, and presigns each source in order', async () => {
    const deps = {
      load: vi.fn().mockResolvedValue([
        { id: 'a1', client_id: 'd1', r2_key: 'k1', status: 'approved' },
        { id: 'a2', client_id: null, r2_key: 'k2', status: 'approved' },
      ]),
      presign: vi.fn().mockImplementation(async (key: string) => `https://r2/${key}?sig`),
    }
    const urls = await resolveSourceAssetUrls(['a1', 'a2'], 'd1', deps as any)
    expect(urls).toEqual(['https://r2/k1?sig', 'https://r2/k2?sig'])
    expect(deps.presign).toHaveBeenCalledWith('k1', 3600)
  })
  it('returns [] for no ids without hitting the db', async () => {
    const deps = { load: vi.fn(), presign: vi.fn() }
    expect(await resolveSourceAssetUrls([], 'd1', deps as any)).toEqual([])
    expect(deps.load).not.toHaveBeenCalled()
  })
  it('throws when a source is unapproved', async () => {
    const deps = { load: vi.fn().mockResolvedValue([{ id: 'a1', client_id: 'd1', r2_key: 'k1', status: 'pending' }]), presign: vi.fn() }
    await expect(resolveSourceAssetUrls(['a1'], 'd1', deps as any)).rejects.toThrow(/not approved/)
    expect(deps.presign).not.toHaveBeenCalled()
  })
})
