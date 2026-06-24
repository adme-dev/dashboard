import { describe, it, expect } from 'vitest'
import { nextQueuePositions } from '~~/server/utils/socialPublishingQueue'

describe('nextQueuePositions', () => {
  it('starts at 0 when the queue is empty (no current max)', () => {
    expect(nextQueuePositions(null, ['a', 'b', 'c'])).toEqual([
      { id: 'a', position: 0 },
      { id: 'b', position: 1 },
      { id: 'c', position: 2 },
    ])
  })

  it('appends after the current max position', () => {
    expect(nextQueuePositions(2, ['x', 'y'])).toEqual([
      { id: 'x', position: 3 },
      { id: 'y', position: 4 },
    ])
  })

  it('treats max 0 correctly (next is 1)', () => {
    expect(nextQueuePositions(0, ['z'])).toEqual([{ id: 'z', position: 1 }])
  })

  it('returns empty when there are no drafts to add', () => {
    expect(nextQueuePositions(5, [])).toEqual([])
    expect(nextQueuePositions(null, [])).toEqual([])
  })
})
