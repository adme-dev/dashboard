import { describe, expect, it, vi } from 'vitest'
import { createGooglePmaxLaunchOrchestrator } from '~~/server/utils/googlePmaxLaunchOrchestrator'
import type { GooglePmaxLaunch } from '~~/server/utils/googlePmaxLaunchStore'

const ids = {
  launch: '5c4ca47b-df3a-43cd-b82f-a23a3f03a781',
  tenant: 'c41c58be-a3a8-4479-b5d1-9251bb80717d',
  actor: '10ea5019-e05f-476f-971e-a73a3bc6930c'
}

function launch(state: GooglePmaxLaunch['state'] = 'DRAFT'): GooglePmaxLaunch {
  return {
    id: ids.launch,
    tenantId: ids.tenant,
    briefId: '23799282-283b-4508-b065-3fd36e8c05fd',
    clientId: '8d28740e-6239-4ab6-8d82-cd03aa10d5ea',
    connectionId: '4f1206a1-fec7-491f-beed-662d9e9fc904',
    platform: 'google_ads', campaignType: 'G_PMaxInventory', configVersion: 3,
    configHash: 'a'.repeat(64), idempotencyKey: 'b'.repeat(64),
    normalizedConfig: { schemaVersion: 2 }, state,
    preflightResult: {}, providerResources: {}, verificationResult: {}, retryFromState: null,
    mediaSpendId: null, lastErrorCode: null, lastErrorMessage: null,
    createdBy: ids.actor, createdAt: '2026-08-07T09:00:00.000Z', updatedAt: '2026-08-07T09:00:00.000Z'
  }
}

const config = { schemaVersion: 2, campaignName: 'Northern GAC Vehicles' } as never
const evidence = {
  identity: {
    configHash: 'a'.repeat(64),
    configVersion: 3,
    clientId: '8d28740e-6239-4ab6-8d82-cd03aa10d5ea',
    briefId: '23799282-283b-4508-b065-3fd36e8c05fd'
  },
  evidenceHash: 'c'.repeat(64),
  readyForDeterministicPreflight: true
} as never
const onboarding = {
  ready: true,
  checks: [],
  tasks: [],
  identities: {},
  shopIdentity: {},
  apiCapabilities: {}
} as never

function dependencies(state: GooglePmaxLaunch['state'] = 'DRAFT') {
  return {
    getLaunch: vi.fn().mockResolvedValue(launch(state)),
    parseConfig: vi.fn().mockReturnValue(config),
    collectEvidence: vi.fn().mockResolvedValue(evidence),
    persistEvidence: vi.fn().mockResolvedValue({
      id: 'snapshot-1', evidenceHash: 'c'.repeat(64),
      collectedAt: '2026-08-07T10:00:00.000Z', isReplay: false
    }),
    runPreflight: vi.fn().mockResolvedValue({
      ready: true, blockerCount: 0, warningCount: 0, providerRequestId: 'google-request-1',
      checkedAt: '2026-08-07T10:00:00.000Z', checks: []
    }),
    readOnboarding: vi.fn().mockResolvedValue(onboarding),
    advise: vi.fn().mockResolvedValue({ status: 'unavailable', reason: 'GATEWAY_UNAVAILABLE' }),
    syncTasks: vi.fn().mockResolvedValue({ status: 'synced', created: 0, reopened: 0, cleared: 0, taskCount: 0 }),
    transition: vi.fn().mockImplementation(async (input: { toState: GooglePmaxLaunch['state'] }) => launch(input.toState))
  }
}

describe('Google PMax preflight orchestration', () => {
  it('persists one evidence snapshot, syncs tasks, and moves a ready launch to approval', async () => {
    const deps = dependencies()
    const result = await createGooglePmaxLaunchOrchestrator(deps).runPreflight({
      launchId: ids.launch, tenantId: ids.tenant, actorId: ids.actor
    })

    expect(result.launch.state).toBe('READY_FOR_APPROVAL')
    expect(deps.persistEvidence).toHaveBeenCalledWith(expect.objectContaining({
      launchId: ids.launch, tenantId: ids.tenant, actorId: ids.actor, evidence
    }))
    expect(deps.syncTasks).toHaveBeenCalledWith(expect.objectContaining({
      preflightChecks: [], onboardingTasks: []
    }))
    expect(deps.transition).toHaveBeenCalledWith(expect.objectContaining({
      expectedState: 'DRAFT',
      toState: 'READY_FOR_APPROVAL',
      results: {
        preflight: expect.objectContaining({
          ready: true,
          evidenceSnapshotId: 'snapshot-1',
          evidenceHash: 'c'.repeat(64),
          advisoryStatus: 'unavailable'
        })
      }
    }))
  })

  it('requires evidence, onboarding, and provider preflight all to pass', async () => {
    const deps = dependencies()
    deps.readOnboarding.mockResolvedValue({
      ...onboarding,
      ready: false,
      tasks: [{ key: 'verify-location', title: 'Verify dealership location', execution: 'human', owner: 'client' }]
    })
    const result = await createGooglePmaxLaunchOrchestrator(deps).runPreflight({
      launchId: ids.launch, tenantId: ids.tenant, actorId: ids.actor
    })

    expect(result.launch.state).toBe('PREFLIGHT_FAILED')
    expect(deps.syncTasks).toHaveBeenCalledWith(expect.objectContaining({
      onboardingTasks: expect.arrayContaining([
        expect.objectContaining({ key: 'verify-location', owner: 'client' })
      ])
    }))
  })

  it('claims a failed launch back to DRAFT before retrying its provider reads', async () => {
    const deps = dependencies('PREFLIGHT_FAILED')
    await createGooglePmaxLaunchOrchestrator(deps).runPreflight({
      launchId: ids.launch, tenantId: ids.tenant, actorId: ids.actor
    })

    expect(deps.transition).toHaveBeenNthCalledWith(1, expect.objectContaining({
      expectedState: 'PREFLIGHT_FAILED', toState: 'DRAFT', eventType: 'PREFLIGHT_RETRY_STARTED'
    }))
    expect(deps.transition).toHaveBeenNthCalledWith(2, expect.objectContaining({
      expectedState: 'DRAFT', toState: 'READY_FOR_APPROVAL'
    }))
  })

  it('refuses to rerun preflight from an approved or executing state', async () => {
    const deps = dependencies('APPROVED')
    await expect(createGooglePmaxLaunchOrchestrator(deps).runPreflight({
      launchId: ids.launch, tenantId: ids.tenant, actorId: ids.actor
    })).rejects.toMatchObject({ code: 'PMAX_PREFLIGHT_STATE_INVALID' })
    expect(deps.collectEvidence).not.toHaveBeenCalled()
  })
})
