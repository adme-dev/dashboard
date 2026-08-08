import type { GooglePmaxInventoryLaunchConfig } from '~~/server/utils/googlePmaxLaunchConfig'
import {
  getGooglePmaxLaunch,
  transitionGooglePmaxLaunch,
  type GooglePmaxLaunch
} from '~~/server/utils/googlePmaxLaunchStore'

export interface GooglePmaxProviderResources {
  customerId: string
  campaignResourceName: string
  campaignId: string
  budgetResourceName: string
  assetGroupResourceName: string
  status: 'PAUSED' | 'ENABLED'
  requestId: string | null
}

export interface GooglePmaxProviderVerification {
  status: 'PAUSED' | 'ENABLED' | 'REMOVED' | 'UNKNOWN'
  matchesConfig: boolean
  requestId: string | null
  details: Record<string, unknown>
}

export interface GooglePmaxPausedProvider {
  validateCreate: (config: GooglePmaxInventoryLaunchConfig) => Promise<{ requestId: string | null }>
  createPaused: (config: GooglePmaxInventoryLaunchConfig) => Promise<GooglePmaxProviderResources>
  verify: (
    config: GooglePmaxInventoryLaunchConfig,
    resources: GooglePmaxProviderResources,
    expectedStatus: 'PAUSED' | 'ENABLED'
  ) => Promise<GooglePmaxProviderVerification>
  emergencyPause: (
    resources: GooglePmaxProviderResources,
    config: GooglePmaxInventoryLaunchConfig
  ) => Promise<{
    status: 'PAUSED' | 'ENABLED' | 'UNKNOWN'
    requestId: string | null
  }>
  enable: (
    resources: GooglePmaxProviderResources,
    config: GooglePmaxInventoryLaunchConfig
  ) => Promise<{
    status: 'PAUSED' | 'ENABLED' | 'UNKNOWN'
    requestId: string | null
  }>
}

interface ExecutorDependencies {
  getLaunch?: typeof getGooglePmaxLaunch
  transition?: typeof transitionGooglePmaxLaunch
  parseConfig: (value: Record<string, unknown>) => GooglePmaxInventoryLaunchConfig | Promise<GooglePmaxInventoryLaunchConfig>
  provider: GooglePmaxPausedProvider
}

export class GooglePmaxPausedExecutorError extends Error {
  constructor(public readonly code:
    | 'PMAX_LAUNCH_NOT_FOUND'
    | 'PMAX_EXECUTION_STATE_INVALID'
    | 'PMAX_ACTIVATION_STATE_INVALID'
    | 'PMAX_CREATE_VALIDATION_FAILED'
    | 'PMAX_CREATE_FAILED'
    | 'PMAX_CREATE_RETURNED_UNSAFE_STATUS'
    | 'PMAX_CREATE_READBACK_UNSAFE'
    | 'PMAX_ACTIVATION_FAILED') {
    super('The governed Google PMax provider operation could not be completed.')
    this.name = 'GooglePmaxPausedExecutorError'
  }
}

function safeRequestId(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,255}$/.test(value)
    ? value
    : null
}

function resourceRecord(resources: GooglePmaxProviderResources): Record<string, unknown> {
  return {
    customerId: resources.customerId,
    campaignResourceName: resources.campaignResourceName,
    campaignId: resources.campaignId,
    budgetResourceName: resources.budgetResourceName,
    assetGroupResourceName: resources.assetGroupResourceName,
    status: resources.status,
    requestId: safeRequestId(resources.requestId)
  }
}

function resourcesFromLaunch(launch: GooglePmaxLaunch): GooglePmaxProviderResources {
  const value = launch.providerResources
  const required = [
    value.customerId,
    value.campaignResourceName,
    value.campaignId,
    value.budgetResourceName,
    value.assetGroupResourceName
  ]
  if (required.some(item => typeof item !== 'string' || !item)) {
    throw new GooglePmaxPausedExecutorError('PMAX_ACTIVATION_STATE_INVALID')
  }
  return {
    customerId: value.customerId as string,
    campaignResourceName: value.campaignResourceName as string,
    campaignId: value.campaignId as string,
    budgetResourceName: value.budgetResourceName as string,
    assetGroupResourceName: value.assetGroupResourceName as string,
    status: value.status === 'ENABLED' ? 'ENABLED' : 'PAUSED',
    requestId: safeRequestId(value.requestId)
  }
}

