import { describe, it, expect } from 'vitest'
import { validateModuleFragment, ModuleFragmentSchema, MAX_MODULE_BLOCKS } from '~~/server/utils/email-marketing/customModules'

const goodFragment = {
  blocks: {
    a: { type: 'Html', data: { props: { html: '<p>hi</p>' } } },
    b: { type: 'Heading', data: { props: { text: 'Title' } } }
  },
  rootChildrenIds: ['a']
}

describe('validateModuleFragment', () => {
  it('accepts a well-formed fragment', () => {
    const out = validateModuleFragment(goodFragment)
    expect(out.rootChildrenIds).toEqual(['a'])
    expect(Object.keys(out.blocks)).toEqual(['a', 'b'])
  })

  it('rejects an empty blocks map', () => {
    expect(() => validateModuleFragment({ blocks: {}, rootChildrenIds: ['a'] })).toThrow()
  })

  it('rejects empty rootChildrenIds', () => {
    expect(() => validateModuleFragment({ blocks: goodFragment.blocks, rootChildrenIds: [] })).toThrow()
  })

  it('rejects rootChildrenIds pointing at a non-existent block', () => {
    expect(() => validateModuleFragment({ blocks: goodFragment.blocks, rootChildrenIds: ['zzz'] })).toThrow()
  })

  it('rejects a block missing a type', () => {
    expect(() => validateModuleFragment({
      blocks: { a: { data: {} } },
      rootChildrenIds: ['a']
    })).toThrow()
  })

  it('rejects a non-object payload', () => {
    expect(() => validateModuleFragment(null)).toThrow()
    expect(() => validateModuleFragment('nope')).toThrow()
    expect(() => validateModuleFragment([])).toThrow()
  })

  it('rejects a fragment over the block cap', () => {
    const blocks: Record<string, { type: string; data: Record<string, unknown> }> = {}
    for (let i = 0; i <= MAX_MODULE_BLOCKS; i++) blocks[`b${i}`] = { type: 'Text', data: {} }
    expect(() => validateModuleFragment({ blocks, rootChildrenIds: ['b0'] })).toThrow()
  })

  it('preserves arbitrary block data via passthrough', () => {
    const out = validateModuleFragment({
      blocks: { a: { type: 'Html', data: { props: { html: 'x' }, style: { color: '#fff' }, childrenIds: [] } } },
      rootChildrenIds: ['a']
    })
    expect(out.blocks.a.data.style).toEqual({ color: '#fff' })
  })

  it('ModuleFragmentSchema.safeParse reports success=false without throwing', () => {
    expect(ModuleFragmentSchema.safeParse({ blocks: {}, rootChildrenIds: [] }).success).toBe(false)
    expect(ModuleFragmentSchema.safeParse(goodFragment).success).toBe(true)
  })
})
