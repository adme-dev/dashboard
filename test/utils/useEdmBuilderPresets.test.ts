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
