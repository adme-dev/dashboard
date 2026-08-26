import { isIP } from 'node:net'
import { z } from 'zod'
import { executeSearchAuthorityMutation } from '~~/server/utils/searchAuthority/godModeMutations'
import { requireAgencySearchAuthorityAccess } from '~~/server/utils/searchAuthority/access'
import { SEARCH_AUTHORITY_FEATURE } from '~~/server/utils/searchAuthority/feature'

const Body = z.object({
  clientId: z.string().uuid(),
  canonicalHostname: z.string().trim().min(1).max(253),
  contentHostname: z.string().trim().min(1).max(253).nullable().optional(),
  publishingMode: z.enum(['subdomain', 'same_host']).optional()
})

function normalizePublicRootHostname(value: string): string {
  let url: URL
  try {
    url = new URL(value.includes('://') ? value : `https://${value}`)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid hostname' })
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, '')
  if (
    !['http:', 'https:'].includes(url.protocol)
    || url.username
    || url.password
    || url.port
    || (url.pathname !== '' && url.pathname !== '/')
    || url.search
    || url.hash
    || hostname === 'localhost'
    || !hostname.includes('.')
    || isIP(hostname) !== 0
  ) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Hostname must be a public website root'
    })
  }
  return hostname
}

export default eventHandler(async (event) => {
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid Search Authority site'
    })
  }

  const user = await requireAgencySearchAuthorityAccess(
    event,
    parsed.data.clientId,
    { requireEntitlement: false }
  )
  if (!['owner', 'admin'].includes(user.role)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Only an owner or admin can activate Search Authority'
    })
  }
  const canonicalHostname = normalizePublicRootHostname(
    parsed.data.canonicalHostname
  )
  const publishingMode = parsed.data.publishingMode ?? 'subdomain'
  // Same-host mode serves guides on the client's own website root via a `/guides/*` rewrite.
  const contentHostname = publishingMode === 'same_host'
    ? canonicalHostname
    : parsed.data.contentHostname
      ? normalizePublicRootHostname(parsed.data.contentHostname)
      : null

  const site = await executeSearchAuthorityMutation(event, 'site-configure', async (db) => {
    const siteResult = await db.query<{
      id: string
      client_id: string
      canonical_hostname: string
      content_hostname: string | null
      status: string
      public_id: string
      publishing_mode: 'subdomain' | 'same_host'
    }>(
      `INSERT INTO search_authority_sites (
         client_id, canonical_hostname, content_hostname, publishing_mode, status, created_by
       )
       VALUES ($1, $2, $3, $4, 'active', $5)
       ON CONFLICT (client_id)
       DO UPDATE SET
         canonical_hostname = EXCLUDED.canonical_hostname,
         content_hostname = EXCLUDED.content_hostname,
         publishing_mode = EXCLUDED.publishing_mode,
         status = 'active',
         updated_at = NOW()
       RETURNING
         id, client_id, canonical_hostname, content_hostname, status, public_id, publishing_mode`,
      [parsed.data.clientId, canonicalHostname, contentHostname, publishingMode, user.id]
    )

    await db.query(
      `INSERT INTO client_feature_entitlements (
         client_id, feature_key, status, source
       )
       VALUES ($1, $2, 'trial', 'search_authority_pilot')
       ON CONFLICT (client_id, feature_key)
       DO UPDATE SET
         status = CASE
           WHEN client_feature_entitlements.status = 'active' THEN 'active'
           ELSE 'trial'
         END,
         source = CASE
           WHEN client_feature_entitlements.status = 'active'
             THEN client_feature_entitlements.source
           ELSE 'search_authority_pilot'
         END,
         updated_at = NOW()`,
      [parsed.data.clientId, SEARCH_AUTHORITY_FEATURE]
    )

    const row = siteResult.rows[0]
    if (!row) throw new Error('Unable to configure Search Authority site')
    return row
  }, async (db, id) => {
    const result = await db.query<{
      id: string
      client_id: string
      canonical_hostname: string
      content_hostname: string | null
      status: string
      public_id: string
      publishing_mode: 'subdomain' | 'same_host'
    }>(`SELECT id, client_id, canonical_hostname, content_hostname, status, public_id, publishing_mode
        FROM search_authority_sites WHERE id = $1 AND client_id = $2`, [id, parsed.data.clientId])
    const row = result.rows[0]
    if (!row) throw new Error('Replayed Search Authority site no longer exists')
    return row
  })

  return {
    site: {
      id: site.id,
      clientId: site.client_id,
      canonicalHostname: site.canonical_hostname,
      contentHostname: site.content_hostname,
      status: site.status,
      publicId: site.public_id,
      publishingMode: site.publishing_mode
    }
  }
})
