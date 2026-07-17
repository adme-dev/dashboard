import type { H3Event } from 'h3'
import { getKV } from '~~/server/utils/kv'
import { createMeasurementProfileCachePublisher } from '~~/server/utils/measurement/profileCache'
import { createPostgresMeasurementProfileRepository } from '~~/server/utils/measurement/profileRepository'
import { createMeasurementProfileService } from '~~/server/utils/measurement/profileService'

export function createMeasurementProfileRuntime(event: H3Event) {
  const kv = getKV(event)
  const cache = kv
    ? createMeasurementProfileCachePublisher({
        get: key => kv.get(key, 'text'),
        put: (key, value, options) => kv.put(key, value, options)
      })
    : {
        async publish() {
          throw new Error('Measurement cache unavailable')
        }
      }

  return createMeasurementProfileService({
    repository: createPostgresMeasurementProfileRepository(),
    cache
  })
}
