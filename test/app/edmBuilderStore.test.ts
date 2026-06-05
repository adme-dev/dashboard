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

  it('starts newly inserted buttons with zero outer spacing', () => {
    const s = useEdmBuilder()
    const rootButtonId = s.addBlock('Button', 'root')

    s.addBlockToDocument('nestedButton', 'Button')

    expect(s.document.value[rootButtonId].data.style?.padding).toEqual({
      top: 0,
      bottom: 0,
      left: 0,
      right: 0
    })
    expect(s.document.value.nestedButton.data.style?.padding).toEqual({
      top: 0,
      bottom: 0,
      left: 0,
      right: 0
    })
  })

  it('starts newly inserted columns containers with zero outer spacing', () => {
    const s = useEdmBuilder()
    const columnsId = s.addBlock('ColumnsContainer', 'root')

    expect(s.document.value[columnsId].data.style?.padding).toEqual({
      top: 0,
      bottom: 0,
      left: 0,
      right: 0
    })
  })

  it('starts detached column-ready blocks with zero bottom spacing', () => {
    const s = useEdmBuilder()

    s.addBlockToDocument('nestedText', 'Text')

    expect(s.document.value.nestedText.data.style?.padding).toEqual({
      top: 8,
      bottom: 0,
      left: 8,
      right: 8
    })
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

  it('inserts multiple blocks into a ColumnsContainer column', () => {
    const s = useEdmBuilder()
    const columnsId = s.addBlock('ColumnsContainer', 'root', undefined, {
      props: {
        columnsCount: 2,
        columns: [{ childrenIds: [] }, { childrenIds: [] }, { childrenIds: [] }]
      }
    })

    s.insertBlocksToColumn(columnsId, 1, {
      nestedHeading: { type: 'Heading', data: { props: { text: 'Nested heading' } } },
      nestedButton: { type: 'Button', data: { props: { text: 'Nested CTA', url: '#' } } }
    }, ['nestedHeading', 'nestedButton'])

    expect(s.document.value.nestedHeading.type).toBe('Heading')
    expect(s.document.value.nestedButton.type).toBe('Button')
    const columns = s.document.value[columnsId].data.props?.columns as Array<{ childrenIds: string[] }>
    expect(columns[1]?.childrenIds).toEqual(['nestedHeading', 'nestedButton'])
    expect(s.canUndo.value).toBe(true)
  })

  it('starts blocks inserted into columns with zero bottom spacing', () => {
    const s = useEdmBuilder()
    const columnsId = s.addBlock('ColumnsContainer', 'root', undefined, {
      props: {
        columnsCount: 2,
        columns: [{ childrenIds: [] }, { childrenIds: [] }, { childrenIds: [] }]
      }
    })

    s.insertBlocksToColumn(columnsId, 0, {
      paddedText: {
        type: 'Text',
        data: {
          style: { padding: { top: 16, right: 24, bottom: 16, left: 24 } },
          props: { text: 'Column copy' }
        }
      },
      unpaddedImage: {
        type: 'Image',
        data: {
          props: { url: '/image.png', alt: 'Image' }
        }
      }
    }, ['paddedText', 'unpaddedImage'])

    expect(s.document.value.paddedText.data.style?.padding).toEqual({
      top: 16,
      right: 24,
      bottom: 0,
      left: 24
    })
    expect(s.document.value.unpaddedImage.data.style?.padding).toEqual({
      top: 16,
      right: 24,
      bottom: 0,
      left: 24
    })
  })
})
