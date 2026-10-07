import { describe, expect, it, vi } from 'vitest'
import { readStandaloneMedia } from '~~/server/utils/pageStudio/standaloneMedia'

const input = { siteId: '10000000-0000-4000-8000-000000000001', clientId: '10000000-0000-4000-8000-000000000002', userId: '10000000-0000-4000-8000-000000000003', tokenHash: 'a'.repeat(64) }
const assetId = '10000000-0000-4000-8000-000000000004'
const scope = { tenant_id: 'tenant', client_id: input.clientId, name: 'Website', role: 'viewer' as const }
const row = { object_key: `page-studio/tenant/${input.clientId}/${input.siteId}/car.jpg`, media_type: 'image/jpeg', scan_status: 'clean', publication_status: 'ready' }
function dependencies() {
  const cancel = vi.fn()
  const body = new ReadableStream({ cancel })
  return { authorize: vi.fn().mockResolvedValue(scope), query: vi.fn().mockResolvedValue(row), bucket: { get: vi.fn().mockResolvedValue({ body, size: 4 }) }, body, cancel }
}
describe('standalone media content', () => {
  it('reads the exact owned object and rechecks authority before serving', async () => {
    const deps = dependencies()
    await expect(readStandaloneMedia(input, assetId, deps)).resolves.toMatchObject({ body: deps.body, size: 4, mediaType: 'image/jpeg' })
    expect(deps.bucket.get).toHaveBeenCalledWith(row.object_key)
    expect(deps.query.mock.calls[0]?.[1]).toEqual(['tenant', input.clientId, input.siteId, assetId])
    expect(deps.authorize).toHaveBeenCalledTimes(4)
    expect(deps.query).toHaveBeenCalledTimes(2)
  })
  it('does not read storage when the customer has no access', async () => {
    const deps = dependencies()
    deps.authorize.mockRejectedValue({ statusCode: 404 })
    await expect(readStandaloneMedia(input, assetId, deps)).rejects.toMatchObject({ statusCode: 404 })
    expect(deps.bucket.get).not.toHaveBeenCalled()
  })
  it.each([null, { ...row, media_type: 'image/svg+xml' }, { ...row, scan_status: 'pending' }, { ...row, publication_status: 'archived' }, { ...row, object_key: 'page-studio/other/private.jpg' }])('rejects unavailable or unsafe metadata before storage', async (asset) => {
    const deps = dependencies()
    deps.query.mockResolvedValue(asset)
    await expect(readStandaloneMedia(input, assetId, deps)).rejects.toMatchObject({ statusCode: 404 })
    expect(deps.bucket.get).not.toHaveBeenCalled()
  })
  it('cancels the stream if membership is revoked during storage read', async () => {
    const deps = dependencies()
    deps.authorize.mockResolvedValueOnce(scope).mockResolvedValueOnce(scope).mockRejectedValueOnce({ statusCode: 404 })
    await expect(readStandaloneMedia(input, assetId, deps)).rejects.toMatchObject({ statusCode: 404 })
    expect(deps.cancel).toHaveBeenCalledOnce()
  })
  it('cancels the stream if the asset is archived during storage read', async () => {
    const deps = dependencies()
    deps.query.mockResolvedValueOnce(row).mockResolvedValueOnce({ ...row, publication_status: 'archived' })
    await expect(readStandaloneMedia(input, assetId, deps)).rejects.toMatchObject({ statusCode: 404 })
    expect(deps.cancel).toHaveBeenCalledOnce()
  })
  it('rejects an invalid asset ID before accessing authority or storage', async () => {
    const deps = dependencies()
    await expect(readStandaloneMedia(input, '../private', deps)).rejects.toMatchObject({ statusCode: 400 })
    expect(deps.authorize).not.toHaveBeenCalled()
  })
  it('reports missing storage and missing objects without public URL fallbacks', async () => {
    await expect(readStandaloneMedia(input, assetId, { ...dependencies(), bucket: undefined })).rejects.toMatchObject({ statusCode: 503 })
    const deps = dependencies()
    deps.bucket.get.mockResolvedValue(null)
    await expect(readStandaloneMedia(input, assetId, deps)).rejects.toMatchObject({ statusCode: 404 })
  })
})
