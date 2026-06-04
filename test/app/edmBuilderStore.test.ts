// test/app/edmBuilderStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useEdmBuilder } from '~~/app/composables/useEdmBuilder'

describe('useEdmBuilder store', () => {
  beforeEach(() => {
    useEdmBuilder().resetDocument()
  })

  it('starts with an empty root EmailLayout', () => {
    const s = useEdmBuilder()
    expect(s.document.value.root.type).toBe('EmailLayout')
    expect(s.document.value.root.data.childrenIds).toEqual([])
  })

  it('is a singleton — repeated calls share state', () => {
    expect(useEdmBuilder()).toBe(useEdmBuilder())
  })

  it('addBlock adds a child under root and records history', () => {
    const s = useEdmBuilder()
    const id = s.addBlock('Heading', 'root')
    expect(id).toBeTruthy()
    expect(s.document.value[id]).toBeTruthy()
    expect(s.document.value.root.data.childrenIds).toContain(id)
    expect(s.canUndo.value).toBe(true)
  })

  it('undo reverses the last addBlock', () => {
    const s = useEdmBuilder()
    const id = s.addBlock('Heading', 'root')
    s.undo()
    expect(s.document.value[id]).toBeUndefined()
    expect(s.document.value.root.data.childrenIds).not.toContain(id)
  })

  it('removeBlock deletes the block and its parent reference', () => {
    const s = useEdmBuilder()
    const id = s.addBlock('Text', 'root')
    s.removeBlock(id)
    expect(s.document.value[id]).toBeUndefined()
    expect(s.document.value.root.data.childrenIds).not.toContain(id)
  })

  it('updates mobile style without changing desktop style', () => {
    const s = useEdmBuilder()
    const id = s.addBlock('Text', 'root', undefined, {
      style: { color: '#111111' },
      props: { text: 'Desktop' }
    })

    s.updateBlockMobileStyle(id, { color: '#222222', fontSize: 14 })

    expect(s.document.value[id].data.style).toEqual({ color: '#111111' })
    expect(s.document.value[id].data.mobile?.style).toEqual({ color: '#222222', fontSize: 14 })
    expect(s.canUndo.value).toBe(true)
  })

  it('updates mobile props and device visibility flags', () => {
    const s = useEdmBuilder()
    const id = s.addBlock('Text', 'root', undefined, { props: { text: 'Desktop' } })

    s.updateBlockMobileProps(id, { text: 'Mobile' })
    s.updateBlockVisibility(id, { hideOnDesktop: true, hideOnMobile: false })

    expect(s.document.value[id].data.props).toEqual({ text: 'Desktop' })
    expect(s.document.value[id].data.mobile?.props).toEqual({ text: 'Mobile' })
    expect(s.document.value[id].data.hideOnDesktop).toBe(true)
    expect(s.document.value[id].data.hideOnMobile).toBe(false)
  })
})
