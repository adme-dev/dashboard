import { describe, expect, it, vi } from 'vitest'
import { usePageStudioCollectionDraft } from '../../app/composables/usePageStudioCollectionDraft'

const definition = {
  formatVersion: 1 as const,
  id: 'fleet',
  label: 'Fleet',
  displayFieldId: 'name',
  version: 1,
  scope: {
    tenantId: 'tenant',
    clientId: 'client',
    businessId: 'client',
    siteId: 'site_test',
    environment: 'staging' as const
  },
  fields: [
    { id: 'name', label: 'Name', type: 'text' as const, required: true, visibility: 'public' as const }
  ]
}
const saved = {
  actorId: 'user',
  createdAt: '2026-09-21',
  sha256: 'a'.repeat(64),
  record: {
    scope: definition.scope,
    collectionId: 'fleet',
    id: 'car',
    schemaVersion: 1,
    revision: 2,
    archived: false,
    values: { name: 'Original' }
  }
}
describe('generated record draft recovery', () => {
  it('retains edits across conflicting save and background reload', async () => {
    const draft = usePageStudioCollectionDraft(definition, 'car')
    draft.load(saved)
    draft.values.value.name = 'Local'
    await expect(draft.save(vi.fn().mockRejectedValue({ statusCode: 409 }))).rejects.toBeDefined()
    expect(draft.conflicted.value).toBe(true)
    expect(draft.load(saved)).toBe(false)
    expect(draft.values.value.name).toBe('Local')
  })
  it('adopts a compatible schema version without replacing edited values', async () => {
    const draft = usePageStudioCollectionDraft(definition, 'car')
    draft.load(saved)
    draft.values.value.name = 'Local edit'
    draft.updateDefinition({ ...definition, version: 2, fields: [...definition.fields, { id: 'note', label: 'Note', type: 'text', required: false, visibility: 'private' }] })
    draft.values.value.note = 'New optional field'
    const send = vi.fn(async body => ({ ...saved, record: { ...saved.record, revision: 3, schemaVersion: 2, values: (body as { values: unknown }).values } }))
    await draft.save(send)
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ schemaVersion: 2, expectedRevision: 2, values: { name: 'Local edit', note: 'New optional field' } }))
    expect(draft.dirty.value).toBe(false)
  })
  it('restores history into a new revision without resetting optimistic version', () => {
    const draft = usePageStudioCollectionDraft(definition, 'car')
    draft.load(saved)
    draft.restore({ ...saved, record: { ...saved.record, revision: 1, values: { name: 'Historic' } } })
    expect(draft.expectedRevision.value).toBe(2)
    expect(draft.values.value.name).toBe('Historic')
    expect(draft.dirty.value).toBe(true)
  })
  it('validates values, rejects foreign history and preserves edits made during save', async () => {
    const draft = usePageStudioCollectionDraft(definition, 'car')
    draft.load(saved)
    expect(() => draft.restore({ ...saved, record: { ...saved.record, id: 'other' } })).toThrow()
    draft.values.value.name = 'Submitted'
    let resolve!: (value: unknown) => void
    const saving = draft.save(
      () =>
        new Promise((done) => {
          resolve = done
        })
    )
    draft.values.value.name = 'Next edit'
    resolve({ ...saved, record: { ...saved.record, revision: 3, values: { name: 'Submitted' } } })
    await saving
    expect(draft.expectedRevision.value).toBe(3)
    expect(draft.values.value.name).toBe('Next edit')
    expect(draft.dirty.value).toBe(true)
  })
})
