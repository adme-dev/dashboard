import type { H3Event } from 'h3'
import { getKV } from '~~/server/utils/kv'
import { createPostgresMeasurementDestinationRepository } from '~~/server/utils/measurement/destinationRepository'
import { createMeasurementDestinationService } from '~~/server/utils/measurement/destinationService'
import { createMeasurementProfileCachePublisher } from '~~/server/utils/measurement/profileCache'
import { createPostgresMeasurementProfileRepository } from '~~/server/utils/measurement/profileRepository'
import { createMeasurementProfileService } from '~~/server/utils/measurement/profileService'
import { createPostgresMeasurementReadRepository } from '~~/server/utils/measurement/readRepository'
import { createMeasurementReadService } from '~~/server/utils/measurement/readService'

function createMeasurementRuntimeCache(event: H3Event) {
  const kv = getKV(event)
  return kv
    ? createMeasurementProfileCachePublisher({
        get: key => kv.get(key, 'text'),
        put: (key, value, options) => kv.put(key, value, options)
      })
    : {
        async publish() {
          throw new Error('Measurement cache unavailable')
        }
      }
}

export function createMeasurementProfileRuntime(event: H3Event) {
  return createMeasurementProfileService({
    repository: createPostgresMeasurementProfileRepository(),
    cache: createMeasurementRuntimeCache(event)
  })
}

export function createMeasurementDestinationRuntime(event: H3Event) {
  const profileRepository = createPostgresMeasurementProfileRepository()
  return createMeasurementDestinationService({
    repository: createPostgresMeasurementDestinationRepository(),
    profileRepository,
    cache: createMeasurementRuntimeCache(event)
  })
}

export function createMeasurementReadRuntime() {
  return createMeasurementReadService({
    repository: createPostgresMeasurementReadRepository()
  })
}
