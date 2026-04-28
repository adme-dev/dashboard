/**
 * Importance scoring tests.
 */
import { describe, it, expect } from 'vitest'
import { computeImportance } from '../../../server/utils/notificationImportance'

describe('computeImportance', () => {
  it('mentions score highest on the reason scale', () => {
    expect(computeImportance({ type: 'task_mentioned', reason: 'mentioned' })).toBeGreaterThanOrEqual(0.9)
  })

  it('assignments score high', () => {
    expect(computeImportance({ type: 'task_assigned', reason: 'assigned' })).toBeGreaterThanOrEqual(0.8)
  })

  it('task_overdue is the ceiling regardless of reason', () => {
    expect(computeImportance({ type: 'task_overdue', reason: 'watching_board' })).toBe(0.95)
    expect(computeImportance({ type: 'task_overdue', reason: 'mentioned' })).toBe(0.95)
  })

  it('task_due_soon bumps watching scores', () => {
    const watching = computeImportance({ type: 'task_due_soon', reason: 'watching_board' })
    const plain = computeImportance({ type: 'system', reason: 'watching_board' })
    expect(watching).toBeGreaterThan(plain)
  })

  it('null reason defaults to mid-low', () => {
    const score = computeImportance({ type: 'system' })
    expect(score).toBeGreaterThan(0.3)
    expect(score).toBeLessThan(0.5)
  })

  it('clamps to 1', () => {
    // mentioned (0.9) + chat_mention (0.1) = 1.0
    expect(computeImportance({ type: 'chat_mention', reason: 'mentioned' })).toBeLessThanOrEqual(1)
  })

  it('clamps to 0', () => {
    // No combo currently goes below 0, but the clamp is in place
    expect(computeImportance({ type: 'system', reason: undefined })).toBeGreaterThanOrEqual(0)
  })

  it('watching_board is lowest of the watching scopes', () => {
    expect(computeImportance({ type: 'task_updated', reason: 'watching_board' }))
      .toBeLessThan(computeImportance({ type: 'task_updated', reason: 'watching_item' }))
  })
})
