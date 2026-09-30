import { afterEach, expect, it, vi } from 'vitest'
import { runtimeFeatureDiagnostics } from '~~/server/utils/pageStudio/runtimeFeatureDiagnostics'

afterEach(() => vi.restoreAllMocks())

it('correlates stages without logging successful content or error details', async () => {
  const info = vi.spyOn(console, 'info').mockImplementation(() => {})
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  const stage = runtimeFeatureDiagnostics()
  const value = { token: 'private-token', record: 'private-content' }
  expect(await stage('recovery', async () => value)).toBe(value)
  const failure = Object.assign(new Error('secret message'), { token: 'secret' })
  await expect(stage('seal', async () => {
    throw failure
  })).rejects.toBe(failure)
  const success = info.mock.calls[0]![1]
  expect(error.mock.calls[0]![1]).toEqual({ operationId: success.operationId, stage: 'seal', outcome: 'failed', category: 'operation', elapsedMs: expect.any(Number) })
  expect(JSON.stringify([...info.mock.calls, ...error.mock.calls])).not.toMatch(/private|secret/)
})

it('identifies the fixed deadline category without changing the failure', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  const failure = new Error('Runtime feature operation timed out')
  await expect(runtimeFeatureDiagnostics()('approval', async () => {
    throw failure
  })).rejects.toBe(failure)
  expect(error.mock.calls[0]![1]).toMatchObject({ stage: 'approval', category: 'deadline' })
})