export function createGooglePmaxPausedExecutor(dependencies: ExecutorDependencies) {
  const getLaunch = dependencies.getLaunch || getGooglePmaxLaunch
  const transition = dependencies.transition || transitionGooglePmaxLaunch
  return {
    async createAndVerify(input: { launchId: string, tenantId: string, actorId: string }) {
      let launch = await getLaunch({ launchId: input.launchId, tenantId: input.tenantId })
      if (!launch) throw new GooglePmaxPausedExecutorError('PMAX_LAUNCH_NOT_FOUND')
      const retryingCreate = launch.state === 'FAILED_RETRYABLE' && launch.retryFromState === 'EXECUTING'
      if (launch.state !== 'APPROVED' && !retryingCreate) {
        throw new GooglePmaxPausedExecutorError('PMAX_EXECUTION_STATE_INVALID')
      }
      const config = await dependencies.parseConfig(launch.normalizedConfig)
      const createClaimState = launch.state
      launch = await transition({
        launchId: launch.id,
        tenantId: launch.tenantId,
        expectedState: createClaimState,
        toState: 'EXECUTING',
        expectedConfigVersion: launch.configVersion,
        expectedConfigHash: launch.configHash,
        actorId: input.actorId,
        eventType: 'CREATE_CLAIMED',
        payload: { pausedOnly: true, retry: retryingCreate }
      })

      let validation
      try {
        validation = await dependencies.provider.validateCreate(config)
      } catch {
        await transition({
          launchId: launch.id, tenantId: launch.tenantId,
          expectedState: 'EXECUTING', toState: 'FAILED_RETRYABLE',
          expectedConfigVersion: launch.configVersion, expectedConfigHash: launch.configHash,
          actorId: input.actorId, eventType: 'CREATE_VALIDATION_FAILED',
          payload: { retryable: true }
        })
        throw new GooglePmaxPausedExecutorError('PMAX_CREATE_VALIDATION_FAILED')
      }

      let resources: GooglePmaxProviderResources
      try {
        resources = await dependencies.provider.createPaused(config)
      } catch {
        await transition({
          launchId: launch.id, tenantId: launch.tenantId,
          expectedState: 'EXECUTING', toState: 'FAILED_RETRYABLE',
          expectedConfigVersion: launch.configVersion, expectedConfigHash: launch.configHash,
          actorId: input.actorId, eventType: 'CREATE_PROVIDER_FAILED',
          providerRequestId: safeRequestId(validation.requestId),
          payload: { retryable: true, validateOnlyPassed: true }
        })
        throw new GooglePmaxPausedExecutorError('PMAX_CREATE_FAILED')
      }

      if (resources.status !== 'PAUSED') {
        let emergencyStatus: 'PAUSED' | 'ENABLED' | 'UNKNOWN' = 'UNKNOWN'
        let emergencyRequestId: string | null = null
        try {
          const emergency = await dependencies.provider.emergencyPause(resources, config)
          emergencyStatus = emergency.status
          emergencyRequestId = safeRequestId(emergency.requestId)
        } catch {
          // Creation returned an unsafe status and the compensating pause could
          // not be confirmed, so the provider state remains UNKNOWN.
        }
        await transition({
          launchId: launch.id, tenantId: launch.tenantId,
          expectedState: 'EXECUTING', toState: 'RECOVERY_REQUIRED',
          expectedConfigVersion: launch.configVersion, expectedConfigHash: launch.configHash,
          actorId: input.actorId, eventType: 'UNSAFE_CREATE_STATUS_DETECTED',
          providerRequestId: emergencyRequestId || safeRequestId(resources.requestId),
          payload: {
            returnedStatus: resources.status,
            emergencyPauseStatus: emergencyStatus,
            campaignResourceName: resources.campaignResourceName
          }
        })
        throw new GooglePmaxPausedExecutorError('PMAX_CREATE_RETURNED_UNSAFE_STATUS')
      }

      launch = await transition({
        launchId: launch.id, tenantId: launch.tenantId,
        expectedState: 'EXECUTING', toState: 'CREATED_PAUSED',
        expectedConfigVersion: launch.configVersion, expectedConfigHash: launch.configHash,
        actorId: input.actorId, eventType: 'PROVIDER_CREATED_PAUSED',
        providerRequestId: safeRequestId(resources.requestId),
        payload: { validateOnlyPassed: true, status: 'PAUSED' },
        results: { providerResources: resourceRecord(resources) }
      })

      let verification: GooglePmaxProviderVerification
      try {
        verification = await dependencies.provider.verify(config, resources, 'PAUSED')
      } catch {
        verification = {
          status: 'UNKNOWN', matchesConfig: false, requestId: null,
          details: { readbackFailed: true }
        }
      }
      if (verification.status !== 'PAUSED') {
        let emergencyStatus: 'PAUSED' | 'ENABLED' | 'UNKNOWN' = 'UNKNOWN'
        let emergencyRequestId: string | null = null
        try {
          const emergency = await dependencies.provider.emergencyPause(resources, config)
          emergencyStatus = emergency.status
          emergencyRequestId = safeRequestId(emergency.requestId)
        } catch {
          // The paused readback was unsafe and the compensating pause could not
          // be confirmed, so the provider state remains UNKNOWN.
        }
        await transition({
          launchId: launch.id, tenantId: launch.tenantId,
          expectedState: 'CREATED_PAUSED', toState: 'RECOVERY_REQUIRED',
          expectedConfigVersion: launch.configVersion, expectedConfigHash: launch.configHash,
          actorId: input.actorId, eventType: 'PAUSED_READBACK_UNSAFE',
          providerRequestId: emergencyRequestId || safeRequestId(verification.requestId),
          payload: {
            readbackStatus: verification.status,
            matchesConfig: verification.matchesConfig,
            emergencyPauseStatus: emergencyStatus
          },
          results: { verification: verification as unknown as Record<string, unknown> }
        })
        throw new GooglePmaxPausedExecutorError('PMAX_CREATE_READBACK_UNSAFE')
      }
      const verified = verification.status === 'PAUSED' && verification.matchesConfig
      launch = await transition({
        launchId: launch.id, tenantId: launch.tenantId,
        expectedState: 'CREATED_PAUSED',
        toState: verified ? 'VERIFIED_PAUSED' : 'VERIFICATION_FAILED',
        expectedConfigVersion: launch.configVersion, expectedConfigHash: launch.configHash,
        actorId: input.actorId,
        eventType: verified ? 'PAUSED_READBACK_VERIFIED' : 'PAUSED_READBACK_FAILED',
        providerRequestId: safeRequestId(verification.requestId),
        payload: { status: verification.status, matchesConfig: verification.matchesConfig },
        results: { verification: verification as unknown as Record<string, unknown> }
      })
      return { launch, resources, verification }
    },

    async activateAndVerify(input: { launchId: string, tenantId: string, actorId: string }) {
      let launch = await getLaunch({ launchId: input.launchId, tenantId: input.tenantId })
      if (!launch) throw new GooglePmaxPausedExecutorError('PMAX_LAUNCH_NOT_FOUND')
      const retryingActivation = launch.state === 'FAILED_RETRYABLE' && launch.retryFromState === 'ENABLING'
      if (launch.state !== 'ACTIVATION_APPROVED' && !retryingActivation) {
        throw new GooglePmaxPausedExecutorError('PMAX_ACTIVATION_STATE_INVALID')
      }
      const config = await dependencies.parseConfig(launch.normalizedConfig)
      const resources = resourcesFromLaunch(launch)
      const activationClaimState = launch.state
      launch = await transition({
        launchId: launch.id, tenantId: launch.tenantId,
        expectedState: activationClaimState, toState: 'ENABLING',
        expectedConfigVersion: launch.configVersion, expectedConfigHash: launch.configHash,
        actorId: input.actorId, eventType: 'ACTIVATION_CLAIMED',
        payload: { separateActivationApprovalVerified: true, retry: retryingActivation }
      })

      let enabled
      try {
        enabled = await dependencies.provider.enable(resources, config)
      } catch {
        let emergencyStatus: 'PAUSED' | 'ENABLED' | 'UNKNOWN' = 'UNKNOWN'
        let emergencyRequestId: string | null = null
        try {
          const emergency = await dependencies.provider.emergencyPause(resources, config)
          emergencyStatus = emergency.status
          emergencyRequestId = safeRequestId(emergency.requestId)
        } catch {
          // The enable request was ambiguous and the compensating pause could
          // not be confirmed, so the provider state remains UNKNOWN.
        }
        await transition({
          launchId: launch.id, tenantId: launch.tenantId,
          expectedState: 'ENABLING', toState: 'RECOVERY_REQUIRED',
          expectedConfigVersion: launch.configVersion, expectedConfigHash: launch.configHash,
          actorId: input.actorId, eventType: 'ACTIVATION_PROVIDER_FAILED',
          providerRequestId: emergencyRequestId,
          payload: { ambiguousEnable: true, emergencyPauseStatus: emergencyStatus }
        })
        throw new GooglePmaxPausedExecutorError('PMAX_ACTIVATION_FAILED')
      }

      let verification: GooglePmaxProviderVerification
      try {
        verification = await dependencies.provider.verify(config, resources, 'ENABLED')
      } catch {
        verification = { status: 'UNKNOWN', matchesConfig: false, requestId: null, details: { readbackFailed: true } }
      }
      if (enabled.status !== 'ENABLED' || verification.status !== 'ENABLED' || !verification.matchesConfig) {
        let emergencyStatus: 'PAUSED' | 'ENABLED' | 'UNKNOWN' = 'UNKNOWN'
        let emergencyRequestId: string | null = null
        try {
          const emergency = await dependencies.provider.emergencyPause(resources, config)
          emergencyStatus = emergency.status
          emergencyRequestId = safeRequestId(emergency.requestId)
        } catch {
          // Readback was unsafe and the compensating pause could not be
          // confirmed, so the provider state remains UNKNOWN.
        }
        await transition({
          launchId: launch.id, tenantId: launch.tenantId,
          expectedState: 'ENABLING', toState: 'RECOVERY_REQUIRED',
          expectedConfigVersion: launch.configVersion, expectedConfigHash: launch.configHash,
          actorId: input.actorId, eventType: 'ACTIVATION_READBACK_FAILED',
          providerRequestId: emergencyRequestId || safeRequestId(verification.requestId) || safeRequestId(enabled.requestId),
          payload: {
            returnedStatus: enabled.status,
            readbackStatus: verification.status,
            matchesConfig: verification.matchesConfig,
            emergencyPauseStatus: emergencyStatus
          }
        })
        throw new GooglePmaxPausedExecutorError('PMAX_ACTIVATION_FAILED')
      }

      launch = await transition({
        launchId: launch.id, tenantId: launch.tenantId,
        expectedState: 'ENABLING', toState: 'ENABLED_VERIFIED',
        expectedConfigVersion: launch.configVersion, expectedConfigHash: launch.configHash,
        actorId: input.actorId, eventType: 'ACTIVATION_READBACK_VERIFIED',
        providerRequestId: safeRequestId(verification.requestId) || safeRequestId(enabled.requestId),
        payload: { status: 'ENABLED', matchesConfig: true },
        results: { verification: verification as unknown as Record<string, unknown> }
      })
      return { launch, resources, verification }
    }
  }
}
