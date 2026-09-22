import { queryOne } from '~~/server/utils/db'
import type { H3Event } from 'h3'
import { resolvePageStudioHttpActor } from './httpActor'
import { preparePageStudioContentLogin } from './contentNativeLogin'
import { featureConflict, type FeaturePublisher } from './releaseFeatureAuthority'
import type { FeatureBuildServices } from './releaseFeatureBuild'

export async function nativeFeaturePublisher(event: H3Event, siteId: string): Promise<FeaturePublisher> {
  const actor = await resolvePageStudioHttpActor(event, 'agency', true)
  const login = await preparePageStudioContentLogin(event, actor)
  return { source: 'native-login', request: { actor, login, siteId, env: (event.context.cloudflare?.env ?? {}) as Record<string, unknown> } }
}
export function featureBuildServices(event: H3Event): FeatureBuildServices {
  const env = event.context.cloudflare?.env as Record<string, unknown> | undefined
  const build = env?.PAGE_STUDIO_BUILD as Pick<FeatureBuildServices, 'buildSealed'> | undefined
  const delivery = env?.PAGE_STUDIO_DELIVERY as Pick<FeatureBuildServices, 'verifyFeatureBuild'> | undefined
  if (typeof build?.buildSealed !== 'function' || typeof delivery?.verifyFeatureBuild !== 'function') throw featureConflict()
  return { buildSealed: input => build.buildSealed(input), verifyFeatureBuild: (pointer, reference) => delivery.verifyFeatureBuild(pointer, reference) }
}

export async function hasSealedFeatureBuild(scope: { tenantId: string, clientId: string, siteId: string }, buildId: string) {
  const row = await queryOne<{ release_metadata: Record<string, unknown> | null }>('SELECT release_metadata FROM page_studio_builds WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3 AND id=$4', [scope.tenantId, scope.clientId, scope.siteId, buildId])
  return Boolean(row?.release_metadata && Object.hasOwn(row.release_metadata, 'featureSeal'))
}
