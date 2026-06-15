import { describe, it, expect, vi } from 'vitest'
import { executeAdSetSplitWrites } from '~~/server/utils/budgetSplitExecutor'

describe('executeAdSetSplitWrites', () => {
  it('applies every ad set when each read-back verifies', async () => {
    const writer = vi.fn(async (_id: string, daily: number) => ({ readBackDailyMajor: daily }))
    const { allApplied, results } = await executeAdSetSplitWrites(
      [{ id: 'a', newDailyMajor: 60 }, { id: 'b', newDailyMajor: 20 }],
      writer,
    )
    expect(allApplied).toBe(true)
    expect(results).toEqual([
      { adSetId: 'a', requested: 60, readBack: 60, status: 'applied' },
      { adSetId: 'b', requested: 20, readBack: 20, status: 'applied' },
    ])
    expect(writer).toHaveBeenCalledTimes(2)
  })

  it('stops at the first read-back mismatch and leaves later ad sets not_attempted', async () => {
    // a verifies, b reads back wrong, c never attempted.
    const writer = vi.fn()
      .mockResolvedValueOnce({ readBackDailyMajor: 30 })   // a ok
      .mockResolvedValueOnce({ readBackDailyMajor: 999 })  // b mismatch
    const { allApplied, results } = await executeAdSetSplitWrites(
      [{ id: 'a', newDailyMajor: 30 }, { id: 'b', newDailyMajor: 30 }, { id: 'c', newDailyMajor: 40 }],
      writer,
    )
    expect(allApplied).toBe(false)
    expect(results[0]).toEqual({ adSetId: 'a', requested: 30, readBack: 30, status: 'applied' })
    expect(results[1]).toEqual({ adSetId: 'b', requested: 30, readBack: 999, status: 'failed' })
    expect(results[2]).toEqual({ adSetId: 'c', requested: 40, readBack: null, status: 'not_attempted' })
    expect(writer).toHaveBeenCalledTimes(2) // c never written
  })

  it('records the thrown error and stops (later ad sets not_attempted)', async () => {
    const writer = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('rate limited'), { data: { error: { message: 'rate limited' } } }))
    const { allApplied, results } = await executeAdSetSplitWrites(
      [{ id: 'a', newDailyMajor: 10 }, { id: 'b', newDailyMajor: 10 }],
      writer,
    )
    expect(allApplied).toBe(false)
    expect(results[0].status).toBe('failed')
    expect(results[0].error).toBe('rate limited')
    expect(results[1].status).toBe('not_attempted')
    expect(writer).toHaveBeenCalledTimes(1)
  })
})
