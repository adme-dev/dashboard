import { queryOne, transaction } from '~~/server/utils/db'

export interface PageStudioVersionQueryClient {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>
}

type RunTransaction = <T>(callback: (db: PageStudioVersionQueryClient) => Promise<T>) => Promise<T>

export class PageStudioVersionError extends Error {
  constructor(
    readonly code:
      | 'VERSION_EDIT_DENIED'
      | 'VERSION_NOT_FOUND'
      | 'VERSION_NOT_CURRENT'
      | 'VERSION_STATE_INVALID',
    readonly statusCode: number,
    message: string
  ) {
    super(message)
    this.name = 'PageStudioVersionError'
  }
}

interface LockedVersionRow {
  id: string
  digest: string
  status: string
  current_version_id: string | null
}

const defaultRunTransaction: RunTransaction = callback =>
  transaction(async db => callback(db as unknown as PageStudioVersionQueryClient))

export async function resolveAgencyPageStudioSiteClient(
  tenantId: string,
  siteId: string
): Promise<string> {
  const site = await queryOne<{ client_id: string }>(
    `SELECT client_id FROM page_studio_sites WHERE tenant_id = $1 AND id = $2`,
    [tenantId, siteId]
  )
  if (!site) throw new PageStudioVersionError('VERSION_NOT_FOUND', 404, 'Page Studio site not found')
  return site.client_id
}

export async function resolvePortalPageStudioSiteTenant(input: {
  clientId: string
  siteId: string
  userId: string
}): Promise<string> {
  const site = await queryOne<{ tenant_id: string }>(
    `SELECT site.tenant_id
     FROM page_studio_sites site
     JOIN page_studio_site_memberships membership
       ON membership.tenant_id = site.tenant_id
      AND membership.client_id = site.client_id
      AND membership.site_id = site.id
     WHERE site.client_id = $1 AND site.id = $2 AND membership.user_id = $3`,
    [input.clientId, input.siteId, input.userId]
  )
  if (!site) throw new PageStudioVersionError('VERSION_NOT_FOUND', 404, 'Page Studio site not found')
  return site.tenant_id
}

async function lockVersion(
  db: PageStudioVersionQueryClient,
  input: { tenantId: string, clientId: string, siteId: string, versionId: string }
): Promise<LockedVersionRow> {
  const result = await db.query<LockedVersionRow>(
    `SELECT version.id, version.digest, version.status, site.current_version_id
     FROM page_studio_versions version
     JOIN page_studio_sites site
       ON site.tenant_id = version.tenant_id
      AND site.client_id = version.client_id
      AND site.id = version.site_id
     WHERE version.tenant_id = $1
       AND version.client_id = $2
       AND version.site_id = $3
       AND version.id = $4
     FOR UPDATE OF version, site`,
    [input.tenantId, input.clientId, input.siteId, input.versionId]
  )
  const version = result.rows[0]
  if (!version) {
    throw new PageStudioVersionError('VERSION_NOT_FOUND', 404, 'Page Studio version not found')
  }
  return version
}

