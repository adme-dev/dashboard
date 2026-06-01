import { describe, it, expect } from 'vitest'
import { pickAssignee } from '~~/server/utils/crm/assignment'

const rr = (pool: string[], assignment_index: number) => ({ strategy: 'round_robin' as const, pool, assignment_index })

describe('pickAssignee', () => {
  it('round-robin rotates through the pool and advances the index', () => {
    expect(pickAssignee(rr(['a', 'b', 'c'], 0))).toEqual({ userId: 'a', nextIndex: 1 })
    expect(pickAssignee(rr(['a', 'b', 'c'], 1))).toEqual({ userId: 'b', nextIndex: 2 })
    expect(pickAssignee(rr(['a', 'b', 'c'], 2))).toEqual({ userId: 'c', nextIndex: 0 })
  })

  it('round-robin tolerates an out-of-range or negative stored index', () => {
    expect(pickAssignee(rr(['a', 'b'], 5))).toEqual({ userId: 'b', nextIndex: 0 }) // 5 % 2 = 1
    expect(pickAssignee(rr(['a', 'b'], -1))).toEqual({ userId: 'b', nextIndex: 0 })
  })

  it('single / priority always pick the first pool member without rotating', () => {
    expect(pickAssignee({ strategy: 'single', pool: ['a', 'b'], assignment_index: 3 })).toEqual({ userId: 'a', nextIndex: 3 })
    expect(pickAssignee({ strategy: 'priority', pool: ['a', 'b'], assignment_index: 3 })).toEqual({ userId: 'a', nextIndex: 3 })
  })

  it('load-balanced picks the pool member with the fewest current assignments', () => {
    const rule = { strategy: 'load_balanced' as const, pool: ['a', 'b', 'c'], assignment_index: 0 }
    expect(pickAssignee(rule, { loads: { a: 3, b: 1, c: 5 } })).toEqual({ userId: 'b', nextIndex: 0 })
  })

  it('load-balanced treats a missing load as zero and breaks ties by pool order', () => {
    const rule = { strategy: 'load_balanced' as const, pool: ['a', 'b'], assignment_index: 0 }
    expect(pickAssignee(rule, { loads: { a: 2 } }).userId).toBe('b') // b has 0
    expect(pickAssignee(rule, { loads: {} }).userId).toBe('a') // tie → first
  })

  it('returns null for an empty pool (no rotation)', () => {
    expect(pickAssignee(rr([], 2))).toEqual({ userId: null, nextIndex: 2 })
    expect(pickAssignee({ strategy: 'single', pool: [], assignment_index: 0 }).userId).toBe(null)
  })
})
