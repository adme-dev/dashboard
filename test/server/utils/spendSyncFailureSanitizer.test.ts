import { describe, expect, it } from 'vitest'
import {
  sanitizeSpendSyncFailure,
  sanitizeSpendSyncFailureReason,
} from '../../../server/utils/spendSyncFailureSanitizer'

describe('spend sync failure sanitization', () => {
  it('redacts Meta credentials embedded in upstream request URLs', () => {
    const reason = '[GET] "https://graph.facebook.com/v25.0/act_123/insights?fields=spend&access_token=super-secret-token&limit=500": 403 Forbidden'

    const sanitized = sanitizeSpendSyncFailureReason(reason)

    expect(sanitized).toContain('access_token=[redacted]')
    expect(sanitized).toContain('403 Forbidden')
    expect(sanitized).not.toContain('super-secret-token')
  })

  it('redacts bearer credentials and common provider secret parameters', () => {
    const reason = 'Authorization: Bearer abc.def-123 client_secret=client-secret refresh_token=refresh-secret appsecret_proof=proof-secret'

    const sanitized = sanitizeSpendSyncFailureReason(reason)

    expect(sanitized).not.toContain('abc.def-123')
    expect(sanitized).not.toContain('client-secret')
    expect(sanitized).not.toContain('refresh-secret')
    expect(sanitized).not.toContain('proof-secret')
    expect(sanitized).toContain('Bearer [redacted]')
  })

  it('sanitizes stored failure objects and bounds their public size', () => {
    const failure = sanitizeSpendSyncFailure({
      account: 'Arctic Campers',
      reason: `token=${'x'.repeat(1200)}`,
    })

    expect(failure.account).toBe('Arctic Campers')
    expect(failure.reason).not.toContain('x'.repeat(20))
    expect(failure.reason.length).toBeLessThanOrEqual(1000)
  })
})
