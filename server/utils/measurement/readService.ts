import {
  ListMeasurementAuditSchema,
  MeasurementReadinessSummarySchema
} from '~~/server/utils/measurement/contracts'
import type {
  MeasurementReadinessSummary
} from '~~/server/utils/measurement/contracts'
import { MeasurementError } from '~~/server/utils/measurement/errors'
import type {
  MeasurementReadinessEvidence,
  MeasurementReadRepository
} from '~~/server/utils/measurement/readRepository'

export interface MeasurementReadServiceDeps {
  repository: MeasurementReadRepository
}

type ReadinessBlocker = MeasurementReadinessSummary['blockers'][number]

function validationError() {
  return new MeasurementError(
    'MEASUREMENT_VALIDATION_ERROR',
    422,
    'Invalid measurement read request'
  )
}

function notFoundError() {
  return new MeasurementError(
    'MEASUREMENT_NOT_FOUND',
    404,
    'Measurement configuration not found'
  )
}

function readinessStatus(
  evidence: MeasurementReadinessEvidence,
  blockers: ReadinessBlocker[]
) {
  if (evidence.profile.environment === 'paused') return 'paused' as const
  if (evidence.counts.blockedDestinations > 0 || evidence.counts.blockedCapabilities > 0) {
    return 'blocked' as const
  }
  if (evidence.counts.degradedDestinations > 0 || evidence.counts.degradedCapabilities > 0) {
    return 'degraded' as const
  }
  if (blockers.length > 0) return 'onboarding' as const
  return 'ready' as const
}

function readinessBlockers(evidence: MeasurementReadinessEvidence): ReadinessBlocker[] {
  const blockers: ReadinessBlocker[] = []
  if (!evidence.profile.desiredEnabled) {
    blockers.push({
      code: 'desired_disabled',
      message: 'Measurement signals were deliberately turned off for this client'
    })
  }
  if (evidence.profile.environment === 'paused') {
    blockers.push({ code: 'profile_paused', message: 'Measurement profile is paused' })
  }
  if (evidence.profile.cacheStatus !== 'fresh') {
    blockers.push({
      code: 'cache_stale',
      message: 'The edge configuration cache does not match confirmed canonical state'
    })
  }
  if (evidence.counts.destinations === 0) {
    blockers.push({ code: 'no_destinations', message: 'No conversion destination is configured' })
  } else if (evidence.counts.readyDestinations !== evidence.counts.destinations) {
    blockers.push({
      code: 'destination_not_ready',
      message: 'One or more conversion destinations lack current ready evidence'
    })
  }
  if (
    evidence.counts.capabilities === 0
    || evidence.counts.readyCapabilities !== evidence.counts.capabilities
  ) {
    blockers.push({
      code: 'capability_not_ready',
      message: 'One or more capabilities lack current ready evidence'
    })
  }
  if (evidence.counts.blockedDestinations > 0 || evidence.counts.blockedCapabilities > 0) {
    blockers.push({
      code: 'capability_blocked',
      message: 'A destination or capability has an unresolved blocker'
    })
  }
  if (evidence.counts.activeMappings === 0) {
    blockers.push({ code: 'no_active_mappings', message: 'No canonical event mapping is active' })
  }
  if (!evidence.profile.enabled || evidence.profile.environment !== 'live') {
    if (!evidence.liveApproved) {
      blockers.push({ code: 'live_approval_missing', message: 'Live approval has not been recorded' })
    }
    if (!evidence.privacyApproved) {
      blockers.push({
        code: 'privacy_approval_missing',
        message: 'Privacy and consent approval has not been recorded'
      })
    }
  }
  if (
    evidence.profile.outcomeAuthority === 'client_webhook'
    && evidence.counts.readyOutcomeEndpoints === 0
  ) {
    blockers.push({
      code: 'outcome_endpoint_not_ready',
      message: 'External outcome authority requires a tested outcome endpoint'
    })
  }
  return blockers
}

export function createMeasurementReadService(deps: MeasurementReadServiceDeps) {
  return {
    async listAudit(rawInput: unknown) {
      const inputResult = ListMeasurementAuditSchema.safeParse(rawInput)
      if (!inputResult.success) throw validationError()
      return deps.repository.listAudit(inputResult.data)
    },

    async getReadiness(clientId: unknown): Promise<MeasurementReadinessSummary> {
      const clientResult = ListMeasurementAuditSchema.shape.clientId.safeParse(clientId)
      if (!clientResult.success) throw validationError()

      const evidence = await deps.repository.getReadinessEvidence(clientResult.data)
      if (!evidence) throw notFoundError()

      const blockers = readinessBlockers(evidence)
      return MeasurementReadinessSummarySchema.parse({
        clientId: evidence.clientId,
        profileId: evidence.profileId,
        configVersion: evidence.configVersion,
        status: readinessStatus(evidence, blockers),
        liveEligible: blockers.length === 0,
        approvals: {
          privacy: evidence.privacyApproved,
          live: evidence.liveApproved
        },
        profile: evidence.profile,
        counts: evidence.counts,
        blockers,
        lastValidatedAt: evidence.lastValidatedAt,
        lastSuccessAt: evidence.lastSuccessAt
      })
    }
  }
}
