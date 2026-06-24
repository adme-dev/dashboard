import { describe, it, expect } from 'vitest'
import { insertAtCaret } from '../../app/utils/insertAtCaret'

describe('insertAtCaret', () => {
  it('inserts at a collapsed caret in the middle of the text', () => {
    // "Hi| world" -> insert 👋
    expect(insertAtCaret('Hi world', '👋', 2, 2)).toEqual({ text: 'Hi👋 world', caret: 2 + '👋'.length })
  })

  it('replaces the current selection', () => {
    // select all of "Hello" and replace with 🎉
    expect(insertAtCaret('Hello', '🎉', 0, 5)).toEqual({ text: '🎉', caret: '🎉'.length })
  })

  it('appends when the caret is at the end', () => {
    expect(insertAtCaret('Hi', '😀', 2, 2)).toEqual({ text: 'Hi😀', caret: 2 + '😀'.length })
  })

  it('inserts into empty text', () => {
    expect(insertAtCaret('', '🔥', 0, 0)).toEqual({ text: '🔥', caret: '🔥'.length })
  })

  it('clamps out-of-range indices instead of producing holes', () => {
    // start/end past the end (e.g. stale selection) -> append at the real end
    expect(insertAtCaret('abc', 'X', 99, 99)).toEqual({ text: 'abcX', caret: 4 })
    // negative indices -> treated as 0
    expect(insertAtCaret('abc', 'X', -5, -5)).toEqual({ text: 'Xabc', caret: 1 })
  })

  it('orders a reversed selection (end before start) correctly', () => {
    expect(insertAtCaret('abcdef', '-', 4, 2)).toEqual({ text: 'ab-ef', caret: 3 })
  })
})
