import { describe, expect, it } from 'vitest'
import { resolveRootDropIndex } from '~~/app/utils/edmDragReorder'

describe('resolveRootDropIndex', () => {
  const children = ['hero', 'intro', 'offer', 'footer']

  it('moves a block earlier using the original drop boundary', () => {
    expect(resolveRootDropIndex(children, 'footer', 1)).toBe(1)
  })

  it('adjusts the store insertion index when moving a block later', () => {
    expect(resolveRootDropIndex(children, 'hero', 3)).toBe(2)
  })

  it('returns null when dropping on the current before or after boundary', () => {
    expect(resolveRootDropIndex(children, 'intro', 1)).toBeNull()
    expect(resolveRootDropIndex(children, 'intro', 2)).toBeNull()
  })

  it('clamps out-of-range drop boundaries', () => {
    expect(resolveRootDropIndex(children, 'footer', -4)).toBe(0)
    expect(resolveRootDropIndex(children, 'hero', 99)).toBe(3)
  })

  it('returns null for unknown dragged blocks', () => {
    expect(resolveRootDropIndex(children, 'missing', 2)).toBeNull()
  })
})
