import { beforeEach, describe, expect, it, vi } from 'vitest'
import { digestPortalSessionToken } from '../../../../server/utils/portalSession'

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  getCookie: () => string | undefined
  deleteCookie: (...args: unknown[]) => void
}

testGlobal.defineEventHandler = fn => fn
testGlobal.getCookie = vi.fn(() => 'portal-session-token')
testGlobal.deleteCookie = vi.fn()

const mockQueryRows = vi.fn()
const mockExecute = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  queryRowsFresh: (...args: unknown[]) => mockQueryRows(...args),
  execute: (...args: unknown[]) => mockExecute(...args)
}))

const { default: logoutHandler } = await import('../../../../server/api/portal/auth/logout.post')

describe('portal logout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExecute.mockResolvedValue(1)
    mockQueryRows.mockResolvedValue([])
  })

  it('deletes a digest session directly without scanning bcrypt rows', async () => {
    await logoutHandler({})

    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('token_hash = $1'),
      [await digestPortalSessionToken('portal-session-token')]
    )
    expect(mockQueryRows).not.toHaveBeenCalled()
    expect(testGlobal.deleteCookie).toHaveBeenCalled()
  })
})
