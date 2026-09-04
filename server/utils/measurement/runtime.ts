import type { H3Event } from 'h3'
import { getKV } from '~~/server/utils/kv'
import { resolveGoogleOAuthRuntimeConfig } from '~~/server/utils/googleOAuthRuntimeConfig'
import { createPostgresMeasurementActivationRepository } from '~~/server/utils/measurement/activationRepository'
import { createMeasurementActivationService } from '~~/server/utils/measurement/activationService'
import { createPostgresMeasurementDestinationRepository } from '~~/server/utils/measurement/destinationRepository'
import { createMeasurementDestinationService } from '~~/server/utils/measurement/destinationService'
import { createPostgresMeasurementOutcomeEndpointRepository } from '~~/server/utils/measurement/outcomeEndpointRepository'
import { createMeasurementOutcomeEndpointService } from '~~/server/utils/measurement/outcomeEndpointService'
import { createMeasurementProfileCachePublisher } from '~~/server/utils/measurement/profileCache'
import { createPostgresMeasurementProfileRepository } from '~~/server/utils/measurement/profileRepository'
import { createMeasurementProfileService } from '~~/server/utils/measurement/profileService'
import { createPostgresMeasurementProviderTestRepository } from '~~/server/utils/measurement/providerTestRepository'
import { createMeasurementProviderTestService } from '~~/server/utils/measurement/providerTestService'
import { createPostgresMeasurementReadRepository } from '~~/server/utils/measurement/readRepository'
import { createMeasurementReadService } from '~~/server/utils/measurement/readService'
import {
  deliverGoogleDataManagerEvent,
  deliverMetaConversionEvent,
  deliverTikTokEvent,
  refreshGoogleDataManagerAccessToken
} from '~~/workers/measurement-delivery/src/providers'
import { resolveMeasurementProviderCredential } from '~~/workers/measurement-delivery/src/credential'

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

export function createMeasurementActivationRuntime(event: H3Event) {
  const profileRepository = createPostgresMeasurementProfileRepository()
  return createMeasurementActivationService({
    repository: createPostgresMeasurementActivationRepository(),
    profileRepository,
    cache: createMeasurementRuntimeCache(event)
  })
}

export function createMeasurementOutcomeEndpointRuntime(event: H3Event) {
  const profileRepository = createPostgresMeasurementProfileRepository()
  return createMeasurementOutcomeEndpointService({
    repository: createPostgresMeasurementOutcomeEndpointRepository(),
    profileRepository,
    cache: createMeasurementRuntimeCache(event)
  })
}

export function createMeasurementProviderTestRuntime(event: H3Event) {
  const config = useRuntimeConfig(event)
  const googleConfig = resolveGoogleOAuthRuntimeConfig(event, {
    googleClientId: String(config.googleClientId || ''),
    googleClientSecret: String(config.googleClientSecret || '')
  })
  const providerFetch = globalThis.fetch.bind(globalThis)
  const env = (event.context as { cloudflare?: { env?: Record<string, unknown> } })
    .cloudflare?.env ?? {}
  return createMeasurementProviderTestService({
    repository: createPostgresMeasurementProviderTestRepository(),
    deliverMeta: input => deliverMetaConversionEvent({ ...input, fetch: providerFetch }),
    deliverGoogle: input => deliverGoogleDataManagerEvent({ ...input, fetch: providerFetch }),
    deliverTikTok: input => deliverTikTokEvent({ ...input, fetch: providerFetch }),
    refreshGoogleAccessToken: input => refreshGoogleDataManagerAccessToken({
      ...input,
      fetch: providerFetch
    }),
    resolveProviderCredential: credentialRef => resolveMeasurementProviderCredential(
      env,
      credentialRef
    ),
    graphApiVersion: String(config.metaGraphApiVersion || 'v25.0'),
    googleClientId: googleConfig.googleClientId,
    googleClientSecret: googleConfig.googleClientSecret,
    now: () => new Date()
  })
}
