import { describe, it, expect } from 'vitest'
import { inverseOf, wouldCreateCycle } from '~~/server/utils/crm/relationships'

describe('inverseOf', () => {
  it('returns the same type for symmetric relationships', () => {
    for (const t of ['spouse', 'partner', 'sibling', 'colleague']) {
      expect(inverseOf(t)).toBe(t)
    }
  })

  it('swaps asymmetric person relationships', () => {
    expect(inverseOf('parent')).toBe('child')
    expect(inverseOf('child')).toBe('parent')
    expect(inverseOf('reports_to')).toBe('manages')
    expect(inverseOf('manages')).toBe('reports_to')
    expect(inverseOf('referrer')).toBe('referred_by')
    expect(inverseOf('referred_by')).toBe('referrer')
  })

  it('swaps company hierarchy and person↔company relationships', () => {
    expect(inverseOf('parent_of')).toBe('subsidiary_of')
    expect(inverseOf('subsidiary_of')).toBe('parent_of')
    expect(inverseOf('works_at')).toBe('employs')
    expect(inverseOf('employs')).toBe('works_at')
    expect(inverseOf('decision_maker_at')).toBe('has_decision_maker')
  })

  it('falls back to "related_to" for unknown types', () => {
    expect(inverseOf('whatever')).toBe('related_to')
  })
})

describe('wouldCreateCycle', () => {
  // edges are [parentId, childId] for company hierarchy (parent_of).
  const edges: [string, string][] = [['A', 'B'], ['B', 'C']]

  it('flags a back-edge that closes a loop', () => {
    expect(wouldCreateCycle(edges, 'C', 'A')).toBe(true) // C parent_of A, but A→B→C already
  })

  it('flags a self-edge', () => {
    expect(wouldCreateCycle(edges, 'A', 'A')).toBe(true)
  })

  it('allows a non-cyclic new edge', () => {
    expect(wouldCreateCycle(edges, 'A', 'C')).toBe(false) // redundant but not a cycle
    expect(wouldCreateCycle(edges, 'C', 'D')).toBe(false) // new leaf
  })
})
