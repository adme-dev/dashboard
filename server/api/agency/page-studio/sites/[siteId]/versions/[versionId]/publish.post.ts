import { queryOne } from '~~/server/utils/db'
import {
  attachPageStudioReleaseMetadataToBuild,
  loadApprovedPageStudioReleaseCheckpoint,
  PageStudioReleaseCheckpointError,
  type PageStudioCheckpointBucket
} from '~~/server/utils/pageStudio/releaseCheckpoint'

interface SiteScopeRow {
  tenant_id: string
  client_id: string
  site_id: string
}

interface PublishBody {
  environment?: unknown
  hostname?: unknown
  expectedActiveReleaseId?: unknown
}

function actorTenantId(actor: Record<string, unknown>) {
  const value = actor.tenantId ?? actor.tenant_id
  return typeof value === 'string' && value ? value : null
}

function forwardedAuthHeaders(event: Parameters<typeof getHeader>[0]) {
  const headers: Record<string, string> = {}
  const cookie = getHeader(event, 'cookie')
  const authorization = getHeader(event, 'authorization')
  if (cookie) headers.cookie = cookie
  if (authorization) headers.authorization = authorization
  return headers
}

export default defineEventHandler(async (event) => {
  const actor = await requireAuth(event) as unknown as Record<string, unknown>
  await requireRole(event, ['admin', 'owner', 'agency'])

  const tenantId = actorTenantId(actor)
  const siteId = getRouterParam(event, 'siteId')
  const versionId = getRouterParam(event, 'versionId')
  if (!tenantId || !siteId || !versionId) {
    throw createError({ statusCode: 400, statusMessage: 'Page Studio publish scope is incomplete' })
  }

  const body = await readBody<PublishBody>(event)
  const environment = body.environment
  const hostname = typeof body.hostname === 'string' ? body.hostname.trim().toLowerCase() : ''
  const expectedActiveReleaseId = body.expectedActiveReleaseId === null || typeof body.expectedActiveReleaseId === 'string'
    ? body.expectedActiveReleaseId
    : undefined
  if ((environment !== 'production' && environment !== 'staging') || !hostname || hostname.length > 253) {
    throw createError({ statusCode: 400, statusMessage: 'A valid Page Studio environment and hostname are required' })
  }

  const idempotencyKey = getHeader(event, 'idempotency-key')?.trim()
  if (!idempotencyKey || idempotencyKey.length > 200) {
    throw createError({ statusCode: 400, statusMessage: 'An idempotency-key header of at most 200 characters is required' })
  }

  const site = await queryOne<SiteScopeRow>(`
    SELECT tenant_id, client_id::text AS client_id, id::text AS site_id
    FROM page_studio_sites
    WHERE tenant_id = $1
      AND id = $2
    LIMIT 1
  `, [tenantId, siteId])
  if (!site) {
    throw createError({ statusCode: 404, statusMessage: 'Page Studio site not found' })
  }

  const bucket = (event.context.cloudflare?.env as Record<string, unknown> | undefined)?.PAGE_STUDIO_CHECKPOINTS as PageStudioCheckpointBucket | undefined
  if (!bucket?.get) {
    throw createError({ statusCode: 503, statusMessage: 'Page Studio checkpoint storage is unavailable' })
  }

  try {
    const scope = { tenantId: site.tenant_id, clientId: site.client_id, siteId: site.site_id }
    const checkpoint = await loadApprovedPageStudioReleaseCheckpoint({ scope, versionId, bucket })
    const authHeaders = forwardedAuthHeaders(event)
    const localFetch = event.$fetch as unknown as (
      request: string,
      options: Record<string, unknown>
    ) => Promise<Record<string, unknown>>

    const buildResponse = await localFetch(
      `/api/agency/page-studio/sites/${encodeURIComponent(siteId)}/versions/${encodeURIComponent(versionId)}/builds`,
      {
        method: 'POST',
        headers: { ...authHeaders, 'idempotency-key': `${idempotencyKey}:build` },
        body: { manifest: checkpoint.manifest, assets: [] }
      }
    )
    const buildValue = buildResponse.build && typeof buildResponse.build === 'object'
      ? buildResponse.build as Record<string, unknown>
      : buildResponse
    const buildId = typeof buildValue.id === 'string' ? buildValue.id : null
    if (!buildId) {
      throw new PageStudioReleaseCheckpointError('BUILD_RESPONSE_INVALID', 'The Page Studio build route did not return a build identifier', 502)
    }

    await attachPageStudioReleaseMetadataToBuild({
      scope,
      versionId,
      buildId,
      digest: checkpoint.digest,
      releaseMetadata: checkpoint.releaseMetadata
    })

    const releaseResponse = await localFetch(
      `/api/agency/page-studio/sites/${encodeURIComponent(siteId)}/releases/activate`,
      {
        method: 'POST',
        headers: { ...authHeaders, 'idempotency-key': `${idempotencyKey}:release` },
        body: {
          buildId,
          environment,
          hostname,
          expectedActiveReleaseId
        }
      }
    )

    return {
      build: buildValue,
      release: releaseResponse.release ?? releaseResponse,
      checkpoint: {
        id: checkpoint.checkpointId,
        digest: checkpoint.digest
      }
    }
  } catch (error) {
    if (error instanceof PageStudioReleaseCheckpointError) {
      throw createError({
        statusCode: error.statusCode,
        statusMessage: error.message,
        data: { code: error.code }
      })
    }
    throw error
  }
})
