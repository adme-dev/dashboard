import { describe, expect, it } from 'vitest'
import { buildGooglePmaxRemediationTaskDrafts } from '~~/server/utils/googlePmaxRemediationTasks'

describe('Google PMax remediation task drafts', () => {
  it('turns deterministic blockers, warnings, and onboarding work into stable task keys', () => {
    const result = buildGooglePmaxRemediationTaskDrafts({
      preflightChecks: [
        { code: 'PMAX_ACCOUNT_READY', category: 'account', status: 'pass', message: 'Ready.', remediation: null },
        { code: 'PMAX_STORE_CODE_MISMATCH', category: 'inventory', status: 'fail', message: 'Store code mismatch.', remediation: 'Correct the exact case-sensitive store code.' },
        { code: 'PMAX_FEED_COUNT_DRIFT', category: 'inventory', status: 'warning', message: 'Feed counts drift.', remediation: 'Wait for import or resolve rejects.' }
      ],
      onboardingTasks: [
        { key: 'verify-business-profile-location', title: 'Verify the Business Profile', execution: 'human', owner: 'client' }
      ]
    })

    expect(result).toEqual([
      expect.objectContaining({ taskKey: 'onboarding:verify-business-profile-location', severity: 'blocker', execution: 'human' }),
      expect.objectContaining({ taskKey: 'preflight:PMAX_FEED_COUNT_DRIFT', severity: 'advisory', execution: 'assisted' }),
      expect.objectContaining({ taskKey: 'preflight:PMAX_STORE_CODE_MISMATCH', severity: 'blocker', execution: 'assisted' })
    ])
    expect(result.some(item => item.sourceCode === 'PMAX_ACCOUNT_READY')).toBe(false)
  })

  it('deduplicates stable keys without using provider error text', () => {
    const result = buildGooglePmaxRemediationTaskDrafts({
      preflightChecks: [
        { code: 'PMAX_PROVIDER_READ_FAILED', category: 'provider', status: 'fail', message: 'Google readiness evidence could not be read.', remediation: 'Reconnect and rerun.' },
        { code: 'PMAX_PROVIDER_READ_FAILED', category: 'provider', status: 'fail', message: 'Google readiness evidence could not be read.', remediation: 'Reconnect and rerun.' }
      ],
      onboardingTasks: []
    })

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      taskKey: 'preflight:PMAX_PROVIDER_READ_FAILED',
      title: 'Resolve Google PMax blocker: Google readiness evidence could not be read.'
    })
  })
})
