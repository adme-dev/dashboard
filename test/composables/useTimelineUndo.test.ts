import { describe, it, expect } from 'vitest'
import { createUndoStack } from '~~/app/composables/useTimelineUndo'
describe('createUndoStack', () => {
  it('pushes, undoes, and redoes states; bounded', () => {
    const s = createUndoStack<number>({ limit: 3 })
    s.push(1); s.push(2); s.push(3)
    expect(s.canUndo()).toBe(true)
    expect(s.undo(99)).toBe(3)     // returns prior state, current(99) goes onto redo
    expect(s.redo(3)).toBe(99)
  })
  it('evicts oldest beyond the limit', () => {
    const s = createUndoStack<number>({ limit: 2 })
    s.push(1); s.push(2); s.push(3) // 1 evicted
    s.undo(0); expect(s.undo(0)).toBe(2)   // can only go back to 2 (1 gone)
    expect(s.canUndo()).toBe(false)
  })
})
