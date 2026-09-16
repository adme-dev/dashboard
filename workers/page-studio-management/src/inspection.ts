import { PageStudioInspectionRequest, MAX_INSPECTION_BYTES } from '../../../shared/pageStudio/inspectionContract'
import type { PageStudioCheckpointBucket } from '../../../shared/pageStudio/checkpointReader'
import { listAgencyPageStudioReviews } from './reviews'
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
