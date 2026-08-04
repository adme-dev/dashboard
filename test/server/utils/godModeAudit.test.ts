import { describe, expect, it, vi } from 'vitest'

import { appendGodModeAuditEvent } from '~~/server/utils/godMode/audit'

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
        false
      ]
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
