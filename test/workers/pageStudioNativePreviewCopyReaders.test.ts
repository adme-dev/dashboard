import { describe, expect, it, vi } from 'vitest'
import { createTransferCopyReaders } from '../../workers/page-studio-management/src/transfer/copyPlan'
import { nativePreviewBindings } from '../utils/pageStudioNativePreview'

const scope = { tenantId: 'native', businessId: 'business', clientId: 'business', siteId: 'site', environment: 'staging' }
const checkpoint = { id: 'saved', digest: 'a'.repeat(64), object_key: 'tenants/native/clients/business/sites/site/checkpoints/saved.json' }
const intent = { authority: { source: scope }, source: { checkpoint, recordHeads: [], objects: [],
  context: { state: { target: { kind: 'd1', databaseId: 'source' }, freeze_digest: 'b'.repeat(64), current_content_id: null }, selections: [] } } }
function fixture() {
  const source = { get: vi.fn().mockResolvedValue(null) }, shared = { get: vi.fn().mockResolvedValue(null) }
  const router = { readManagedCmsTarget: vi.fn(), readManagedCmsObjectsAtTarget: vi.fn() }
  return { source, shared, env: { ...nativePreviewBindings(), PAGE_STUDIO_CUSTOMER_PREVIEW_CHECKPOINTS: source,
    PAGE_STUDIO_CUSTOMER_PREVIEW_CONTENT_ROUTER: router, PAGE_STUDIO_CMS_STAGING_CONTENT_ROUTER: router, PAGE_STUDIO_CMS_STAGING_CHECKPOINTS: shared } }
}
describe('native managed transfer isolated source readers', () => {
  it('reads the original checkpoint only from the dedicated store without fallback on missing bytes', async () => {
    const f = fixture()
    const read = createTransferCopyReaders(f.env)
    await expect(read(intent as never)).rejects.toThrow()
    expect(f.source.get).toHaveBeenCalledWith(checkpoint.object_key)
    expect(f.shared.get).not.toHaveBeenCalled()
  })
  it('preserves existing source readers when dedicated configuration is wholly absent', async () => {
    const f = fixture()
    const read = createTransferCopyReaders({ PAGE_STUDIO_CMS_STAGING_CONTENT_ROUTER: f.env.PAGE_STUDIO_CMS_STAGING_CONTENT_ROUTER,
      PAGE_STUDIO_CMS_STAGING_CHECKPOINTS: f.shared })
    await expect(read(intent as never)).rejects.toThrow()
    expect(f.shared.get).toHaveBeenCalledWith(checkpoint.object_key)
    expect(f.source.get).not.toHaveBeenCalled()
  })
  it('rejects disabled and partially configured dedicated sources before shared storage reads', () => {
    const f = fixture()
    expect(() => createTransferCopyReaders({ ...f.env, PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED: 'false' })).toThrow()
    expect(() => createTransferCopyReaders({ ...f.env, PAGE_STUDIO_CUSTOMER_PREVIEW_CHECKPOINTS: undefined })).toThrow()
    expect(f.shared.get).not.toHaveBeenCalled()
  })
})
