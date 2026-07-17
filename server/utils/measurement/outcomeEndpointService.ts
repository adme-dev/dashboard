import {
  CreateOutcomeEndpointConfigurationSchema,
  ListOutcomeEndpointsSchema,
  OutcomeEndpointReadModelSchema
} from '~~/server/utils/measurement/contracts'
import type {
  MeasurementOutcomeEndpointRepository
} from '~~/server/utils/measurement/outcomeEndpointRepository'
import { MeasurementError } from '~~/server/utils/measurement/errors'
import type { MeasurementProfileRepository } from '~~/server/utils/measurement/profileRepository'
import {
  repairMeasurementProfileCacheFromCanonical,
  toMeasurementProfileCacheProjection,
  type MeasurementProfileCachePublisher
} from '~~/server/utils/measurement/profileService'

export interface MeasurementOutcomeEndpointServiceDeps {
  repository: MeasurementOutcomeEndpointRepository
  profileRepository: MeasurementProfileRepository
  cache: MeasurementProfileCachePublisher
  generateEndpointKey?: () => string
}

function generateEndpointKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

function validationError() {
  return new MeasurementError(
    'MEASUREMENT_VALIDATION_ERROR',
    422,
    'Invalid measurement outcome endpoint configuration'
  )
}

export function createMeasurementOutcomeEndpointService(
  deps: MeasurementOutcomeEndpointServiceDeps
) {
  return {
    async list(rawInput: unknown) {
      const inputResult = ListOutcomeEndpointsSchema.safeParse(rawInput)
      if (!inputResult.success) throw validationError()
      return deps.repository.list(inputResult.data)
    },

    async create(rawInput: unknown) {
      const inputResult = CreateOutcomeEndpointConfigurationSchema.safeParse(rawInput)
      if (!inputResult.success) throw validationError()
      const endpointKey = (deps.generateEndpointKey ?? generateEndpointKey)()
      if (!OutcomeEndpointReadModelSchema.shape.endpointKey.safeParse(endpointKey).success) {
        throw new MeasurementError(
          'MEASUREMENT_DISABLED',
          503,
          'Measurement endpoint identity generation unavailable'
        )
      }

      const persisted = await deps.repository.create({ ...inputResult.data, endpointKey })
      if (persisted.status === 'not_found') {
        throw new MeasurementError(
          'MEASUREMENT_NOT_FOUND',
          404,
          'Measurement configuration not found'
        )
      }
      if (persisted.status === 'not_available') {
        throw new MeasurementError(
          'MEASUREMENT_DISABLED',
          409,
          'Outcome endpoint configuration requires a disabled test profile'
        )
      }
      if (persisted.status === 'version_conflict') {
        throw new MeasurementError(
          'MEASUREMENT_VERSION_CONFLICT',
          409,
          'Measurement configuration changed; refresh before updating'
        )
      }
      if (persisted.status === 'duplicate') {
        throw new MeasurementError(
          'MEASUREMENT_DUPLICATE',
          409,
          'Measurement outcome endpoint already exists'
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
        endpoint: persisted.endpoint,
        profileConfigVersion: persisted.profile.configVersion,
        warnings
      }
    }
  }
}
