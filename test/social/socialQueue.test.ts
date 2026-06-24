import { describe, it, expect } from 'vitest'
import { reorder } from '../../app/utils/socialQueue'

describe('reorder', () => {
  it('moves an item down to a later index', () => {
    expect(reorder(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd'])
  })

  it('moves an item up to an earlier index', () => {
    expect(reorder(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c'])
  })

  it('is a no-op when from === to', () => {
    expect(reorder(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'b', 'c'])
  })

  it('returns the order unchanged for out-of-bounds indices', () => {
    expect(reorder(['a', 'b'], 5, 0)).toEqual(['a', 'b'])
    expect(reorder(['a', 'b'], 0, -1)).toEqual(['a', 'b'])
  })

  it('does not mutate the input array', () => {
    const input = ['a', 'b', 'c']
    const out = reorder(input, 0, 2)
    expect(input).toEqual(['a', 'b', 'c'])
    expect(out).not.toBe(input)
  })
})
