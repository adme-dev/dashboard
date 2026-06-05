import { describe, it, expect } from 'vitest'
import { BLOCK_PALETTE, getDefaultBlockData } from '~~/app/utils/edmBlocks'

describe('edmBlocks palette', () => {
  it('exposes the 10 agency block types in order', () => {
    expect(BLOCK_PALETTE.map(b => b.type)).toEqual([
      'Heading', 'Text', 'Button', 'Image', 'Avatar',
      'Divider', 'Spacer', 'Html', 'ColumnsContainer', 'Container'
    ])
  })

  it('uses iconify lucide name strings (no component imports)', () => {
    for (const b of BLOCK_PALETTE) {
      expect(b.icon).toMatch(/^i-lucide-[a-z0-9-]+$/)
      expect(b.name.length).toBeGreaterThan(0)
    }
  })
})

describe('getDefaultBlockData', () => {
  it('gives a Heading text + level under props, with padding style', () => {
    const d = getDefaultBlockData('Heading')
    expect(d.props).toEqual({ text: 'New Heading', level: 'h2' })
    expect(d.style).toEqual({ padding: { top: 16, bottom: 16, left: 24, right: 24 } })
  })

  it('gives a Container an empty childrenIds array', () => {
    const d = getDefaultBlockData('Container')
    expect(d.childrenIds).toEqual([])
    expect(d.props).toEqual({})
  })

  it('gives a ColumnsContainer a 3-slot columns array + layout props, plus childrenIds', () => {
    const d = getDefaultBlockData('ColumnsContainer')
    expect(d.childrenIds).toEqual([])
    expect(d.style).toEqual({ padding: { top: 0, bottom: 0, left: 0, right: 0 } })
    expect(d.props).toEqual({
      columnsCount: 2,
      columnsGap: 16,
      contentAlignment: 'top',
      columns: [{ childrenIds: [] }, { childrenIds: [] }, { childrenIds: [] }]
    })
  })

  it('gives a Button its url + brand colour default', () => {
    expect(getDefaultBlockData('Button').props).toEqual({
      text: 'Click Here', url: '#', buttonBackgroundColor: '#2f4574'
    })
  })

  it('returns empty props for an unknown type', () => {
    expect(getDefaultBlockData('Nope').props).toEqual({})
  })
})
