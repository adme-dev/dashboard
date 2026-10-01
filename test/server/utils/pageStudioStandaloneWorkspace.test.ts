import { describe, expect, it, vi } from 'vitest'
import { readStandaloneSiteWorkspace } from '~~/server/utils/pageStudio/standaloneWorkspace'

const input = { siteId: 'c34f6347-cc63-4ed7-9a5a-da165ebefed2', clientId: '0595e5aa-59b4-461e-b8ff-7fe529ca9667', userId: '10000000-0000-4000-8000-000000000099', tokenHash: 'a'.repeat(64) }
const scope = { tenant_id: 'tenant', client_id: input.clientId, name: 'Fantasy Limo', role: 'viewer' }
const document = { id: input.siteId, site: { id: input.siteId, clientId: input.clientId, name: 'Fantasy Limo', route: 'fantasy-limo' }, studio: { checkpointId: 'cp', pages: [] }, document: null, pageLimit: 75, revision: 0, updatedAt: null }
function dependencies() {
  return { query: vi.fn().mockResolvedValue(scope), readDocument: vi.fn().mockResolvedValue(document), readAssets: vi.fn().mockResolvedValue([{ id: 'asset', altText: 'Limousine', mediaType: 'image/jpeg', publicationStatus: 'ready', objectKey: 'private-key', renditions: [{ objectKey: 'private-rendition', fileName: 'car.jpg', size: 12 }] }]) }
}
describe('standalone customer site workspace', () => {
  it('returns the owned saved pages and redacted media to a viewer', async () => {
    const deps = dependencies()
    const result = await readStandaloneSiteWorkspace(input, deps)
    expect(result.canEdit).toBe(false)
    expect(result.document).toEqual(document)
    expect(result.assets).toEqual([{ id: 'asset', altText: 'Limousine', mediaType: 'image/jpeg', publicationStatus: 'ready', fileName: 'car.jpg', size: 12 }])
    expect(deps.query).toHaveBeenCalledTimes(2)
    expect(deps.query.mock.calls[0][1]).toEqual([input.siteId, input.clientId, input.userId, input.tokenHash])
  })
  it('does not read content for an unassigned or foreign site', async () => {
    const deps = dependencies()
    deps.query.mockResolvedValue(null)
    await expect(readStandaloneSiteWorkspace(input, deps)).rejects.toMatchObject({ statusCode: 404 })
    expect(deps.readDocument).not.toHaveBeenCalled()
    expect(deps.readAssets).not.toHaveBeenCalled()
  })
  it('rejects revocation while the checkpoint is being read', async () => {
    const deps = dependencies()
    deps.query.mockResolvedValueOnce(scope).mockResolvedValueOnce(null)
    await expect(readStandaloneSiteWorkspace(input, deps)).rejects.toMatchObject({ statusCode: 404 })
  })
  it('rejects a document from a different customer', async () => {
    const deps = dependencies()
    deps.readDocument.mockResolvedValue({ ...document, site: { ...document.site, clientId: 'other' } })
    await expect(readStandaloneSiteWorkspace(input, deps)).rejects.toMatchObject({ statusCode: 503 })
  })
  it('rejects invalid identifiers before querying', async () => {
    const deps = dependencies()
    await expect(readStandaloneSiteWorkspace({ ...input, siteId: '../other' }, deps)).rejects.toMatchObject({ statusCode: 400 })
    expect(deps.query).not.toHaveBeenCalled()
  })
})
