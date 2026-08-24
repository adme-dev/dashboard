import { describe, expect, it } from 'vitest'
import {
  diagnosticDataStatus,
  normalizeGoogleApprovalStatus,
  normalizeGoogleServingReasons,
  normalizeMetaApprovalStatus,
  normalizeMetaLearningStage,
  normalizeMetaPolicyIssues,
  sanitizeDiagnosticError,
} from '~~/server/utils/adDiagnostics'

describe('ad delivery diagnostic contracts', () => {
  it('preserves exact Google reasons and maps stable consumer codes', () => {
    expect(normalizeGoogleServingReasons([
      'BUDGET_CONSTRAINED',
      'BIDDING_STRATEGY_CONSTRAINED',
      'NEW_PROVIDER_REASON',
    ])).toEqual({
      provider: ['BUDGET_CONSTRAINED', 'BIDDING_STRATEGY_CONSTRAINED', 'NEW_PROVIDER_REASON'],
      normalized: ['LIMITED_BY_BUDGET', 'BIDDING_LIMITED', 'OTHER_PROVIDER_REASON'],
    })
  })

  it('normalizes provider approval and learning states without losing adverse states', () => {
    expect(normalizeGoogleApprovalStatus('APPROVED_LIMITED')).toBe('LIMITED')
    expect(normalizeGoogleApprovalStatus('DISAPPROVED')).toBe('DISAPPROVED')
    expect(normalizeMetaApprovalStatus('CAMPAIGN_PAUSED')).toBe('APPROVED')
    expect(normalizeMetaApprovalStatus('DISAPPROVED')).toBe('DISAPPROVED')
    expect(normalizeMetaLearningStage('LEARNING_LIMITED')).toBe('LEARNING_LIMITED')
    expect(normalizeMetaLearningStage('SUCCESS')).toBe('ACTIVE')
  })

  it('caps and normalizes Meta issue text', () => {
    expect(normalizeMetaPolicyIssues([{
      error_code: 1487007,
      error_summary: 'Vehicle pricing claim',
      error_message: 'Price evidence is required',
      error_type: 'POLICY',
      level: 'AD',
    }])).toEqual([{
      code: '1487007',
      topic: 'POLICY',
      summary: 'Vehicle pricing claim',
      message: 'Price evidence is required',
      type: 'POLICY',
      level: 'AD',
    }])
  })

  it('keeps family clocks independent and redacts provider credentials from errors', () => {
    expect(diagnosticDataStatus({ supported: false, asOf: null })).toBe('unsupported')
    expect(diagnosticDataStatus({ supported: true, asOf: null })).toBe('unavailable')
    expect(diagnosticDataStatus({
      supported: true,
      asOf: '2026-08-24T00:00:00Z',
      now: new Date('2026-08-24T12:00:00Z'),
    })).toBe('fresh')
    expect(diagnosticDataStatus({
      supported: true,
      asOf: '2026-08-22T00:00:00Z',
      now: new Date('2026-08-24T12:00:00Z'),
    })).toBe('stale')
    expect(sanitizeDiagnosticError('access_token=super-secret Bearer abc.def')).toBe('access_token=[REDACTED] Bearer [REDACTED]')
  })
})
