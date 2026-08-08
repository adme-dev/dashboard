import type { GooglePmaxAiAdvisoryResult } from '~~/server/utils/googlePmaxAiAdvisor'
import type { GooglePmaxDecisionEvidence } from '~~/server/utils/googlePmaxDecisionEvidence'
import type { GooglePmaxInventoryLaunchConfig } from '~~/server/utils/googlePmaxLaunchConfig'
import {
  getGooglePmaxLaunch,
  transitionGooglePmaxLaunch,
  type GooglePmaxLaunch
} from '~~/server/utils/googlePmaxLaunchStore'
import type { GooglePmaxOnboardingResult } from '~~/server/utils/googlePmaxOnboarding'
import type { GooglePmaxPreflightResult } from '~~/server/utils/googlePmaxPreflight'

interface GooglePmaxLaunchOrchestratorDependencies {
  getLaunch?: typeof getGooglePmaxLaunch
  parseConfig: (value: Record<string, unknown>) => GooglePmaxInventoryLaunchConfig | Promise<GooglePmaxInventoryLaunchConfig>
  collectEvidence: (
    config: GooglePmaxInventoryLaunchConfig,
    launch: GooglePmaxLaunch
  ) => Promise<GooglePmaxDecisionEvidence>
  persistEvidence: (input: {
    launchId: string
    tenantId: string
    actorId: string
    evidence: GooglePmaxDecisionEvidence
  }) => Promise<{ id: string, evidenceHash: string, collectedAt: string, isReplay: boolean }>
  runPreflight: (config: GooglePmaxInventoryLaunchConfig) => Promise<GooglePmaxPreflightResult>
  readOnboarding: (
    config: GooglePmaxInventoryLaunchConfig,
    launch: GooglePmaxLaunch
  ) => Promise<GooglePmaxOnboardingResult>
  advise: (input: {
    evidence: GooglePmaxDecisionEvidence
    preflight: GooglePmaxPreflightResult
  }) => Promise<GooglePmaxAiAdvisoryResult>
  syncTasks: (input: {
    launchId: string
    tenantId: string
    actorId: string
    preflightChecks: GooglePmaxPreflightResult['checks']
    onboardingTasks: GooglePmaxOnboardingResult['tasks']
  }) => Promise<{
    status: 'synced' | 'project_required'
    created: number
    reopened: number
    cleared: number
    taskCount: number
  }>
  transition?: typeof transitionGooglePmaxLaunch
}

export class GooglePmaxLaunchOrchestratorError extends Error {
  constructor(public readonly code:
    | 'PMAX_LAUNCH_NOT_FOUND'
    | 'PMAX_PREFLIGHT_STATE_INVALID'
    | 'PMAX_PREFLIGHT_EVIDENCE_IDENTITY_MISMATCH') {
    super('Google PMax launch preflight could not be completed.')
    this.name = 'GooglePmaxLaunchOrchestratorError'
  }
}

export function createGooglePmaxLaunchOrchestrator(
  dependencies: GooglePmaxLaunchOrchestratorDependencies
) {
  const getLaunch = dependencies.getLaunch || getGooglePmaxLaunch
  const transition = dependencies.transition || transitionGooglePmaxLaunch

  return {
    async runPreflight(input: {
      launchId: string
      tenantId: string
      actorId: string
    }) {
      let launch = await getLaunch({ launchId: input.launchId, tenantId: input.tenantId })
      if (!launch) throw new GooglePmaxLaunchOrchestratorError('PMAX_LAUNCH_NOT_FOUND')
      if (!['DRAFT', 'PREFLIGHT_FAILED'].includes(launch.state)) {
        throw new GooglePmaxLaunchOrchestratorError('PMAX_PREFLIGHT_STATE_INVALID')
      }

      if (launch.state === 'PREFLIGHT_FAILED') {
        launch = await transition({
          launchId: launch.id,
          tenantId: launch.tenantId,
          expectedState: 'PREFLIGHT_FAILED',
          toState: 'DRAFT',
          expectedConfigVersion: launch.configVersion,
          expectedConfigHash: launch.configHash,
          actorId: input.actorId,
          eventType: 'PREFLIGHT_RETRY_STARTED',
          payload: { priorFailureAcknowledged: true }
        })
      }

      const config = await dependencies.parseConfig(launch.normalizedConfig)
      const [evidence, preflight, onboarding] = await Promise.all([
        dependencies.collectEvidence(config, launch),
        dependencies.runPreflight(config),
        dependencies.readOnboarding(config, launch)
      ])
      if (
        evidence.identity.configHash !== launch.configHash
        || evidence.identity.configVersion !== launch.configVersion
        || evidence.identity.clientId !== launch.clientId
        || evidence.identity.briefId !== launch.briefId
      ) {
        throw new GooglePmaxLaunchOrchestratorError('PMAX_PREFLIGHT_EVIDENCE_IDENTITY_MISMATCH')
      }

      const snapshot = await dependencies.persistEvidence({
        launchId: launch.id,
        tenantId: launch.tenantId,
        actorId: input.actorId,
        evidence
      })
      const advisory = await dependencies.advise({ evidence, preflight })
      const taskSync = await dependencies.syncTasks({
        launchId: launch.id,
        tenantId: launch.tenantId,
        actorId: input.actorId,
        preflightChecks: preflight.checks,
        onboardingTasks: onboarding.tasks
      })

      const ready = evidence.readyForDeterministicPreflight
        && preflight.ready
        && onboarding.ready
      const toState = ready ? 'READY_FOR_APPROVAL' as const : 'PREFLIGHT_FAILED' as const
      const preflightResult: Record<string, unknown> = {
        ...preflight,
        ready,
        evidenceSnapshotId: snapshot.id,
        evidenceHash: snapshot.evidenceHash,
        evidenceBlockerCount: evidence.blockerCount,
        evidenceAdvisoryCount: evidence.advisoryCount,
        onboardingReady: onboarding.ready,
        onboardingChecks: onboarding.checks,
        taskSync,
        advisoryStatus: advisory.status,
        ...(advisory.status === 'available' ? { advisory: advisory.advisory } : {})
      }
      const updated = await transition({
        launchId: launch.id,
        tenantId: launch.tenantId,
        expectedState: 'DRAFT',
        toState,
        expectedConfigVersion: launch.configVersion,
        expectedConfigHash: launch.configHash,
        actorId: input.actorId,
        eventType: ready ? 'PREFLIGHT_PASSED' : 'PREFLIGHT_FAILED',
        providerRequestId: preflight.providerRequestId,
        payload: {
          ready,
          evidenceHash: snapshot.evidenceHash,
          blockerCount: preflight.blockerCount + evidence.blockerCount,
          onboardingReady: onboarding.ready,
          taskCount: taskSync.taskCount,
          advisoryStatus: advisory.status
        },
        results: { preflight: preflightResult }
      })

      return {
        launch: updated,
        evidence,
        preflight,
        onboarding,
        advisory,
        taskSync
      }
    }
  }
}
