// test/crm/engine/resolveObjects.test.ts
import { describe, it, expect } from 'vitest'
import { filterVisibleObjects, type ObjectVisibilityRow } from '~~/server/utils/crm/engine/resolveObjects'

const objs: ObjectVisibilityRow[] = [
  { id: 'o1', key: 'product', vertical_key: 'retail' },
  { id: 'o2', key: 'order', vertical_key: 'retail' },
  { id: 'o3', key: 'permit', vertical_key: 'construction' },
]

describe('filterVisibleObjects', () => {
  it('keeps only objects whose vertical is enabled (generic always allowed)', () => {
    const out = filterVisibleObjects(objs, ['generic', 'retail'])
    expect(out.map(o => o.key)).toEqual(['product', 'order'])
  })

  it('returns nothing when no matching vertical is enabled', () => {
    expect(filterVisibleObjects(objs, ['generic'])).toEqual([])
  })

  it('includes construction objects when that vertical is enabled', () => {
    const out = filterVisibleObjects(objs, ['generic', 'construction'])
    expect(out.map(o => o.key)).toEqual(['permit'])
  })
})
