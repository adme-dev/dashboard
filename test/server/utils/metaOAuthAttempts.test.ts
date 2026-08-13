import { describe, expect, it, vi } from 'vitest'
import {
  consumeMetaOAuthAttempt,
  createMetaOAuthAttempt,
  hashMetaOAuthState
} from '~~/server/utils/metaOAuthAttempts'

describe('Meta OAuth attempts', () => {
  it('stores only a digest of the random state with the bounded intent', async () => {
    const insertAttempt = vi.fn().mockResolvedValue({ id: 'attempt-1' })
    const rawState = 'abcdefghijklmnopqrstuvwxyzABCDEFG_1234567890-xyz'

    const result = await createMetaOAuthAttempt('user-1', 'catalog_management', {
      randomState: () => rawState,
      insertAttempt
    })

    expect(result).toEqual({ attemptId: 'attempt-1', state: rawState })
    expect(insertAttempt).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      intent: 'catalog_management',
      stateDigest: await hashMetaOAuthState(rawState)
    }))
    expect(JSON.stringify(insertAttempt.mock.calls)).not.toContain(rawState)
  })

  it('consumes the exact state once for the initiating user', async () => {
    const consumeAttempt = vi.fn().mockResolvedValue({ id: 'attempt-1', intent: 'connection' })
    const state = 'abcdefghijklmnopqrstuvwxyzABCDEFG_1234567890-xyz'

    await expect(consumeMetaOAuthAttempt(state, 'user-1', { consumeAttempt }))
      .resolves.toEqual({ id: 'attempt-1', intent: 'connection' })
    expect(consumeAttempt).toHaveBeenCalledWith({
      userId: 'user-1',
      stateDigest: await hashMetaOAuthState(state)
    })
  })

  it('rejects malformed state without querying storage', async () => {
    const consumeAttempt = vi.fn()
    await expect(consumeMetaOAuthAttempt('bad', 'user-1', { consumeAttempt })).resolves.toBeNull()
    expect(consumeAttempt).not.toHaveBeenCalled()
  })
})
