import { describe, expect, it, vi } from 'vitest'
import { createGooglePmaxPausedExecutor } from '~~/server/utils/googlePmaxPausedExecutor'
import type { GooglePmaxLaunch } from '~~/server/utils/googlePmaxLaunchStore'

const ids = {
  launch: '5c4ca47b-df3a-43cd-b82f-a23a3f03a781',
  tenant: 'c41c58be-a3a8-4479-b5d1-9251bb80717d',
  actor: '10ea5019-e05f-476f-971e-a73a3bc6930c'
}

function launch(
  state: GooglePmaxLaunch['state'],
  retryFromState: GooglePmaxLaunch['retryFromState'] = null
): GooglePmaxLaunch {
  return {
    id: ids.launch, tenantId: ids.tenant,
    briefId: '23799282-283b-4508-b065-3fd36e8c05fd',
    clientId: '8d28740e-6239-4ab6-8d82-cd03aa10d5ea',
    connectionId: '4f1206a1-fec7-491f-beed-662d9e9fc904',
    platform: 'google_ads', campaignType: 'G_PMaxInventory', configVersion: 3,
    configHash: 'a'.repeat(64), idempotencyKey: 'b'.repeat(64), normalizedConfig: { schemaVersion: 2 }, state,
    preflightResult: {},
    providerResources: state === 'ACTIVATION_APPROVED' || retryFromState === 'ENABLING' ? resources : {},
    verificationResult: {}, retryFromState,
    mediaSpendId: null, lastErrorCode: null, lastErrorMessage: null, createdBy: ids.actor,
    createdAt: '2026-08-07T09:00:00.000Z', updatedAt: '2026-08-07T09:00:00.000Z'
  }
}

const resources = {
  customerId: '1234567890',
  campaignResourceName: 'customers/1234567890/campaigns/101',
  campaignId: '101',
  budgetResourceName: 'customers/1234567890/campaignBudgets/102',
  assetGroupResourceName: 'customers/1234567890/assetGroups/103',
  status: 'PAUSED' as const,
  requestId: 'create-request-1'
}

function dependencies(
  state: GooglePmaxLaunch['state'] = 'APPROVED',
  retryFromState: GooglePmaxLaunch['retryFromState'] = null
) {
  let current = launch(state, retryFromState)
  return {
    getLaunch: vi.fn().mockImplementation(async () => current),
    parseConfig: vi.fn().mockReturnValue({ schemaVersion: 2, campaignName: 'Northern GAC' }),
    transition: vi.fn().mockImplementation(async (input: { toState: GooglePmaxLaunch['state'] }) => {
      current = { ...current, state: input.toState }
      return current
    }),
    provider: {
      validateCreate: vi.fn().mockResolvedValue({ requestId: 'validate-request-1' }),
      createPaused: vi.fn().mockResolvedValue(resources),
      verify: vi.fn().mockResolvedValue({
        status: 'PAUSED' as const,
        matchesConfig: true,
        requestId: 'verify-request-1',
        details: { merchantCenterId: '5831245452', totalAmountMicros: '700000000' }
      }),
      emergencyPause: vi.fn().mockResolvedValue({ status: 'PAUSED' as const, requestId: 'pause-request-1' }),
      enable: vi.fn().mockResolvedValue({ status: 'ENABLED' as const, requestId: 'enable-request-1' })
    }
  }
}

