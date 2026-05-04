/**
 * Tests for the connection health classifier — pure function, no I/O.
 *
 * Health rules (single source of truth in connectionHealth.ts):
 *   - error            → status != 'active'
 *   - expired          → token_expires_at < NOW
 *   - expiring_soon    → token_expires_at within 7 days AND no refresh_token
 *   - never_synced     → last_synced_at IS NULL
 *   - stale_sync       → last_synced_at older than 24h
 *   - healthy          → otherwise
 */
import { describe, it, expect } from 'vitest'
import { classifyConnectionHealth } from '../../../server/utils/connectionHealth'

const NOW = new Date('2026-05-04T12:00:00Z')
const HOUR = 3_600_000
const DAY = 24 * HOUR

describe('classifyConnectionHealth', () => {
  it('returns "error" when status is not active', () => {
    const r = classifyConnectionHealth({
      status: 'revoked',
      tokenExpiresAt: new Date(NOW.getTime() + 30 * DAY),
      refreshToken: 'rt',
      lastSyncedAt: new Date(NOW.getTime() - HOUR),
      now: NOW,
    })
    expect(r.health).toBe('error')
  })

  it('returns "expired" when token_expires_at is in the past', () => {
    const r = classifyConnectionHealth({
      status: 'active',
      tokenExpiresAt: new Date(NOW.getTime() - 9 * DAY),
      refreshToken: null,
      lastSyncedAt: new Date(NOW.getTime() - HOUR),
      now: NOW,
    })
    expect(r.health).toBe('expired')
    expect(r.daysUntilExpiry).toBe(-9)
  })

  it('returns "expiring_soon" within 7 days AND no refresh_token (Meta case)', () => {
    const r = classifyConnectionHealth({
      status: 'active',
      tokenExpiresAt: new Date(NOW.getTime() + 3 * DAY),
      refreshToken: null,
      lastSyncedAt: new Date(NOW.getTime() - HOUR),
      now: NOW,
    })
    expect(r.health).toBe('expiring_soon')
    expect(r.daysUntilExpiry).toBe(3)
  })

  it('skips "expiring_soon" when refresh_token present (Google case)', () => {
    // Google access tokens expire hourly but auto-refresh — must not warn.
    const r = classifyConnectionHealth({
      status: 'active',
      tokenExpiresAt: new Date(NOW.getTime() + 30 * 60 * 1000), // 30 min
      refreshToken: 'rt',
      lastSyncedAt: new Date(NOW.getTime() - HOUR),
      now: NOW,
    })
    expect(r.health).toBe('healthy')
  })

  it('returns "never_synced" when last_synced_at is null', () => {
    const r = classifyConnectionHealth({
      status: 'active',
      tokenExpiresAt: new Date(NOW.getTime() + 30 * DAY),
      refreshToken: 'rt',
      lastSyncedAt: null,
      now: NOW,
    })
    expect(r.health).toBe('never_synced')
  })

  it('returns "stale_sync" when last_synced_at is older than 24h', () => {
    const r = classifyConnectionHealth({
      status: 'active',
      tokenExpiresAt: new Date(NOW.getTime() + 30 * DAY),
      refreshToken: 'rt',
      lastSyncedAt: new Date(NOW.getTime() - 25 * HOUR),
      now: NOW,
    })
    expect(r.health).toBe('stale_sync')
  })

  it('returns "healthy" for fresh active connection with recent sync', () => {
    const r = classifyConnectionHealth({
      status: 'active',
      tokenExpiresAt: new Date(NOW.getTime() + 30 * DAY),
      refreshToken: 'rt',
      lastSyncedAt: new Date(NOW.getTime() - 2 * HOUR),
      now: NOW,
    })
    expect(r.health).toBe('healthy')
    expect(r.daysUntilExpiry).toBe(30)
  })

  it('error wins over expired when both apply', () => {
    const r = classifyConnectionHealth({
      status: 'revoked',
      tokenExpiresAt: new Date(NOW.getTime() - 9 * DAY),
      refreshToken: null,
      lastSyncedAt: null,
      now: NOW,
    })
    expect(r.health).toBe('error')
  })

  it('expired wins over stale_sync when both apply', () => {
    const r = classifyConnectionHealth({
      status: 'active',
      tokenExpiresAt: new Date(NOW.getTime() - 9 * DAY),
      refreshToken: null,
      lastSyncedAt: new Date(NOW.getTime() - 30 * DAY),
      now: NOW,
    })
    expect(r.health).toBe('expired')
  })

  it('handles null tokenExpiresAt as healthy when other signals are good', () => {
    // Some connections have no token expiry (e.g. API-key based platforms).
    const r = classifyConnectionHealth({
      status: 'active',
      tokenExpiresAt: null,
      refreshToken: null,
      lastSyncedAt: new Date(NOW.getTime() - HOUR),
      now: NOW,
    })
    expect(r.health).toBe('healthy')
    expect(r.daysUntilExpiry).toBeNull()
  })
})
