import { beforeEach, describe, expect, it } from 'vitest'
import { useEdmBuilder } from '~~/app/composables/useEdmBuilder'
import { buildStarterTemplateDocument } from '~~/app/utils/edmPresets'

describe('useEdmBuilder preset actions', () => {
  beforeEach(() => {
    useEdmBuilder().resetDocument()
  })

  it('inserts a section preset into the root document', () => {
    const store = useEdmBuilder()
    store.insertSectionPreset('header-logo-menu')
    const childIds = store.document.value.root.data.childrenIds || []
    expect(childIds).toHaveLength(2)
    expect(store.document.value[childIds[0]]?.type).toBe('header')
    expect(store.document.value[childIds[1]]?.type).toBe('menu')
  })

  it('inserts a section preset at a requested position', () => {
    const store = useEdmBuilder()
    const firstId = store.addBlock('Heading')
    store.insertSectionPreset('footer-legal', 0)
    const childIds = store.document.value.root.data.childrenIds || []
    expect(store.document.value[childIds[0]]?.type).toBe('footer')
    expect(childIds[1]).toBe(firstId)
  })

  it('insertBlocks is a no-op when the parent is missing', () => {
    const store = useEdmBuilder()
    const before = JSON.parse(JSON.stringify(store.document.value))

    store.insertBlocks({}, [], 'missing-parent')

    expect(store.document.value).toEqual(before)
    expect(store.canUndo.value).toBe(false)
    expect(store.canRedo.value).toBe(false)
  })

  it('creates an undo frame for preset insertion after a microtask boundary', async () => {
    const store = useEdmBuilder()
    const firstId = store.addBlock('Heading')
    await Promise.resolve()

    store.insertSectionPreset('header-logo-menu')
    const insertedIds = [...(store.document.value.root.data.childrenIds || [])]

    expect(store.canUndo.value).toBe(true)
    expect(insertedIds).toHaveLength(3)

    store.undo()

    expect(store.document.value.root.data.childrenIds).toEqual([firstId])
    for (const insertedId of insertedIds.slice(1)) {
      expect(store.document.value[insertedId]).toBeUndefined()
    }
  })

  it('clamps preset insertion positions within the root bounds', () => {
    const store = useEdmBuilder()

    store.insertSectionPreset('footer-legal', -12)
    const negativeChildIds = store.document.value.root.data.childrenIds || []
    expect(store.document.value[negativeChildIds[0]]?.type).toBe('footer')

    store.resetDocument()
    const endBlockId = store.addBlock('Heading')
    store.insertSectionPreset('footer-legal', 999)
    const largeChildIds = store.document.value.root.data.childrenIds || []
    expect(largeChildIds).toHaveLength(2)
    expect(largeChildIds[0]).toBe(endBlockId)
    expect(store.document.value[largeChildIds[1]]?.type).toBe('footer')
  })

  it('keeps Basic block insertion available after section insertion', () => {
    const store = useEdmBuilder()
    store.insertSectionPreset('hero-dark-product')
    const headingId = store.addBlock('Heading')
    const childIds = store.document.value.root.data.childrenIds || []
    expect(childIds).toContain(headingId)
    expect(store.document.value[headingId]?.type).toBe('Heading')
  })

  it('loads a starter template document and resets history', () => {
    const store = useEdmBuilder()
    store.addBlock('Heading')
    expect(store.canUndo.value).toBe(true)
    store.setTemplatePreset('newsletter-digest')
    expect(store.document.value.root.data.childrenIds?.length).toBe(
      buildStarterTemplateDocument('newsletter-digest').root.data.childrenIds?.length
    )
    expect(store.canUndo.value).toBe(false)
  })
})