describe('Google PMax paused-only executor', () => {
  it('validates, creates PAUSED, and verifies exact provider resources through separate states', async () => {
    const deps = dependencies()
    const result = await createGooglePmaxPausedExecutor(deps).createAndVerify({
      launchId: ids.launch, tenantId: ids.tenant, actorId: ids.actor
    })

    expect(result.launch.state).toBe('VERIFIED_PAUSED')
    expect(deps.provider.validateCreate).toHaveBeenCalledBefore(deps.provider.createPaused)
    expect(deps.transition).toHaveBeenNthCalledWith(1, expect.objectContaining({
      expectedState: 'APPROVED', toState: 'EXECUTING'
    }))
    expect(deps.transition).toHaveBeenNthCalledWith(2, expect.objectContaining({
      expectedState: 'EXECUTING', toState: 'CREATED_PAUSED',
      results: { providerResources: expect.objectContaining({ status: 'PAUSED' }) }
    }))
    expect(deps.transition).toHaveBeenNthCalledWith(3, expect.objectContaining({
      expectedState: 'CREATED_PAUSED', toState: 'VERIFIED_PAUSED',
      results: { verification: expect.objectContaining({ matchesConfig: true, status: 'PAUSED' }) }
    }))
    expect(deps.provider.emergencyPause).not.toHaveBeenCalled()
  })

  it('emergency-pauses and requires recovery if Google ever returns an enabled create', async () => {
    const deps = dependencies()
    deps.provider.createPaused.mockResolvedValue({ ...resources, status: 'ENABLED' })

    await expect(createGooglePmaxPausedExecutor(deps).createAndVerify({
      launchId: ids.launch, tenantId: ids.tenant, actorId: ids.actor
    })).rejects.toMatchObject({ code: 'PMAX_CREATE_RETURNED_UNSAFE_STATUS' })

    expect(deps.provider.emergencyPause).toHaveBeenCalledOnce()
    expect(deps.transition).toHaveBeenLastCalledWith(expect.objectContaining({
      expectedState: 'EXECUTING', toState: 'RECOVERY_REQUIRED'
    }))
  })

  it('records verification failure without granting activation approval', async () => {
    const deps = dependencies()
    deps.provider.verify.mockResolvedValue({
      status: 'PAUSED', matchesConfig: false, requestId: 'verify-request-1', details: { drift: true }
    })
    const result = await createGooglePmaxPausedExecutor(deps).createAndVerify({
      launchId: ids.launch, tenantId: ids.tenant, actorId: ids.actor
    })

    expect(result.launch.state).toBe('VERIFICATION_FAILED')
    expect(deps.transition).toHaveBeenLastCalledWith(expect.objectContaining({
      toState: 'VERIFICATION_FAILED'
    }))
    expect(deps.provider.emergencyPause).not.toHaveBeenCalled()
  })

  it('emergency-pauses and requires recovery when paused creation readback is uncertain', async () => {
    const deps = dependencies()
    deps.provider.verify.mockRejectedValue(new Error('readback timeout'))

    await expect(createGooglePmaxPausedExecutor(deps).createAndVerify({
      launchId: ids.launch, tenantId: ids.tenant, actorId: ids.actor
    })).rejects.toMatchObject({ code: 'PMAX_CREATE_READBACK_UNSAFE' })

    expect(deps.provider.emergencyPause).toHaveBeenCalledOnce()
    expect(deps.transition).toHaveBeenLastCalledWith(expect.objectContaining({
      expectedState: 'CREATED_PAUSED',
      toState: 'RECOVERY_REQUIRED',
      payload: expect.objectContaining({
        readbackStatus: 'UNKNOWN',
        emergencyPauseStatus: 'PAUSED'
      })
    }))
  })

  it('enables only after separate activation approval and verifies the enabled readback', async () => {
    const deps = dependencies('ACTIVATION_APPROVED')
    deps.provider.verify.mockResolvedValue({
      status: 'ENABLED', matchesConfig: true, requestId: 'verify-enabled-1', details: { enabled: true }
    })
    const result = await createGooglePmaxPausedExecutor(deps).activateAndVerify({
      launchId: ids.launch, tenantId: ids.tenant, actorId: ids.actor
    })

    expect(result.launch.state).toBe('ENABLED_VERIFIED')
    expect(deps.provider.enable).toHaveBeenCalledOnce()
    expect(deps.transition).toHaveBeenNthCalledWith(1, expect.objectContaining({
      expectedState: 'ACTIVATION_APPROVED', toState: 'ENABLING'
    }))
    expect(deps.transition).toHaveBeenNthCalledWith(2, expect.objectContaining({
      expectedState: 'ENABLING', toState: 'ENABLED_VERIFIED'
    }))
    expect(deps.provider.emergencyPause).not.toHaveBeenCalled()
  })

  it('resumes a retryable paused-creation failure in the persisted execution phase', async () => {
    const deps = dependencies('FAILED_RETRYABLE', 'EXECUTING')
    const result = await createGooglePmaxPausedExecutor(deps).createAndVerify({
      launchId: ids.launch, tenantId: ids.tenant, actorId: ids.actor
    })

    expect(result.launch.state).toBe('VERIFIED_PAUSED')
    expect(deps.transition).toHaveBeenNthCalledWith(1, expect.objectContaining({
      expectedState: 'FAILED_RETRYABLE',
      toState: 'EXECUTING',
      payload: { pausedOnly: true, retry: true }
    }))
  })

  it('resumes a retryable activation failure without requiring a new approval', async () => {
    const deps = dependencies('FAILED_RETRYABLE', 'ENABLING')
    deps.provider.verify.mockResolvedValue({
      status: 'ENABLED', matchesConfig: true, requestId: 'verify-enabled-retry', details: { enabled: true }
    })
    const result = await createGooglePmaxPausedExecutor(deps).activateAndVerify({
      launchId: ids.launch, tenantId: ids.tenant, actorId: ids.actor
    })

    expect(result.launch.state).toBe('ENABLED_VERIFIED')
    expect(deps.transition).toHaveBeenNthCalledWith(1, expect.objectContaining({
      expectedState: 'FAILED_RETRYABLE',
      toState: 'ENABLING',
      payload: { separateActivationApprovalVerified: true, retry: true }
    }))
  })

  it('emergency-pauses and requires recovery when activation readback is uncertain', async () => {
    const deps = dependencies('ACTIVATION_APPROVED')
    deps.provider.verify.mockResolvedValue({
      status: 'UNKNOWN', matchesConfig: false, requestId: null, details: { readbackFailed: true }
    })

    await expect(createGooglePmaxPausedExecutor(deps).activateAndVerify({
      launchId: ids.launch, tenantId: ids.tenant, actorId: ids.actor
    })).rejects.toMatchObject({ code: 'PMAX_ACTIVATION_FAILED' })

    expect(deps.provider.emergencyPause).toHaveBeenCalledOnce()
    expect(deps.transition).toHaveBeenLastCalledWith(expect.objectContaining({
      expectedState: 'ENABLING',
      toState: 'RECOVERY_REQUIRED',
      payload: expect.objectContaining({ emergencyPauseStatus: 'PAUSED' })
    }))
  })

  it('emergency-pauses after an ambiguous activation request failure', async () => {
    const deps = dependencies('ACTIVATION_APPROVED')
    deps.provider.enable.mockRejectedValue(new Error('network timeout'))

    await expect(createGooglePmaxPausedExecutor(deps).activateAndVerify({
      launchId: ids.launch, tenantId: ids.tenant, actorId: ids.actor
    })).rejects.toMatchObject({ code: 'PMAX_ACTIVATION_FAILED' })

    expect(deps.provider.emergencyPause).toHaveBeenCalledOnce()
    expect(deps.transition).toHaveBeenLastCalledWith(expect.objectContaining({
      expectedState: 'ENABLING',
      toState: 'RECOVERY_REQUIRED',
      payload: expect.objectContaining({ ambiguousEnable: true, emergencyPauseStatus: 'PAUSED' })
    }))
  })

  it('refuses create or activation from every unapproved state', async () => {
    const createDeps = dependencies('READY_FOR_APPROVAL')
    await expect(createGooglePmaxPausedExecutor(createDeps).createAndVerify({
      launchId: ids.launch, tenantId: ids.tenant, actorId: ids.actor
    })).rejects.toMatchObject({ code: 'PMAX_EXECUTION_STATE_INVALID' })
    expect(createDeps.provider.validateCreate).not.toHaveBeenCalled()

    const activationDeps = dependencies('VERIFIED_PAUSED')
    await expect(createGooglePmaxPausedExecutor(activationDeps).activateAndVerify({
      launchId: ids.launch, tenantId: ids.tenant, actorId: ids.actor
    })).rejects.toMatchObject({ code: 'PMAX_ACTIVATION_STATE_INVALID' })
    expect(activationDeps.provider.enable).not.toHaveBeenCalled()
  })
})
