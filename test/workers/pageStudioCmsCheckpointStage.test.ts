import { describe, expect, it, vi } from 'vitest'
import { checkpointStage } from '../../workers/page-studio-management/src/cms/checkpointStage'

describe('checkpoint stage diagnostics', () => {
  it('returns the exact result without replaying or logging successful work', async () => {
    const value = { acknowledged: true }
    const work = vi.fn(async () => value)
    const log = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      expect(await checkpointStage('commit', work)).toBe(value)
      expect(work).toHaveBeenCalledOnce()
      expect(log).not.toHaveBeenCalled()
    } finally { log.mockRestore() }
  })
  it('rethrows the original failure and logs only its fixed stage', async () => {
    const error = new Error('private database or checkpoint details')
    const work = vi.fn(async () => { throw error })
    const log = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      await expect(checkpointStage('base', work)).rejects.toBe(error)
      expect(work).toHaveBeenCalledOnce()
      expect(log).toHaveBeenCalledExactlyOnceWith('page-studio-cms-management-failed', { operation: 'checkpoint', stage: 'base', category: 'checkpoint-stage' })
    } finally { log.mockRestore() }
  })
})
