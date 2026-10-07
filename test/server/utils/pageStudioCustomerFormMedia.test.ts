import { describe, expect, it, vi } from 'vitest'
import { createCustomerFormContext } from '../../../server/utils/pageStudio/customerForms'
import { queryOneFresh } from '../../../server/utils/db'
import { starterEmailTemplate } from '../../../shared/pageStudio/emailTemplates'

vi.mock('~~/server/utils/db', () => ({ queryOneFresh: vi.fn(), queryRowsFresh: vi.fn(), transaction: vi.fn() }))
const scope = { tenantId: 'tenant_one', clientId: 'business_one', businessId: 'business_one', siteId: 'site_one', environment: 'staging' as const }
const authority = { scope, workspaceId: 'workspace_one', actor: { kind: 'customer-user' as const, userId: 'native_one', accountId: 'account_one' }, canEdit: true }
const assetId = '10000000-0000-4000-8000-000000000001'
const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])
const template = { ...starterEmailTemplate('team'), blocks: [{ id: 'photo', type: 'image' as const, assetId, alt: 'Photo', width: 500, alignment: 'center' as const }] }
function setup(bytes = png, size = bytes.length) {
  vi.mocked(queryOneFresh).mockResolvedValue({ object_key: 'page-studio/tenant_one/business_one/site_one/image', media_type: 'image/png', scan_status: 'clean', publication_status: 'draft' })
  const authorize = vi.fn().mockResolvedValue(authority)
  const get = vi.fn(async () => ({ size, body: new ReadableStream<Uint8Array>({ pull(controller) {
    controller.enqueue(bytes)
    controller.close()
  } }, { highWaterMark: 0 }) }))
  const context = createCustomerFormContext({ sessionToken: 'a'.repeat(64), siteId: scope.siteId, environment: 'staging' }, { MEDIA_BUCKET: { get } }, { authority: authorize })
  return { context, authorize, get }
}
describe('native scoped email media consumption', () => {
  it('embeds admitted own raster bytes without URLs or portal login', async () => {
    const s = setup()
    const result = await s.context.resolveMedia(template)
    expect(result.images[assetId]).toBe('data:image/png;base64,iVBORw0KGgoAAAAA')
    expect(result.warnings).toEqual([])
    expect(s.get).toHaveBeenCalledWith('page-studio/tenant_one/business_one/site_one/image')
  })
  it('rechecks current native account after R2 stream bytes finish', async () => {
    const s = setup()
    s.get.mockImplementation(async () => ({ size: png.length, body: new ReadableStream<Uint8Array>({ pull(controller) {
      s.authorize.mockResolvedValue({ ...authority, actor: { ...authority.actor, accountId: 'substituted' } })
      controller.enqueue(png)
      controller.close()
    } }, { highWaterMark: 0 }) }))
    await expect(s.context.resolveMedia(template)).rejects.toMatchObject({ statusCode: 403 })
  })
  it.each(['signature', 'length', 'mime', 'crossscope', 'size'])('rejects invalid native %s media with a safe missing image warning', async (kind) => {
    const s = setup(kind === 'signature' ? new Uint8Array(12) : png, kind === 'length' ? 13 : kind === 'size' ? 600000 : 12)
    if (kind === 'mime') vi.mocked(queryOneFresh).mockResolvedValue({ object_key: 'page-studio/tenant_one/business_one/site_one/image', media_type: 'image/svg+xml', scan_status: 'clean', publication_status: 'draft' })
    if (kind === 'crossscope') vi.mocked(queryOneFresh).mockResolvedValue({ object_key: 'page-studio/other/private/image', media_type: 'image/png', scan_status: 'clean', publication_status: 'draft' })
    const result = await s.context.resolveMedia(template)
    expect(result.images[assetId]).toBeUndefined()
    expect(result.warnings).toHaveLength(1)
  })
  it('counts repeated placements toward aggregate email bytes', async () => {
    const bytes = new Uint8Array(500000)
    bytes.set(png)
    const s = setup(bytes)
    const repeated = { ...template, blocks: Array.from({ length: 5 }, (_, index) => ({ ...template.blocks[0]!, id: 'photo_' + index })) }
    expect((await s.context.resolveMedia(repeated)).warnings).toHaveLength(1)
  })
  it('cancels bytes when actual stream exceeds declared size and per-image bound', async () => {
    const s = setup()
    const cancel = vi.fn()
    let count = 0
    s.get.mockImplementation(async () => ({ size: 12, body: new ReadableStream<Uint8Array>({ pull(controller) {
      controller.enqueue(new Uint8Array(++count === 1 ? 400000 : 200000))
    }, cancel }, { highWaterMark: 0 }) }))
    expect((await s.context.resolveMedia(template)).warnings).toHaveLength(1)
    expect(cancel).toHaveBeenCalledOnce()
  })
})
