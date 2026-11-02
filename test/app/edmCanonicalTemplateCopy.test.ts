import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useEdmCanonicalTemplateCopy } from '../../app/composables/useEdmCanonicalTemplateCopy'

const fetch = vi.fn()
const id = '10000000-0000-4000-8000-000000000001'
const row = {
  id,
  head_revision_id: id,
  revision_schema_version: 1,
  design_document_id: id,
  name: 'Shared',
  folder_name: 'Campaigns'
}
describe('canonical template copy recovery', () => {
  beforeEach(() => {
    fetch.mockReset()
    vi.stubGlobal('$fetch', fetch)
  })
  it('never submits replacement design JSON and reconciles the exact action after a lost reply', async () => {
    const copy = useEdmCanonicalTemplateCopy()
    fetch.mockRejectedValueOnce(new Error('lost reply'))
    await expect(copy.copy(row, 'Draft', null)).rejects.toThrow('lost reply')
    const original = fetch.mock.calls[0][1].body
    expect(original).toMatchObject({
      command: 'copy-template-draft',
      templateId: id,
      revisionId: id,
      expectedSourceHeadRevisionId: id,
      clientId: null
    })
    expect(original).not.toHaveProperty('design')
    await expect(copy.copy(row, 'Changed name', null)).rejects.toThrow('Reconcile')
    fetch
      .mockResolvedValueOnce({ templateId: id, documentId: id, revisionId: id })
      .mockResolvedValueOnce({ draft: { documentId: id, headRevisionId: id } })
    expect((await copy.reconcile())!.templateId).toBe(id)
    expect(fetch.mock.calls[1][1].body).toEqual(original)
    expect(copy.hasPending.value).toBe(false)
  })
  it('retains receipt when exact readback sees an intervening edit', async () => {
    const copy = useEdmCanonicalTemplateCopy()
    fetch
      .mockResolvedValueOnce({ templateId: id, documentId: id, revisionId: id })
      .mockResolvedValueOnce({ draft: { documentId: id, headRevisionId: crypto.randomUUID() } })
    await expect(copy.copy(row, 'Draft', null)).rejects.toThrow('changed')
    expect(copy.hasPending.value).toBe(true)
    expect(copy.receipt.value).toBe(null)
  })
  it('blocks a versioned original with no structured source instead of legacy copying', async () => {
    const copy = useEdmCanonicalTemplateCopy()
    await expect(copy.copy({ ...row, revision_schema_version: 0 }, 'Draft', null)).rejects.toThrow('structured')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('keeps an unknown copy after authority rejects a later reconciliation', async () => {
    const copy = useEdmCanonicalTemplateCopy()
    fetch.mockRejectedValueOnce(new Error('lost commit reply'))
    await expect(copy.copy(row, 'Draft', null)).rejects.toThrow()
    const original = fetch.mock.calls[0][1].body
    fetch.mockRejectedValueOnce(Object.assign(new Error('access revoked'), { statusCode: 403 }))
    await expect(copy.reconcile()).rejects.toThrow('access revoked')
    expect(copy.hasPending.value).toBe(true)
    await expect(copy.copy(row, 'Different action', null)).rejects.toThrow('Reconcile')
    fetch.mockResolvedValueOnce({ templateId: id, documentId: id, revisionId: id })
      .mockResolvedValueOnce({ draft: { documentId: id, headRevisionId: id } })
    await copy.reconcile()
    expect(fetch.mock.calls[2][1].body).toEqual(original)
  })
})
