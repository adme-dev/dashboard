import {
  ActivateMeasurementProfileSchema,
  ApproveMeasurementActivationSchema
} from '~~/server/utils/measurement/contracts'
import type {
  MeasurementActivationRepository
} from '~~/server/utils/measurement/activationRepository'
import { MeasurementError } from '~~/server/utils/measurement/errors'
import type { MeasurementProfileRepository } from '~~/server/utils/measurement/profileRepository'
import {
  repairMeasurementProfileCacheFromCanonical,
  toMeasurementProfileCacheProjection,
  type MeasurementProfileCachePublisher
} from '~~/server/utils/measurement/profileService'

export interface MeasurementActivationServiceDeps {
  repository: MeasurementActivationRepository
  profileRepository: MeasurementProfileRepository
  cache: MeasurementProfileCachePublisher
}

function validationError() {
  return new MeasurementError(
    'MEASUREMENT_VALIDATION_ERROR',
    422,
    'Invalid measurement activation command'
  )
}

function notFoundError() {
  return new MeasurementError(
    'MEASUREMENT_NOT_FOUND',
    404,
    'Measurement configuration not found'
  )
}

function versionConflictError() {
  return new MeasurementError(
    'MEASUREMENT_VERSION_CONFLICT',
    409,
    'Measurement configuration changed; refresh before approval or activation'
  )
}

export function createMeasurementActivationService(deps: MeasurementActivationServiceDeps) {
  return {
    async approve(rawInput: unknown) {
      const inputResult = ApproveMeasurementActivationSchema.safeParse(rawInput)
      if (!inputResult.success) throw validationError()

      const result = await deps.repository.approve(inputResult.data)
      if (result.status === 'not_found') throw notFoundError()
      if (result.status === 'version_conflict') throw versionConflictError()
      if (result.status === 'not_available') {
        throw new MeasurementError(
          'MEASUREMENT_DISABLED',
          409,
          'Measurement approvals are available only for a disabled test configuration'
        )
      }
      if (result.status === 'duplicate_approval') {
        throw new MeasurementError(
          'MEASUREMENT_DUPLICATE',
          409,
          'This approval is already recorded for the current configuration'
        )
      }
      if (result.status === 'approver_conflict') {
        throw new MeasurementError(
          'MEASUREMENT_APPROVAL_CONFLICT',
          409,
          'Privacy and live approval require two different team members'
        )
      }
      return result.approval
    },

    async activate(rawInput: unknown) {
      const inputResult = ActivateMeasurementProfileSchema.safeParse(rawInput)
      if (!inputResult.success) throw validationError()

      const result = await deps.repository.activate(inputResult.data)
      if (result.status === 'not_found') throw notFoundError()
      if (result.status === 'version_conflict') throw versionConflictError()
      if (result.status === 'already_active') {
        throw new MeasurementError(
          'MEASUREMENT_DUPLICATE',
          409,
          'Measurement profile is already active'
        )
      }
      if (result.status === 'not_ready') {
        throw new MeasurementError(
          'MEASUREMENT_NOT_READY',
          409,
          'Measurement profile is not eligible for live activation',
          { blockers: result.blockers }
        )
      }

      const warnings: Array<{ code: 'MEASUREMENT_CACHE_STALE' }> = []
      let cacheStatus: 'fresh' | 'stale' = 'fresh'
      let cacheErrorClass: string | null = null
      try {
        await deps.cache.publish(toMeasurementProfileCacheProjection(result.profile))
      } catch {
        cacheStatus = 'stale'
        cacheErrorClass = 'cache_publication_failed'
        warnings.push({ code: 'MEASUREMENT_CACHE_STALE' })
      }

      try {
        const recorded = await deps.profileRepository.recordCachePublication({
          clientId: result.profile.clientId,
          profileId: result.profile.id,
          configVersion: result.profile.configVersion,
          status: cacheStatus,
          errorClass: cacheErrorClass
        })
        if (!recorded) {
          if (warnings.length === 0) warnings.push({ code: 'MEASUREMENT_CACHE_STALE' })
          await repairMeasurementProfileCacheFromCanonical({
            repository: deps.profileRepository,
            cache: deps.cache
          }, result.profile)
        }
      } catch {
        if (warnings.length === 0) warnings.push({ code: 'MEASUREMENT_CACHE_STALE' })
      }

      return {
        profile: result.profile,
        activatedDestinations: result.activatedDestinations,
        warnings
      }
    }
  }
}
