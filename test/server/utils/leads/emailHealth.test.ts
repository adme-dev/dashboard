import { describe, expect, it } from 'vitest'

import {
  deriveEmailEndpointAlertCodes,
  reconcileEmailHealthRows,
  resolveEmailHealthRuntimeConfig,
  type EmailHealthRow
} from '../../../../server/utils/leads/emailHealth'

function row(overrides: Partial<EmailHealthRow> = {}): EmailHealthRow {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    status: 'accepted',
    terminal_at: '2026-07-29T00:00:05.000Z',
    created_at: '2026-07-29T00:00:00.000Z',
    processing_ms: 5000,
    possible_duplicate: false,
    assigned: true,
    first_response_ms: 60000,
    recovery_attempts: 0,
    error_class: null,
    ...overrides
  }
}

describe('email ingestion health reconciliation', () => {
  it('assigns every reservation to exactly one durable bucket and computes percentiles', () => {
    const snapshot = reconcileEmailHealthRows([
      row(),
      row({ id: '2', status: 'duplicate', processing_ms: 1000 }),
      row({ id: '3', status: 'quarantined', processing_ms: null }),
      row({ id: '4', status: 'failed', terminal_at: '2026-07-29T00:01:00Z', processing_ms: null }),
      row({ id: '5', status: 'failed', terminal_at: null, created_at: '2026-07-28T23:00:00Z', processing_ms: null })
    ], new Date('2026-07-29T02:00:00Z'))

    expect(snapshot).toMatchObject({
      reservedTotal: 5,
      accepted: 1,
      duplicate: 1,
      quarantined: 1,
      terminalFailed: 1,
      nonTerminal: 1,
      processingP50Ms: 3000,
      processingP95Ms: 4800,
      firstResponseP50Ms: 60000,
      firstResponseP95Ms: 60000,
      oldestNonTerminalAgeMs: 3 * 60 * 60 * 1000
    })
    expect(snapshot.reservedTotal).toBe(
      snapshot.accepted + snapshot.duplicate + snapshot.quarantined
      + snapshot.terminalFailed + snapshot.nonTerminal
    )
  })

  it('keeps transport counters outside reservation reconciliation', () => {
    const snapshot = reconcileEmailHealthRows([row()], new Date(), {
      prePolicy: 7,
      unknownRecipient: 3,
      signatureFailure: 2,
      policyDenied: 2
    })
    expect(snapshot.reservedTotal).toBe(1)
    expect(snapshot.transport).toEqual({
      prePolicy: 7,
      unknownRecipient: 3,
      signatureFailure: 2,
      policyDenied: 2
    })
  })
})

describe('email endpoint alert policy', () => {
  it('prefers Cloudflare runtime bindings when process.env is absent or conflicting', () => {
    process.env.EMAIL_INGESTION_NOTIFY_ALLOWLIST = 'process@example.test'
    process.env.EMAIL_INGESTION_SIGNATURE_FAILURE_THRESHOLD = '99'
    try {
      const config = resolveEmailHealthRuntimeConfig({
        context: {
          cloudflare: {
            env: {
              EMAIL_INGESTION_NOTIFY_ALLOWLIST: 'runtime@example.test',
              EMAIL_INGESTION_SIGNATURE_FAILURE_THRESHOLD: '4',
              EMAIL_INGESTION_R2_FAILURE_THRESHOLD: '3'
            }
          }
        }
      } as never)
      expect(config).toMatchObject({
        notificationAllowlist: 'runtime@example.test',
        signatureFailureThreshold: 4,
        r2FailureThreshold: 3
      })
    } finally {
      delete process.env.EMAIL_INGESTION_NOTIFY_ALLOWLIST
      delete process.env.EMAIL_INGESTION_SIGNATURE_FAILURE_THRESHOLD
    }
  })

  it('alerts at five failures only after a previously healthy transition', () => {
    expect(deriveEmailEndpointAlertCodes({
      consecutiveFailures: 5,
      wasHealthy: true,
      messages15m: 5,
      failures15m: 5
    })).toContain('consecutive_failures')
    expect(deriveEmailEndpointAlertCodes({
      consecutiveFailures: 6,
      wasHealthy: false,
      messages15m: 6,
      failures15m: 6
    })).not.toContain('consecutive_failures')
    expect(deriveEmailEndpointAlertCodes({
      consecutiveFailures: 6,
      wasHealthy: true,
      messages15m: 6,
      failures15m: 6
    })).toContain('consecutive_failures')
  })

  it('requires more than twenty percent and at least ten messages', () => {
    expect(deriveEmailEndpointAlertCodes({
      consecutiveFailures: 0,
      wasHealthy: true,
      messages15m: 10,
      failures15m: 3
    })).toContain('failure_rate')
    expect(deriveEmailEndpointAlertCodes({
      consecutiveFailures: 0,
      wasHealthy: true,
      messages15m: 9,
      failures15m: 9
    })).not.toContain('failure_rate')
    expect(deriveEmailEndpointAlertCodes({
      consecutiveFailures: 0,
      wasHealthy: true,
      messages15m: 10,
      failures15m: 2
    })).not.toContain('failure_rate')
  })

  it('uses configured silence and activation grace, never a universal interval', () => {
    const now = Date.parse('2026-07-29T12:00:00Z')
    expect(deriveEmailEndpointAlertCodes({
      consecutiveFailures: 0,
      wasHealthy: true,
      messages15m: 0,
      failures15m: 0,
      expectedMaxSilenceHours: null,
      activatedAtMs: now - 30 * 24 * 60 * 60 * 1000
    }, now)).not.toContain('silence')
    expect(deriveEmailEndpointAlertCodes({
      consecutiveFailures: 0,
      wasHealthy: true,
      messages15m: 0,
      failures15m: 0,
      expectedMaxSilenceHours: 24,
      activatedAtMs: now - 23 * 60 * 60 * 1000
    }, now)).not.toContain('silence')
    expect(deriveEmailEndpointAlertCodes({
      consecutiveFailures: 0,
      wasHealthy: true,
      messages15m: 0,
      failures15m: 0,
      expectedMaxSilenceHours: 24,
      activatedAtMs: now - 48 * 60 * 60 * 1000,
      lastReceivedAtMs: now - 25 * 60 * 60 * 1000
    }, now)).toContain('silence')
  })

  it('derives assignment and SLA alerts only from endpoint configuration', () => {
    expect(deriveEmailEndpointAlertCodes({
      consecutiveFailures: 0,
      wasHealthy: true,
      messages15m: 0,
      failures15m: 0,
      unassignedAccepted: 2,
      assignmentAlertThreshold: null,
      beyondFirstResponseSla: 4,
      firstResponseSlaMinutes: null
    })).toEqual([])
    expect(deriveEmailEndpointAlertCodes({
      consecutiveFailures: 0,
      wasHealthy: true,
      messages15m: 0,
      failures15m: 0,
      unassignedAccepted: 2,
      assignmentAlertThreshold: 2,
      beyondFirstResponseSla: 1,
      firstResponseSlaMinutes: 30
    })).toEqual(expect.arrayContaining(['unassigned', 'first_response_sla']))
  })
})
