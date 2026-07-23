import { describe, expect, it, vi } from 'vitest'

import { createSingleFlight, runTasksSequentially } from '../../app/utils/asyncControl'

describe('async control', () => {
  it('runs tasks one at a time, preserves order, and continues after a rejection', async () => {
    let active = 0
    let peakActive = 0
    const started: number[] = []

    const task = (id: number, shouldReject = false) => async () => {
      started.push(id)
      active += 1
      peakActive = Math.max(peakActive, active)
      await Promise.resolve()
      active -= 1

      if (shouldReject) throw new Error(`failed ${id}`)
      return id
    }

    const results = await runTasksSequentially([
      task(1),
      task(2, true),
      task(3),
    ])

    expect(started).toEqual([1, 2, 3])
    expect(peakActive).toBe(1)
    expect(results.map(result => result.status)).toEqual([
      'fulfilled',
      'rejected',
      'fulfilled',
    ])
  })

  it('shares an in-flight promise and allows a new execution after it settles', async () => {
    let resolveFirst!: (value: number) => void
    const task = vi.fn()
      .mockImplementationOnce(() => new Promise<number>((resolve) => {
        resolveFirst = resolve
      }))
      .mockResolvedValueOnce(2)
    const run = createSingleFlight(task)

    const first = run()
    const duplicate = run()

    expect(duplicate).toBe(first)
    expect(task).toHaveBeenCalledTimes(1)

    resolveFirst(1)
    await expect(first).resolves.toBe(1)
    await expect(run()).resolves.toBe(2)
    expect(task).toHaveBeenCalledTimes(2)
  })
})
