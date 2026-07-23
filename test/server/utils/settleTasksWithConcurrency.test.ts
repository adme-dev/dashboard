import { describe, expect, it } from 'vitest'

import { settleTasksWithConcurrency } from '../../../server/utils/settleTasksWithConcurrency'

describe('settleTasksWithConcurrency', () => {
  it('caps active tasks, preserves result order, and isolates failures', async () => {
    let active = 0
    let peakActive = 0
    const resolvers: Array<() => void> = []

    const tasks = [0, 1, 2, 3].map(id => async () => {
      active += 1
      peakActive = Math.max(peakActive, active)
      await new Promise<void>(resolve => resolvers.push(resolve))
      active -= 1
      if (id === 2) throw new Error('expected failure')
      return id
    })

    const pending = settleTasksWithConcurrency(tasks, 2)
    await waitForCondition(() => resolvers.length === 2)
    resolvers.shift()?.()
    await waitForCondition(() => resolvers.length === 2)
    resolvers.shift()?.()
    await waitForCondition(() => resolvers.length === 2)
    resolvers.shift()?.()
    resolvers.shift()?.()

    const results = await pending

    expect(peakActive).toBe(2)
    expect(results.map(result => result.status)).toEqual([
      'fulfilled',
      'fulfilled',
      'rejected',
      'fulfilled',
    ])
    expect(results[0]).toEqual({ status: 'fulfilled', value: 0 })
    expect(results[3]).toEqual({ status: 'fulfilled', value: 3 })
  })
})

async function waitForCondition(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return
    await Promise.resolve()
  }
  throw new Error('condition was not met')
}
