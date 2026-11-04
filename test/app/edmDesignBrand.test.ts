import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useEdmDesignBrand } from '../../app/composables/useEdmDesignBrand'
import { useEdmBuilder } from '../../app/composables/useEdmBuilder'
import { validateEmailDesign } from '../../shared/emailRendering/designContract'
import { applyDesignBrand } from '../../shared/emailRendering/designBrand'
import { emailBrandDefaults } from '../../shared/emailRendering/designBrandDefaults'
import { structuredDesign } from '../fixtures/email-design/structured'

const fetch = vi.fn()
const draftId = crypto.randomUUID(), kitId = crypto.randomUUID(), revisionId = crypto.randomUUID()
const brand = () => ({ kitId, versionId: crypto.randomUUID(), version: 1, name: 'Client', defaults: emailBrandDefaults({ colors: [{ role: 'primary', hex: '#123456' }], fonts: [{ role: 'body', family: 'Private font' }] }) })
const source = () => applyDesignBrand(structuredDesign(), brand())
const draft = () => ({ state: 'structured', documentId: draftId, templateId: crypto.randomUUID(), headRevisionId: revisionId, projectionRevisionId: revisionId, projection: { state: 'current' }, source: source() })
const options = () => ({ draftId, revisionId, brand: null, kits: [{ id: kitId, name: 'Client', shared: false, isDefault: true, digest: 'a'.repeat(64), defaults: brand().defaults }], defaultKitId: kitId, canManageLocks: true, lockTargets: [] })
describe('brand UI request reconciliation', () => {
  beforeEach(() => {
    fetch.mockReset()
    vi.stubGlobal('$fetch', fetch)
  })
  it('does not mutate on read and keeps the exact original action across lost replies and options refreshes', async () => {
    const flow = useEdmDesignBrand()
    fetch.mockResolvedValueOnce(options())
    await flow.load(draftId)
    expect(fetch.mock.calls[0][1]).toBeUndefined()
    fetch.mockRejectedValueOnce(new Error('network loss'))
    await flow.applyBrand(kitId)
    const original = fetch.mock.calls[1][1].body
    expect(flow.hasPending.value).toBe(true)
    fetch.mockResolvedValueOnce({ ...options(), revisionId: crypto.randomUUID() })
    await flow.load(draftId)
    await flow.applyBrand(kitId)
    expect(fetch).toHaveBeenCalledTimes(3)
    fetch.mockResolvedValueOnce({ documentId: draftId, revisionId }).mockResolvedValueOnce({ draft: draft() }).mockResolvedValueOnce(options())
    await flow.reconcile()
    expect(fetch.mock.calls[3][1].body).toEqual(original)
    expect(flow.hasPending.value).toBe(false)
  })
  it('retains acknowledged mutations through denied readback and newer-head conflicts', async () => {
    const flow = useEdmDesignBrand()
    flow.options.value = options()
    fetch.mockResolvedValueOnce({ documentId: draftId, revisionId }).mockRejectedValueOnce({ statusCode: 403 })
    await flow.applyBrand(kitId)
    expect(flow.hasPending.value).toBe(true)
    const original = fetch.mock.calls[0][1].body
    fetch.mockResolvedValueOnce({ documentId: draftId, revisionId }).mockResolvedValueOnce({ draft: { ...draft(), headRevisionId: crypto.randomUUID() } })
    await flow.reconcile()
    expect(flow.hasPending.value).toBe(true)
    expect(fetch.mock.calls[2][1].body).toEqual(original)
    fetch.mockRejectedValueOnce({ statusCode: 403 })
    await flow.reconcile()
    expect(flow.hasPending.value).toBe(true)
  })
  it('allows correction after definite rejection and never submits policy controls without manager discovery', async () => {
    const flow = useEdmDesignBrand()
    flow.options.value = { ...options(), canManageLocks: false }
    await flow.setLock({ blockId: 'root', target: 'block', locked: false })
    expect(fetch).not.toHaveBeenCalled()
    fetch.mockRejectedValueOnce({ statusCode: 409 })
    await flow.applyBrand(kitId)
    expect(flow.hasPending.value).toBe(false)
  })
  it('pre-styles only fresh composer additions from the shared pinned defaults; copies and inserted authored sections are preserved', () => {
    const store = useEdmBuilder(), design = source()
    store.resetDocument(design.blocks)
    store.setBrandSnapshot(design.source.brand!)
    const before = structuredClone(JSON.parse(JSON.stringify(store.document.value.heading)))
    const button = store.addBlock('Button', 'root', undefined, { props: { text: 'New', buttonBackgroundColor: '#000000' } })
    expect(store.document.value[button].data).toMatchObject({ props: { buttonBackgroundColor: '#123456' }, style: { fontFamily: 'MODERN_SANS' } })
    const duplicate = store.duplicateBlock('heading')!
    expect(store.document.value[duplicate]).toEqual(before)
    store.addBlockToDocument('column-new', 'Heading')
    expect(store.document.value['column-new'].data.style).toMatchObject({ color: '#123456', fontFamily: 'MODERN_SANS' })
    store.insertBlocks({ authored: { type: 'Button', data: { props: { text: 'Saved section', buttonBackgroundColor: '#abcdef' } } } }, ['authored'])
    expect(store.document.value.authored.data.props?.buttonBackgroundColor).toBe('#abcdef')
    expect(store.document.value.heading).toEqual(before)
    store.resetDocument(validateEmailDesign(structuredDesign()).blocks)
    const fresh = store.addBlock('Heading')
    expect(store.document.value[fresh].data.style?.color).toBeUndefined()
  })
})
