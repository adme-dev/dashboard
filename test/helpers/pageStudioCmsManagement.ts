import { handleCmsManagement } from '../../workers/page-studio-management/src/cmsManagement'
import type { PageStudioControlQueryClient } from '../../server/utils/pageStudio/controlStore'

/** Production control plane with an isolated, logically staging native source. */
export function nativeSourceCmsEnvironment(contentRouter: { readManagedCmsTarget: () => unknown }, checkpoints: { get: (key: string) => unknown }, editorOrigin: string) {
  const provisioner = {
    createProvisioning() { throw new Error('Provisioning is outside this CMS fixture') },
    readProvisioning() { throw new Error('Provisioning is outside this CMS fixture') }
  }
  return {
    PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production',
    PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'production',
    PAGE_STUDIO_CONTENT_ENVIRONMENT: 'staging',
    PAGE_STUDIO_CONTENT_ROUTER: contentRouter,
    PAGE_STUDIO_CHECKPOINTS: checkpoints,
    PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED: 'true',
    PAGE_STUDIO_CUSTOMER_PREVIEW_PROVISIONER: provisioner,
    PAGE_STUDIO_CUSTOMER_PREVIEW_CONTENT_ROUTER: contentRouter,
    PAGE_STUDIO_CUSTOMER_PREVIEW_CHECKPOINTS: checkpoints,
    PAGE_STUDIO_CUSTOMER_PREVIEW_EDITOR_ORIGIN: editorOrigin
  }
}

/** In-process private RPC with real native SQL; no authority or graph implementation mocked. */
export function attachCmsManagement(env: Record<string, unknown>, run: <T>(work: (db: PageStudioControlQueryClient) => Promise<T>) => Promise<T>) {
  env.PAGE_STUDIO_RELEASE_ENVIRONMENT ??= 'production'
  const workerEnv = { ...env, PAGE_STUDIO_CMS_STAGING_CONTENT_ROUTER: env.PAGE_STUDIO_CONTENT_ROUTER,
    PAGE_STUDIO_CMS_STAGING_CHECKPOINTS: env.PAGE_STUDIO_CHECKPOINTS,
    PAGE_STUDIO_CMS_STAGING_OBJECT_TRANSPORT: env.PAGE_STUDIO_CMS_OBJECT_TRANSPORT,
    PAGE_STUDIO_CMS_STAGING_ACTION_RUNTIME_DIGEST: env.PAGE_STUDIO_ACTION_RUNTIME_DIGEST }
  env.PAGE_STUDIO_MANAGEMENT = { cmsAuthoring: (request: unknown) => handleCmsManagement(request, workerEnv, run) }
}
