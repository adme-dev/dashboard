import type { H3Event } from 'h3'
import { selectNativeAstroCompilerGeneration } from '~~/shared/pageStudio/generated/builderGraphVerifier.mjs'
import type { AstroBuildServices } from './astroBuildCoordinator'
import { PageStudioBuildError } from './builds'
import { resolvePageStudioDeliveryWorker } from './publishing'
import { loadApprovedPageStudioReleaseCheckpoint, type PageStudioCheckpointBucket } from './releaseCheckpoint'

function environmentBindings(event: H3Event) {
  return (event.context.cloudflare?.env ?? {}) as Record<string, unknown>
}
export function hasAstroReleaseConfiguration(event: H3Event): boolean {
  return Object.hasOwn(environmentBindings(event), 'PAGE_STUDIO_ASTRO_RELEASE_REGISTRY')
}

/** Deployment-owned bindings only; no caller-selected service names or URLs.
 * Checkpoint storage is resolved lazily so completed retries only need artifacts. */
export function resolveAstroBuildServices(event: H3Event): { environment: 'staging' | 'production', services: AstroBuildServices } {
  const bindings = environmentBindings(event)
  const environment = bindings.PAGE_STUDIO_RELEASE_ENVIRONMENT
  const registry = bindings.PAGE_STUDIO_ASTRO_RELEASE_REGISTRY
  const currentDigest = bindings.PAGE_STUDIO_ASTRO_CURRENT_TOOLCHAIN_DIGEST
  const build = bindings.PAGE_STUDIO_BUILD as Pick<AstroBuildServices, 'buildAstroApproved'> | undefined
  if ((environment !== 'staging' && environment !== 'production') || typeof registry !== 'string' || typeof build?.buildAstroApproved !== 'function') {
    throw new PageStudioBuildError('BUILD_WORKER_UNAVAILABLE', 503, 'Approved Astro compiler configuration is unavailable')
  }
  const delivery = resolvePageStudioDeliveryWorker(event, environment)
  const bucket = bindings.PAGE_STUDIO_CHECKPOINTS as PageStudioCheckpointBucket | undefined
  return { environment, services: {
    selectGeneration: async (requestedEnvironment, retainedDigest) => {
      if (requestedEnvironment !== environment) throw new PageStudioBuildError('BUILD_WORKER_UNAVAILABLE', 503, 'Astro compiler environment mismatch')
      try {
        return await selectNativeAstroCompilerGeneration(registry, environment, retainedDigest ?? currentDigest)
      } catch {
        throw new PageStudioBuildError('BUILD_WORKER_UNAVAILABLE', 503, 'The requested Astro compiler generation is unavailable')
      }
    },
    loadCheckpoint: async (input) => {
      if (typeof bucket?.get !== 'function') throw new PageStudioBuildError('BUILD_WORKER_UNAVAILABLE', 503, 'Approved checkpoint storage is unavailable')
      return loadApprovedPageStudioReleaseCheckpoint({ ...input, bucket })
    },
    buildAstroApproved: input => build.buildAstroApproved(input),
    verifyBuild: pointer => delivery.verifyBuild(pointer)
  } }
}
