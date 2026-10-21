import { customerPreviewRuntimeEnvironment } from '../../../server/utils/pageStudio/customerPreviewRuntime'
import { requireCustomerInspectionAuthority } from '../../../shared/pageStudio/customerInspectionAuthority'
import { PageStudioInspectionRequest, MAX_INSPECTION_BYTES } from '../../../shared/pageStudio/inspectionContract'
import type { PageStudioCheckpointBucket } from '../../../shared/pageStudio/checkpointReader'
import { listAgencyPageStudioReviews } from './reviews'
import { requirePortalDomainAuthority } from './portalDomainAuthority'
import { agencyAuthority } from './domainManagement'
import { readPageStudioLaunchState } from './launchState'
import { readPageStudioVersionComparison } from './versionComparison'
import type { DomainTransaction } from './domainAttachment'
import type { InspectionQuery } from './inspectionTypes'

export async function handleInspection(input: unknown, env: Record<string, unknown>, transaction: DomainTransaction) {
  const parsed = PageStudioInspectionRequest.safeParse(input)
  if (!parsed.success) return { ok: false as const, statusCode: 400 }
  const request = parsed.data
  if (request.expectedEnvironment !== env.PAGE_STUDIO_RELEASE_ENVIRONMENT
    || !(env.HYPERDRIVE_FRESH as { connectionString?: string } | undefined)?.connectionString
    || !(env.PAGE_STUDIO_CHECKPOINTS as PageStudioCheckpointBucket | undefined)?.get) return { ok: false as const, statusCode: 503 }
  try {
    const value = await transaction(async (db) => {
      if (request.operation === 'customer-launch') {
        const actor = { actorId: request.actorId, accountId: request.accountId, workspaceId: request.workspaceId, siteId: request.siteId }
        const scope = await requireCustomerInspectionAuthority(db, actor, { lock: false })
        const query: InspectionQuery = async <T>(sql: string, params: unknown[]) => (await db.query<T>(sql, params)).rows[0] ?? null
        if (env.PAGE_STUDIO_RELEASE_ENVIRONMENT === 'production') {
          let current = scope
          const value = await readPageStudioLaunchState({ ...scope, siteId: request.siteId,
            nativeStorage: {
              source: () => env.PAGE_STUDIO_RELEASE_ENVIRONMENT === 'production' && env.PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED === 'true'
                ? customerPreviewRuntimeEnvironment(env)?.PAGE_STUDIO_CHECKPOINTS as PageStudioCheckpointBucket | undefined
                : undefined,
              destination: () => env.PAGE_STUDIO_RELEASE_ENVIRONMENT === 'production' ? env.PAGE_STUDIO_CHECKPOINTS as PageStudioCheckpointBucket | undefined : undefined
            },
            beforeFinalRead: async () => {
              current = await requireCustomerInspectionAuthority(db, actor)
              if (current.tenantId !== scope.tenantId || current.clientId !== scope.clientId || current.workspaceId !== scope.workspaceId) {
                throw Object.assign(new Error('Website access changed'), { statusCode: 403 })
              }
            }
          }, query)
          return { ...value, canManagePublication: current.canManagePublication === true }
        }
        const value = await readPageStudioLaunchState({ ...scope, siteId: request.siteId,
          bucket: env.PAGE_STUDIO_CHECKPOINTS as PageStudioCheckpointBucket }, query)
        const current = await requireCustomerInspectionAuthority(db, actor)
        if (current.tenantId !== scope.tenantId || current.clientId !== scope.clientId) throw Object.assign(new Error('Website access changed'), { statusCode: 403 })
        return { ...value, canManagePublication: current.canManagePublication === true }
      }
      if (request.operation === 'portal-launch') {
        const scope = await requirePortalDomainAuthority(db, request, false, { lock: false })
        const query: InspectionQuery = async <T>(sql: string, params: unknown[]) => (await db.query<T>(sql, params)).rows[0] ?? null
        const value = await readPageStudioLaunchState({ ...request, tenantId: scope.tenantId,
          bucket: env.PAGE_STUDIO_CHECKPOINTS as PageStudioCheckpointBucket }, query)
        // Storage reads are asynchronous; do not return data after access changes.
        const current = await requirePortalDomainAuthority(db, { ...request, tenantId: scope.tenantId }, false)
        return { ...value, canManagePublication: current.canManage === true }
      }
      await agencyAuthority(db, request.actorId, request.operation === 'launch' ? 'PAGE_STUDIO_VIEW' : 'PAGE_STUDIO_APPROVE')
      if (request.operation === 'reviews') return { tenantId: request.tenantId, reviews: await listAgencyPageStudioReviews(request.tenantId, db) }
      const query: InspectionQuery = async <T>(sql: string, params: unknown[]) => (await db.query<T>(sql, params)).rows[0] ?? null
      const scoped = { ...request, bucket: env.PAGE_STUDIO_CHECKPOINTS as PageStudioCheckpointBucket }
      return request.operation === 'launch' ? readPageStudioLaunchState(scoped, query) : readPageStudioVersionComparison({ ...scoped, ...request }, query)
    })
    // Two bounded 8 MiB checkpoints fit below RPC's 32 MiB limit as UTF-8 bytes.
    const payload = new TextEncoder().encode(JSON.stringify({ request, value }))
    if (payload.byteLength > MAX_INSPECTION_BYTES) return { ok: false as const, statusCode: 413 }
    return { ok: true as const, payload }
  } catch (error) {
    const status = (error as { statusCode?: number })?.statusCode
    return { ok: false as const, statusCode: status && [403, 404, 409, 413, 422].includes(status) ? status : 503 }
  }
}
