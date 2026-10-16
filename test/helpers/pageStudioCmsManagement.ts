import { handleCmsManagement } from '../../workers/page-studio-management/src/cmsManagement'
import type { PageStudioControlQueryClient } from '../../server/utils/pageStudio/controlStore'

/** In-process private RPC with real native SQL; no authority or graph implementation mocked. */
export function attachCmsManagement(env: Record<string, unknown>, run: <T>(work: (db: PageStudioControlQueryClient) => Promise<T>) => Promise<T>) {
  env.PAGE_STUDIO_RELEASE_ENVIRONMENT ??= 'production'
  const workerEnv = { ...env, PAGE_STUDIO_CMS_STAGING_CONTENT_ROUTER: env.PAGE_STUDIO_CONTENT_ROUTER,
    PAGE_STUDIO_CMS_STAGING_CHECKPOINTS: env.PAGE_STUDIO_CHECKPOINTS,
    PAGE_STUDIO_CMS_STAGING_OBJECT_TRANSPORT: env.PAGE_STUDIO_CMS_OBJECT_TRANSPORT,
    PAGE_STUDIO_CMS_STAGING_ACTION_RUNTIME_DIGEST: env.PAGE_STUDIO_ACTION_RUNTIME_DIGEST }
  env.PAGE_STUDIO_MANAGEMENT = { cmsAuthoring: (request: unknown) => handleCmsManagement(request, workerEnv, run) }
}
