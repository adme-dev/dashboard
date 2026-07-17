import {
  CreateConversionDestinationConfigurationSchema,
  ListConversionDestinationsSchema
} from '~~/server/utils/measurement/contracts'
import type { MeasurementDestinationRepository } from '~~/server/utils/measurement/destinationRepository'
import { MeasurementError } from '~~/server/utils/measurement/errors'
import type { MeasurementProfileRepository } from '~~/server/utils/measurement/profileRepository'
import {
  repairMeasurementProfileCacheFromCanonical,
  toMeasurementProfileCacheProjection,
  type MeasurementProfileCachePublisher
} from '~~/server/utils/measurement/profileService'

export interface MeasurementDestinationServiceDeps {
  repository: MeasurementDestinationRepository
  profileRepository: MeasurementProfileRepository
  cache: MeasurementProfileCachePublisher
}

function validationError() {
  return new MeasurementError(
    'MEASUREMENT_VALIDATION_ERROR',
    422,
    'Invalid measurement destination configuration'
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
    'Measurement configuration changed; refresh before updating'
  )
}

export function createMeasurementDestinationService(deps: MeasurementDestinationServiceDeps) {
  return {
    async list(rawInput: unknown) {
      const inputResult = ListConversionDestinationsSchema.safeParse(rawInput)
      if (!inputResult.success) throw validationError()
      return deps.repository.list(inputResult.data)
    },

    async create(rawInput: unknown) {
      const inputResult = CreateConversionDestinationConfigurationSchema.safeParse(rawInput)
      if (!inputResult.success) throw validationError()

      const persisted = await deps.repository.create(inputResult.data)
      if (persisted.status === 'not_found' || persisted.status === 'connection_not_found') {
        throw notFoundError()
      }
      if (persisted.status === 'version_conflict') throw versionConflictError()
      if (persisted.status === 'duplicate') {
        throw new MeasurementError(
          'MEASUREMENT_DUPLICATE',
          409,
          'Measurement destination already exists'
        )
      }

      const warnings: Array<{ code: 'MEASUREMENT_CACHE_STALE' }> = []
      let cacheStatus: 'fresh' | 'stale' = 'fresh'
      let cacheErrorClass: string | null = null

      try {
        await deps.cache.publish(toMeasurementProfileCacheProjection(persisted.profile))
      } catch {
        cacheStatus = 'stale'
        cacheErrorClass = 'cache_publication_failed'
        warnings.push({ code: 'MEASUREMENT_CACHE_STALE' })
      }

      try {
        const recorded = await deps.profileRepository.recordCachePublication({
          clientId: persisted.profile.clientId,
          profileId: persisted.profile.id,
          configVersion: persisted.profile.configVersion,
          status: cacheStatus,
          errorClass: cacheErrorClass
        })
        if (!recorded) {
          if (warnings.length === 0) warnings.push({ code: 'MEASUREMENT_CACHE_STALE' })
          await repairMeasurementProfileCacheFromCanonical({
            repository: deps.profileRepository,
            cache: deps.cache
          }, persisted.profile)
        }
      } catch {
        if (warnings.length === 0) warnings.push({ code: 'MEASUREMENT_CACHE_STALE' })
      }

      return {
        destination: persisted.destination,
        profileConfigVersion: persisted.profile.configVersion,
        warnings
      }
    }
  }
}
