/**
 * Web Push helper tests.
 *
 * Mocks @pushforge/builder, the DB layer, and global fetch so the helper's
 * fan-out / purge / update behaviour is exercised end-to-end without a real
 * push service.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockQueryRows = vi.fn()
const mockExecute = vi.fn()
vi.mock('~~/server/utils/db', () => ({
  queryOne: vi.fn(),
  queryRows: (...args: any[]) => mockQueryRows(...args),
  execute: (...args: any[]) => mockExecute(...args),
}))

const mockBuildPushHTTPRequest = vi.fn()
vi.mock('@pushforge/builder', () => ({
  buildPushHTTPRequest: (...args: any[]) => mockBuildPushHTTPRequest(...args),
}))

import { sendWebPushToUser, getVapidPublicKeyForBrowser } from '../../../server/utils/webPush'

const ORIGINAL_ENV = { ...process.env }

const validPublicKey =
  'BGwCQ1N6Nzb8NoaT6A1UYEHQ8df_hBxuVIMZZq8WRpMkWLE4eV7kWYB4dXR-jcMFT-EEFQXVlIZ_MQTy291purE'
const validPrivateJwk = JSON.stringify({
  kty: 'EC',
  crv: 'P-256',
  x: 'bAJDU3o3Nvw2hpPoDVRgQdDx1_-EHG5UgxlmrxZGkyQ',
  y: 'WLE4eV7kWYB4dXR-jcMFT-EEFQXVlIZ_MQTy291purE',
  d: '_lNENeFSZHLwVuRSbKoUGo5bo9T8y9DQ5hdzMrdVxv4',
})

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.USER_MEMBER_NOTIFICATIONS_DISABLED
  process.env.VAPID_PUBLIC_KEY = validPublicKey
  process.env.VAPID_PRIVATE_KEY = validPrivateJwk
  process.env.VAPID_SUBJECT = 'mailto:test@example.com'
  // Default: pushforge returns a dummy request object
  mockBuildPushHTTPRequest.mockResolvedValue({
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
    headers: new Headers({ 'TTL': '3600' }),
    body: new ArrayBuffer(8),
  })
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('getVapidPublicKeyForBrowser', () => {
  it('returns the configured public key verbatim', () => {
    expect(getVapidPublicKeyForBrowser()).toBe(validPublicKey)
  })

  it('returns null when env is not configured', () => {
    delete process.env.VAPID_PUBLIC_KEY
    expect(getVapidPublicKeyForBrowser()).toBeNull()
  })

  it('returns null when private key is invalid JSON', () => {
    process.env.VAPID_PRIVATE_KEY = '{not json'
    expect(getVapidPublicKeyForBrowser()).toBeNull()
  })
})

describe('sendWebPushToUser', () => {
  it('does not load subscriptions when member notifications are globally paused', async () => {
    process.env.USER_MEMBER_NOTIFICATIONS_DISABLED = 'true'

    const result = await sendWebPushToUser('user-1', { title: 'hi', body: 'there' })

    expect(result).toEqual({ sent: 0, failed: 0, purged: 0 })
    expect(mockQueryRows).not.toHaveBeenCalled()
  })

  it('returns zero counts when env is unset', async () => {
    delete process.env.VAPID_PRIVATE_KEY
    const result = await sendWebPushToUser('user-1', { title: 'hi', body: 'there' })
    expect(result).toEqual({ sent: 0, failed: 0, purged: 0 })
    expect(mockQueryRows).not.toHaveBeenCalled()
  })

  it('returns zero counts when user has no subscriptions', async () => {
    mockQueryRows.mockResolvedValue([])
    const result = await sendWebPushToUser('user-1', { title: 'hi', body: 'there' })
    expect(result).toEqual({ sent: 0, failed: 0, purged: 0 })
    expect(global.fetch).toBeDefined()
  })

  it('sends and updates last_used_at on 200', async () => {
    mockQueryRows.mockResolvedValue([
      { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh_key: 'p1', auth_key: 'a1' },
    ])
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(null, { status: 201 })
    )

    const result = await sendWebPushToUser('user-1', { title: 'hi', body: 'there' })

    expect(result).toEqual({ sent: 1, failed: 0, purged: 0 })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE push_subscriptions SET last_used_at'),
      ['https://fcm.googleapis.com/fcm/send/abc']
    )
    fetchSpy.mockRestore()
  })

  it('purges subscription on 410 Gone', async () => {
    mockQueryRows.mockResolvedValue([
      { endpoint: 'https://fcm.googleapis.com/fcm/send/dead', p256dh_key: 'p1', auth_key: 'a1' },
    ])
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(null, { status: 410 })
    )

    const result = await sendWebPushToUser('user-1', { title: 'hi', body: 'there' })

    expect(result).toEqual({ sent: 0, failed: 0, purged: 1 })
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM push_subscriptions'),
      ['https://fcm.googleapis.com/fcm/send/dead']
    )
    fetchSpy.mockRestore()
  })

  it('purges subscription on 404 Not Found', async () => {
    mockQueryRows.mockResolvedValue([
      { endpoint: 'https://fcm.googleapis.com/fcm/send/missing', p256dh_key: 'p1', auth_key: 'a1' },
    ])
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(null, { status: 404 })
    )

    const result = await sendWebPushToUser('user-1', { title: 'hi', body: 'there' })

    expect(result).toEqual({ sent: 0, failed: 0, purged: 1 })
    fetchSpy.mockRestore()
  })

  it('counts other 4xx/5xx as failed and keeps the subscription', async () => {
    mockQueryRows.mockResolvedValue([
      { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh_key: 'p1', auth_key: 'a1' },
    ])
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response('rate limited', { status: 429 })
    )

    const result = await sendWebPushToUser('user-1', { title: 'hi', body: 'there' })

    expect(result).toEqual({ sent: 0, failed: 1, purged: 0 })
    // No DELETE, no UPDATE last_used_at
    expect(mockExecute).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('fans out to multiple subscriptions in parallel', async () => {
    mockQueryRows.mockResolvedValue([
      { endpoint: 'https://fcm.googleapis.com/fcm/send/a', p256dh_key: 'p1', auth_key: 'a1' },
      { endpoint: 'https://updates.push.services.mozilla.com/wpush/x', p256dh_key: 'p2', auth_key: 'a2' },
      { endpoint: 'https://web.push.apple.com/123', p256dh_key: 'p3', auth_key: 'a3' },
    ])
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(null, { status: 201 })
    )

    const result = await sendWebPushToUser('user-1', { title: 'hi', body: 'there' })

    expect(result).toEqual({ sent: 3, failed: 0, purged: 0 })
    expect(fetchSpy).toHaveBeenCalledTimes(3)
    fetchSpy.mockRestore()
  })

  it('survives an exception from buildPushHTTPRequest without throwing', async () => {
    mockQueryRows.mockResolvedValue([
      { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh_key: 'p1', auth_key: 'a1' },
    ])
    mockBuildPushHTTPRequest.mockRejectedValueOnce(new Error('encrypt failed'))

    const result = await sendWebPushToUser('user-1', { title: 'hi', body: 'there' })

    expect(result).toEqual({ sent: 0, failed: 1, purged: 0 })
  })
})
