import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  consumeGoogleOAuthAttempt,
  createGoogleOAuthAttempt,
  persistGoogleCredentialRefresh,
  resolveGoogleCredential,
  resolveGoogleRefreshToken,
  hashGoogleOAuthState
} from '~~/server/utils/googleCredentialProfiles'

describe('Google OAuth attempts', () => {
  beforeEach(() => vi.clearAllMocks())

  it('persists only a digest and returns the raw state once', async () => {
    const insertAttempt = vi.fn().mockResolvedValue({ id: 'attempt-1' })
    const rawState = 'a'.repeat(43)

    const result = await createGoogleOAuthAttempt('user-1', {
      purpose: 'search_console',
      randomState: () => rawState,
      insertAttempt
    })

    expect(result).toEqual({ attemptId: 'attempt-1', state: rawState })
    expect(insertAttempt).toHaveBeenCalledWith({
      userId: 'user-1',
      purpose: 'search_console',
      stateDigest: await hashGoogleOAuthState(rawState),
      expiresAt: expect.any(Date)
    })
    expect(JSON.stringify(insertAttempt.mock.calls)).not.toContain(rawState)
  })

  it('atomically consumes a valid attempt for the initiating user', async () => {
    const consumeAttempt = vi.fn().mockResolvedValue({ id: 'attempt-1' })
    const state = 'b'.repeat(43)

    await expect(consumeGoogleOAuthAttempt(state, 'user-1', {
      purpose: 'search_console',
      consumeAttempt
    }))
      .resolves.toEqual({ id: 'attempt-1' })

    expect(consumeAttempt).toHaveBeenCalledWith({
      userId: 'user-1',
      purpose: 'search_console',
      stateDigest: await hashGoogleOAuthState(state)
    })
  })

  it('does not consume an OAuth attempt created for a different Google product', async () => {
    const consumeAttempt = vi.fn(async (input: { purpose: string }) =>
      input.purpose === 'google_ads' ? { id: 'ads-attempt' } : null)

    await expect(consumeGoogleOAuthAttempt('d'.repeat(43), 'user-1', {
      purpose: 'search_console',
      consumeAttempt
    })).resolves.toBeNull()
  })

  it('round-trips client context only through the server-side OAuth attempt', async () => {
    const insertAttempt = vi.fn().mockResolvedValue({ id: 'attempt-2' })
    const context = {
      clientId: '11111111-1111-4111-8111-111111111111'
    }

    await createGoogleOAuthAttempt('user-1', {
      purpose: 'search_console',
      context,
      randomState: () => 'e'.repeat(43),
      insertAttempt
    })

    expect(insertAttempt).toHaveBeenCalledWith(expect.objectContaining({
      purpose: 'search_console',
      context
    }))

    const consumeAttempt = vi.fn().mockResolvedValue({
      id: 'attempt-2',
      context
    })
    await expect(consumeGoogleOAuthAttempt('e'.repeat(43), 'user-1', {
      purpose: 'search_console',
      consumeAttempt
    })).resolves.toEqual({
      id: 'attempt-2',
      context
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
  it('decrypts only the refresh token required by Google provider validation', async () => {
    const decrypt = vi.fn().mockResolvedValue('profile-refresh')

    await expect(resolveGoogleRefreshToken({
      refresh_token: 'must-not-fallback',
      google_credential_profile_id: 'profile-1',
      profile_refresh_token_encrypted: new Uint8Array([3]),
      profile_refresh_token_iv: new Uint8Array([4])
    }, { decrypt })).resolves.toBe('profile-refresh')

    expect(decrypt).toHaveBeenCalledTimes(1)
  })

  it('keeps refresh-token-only resolution compatible with legacy rows', async () => {
    const decrypt = vi.fn()

    await expect(resolveGoogleRefreshToken({
      refresh_token: 'legacy-refresh',
      google_credential_profile_id: null
    }, { decrypt })).resolves.toBe('legacy-refresh')

    expect(decrypt).not.toHaveBeenCalled()
  })

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
      profile_token_expires_at: '2026-07-19T02:00:00.000Z'
    }, { decrypt })

    expect(result).toEqual({
      accessToken: 'profile-access',
      refreshToken: 'profile-refresh',
      tokenExpiresAt: '2026-07-19T02:00:00.000Z',
      profileId: 'profile-1',
      source: 'profile'
    })
    expect(decrypt).toHaveBeenCalledTimes(2)
  })

  it('persists refreshes to the active encrypted profile, not the account mirror', async () => {
    const encrypt = vi.fn().mockResolvedValue({
      ciphertext: new Uint8Array([9]),
      iv: new Uint8Array([8])
    })
    const updateProfile = vi.fn().mockResolvedValue(undefined)
    const updateLegacy = vi.fn()
    const expiresAt = new Date('2026-07-19T04:00:00.000Z')

    await persistGoogleCredentialRefresh({
      connectionId: 'connection-1',
      profileId: 'profile-1',
      accessToken: 'new-access',
      expiresAt
    }, { encrypt, updateProfile, updateLegacy })

    expect(encrypt).toHaveBeenCalledWith('new-access')
    expect(updateProfile).toHaveBeenCalledWith(expect.objectContaining({
      profileId: 'profile-1',
      expiresAt
    }))
    expect(updateLegacy).not.toHaveBeenCalled()
  })

  it('keeps legacy refresh persistence for unprofiled accounts', async () => {
    const encrypt = vi.fn()
    const updateProfile = vi.fn()
    const updateLegacy = vi.fn().mockResolvedValue(undefined)
    const expiresAt = new Date('2026-07-19T04:00:00.000Z')

    await persistGoogleCredentialRefresh({
      connectionId: 'connection-legacy',
      profileId: null,
      accessToken: 'legacy-new-access',
      expiresAt
    }, { encrypt, updateProfile, updateLegacy })

    expect(updateLegacy).toHaveBeenCalledWith(expect.objectContaining({
      connectionId: 'connection-legacy',
      accessToken: 'legacy-new-access'
    }))
    expect(encrypt).not.toHaveBeenCalled()
    expect(updateProfile).not.toHaveBeenCalled()
  })

  it('falls back to legacy credentials for existing unprofiled rows', async () => {
    const decrypt = vi.fn()
    const result = await resolveGoogleCredential({
      id: 'connection-legacy',
      access_token: 'legacy-access',
      refresh_token: 'legacy-refresh',
      token_expires_at: '2026-07-19T01:00:00.000Z',
      google_credential_profile_id: null
    }, { decrypt })

    expect(result).toEqual({
      accessToken: 'legacy-access',
      refreshToken: 'legacy-refresh',
      tokenExpiresAt: '2026-07-19T01:00:00.000Z',
      profileId: null,
      source: 'legacy'
    })
    expect(decrypt).not.toHaveBeenCalled()
  })

  it('fails closed when a profile pointer has incomplete encrypted material', async () => {
    await expect(resolveGoogleCredential({
      id: 'connection-1',
      access_token: 'must-not-fallback',
      refresh_token: null,
      token_expires_at: null,
      google_credential_profile_id: 'profile-1'
    })).rejects.toThrow('Google credential profile is incomplete')
  })
})
