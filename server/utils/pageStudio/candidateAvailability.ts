import type { H3Event } from 'h3'
import { resolveAstroBuildServices } from './astroBuildHttp'
import { PageStudioHostnameSchema } from './delivery'
import { resolvePageStudioSessionEnvironment } from './sessions'

/** UI availability only. No compiler dispatch, storage reads or access grants;
 * preparing a preview still performs all original-login and approval checks. */
export async function productionCandidateAvailable(event: H3Event): Promise<boolean> {
  try {
    const bindings = event.context.cloudflare?.env
    const bucket = bindings?.PAGE_STUDIO_CHECKPOINTS as { get?: unknown } | undefined
    if (typeof bucket?.get !== 'function') return false
    const hostname = PageStudioHostnameSchema.safeParse(bindings?.PAGE_STUDIO_RELEASE_PREVIEW_HOSTNAME)
    if (!hostname.success || hostname.data.length > 196) return false
    const { environment, services } = resolveAstroBuildServices(event)
    if (environment !== 'production') return false
    resolvePageStudioSessionEnvironment(event)
    const generation = await services.selectGeneration('production')
    return generation.environment === 'production'
  } catch { return false }
}
