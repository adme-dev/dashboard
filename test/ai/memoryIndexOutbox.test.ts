import { describe, expect, it, vi } from 'vitest'

import { processMemoryIndexOutbox } from '~~/server/utils/ai/memory/indexOutbox'

describe('memory Vectorize indexing outbox', () => {
  it('acknowledges one committed row after Vectorize indexing succeeds', async () => {
    const claim = vi.fn(async () => ({
      id: 'outbox-1', memoryId: 'memory-1', userId: 'user-1', memType: 'semantic' as const,
      content: 'Reports are in AUD', attempts: 0
    }))
    const index = vi.fn(async () => true)
    const complete = vi.fn(async () => undefined)
    const retry = vi.fn(async () => undefined)

    await expect(processMemoryIndexOutbox({ claim, index, complete, retry }, { limit: 1, event: {} as any }))
      .resolves.toEqual({ claimed: 1, indexed: 1, retried: 0 })
    expect(complete).toHaveBeenCalledWith('outbox-1')
    expect(retry).not.toHaveBeenCalled()
  })

  it('releases a failed Vectorize attempt for bounded retry and eventually indexes it', async () => {
    const row = {
      id: 'outbox-2', memoryId: 'memory-2', userId: 'user-1', memType: 'procedural' as const,
      content: 'Monday recap routine', attempts: 0
    }
    const claim = vi.fn()
      .mockResolvedValueOnce(row)
      .mockResolvedValueOnce({ ...row, attempts: 1 })
      .mockResolvedValue(null)
    const index = vi.fn().mockRejectedValueOnce(new Error('Vectorize unavailable')).mockResolvedValueOnce(true)
    const complete = vi.fn(async () => undefined)
    const retry = vi.fn(async () => undefined)

    await expect(processMemoryIndexOutbox({ claim, index, complete, retry }, { limit: 3, event: {} as any }))
      .resolves.toEqual({ claimed: 2, indexed: 1, retried: 1 })
    expect(retry).toHaveBeenCalledWith('outbox-2', 1, 'Vectorize unavailable')
    expect(complete).toHaveBeenCalledWith('outbox-2')
  })
})