export async function submitPageStudioVersion(
  input: {
    tenantId: string
    clientId: string
    siteId: string
    versionId: string
    portalUserId: string
  },
  dependencies: { runTransaction?: RunTransaction } = {}
) {
  const runTransaction = dependencies.runTransaction ?? defaultRunTransaction
  return runTransaction(async (db) => {
    const membership = await db.query<{ role: string }>(
      `SELECT role
       FROM page_studio_site_memberships
       WHERE tenant_id = $1 AND client_id = $2 AND site_id = $3 AND user_id = $4`,
      [input.tenantId, input.clientId, input.siteId, input.portalUserId]
    )
    if (membership.rows[0]?.role !== 'editor') {
      throw new PageStudioVersionError(
        'VERSION_EDIT_DENIED',
        403,
        'Page Studio editing access denied'
      )
    }

    const version = await lockVersion(db, input)
    if (version.current_version_id !== version.id) {
      throw new PageStudioVersionError(
        'VERSION_NOT_CURRENT',
        409,
        'Only the current draft can be submitted'
      )
    }
    if (version.status !== 'draft') {
      throw new PageStudioVersionError(
        'VERSION_STATE_INVALID',
        422,
        'Only a draft version can be submitted'
      )
    }

    const updated = await db.query<{
      id: string
      digest: string
      status: string
      submitted_at: string
    }>(
      `UPDATE page_studio_versions
       SET status = 'in_review', submitted_at = NOW(), updated_at = NOW()
       WHERE tenant_id = $1 AND client_id = $2 AND site_id = $3 AND id = $4
       RETURNING id, digest, status, submitted_at`,
      [input.tenantId, input.clientId, input.siteId, input.versionId]
    )

    await db.query(
      `INSERT INTO page_studio_audit_events (
         tenant_id, client_id, site_id, actor_id, actor_role, action,
         resource_type, resource_id, metadata
       ) VALUES ($1, $2, $3, $4, 'client', $5, 'version', $6, $7::jsonb)`,
      [
        input.tenantId,
        input.clientId,
        input.siteId,
        input.portalUserId,
        'version.submitted',
        input.versionId,
        JSON.stringify({ digest: version.digest })
      ]
    )
    return updated.rows[0]
  })
}

export async function reviewPageStudioVersion(
  input: {
    tenantId: string
    clientId: string
    siteId: string
    versionId: string
    reviewerId: string
    decision: 'approved' | 'rejected' | 'returned_to_draft'
    comment?: string
  },
  dependencies: { runTransaction?: RunTransaction } = {}
) {
  const runTransaction = dependencies.runTransaction ?? defaultRunTransaction
  return runTransaction(async (db) => {
    const version = await lockVersion(db, input)
    if (version.current_version_id !== version.id) {
      throw new PageStudioVersionError(
        'VERSION_NOT_CURRENT',
        409,
        'Only the current submitted version can be reviewed'
      )
    }
    if (version.status !== 'in_review') {
      throw new PageStudioVersionError(
        'VERSION_STATE_INVALID',
        422,
        'Only a submitted version can be reviewed'
      )
    }

    const review = await db.query<{ id: string, decided_at: string }>(
      `INSERT INTO page_studio_reviews (
         tenant_id, client_id, site_id, version_id, version_digest,
         reviewer_id, decision, comment
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, decided_at`,
      [
        input.tenantId,
        input.clientId,
        input.siteId,
        input.versionId,
        version.digest,
        input.reviewerId,
        input.decision,
        input.comment ?? null
      ]
    )

    const nextStatus = input.decision === 'returned_to_draft' ? 'draft' : input.decision
    await db.query(
      `UPDATE page_studio_versions
       SET status = $5,
           submitted_at = CASE WHEN $5 = 'draft' THEN NULL ELSE submitted_at END,
           updated_at = NOW()
       WHERE tenant_id = $1 AND client_id = $2 AND site_id = $3 AND id = $4`,
      [input.tenantId, input.clientId, input.siteId, input.versionId, nextStatus]
    )

    await db.query(
      `INSERT INTO page_studio_audit_events (
         tenant_id, client_id, site_id, actor_id, actor_role, action,
         resource_type, resource_id, metadata
       ) VALUES ($1, $2, $3, $4, 'agency', $5, 'version', $6, $7::jsonb)`,
      [
        input.tenantId,
        input.clientId,
        input.siteId,
        input.reviewerId,
        `version.${input.decision}`,
        input.versionId,
        JSON.stringify({ comment: input.comment ?? null, digest: version.digest })
      ]
    )

    return {
      id: review.rows[0]?.id,
      decidedAt: review.rows[0]?.decided_at,
      decision: input.decision,
      versionDigest: version.digest,
      versionId: version.id
    }
  })
}
