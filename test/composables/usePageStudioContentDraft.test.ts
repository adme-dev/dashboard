import { describe, expect, it, vi } from 'vitest'
import { usePageStudioContentDraft } from '../../app/composables/usePageStudioContentDraft'

const state = {
  actorId: 'user_test', createdAt: '2026-09-07 12:00:00', revision: 1,
  content: { schemaVersion: 1, scope: { tenantId: 'tenant_test', clientId: 'client_test', businessId: 'business_test', siteId: 'site_test', environment: 'preview' },
    collections: [{ id: 'services', records: [{ id: 'wedding', title: 'Wedding', summary: 'Original', status: 'draft', attributes: { retained: 'value' } }] }] }
}

describe('business content editing recovery', () => {
  it('marks newly created records clean after the server normalises field order and whitespace', async () => {
    const draft = usePageStudioContentDraft()
    draft.load(state)
    draft.collections.value[0]!.records.push({ id: 'new_record', title: ' New service ', summary: '', status: 'draft', attributes: {} })
    await draft.save(async body => ({ ...state, revision: 2, content: { ...state.content, collections: (body as { collections: unknown }).collections } }))
    expect(draft.dirty.value).toBe(false)
    expect(draft.collections.value[0]!.records[1]!.title).toBe('New service')
  })
  it('keeps unsaved edits on conflict and refuses a background replacement', async () => {
    const draft = usePageStudioContentDraft()
    draft.load(state)
    draft.collections.value[0]!.records[0]!.summary = 'My edit'
    await expect(draft.save(vi.fn().mockRejectedValue({ statusCode: 409 }))).rejects.toBeDefined()
    expect(draft.dirty.value).toBe(true)
    expect(draft.conflicted.value).toBe(true)
    expect(draft.load(state)).toBe(false)
    expect(draft.collections.value[0]!.records[0]!.summary).toBe('My edit')
    expect(draft.load(state, true)).toBe(true)
    expect(draft.conflicted.value).toBe(false)
  })
  it('sends only records and revision, retains attributes, and preserves edits made during a save', async () => {
    const draft = usePageStudioContentDraft()
    draft.load(state)
    draft.collections.value[0]!.records[0]!.summary = 'Saved edit'
    let finish!: (value: unknown) => void
    const send = vi.fn((_body: unknown) => new Promise((resolve) => {
      finish = resolve
    }))
    const saving = draft.save(send)
    const sent = send.mock.calls[0]![0] as { collections: typeof state.content.collections, expectedRevision: number }
    expect(Object.keys(sent).sort()).toEqual(['collections', 'expectedRevision'])
    expect(sent.collections[0]!.records[0]!.attributes.retained).toBe('value')
    draft.collections.value[0]!.records[0]!.summary = 'Next edit'
    finish({ ...state, revision: 2, content: { ...state.content, collections: sent.collections } })
    await saving
    expect(draft.revision.value).toBe(2)
    expect(draft.collections.value[0]!.records[0]!.summary).toBe('Next edit')
    expect(draft.dirty.value).toBe(true)
  })
})
