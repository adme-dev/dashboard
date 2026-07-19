import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  consumeGoogleOAuthAttempt,
  createGoogleOAuthAttempt,
  resolveGoogleCredential,
  sha256Hex,
} from '~~/server/utils/googleCredentialProfiles'

describe('Google OAuth attempts', () => {
  beforeEach(() => vi.clearAllMocks())

  it('persists only a digest and returns the raw state once', async () => {
    const insertAttempt = vi.fn().mockResolvedValue({ id: 'attempt-1' })
    const rawState = 'a'.repeat(43)

    const result = await createGoogleOAuthAttempt('user-1', {
      randomState: () => rawState,
      insertAttempt,
    })

    expect(result).toEqual({ attemptId: 'attempt-1', state: rawState })
    expect(insertAttempt).toHaveBeenCalledWith({
      userId: 'user-1',
      stateDigest: await sha256Hex(rawState),
      expiresAt: expect.any(Date),
    })
    expect(JSON.stringify(insertAttempt.mock.calls)).not.toContain(rawState)
  })

  it('atomically consumes a valid attempt for the initiating user', async () => {
    const consumeAttempt = vi.fn().mockResolvedValue({ id: 'attempt-1' })
    const state = 'b'.repeat(43)

    await expect(consumeGoogleOAuthAttempt(state, 'user-1', { consumeAttempt }))
      .resolves.toEqual({ id: 'attempt-1' })

    expect(consumeAttempt).toHaveBeenCalledWith({
      userId: 'user-1',
      stateDigest: await sha256Hex(state),
    })
  })

  it.each(['', 'short', 'contains spaces', 'x'.repeat(200)])('rejects malformed state before querying: %j', async (state) => {
    const consumeAttempt = vi.fn()
    await expect(consumeGoogleOAuthAttempt(state, 'user-1', { consumeAttempt })).resolves.toBeNull()
    expect(consumeAttempt).not.toHaveBeenCalled()
  })

  it('returns null for replayed, expired, or cross-user attempts', async () => {
    const consumeAttempt = vi.fn().mockResolvedValue(null)
    await expect(consumeGoogleOAuthAttempt('c'.repeat(43), 'other-user', { consumeAttempt })).resolves.toBeNull()
  })
})

describe('Google credential resolution', () => {
  it('prefers and decrypts the active profile credential', async () => {
    const decrypt = vi.fn()
      .mockResolvedValueOnce('profile-access')
      .mockResolvedValueOnce('profile-refresh')

    const result = await resolveGoogleCredential({
      id: 'connection-1',
      access_token: 'legacy-access',
      refresh_token: 'legacy-refresh',
      token_expires_at: '2026-07-19T01:00:00.000Z',
      google_credential_profile_id: 'profile-1',
      profile_access_token_encrypted: new Uint8Array([1]),
      profile_access_token_iv: new Uint8Array([2]),
      profile_refresh_token_encrypted: new Uint8Array([3]),
      profile_refresh_token_iv: new Uint8Array([4]),
      profile_token_expires_at: '2026-07-19T02:00:00.000Z',
    }, { decrypt })

    expect(result).toEqual({
      accessToken: 'profile-access',
      refreshToken: 'profile-refresh',
      tokenExpiresAt: '2026-07-19T02:00:00.000Z',
      profileId: 'profile-1',
      source: 'profile',
    })
    expect(decrypt).toHaveBeenCalledTimes(2)
  })

  it('falls back to legacy credentials for existing unprofiled rows', async () => {
    const decrypt = vi.fn()
    const result = await resolveGoogleCredential({
      id: 'connection-legacy',
      access_token: 'legacy-access',
      refresh_token: 'legacy-refresh',
      token_expires_at: '2026-07-19T01:00:00.000Z',
      google_credential_profile_id: null,
    }, { decrypt })

    expect(result).toEqual({
      accessToken: 'legacy-access',
      refreshToken: 'legacy-refresh',
      tokenExpiresAt: '2026-07-19T01:00:00.000Z',
      profileId: null,
      source: 'legacy',
    })
    expect(decrypt).not.toHaveBeenCalled()
  })

  it('fails closed when a profile pointer has incomplete encrypted material', async () => {
    await expect(resolveGoogleCredential({
      id: 'connection-1',
      access_token: 'must-not-fallback',
      refresh_token: null,
      token_expires_at: null,
      google_credential_profile_id: 'profile-1',
    })).rejects.toThrow('Google credential profile is incomplete')
  })
})
