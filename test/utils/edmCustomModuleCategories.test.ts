import { describe, expect, it } from 'vitest'
import {
  groupCustomModulesByCategory,
  inferCustomModuleCategoryFromBlockType,
  labelCustomModuleCategory,
  normaliseCustomModuleCategory,
  resolveCustomModuleCategorySelection
} from '~~/app/utils/edmCustomModuleCategories'
import type { EdmCustomModule } from '~~/app/composables/useEdmCustomModules'

function module(id: string, category: string): EdmCustomModule {
  return {
    id,
    name: id,
    description: null,
    category,
    blocks: { blocks: {}, rootChildrenIds: [] },
    preview_tone: 'light',
    client_id: null,
    created_by: null,
    created_at: '2026-06-05T00:00:00.000Z',
    updated_at: '2026-06-05T00:00:00.000Z'
  }
}

describe('edmCustomModuleCategories', () => {
  it('normalises custom category labels into stable slugs', () => {
    expect(normaliseCustomModuleCategory(' Dealer Specials! ')).toBe('dealer-specials')
    expect(normaliseCustomModuleCategory('')).toBe('custom')
  })

  it('labels known and custom category slugs for the palette', () => {
    expect(labelCustomModuleCategory('call-to-action')).toBe('Call to action')
    expect(labelCustomModuleCategory('dealer-specials')).toBe('Dealer Specials')
    expect(labelCustomModuleCategory('custom')).toBe('Misc')
  })

  it('groups modules by category with known categories ordered before custom categories', () => {
    const groups = groupCustomModulesByCategory([
      module('footer-a', 'footer'),
      module('dealer-a', 'dealer-specials'),
      module('header-a', 'header'),
      module('dealer-b', 'dealer-specials')
    ])

    expect(groups.map(group => [group.category, group.label, group.modules.map(m => m.id)])).toEqual([
      ['header', 'Header', ['header-a']],
      ['footer', 'Footer', ['footer-a']],
      ['dealer-specials', 'Dealer Specials', ['dealer-a', 'dealer-b']]
    ])
  })

  it('infers a sensible default category from the selected block type', () => {
    expect(inferCustomModuleCategoryFromBlockType('header')).toBe('header')
    expect(inferCustomModuleCategoryFromBlockType('footer')).toBe('footer')
    expect(inferCustomModuleCategoryFromBlockType('hero-section')).toBe('hero')
    expect(inferCustomModuleCategoryFromBlockType('Html')).toBe('imported')
    expect(inferCustomModuleCategoryFromBlockType('Button')).toBe('call-to-action')
    expect(inferCustomModuleCategoryFromBlockType('unknown')).toBe('custom')
  })

  it('resolves built-in or newly created category selections for saving', () => {
    expect(resolveCustomModuleCategorySelection('header', '')).toBe('header')
    expect(resolveCustomModuleCategorySelection('__new__', 'Dealer Specials')).toBe('dealer-specials')
    expect(resolveCustomModuleCategorySelection('__new__', '')).toBe('custom')
  })
})
