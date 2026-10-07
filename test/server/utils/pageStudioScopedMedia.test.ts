import { expect, it, vi } from 'vitest'
import { readScopedMedia } from '../../../server/utils/pageStudio/standaloneMedia'

const scope = { tenantId: 'tenant', clientId: 'business', businessId: 'business', siteId: 'site', environment: 'staging' as const }
const authority = { scope, actorId: 'native', authorityKey: 'account-workspace', canEdit: true }
const id = '10000000-0000-4000-8000-000000000001'
it('cancels acquired media on revocation during the second asset query', async () => {
  const cancel = vi.fn()
  const authorize = vi.fn().mockResolvedValue(authority)
  let queries = 0
  const query = vi.fn(async () => {
    if (++queries === 2) authorize.mockRejectedValue(new Error('revoked second query'))
    return { object_key: 'page-studio/tenant/business/site/image', media_type: 'image/png', scan_status: 'clean', publication_status: 'draft' }
  })
  await expect(readScopedMedia({ authorize }, id, { query, bucket: { get: async () => ({ body: new ReadableStream({ cancel }), size: 8 }) } })).rejects.toThrow('revoked second query')
  expect(cancel).toHaveBeenCalledOnce()
  expect(query).toHaveBeenCalledWith(expect.stringContaining('client_id=$2'), ['tenant', 'business', 'site', id])
})
it('rejects account substitution after R2 and cancels its stream', async () => {
  const cancel = vi.fn()
  const authorize = vi.fn().mockResolvedValue(authority)
  const query = async () => ({ object_key: 'page-studio/tenant/business/site/image', media_type: 'image/png', scan_status: 'clean', publication_status: 'draft' })
  await expect(readScopedMedia({ authorize }, id, { query, bucket: { get: async () => {
    authorize.mockResolvedValue({ ...authority, authorityKey: 'different-account' })
    return { body: new ReadableStream({ cancel }), size: 8 }
  } } })).rejects.toThrow()
  expect(cancel).toHaveBeenCalledOnce()
})
