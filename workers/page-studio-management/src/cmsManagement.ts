import { customerPreviewRuntimeEnvironment } from '../../../server/utils/pageStudio/customerPreviewRuntime'
import { CmsManagementRequestSchema, cmsManagementResultSchema } from '../../../shared/pageStudio/cmsManagementContract'
import { collectionDigest } from '../../../shared/pageStudio/collectionApi'
import { PageStudioBusinessContentError } from '../../../server/utils/pageStudio/businessContent'
import type { CmsGraphPrincipal, CmsGraphTransitionInput } from '../../../server/utils/pageStudio/cmsGraphRead'
import type { PageStudioCheckpointInput, PageStudioControlQueryClient } from '~~/shared/pageStudio/controlTypes'
import { coordinateCmsAdoption } from './cms/adoptionCoordinator'
import { coordinateCmsGraphCheckpoint, coordinateCmsGraphTransition, coordinateCmsGraphRestore } from './cms/graphMutations'
import { runCmsDatabaseInvocation, transactionWithoutRetry } from './cmsDatabase'

type Runner = <T>(work: (db: PageStudioControlQueryClient) => Promise<T>) => Promise<T>
const rejected = (requestDigest: string, code = 'CMS_MANAGEMENT_UNAVAILABLE', statusCode = 503, message = 'Website content service is unavailable. Check the operation status before trying again.') =>
  ({ ok: false as const, requestDigest, error: { code, statusCode, message } })

/** Service-binding-only capability. No public HTTP route or caller-selected provider. */
export async function handleCmsManagement(raw: unknown, env: Record<string, unknown>, run: Runner) {
  const parsed = CmsManagementRequestSchema.safeParse(raw)
  if (!parsed.success) return rejected('0'.repeat(64), 'CMS_MANAGEMENT_INVALID', 400, 'Invalid website content request.')
  const request = structuredClone(parsed.data)
  // Capture trusted bindings and configuration before any asynchronous work.
  const deployment = env.PAGE_STUDIO_RELEASE_ENVIRONMENT
  const stagingFromProduction = deployment === 'production' && request.contentEnvironment === 'staging'
  const customerSource = stagingFromProduction && request.principal.source === 'customer-session'
  const native = customerSource ? customerPreviewRuntimeEnvironment(env) : null
  const storage = {
    ...(Object.hasOwn(env, 'PAGE_STUDIO_CUSTOMER_ACTIVATION') ? { PAGE_STUDIO_CUSTOMER_ACTIVATION: env.PAGE_STUDIO_CUSTOMER_ACTIVATION } : {}),
    PAGE_STUDIO_RELEASE_ENVIRONMENT: deployment,
    PAGE_STUDIO_CONTENT_ENVIRONMENT: request.contentEnvironment,
    PAGE_STUDIO_CONTENT_ROUTER: customerSource ? native?.PAGE_STUDIO_CONTENT_ROUTER : stagingFromProduction ? env.PAGE_STUDIO_CMS_STAGING_CONTENT_ROUTER : env.PAGE_STUDIO_CONTENT_ROUTER,
    PAGE_STUDIO_CHECKPOINTS: customerSource ? native?.PAGE_STUDIO_CHECKPOINTS : stagingFromProduction ? env.PAGE_STUDIO_CMS_STAGING_CHECKPOINTS : env.PAGE_STUDIO_CHECKPOINTS,
    PAGE_STUDIO_CMS_OBJECT_TRANSPORT: stagingFromProduction ? env.PAGE_STUDIO_CMS_STAGING_OBJECT_TRANSPORT : env.PAGE_STUDIO_CMS_OBJECT_TRANSPORT,
    PAGE_STUDIO_ACTION_RUNTIME_DIGEST: stagingFromProduction ? env.PAGE_STUDIO_CMS_STAGING_ACTION_RUNTIME_DIGEST : env.PAGE_STUDIO_ACTION_RUNTIME_DIGEST
  }
  const validEnvironment = (deployment === 'production' || deployment === 'staging') && request.expectedEnvironment === deployment
    && (deployment === 'production' || request.contentEnvironment === 'staging')
  const requestDigest = await collectionDigest(request)
  if (!validEnvironment || typeof (storage.PAGE_STUDIO_CONTENT_ROUTER as { readManagedCmsTarget?: unknown } | undefined)?.readManagedCmsTarget !== 'function'
    || typeof (storage.PAGE_STUDIO_CHECKPOINTS as { get?: unknown } | undefined)?.get !== 'function') return rejected(requestDigest)
  const source = request.principal
  if (source.source === 'customer-session' && source.claims.environment !== request.contentEnvironment) return rejected(requestDigest, 'CMS_AUTHORITY_DENIED', 403, 'CMS mutation access denied')
  const principal: CmsGraphPrincipal = source.source === 'native-login'
    ? { source: source.source, request: { ...source.request, login: { ...source.request.login, issuedAt: new Date(source.request.login.issuedAt), expiresAt: new Date(source.request.login.expiresAt) }, env: storage } }
    : { ...source, env: storage }
  try {
    const value = await runCmsDatabaseInvocation(run, async () => {
      // Dependencies preserve each original transaction boundary. No SQL lock is
      // held by this dispatcher while an implementation awaits storage/provider I/O.
      const deps = { runTransaction: transactionWithoutRetry }
      switch (request.operation) {
        case 'adoption': return coordinateCmsAdoption(request.body, principal, deps)
        case 'transition': return coordinateCmsGraphTransition(request.body as CmsGraphTransitionInput, principal, deps)
        case 'checkpoint': return coordinateCmsGraphCheckpoint(request.body.input as { checkpoint: PageStudioCheckpointInput, expectedCheckpointId: string | null }, principal, deps, request.body.internal)
        case 'restore': return coordinateCmsGraphRestore(request.body, principal, deps)
      }
    })
    return cmsManagementResultSchema(request.operation).parse({ ok: true, requestDigest, value })
  } catch (error) {
    if (error instanceof PageStudioBusinessContentError) {
      const result = cmsManagementResultSchema(request.operation).safeParse(rejected(requestDigest, error.code, error.statusCode, error.message))
      if (result.success) return result.data
    }
    const status = (error as { statusCode?: number })?.statusCode
    if (status === 401 || status === 403) return rejected(requestDigest, 'CMS_AUTHORITY_DENIED', status, 'CMS mutation access denied')
    return rejected(requestDigest)
  }
}
