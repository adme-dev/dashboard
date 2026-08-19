import { describe, expect, it, vi } from 'vitest'

import { appendGodModeAuditEvent, summarizeGodModeActionArguments } from '~~/server/utils/godMode/audit'

const validInput = {
  actorUserId: '11111111-1111-4111-8111-111111111111',
  correlationId: '22222222-2222-4222-8222-222222222222',
  sessionDigest: 'a'.repeat(64),
  channel: 'application' as const,
  routeOrTool: 'admin.god-mode',
  phase: 'attempt' as const,
  bypassedControls: ['permission', 'confirmation'] as const,
  outcomeCode: 'started',
  emergencyDisabled: false
}

describe('appendGodModeAuditEvent', () => {
  it('inserts a fully allowlisted audit event with parameterized values', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }

    await appendGodModeAuditEvent(validInput, db)

    expect(db.query.mock.calls[0]?.[0]).not.toContain('ON CONFLICT DO NOTHING')
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO god_mode_audit_events'),
      [
        validInput.actorUserId,
        validInput.correlationId,
        validInput.sessionDigest,
        'application',
        'admin.god-mode',
        'attempt',
        null,
        null,
        null,
        null,
        ['permission', 'confirmation'],
        'started',
        false,
        '{}'
      ]
    )
  })

  it('keeps bounded action intent while recursively redacting credentials', () => {
    expect(summarizeGodModeActionArguments({
      clientId: '11111111-1111-4111-8111-111111111111',
      prompt: 'Summer retail campaign',
      nested: { apiKey: 'do-not-store', title: 'Northern Motor Group' },
      accessToken: 'also-secret'
    })).toEqual({
      clientId: '11111111-1111-4111-8111-111111111111',
      prompt: 'Summer retail campaign',
      nested: { apiKey: '[REDACTED]', title: 'Northern Motor Group' },
      accessToken: '[REDACTED]'
    })
  })

  it('falls back to key intent when an argument body would exceed the database bound', () => {
    const summary = summarizeGodModeActionArguments({
      clientId: '11111111-1111-4111-8111-111111111111',
      prompt: 'Dealer campaign',
      ...Object.fromEntries(Array.from({ length: 38 }, (_, index) => [`field${index}`, 'x'.repeat(500)]))
    })

    expect(summary).toMatchObject({
      clientId: '11111111-1111-4111-8111-111111111111',
      prompt: 'Dealer campaign',
      truncated: true
    })
    expect(new TextEncoder().encode(JSON.stringify(summary)).byteLength).toBeLessThan(16_384)
  })

  it('normalizes and idempotently inserts a durable pre-execution bypass event', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }

    await appendGodModeAuditEvent({
      ...validInput,
      phase: 'bypass',
      bypassedControls: ['rate_limit', 'budget', 'rate_limit'],
      outcomeCode: 'pre_execution'
    }, db)

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT DO NOTHING'),
      expect.arrayContaining([
        validInput.actorUserId,
        validInput.correlationId,
        validInput.sessionDigest,
        'application',
        'admin.god-mode',
        'bypass',
        null,
        null,
        null,
        null,
        ['budget', 'rate_limit'],
        'pre_execution',
        false
      ])
    )
  })

  it('rejects a bypass control outside the closed allowlist before writing', async () => {
    const db = { query: vi.fn() }

    await expect(appendGodModeAuditEvent({
      ...validInput,
      bypassedControls: ['permission', 'invented_control'] as any
    }, db)).rejects.toThrow()
    expect(db.query).not.toHaveBeenCalled()
  })

  it('rejects more than twenty-four bypassed controls before writing', async () => {
    const db = { query: vi.fn() }

    await expect(appendGodModeAuditEvent({
      ...validInput,
      bypassedControls: Array.from({ length: 25 }, () => 'permission')
    }, db)).rejects.toThrow()
    expect(db.query).not.toHaveBeenCalled()
  })

  it('rejects malformed UUIDs and session digests before writing', async () => {
    const db = { query: vi.fn() }

    await expect(appendGodModeAuditEvent({ ...validInput, actorUserId: 'not-a-uuid' }, db)).rejects.toThrow()
    await expect(appendGodModeAuditEvent({ ...validInput, sessionDigest: 'abc' }, db)).rejects.toThrow()
    expect(db.query).not.toHaveBeenCalled()
  })

  it('rejects overlong bounded audit fields before writing', async () => {
    const db = { query: vi.fn() }

    await expect(appendGodModeAuditEvent({ ...validInput, routeOrTool: 'x'.repeat(161) }, db)).rejects.toThrow()
    await expect(appendGodModeAuditEvent({ ...validInput, entityType: 'x'.repeat(65) }, db)).rejects.toThrow()
    await expect(appendGodModeAuditEvent({ ...validInput, outcomeCode: 'x'.repeat(65) }, db)).rejects.toThrow()
    expect(db.query).not.toHaveBeenCalled()
  })

  it('rejects unexpected metadata keys before writing', async () => {
    const db = { query: vi.fn() }

    await expect(appendGodModeAuditEvent({
      ...validInput,
      rawProviderBody: { credentials: 'must not persist' }
    } as any, db)).rejects.toThrow()
    expect(db.query).not.toHaveBeenCalled()
  })

  it('propagates database errors unchanged', async () => {
    const databaseFailure = new Error('insert unavailable')
    const db = { query: vi.fn().mockRejectedValue(databaseFailure) }

    await expect(appendGodModeAuditEvent(validInput, db)).rejects.toBe(databaseFailure)
  })
})
